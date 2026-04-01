"""Serper API integration for live web search before Claude scans.

Fetches recent news articles via Serper's Google News endpoint and formats
them as context to inject into Claude prompts. API key is retrieved from
AWS Secrets Manager (secret: sc-hub/serper-api-key) with env var fallback.
"""

from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SERPER_NEWS_URL = "https://google.serper.dev/news"
SECRETS_MANAGER_SECRET = "sc-hub/serper-api-key"

# Search queries tuned per scan mode
_SEARCH_QUERIES: dict[str, list[str]] = {
    "disruptions": [
        "supply chain disruption news today",
        "factory fire flood earthquake port closure logistics delay",
    ],
    "geopolitical": [
        "geopolitical risk news today",
        "sanctions conflict trade war political instability",
    ],
    "trade": [
        "trade policy tariff news today",
        "anti-dumping duties export controls steel tariffs bearings",
    ],
}

# Max results per query
_NUM_RESULTS = 10


@lru_cache(maxsize=1)
def _get_api_key_from_secrets_manager() -> str | None:
    """Retrieve Serper API key from AWS Secrets Manager. Cached for Lambda lifetime."""
    import os

    # Env var override for local dev / testing
    env_key = os.environ.get("SERPER_API_KEY", "")
    if env_key:
        return env_key

    try:
        import boto3

        client = boto3.client("secretsmanager", region_name=os.environ.get("AWS_REGION", "eu-west-1"))
        resp = client.get_secret_value(SecretId=SECRETS_MANAGER_SECRET)
        secret = resp["SecretString"]
        # Handle both plain string and JSON {"api_key": "..."} formats
        try:
            parsed = json.loads(secret)
            return parsed.get("api_key") or parsed.get("SERPER_API_KEY") or secret
        except (json.JSONDecodeError, AttributeError):
            return secret.strip()
    except Exception as exc:
        logger.warning("Failed to retrieve Serper API key from Secrets Manager: %s", exc)
        return None


async def _fetch_serper_news(query: str, api_key: str) -> list[dict[str, Any]]:
    """Call Serper News API for a single query."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            SERPER_NEWS_URL,
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={"q": query, "num": _NUM_RESULTS},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("news", [])


def _format_articles(articles: list[dict[str, Any]]) -> str:
    """Format Serper news articles into a text block for prompt injection."""
    if not articles:
        return ""

    seen_titles: set[str] = set()
    lines: list[str] = []

    for a in articles:
        title = a.get("title", "").strip()
        if not title or title.lower() in seen_titles:
            continue
        seen_titles.add(title.lower())

        snippet = a.get("snippet", "").strip()
        source = a.get("source", "").strip()
        date = a.get("date", "").strip()

        parts = [f"- {title}"]
        if source or date:
            parts[0] += f" ({source}, {date})" if source and date else f" ({source or date})"
        if snippet:
            parts.append(f"  {snippet}")
        lines.append("\n".join(parts))

    return "\n".join(lines)


async def fetch_search_context(mode: str) -> str | None:
    """Fetch live news context for a scan mode via Serper.

    Returns a formatted text block of recent articles to inject into the
    Claude prompt, or None if Serper is unavailable or returns no results.
    Falls back gracefully on any error.
    """
    api_key = await asyncio.to_thread(_get_api_key_from_secrets_manager)
    if not api_key:
        logger.info("Serper API key not available — skipping web search pre-step")
        return None

    queries = _SEARCH_QUERIES.get(mode, _SEARCH_QUERIES["disruptions"])

    try:
        # Run all queries for this mode concurrently
        tasks = [_fetch_serper_news(q, api_key) for q in queries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_articles: list[dict[str, Any]] = []
        for r in results:
            if isinstance(r, list):
                all_articles.extend(r)
            elif isinstance(r, Exception):
                logger.warning("Serper query failed: %s", r)

        if not all_articles:
            logger.info("Serper returned no articles for %s", mode)
            return None

        formatted = _format_articles(all_articles)
        if formatted:
            logger.info("Serper returned %d articles for %s scan", len(all_articles), mode)
        return formatted or None

    except Exception as exc:
        logger.warning("Serper search failed for %s — continuing without web context: %s", mode, exc)
        return None
