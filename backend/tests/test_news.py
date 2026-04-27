"""Tests for the RSS news enrichment service."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.news import (
    _format_articles,
    _is_relevant,
    _strip_html,
    _title_hash,
    _truncate_body,
    _is_recent,
    fetch_search_context,
)


# ── _title_hash ───────────────────────────────────────────────────


def test_title_hash_deterministic():
    assert _title_hash("Port Strike") == _title_hash("Port Strike")


def test_title_hash_case_insensitive():
    assert _title_hash("Port Strike") == _title_hash("port strike")


def test_title_hash_trims_whitespace():
    assert _title_hash("  Port Strike  ") == _title_hash("Port Strike")


# ── _is_relevant ──────────────────────────────────────────────────


def test_relevant_supply_chain():
    assert _is_relevant("Major supply chain disruption hits Europe")


def test_relevant_chokepoint():
    assert _is_relevant("Red Sea shipping attacks escalate")


def test_relevant_trade():
    assert _is_relevant("EU tariff on Chinese steel imports")


def test_relevant_skf_material():
    assert _is_relevant("Bearing steel shortage worsens")


def test_relevant_country():
    assert _is_relevant("Germany factory output declines sharply")


def test_not_relevant():
    assert not _is_relevant("Celebrity gossip and entertainment news")


def test_relevant_from_summary():
    assert _is_relevant("Unclear title", "Flooding disrupts manufacturing in Pune")


# ── _strip_html ───────────────────────────────────────────────────


def test_strip_html_removes_tags():
    assert _strip_html("<p>Hello <b>world</b></p>") == "Hello world"


def test_strip_html_passthrough():
    assert _strip_html("No tags here") == "No tags here"


# ── _truncate_body ────────────────────────────────────────────────


def test_truncate_short_text():
    assert _truncate_body("Short text.", max_words=10) == "Short text."


def test_truncate_long_text():
    text = "Word " * 500
    result = _truncate_body(text, max_words=50)
    assert len(result.split()) <= 51  # max_words + possible partial


def test_truncate_sentence_boundary():
    text = "First sentence. Second sentence. " + "Word " * 300
    result = _truncate_body(text, max_words=10)
    assert result.endswith(".")


# ── _is_recent ────────────────────────────────────────────────────


def test_recent_unknown_date_passes():
    assert _is_recent("", max_age_days=7) is True


def test_recent_rfc2822():
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    from email.utils import format_datetime
    assert _is_recent(format_datetime(now), max_age_days=1) is True


def test_old_date_rejected():
    assert _is_recent("Mon, 01 Jan 2020 00:00:00 GMT", max_age_days=7) is False


# ── _format_articles ──────────────────────────────────────────────


def test_format_articles_empty():
    assert _format_articles([]) == ""


def test_format_articles_with_body():
    articles = [
        {
            "title": "Port Strike",
            "source": "Reuters",
            "published": "2h ago",
            "body": "Full article text about the port strike.",
            "title_hash": "abc123",
        },
    ]
    result = _format_articles(articles)
    assert "### Port Strike" in result
    assert "Full article text" in result


def test_format_articles_with_summary():
    articles = [
        {
            "title": "Flood Warning",
            "source": "BBC",
            "summary": "Rivers rising in industrial zone.",
            "title_hash": "def456",
        },
    ]
    result = _format_articles(articles)
    assert "Flood Warning" in result
    assert "Rivers rising" in result


def test_format_articles_headline_only():
    articles = [
        {"title": "Brief Headline", "source": "AP", "title_hash": "ghi789"},
    ]
    result = _format_articles(articles)
    assert "Brief Headline (AP)" in result


def test_format_articles_deduplicates():
    articles = [
        {"title": "Same", "source": "A", "title_hash": "aaa"},
        {"title": "Same", "source": "B", "title_hash": "aaa"},
    ]
    result = _format_articles(articles)
    assert result.count("Same") == 1


def test_format_articles_body_first():
    articles = [
        {"title": "With Body", "source": "A", "body": "Full text.", "title_hash": "aaa"},
        {"title": "Without Body", "source": "B", "summary": "Summary.", "title_hash": "bbb"},
    ]
    result = _format_articles(articles)
    body_pos = result.index("With Body")
    summary_pos = result.index("Without Body")
    assert body_pos < summary_pos


# ── fetch_search_context ──────────────────────────────────────────


def test_fetch_search_context_cache_hit():
    """Returns cached articles when cache is warm."""
    cached = [
        {"title": "Cached Article", "source": "Reuters", "url": "", "summary": "Cached supply chain update.",
         "published_at": "", "title_hash": "cached1"},
    ]

    async def _run():
        with patch("backend.app.services.news._cache_is_warm", return_value=True), \
             patch("backend.app.db.database.get_cached_news", return_value=cached):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is not None
    assert "Cached Article" in result


def test_fetch_search_context_fetches_on_cold_cache():
    """Fetches from RSS when cache is cold."""
    async def _run():
        with patch("backend.app.services.news._cache_is_warm", return_value=False), \
             patch("backend.app.services.news._fetch_google_news", new_callable=AsyncMock, return_value=[
                 {"title": "Supply chain disruption in Germany", "source": "Reuters", "url": "",
                  "summary": "", "published": "", "title_hash": "fresh1"},
             ]), \
             patch("backend.app.services.news._fetch_direct_feed", new_callable=AsyncMock, return_value=[]), \
             patch("backend.app.services.news._enrich_with_full_text", new_callable=AsyncMock), \
             patch("backend.app.db.database.save_news_articles", return_value=1), \
             patch("backend.app.db.database.prune_old_news", return_value=0):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is not None
    assert "Supply chain disruption" in result


def test_fetch_search_context_returns_none_on_no_articles():
    """Returns None when no articles are found."""
    async def _run():
        with patch("backend.app.services.news._cache_is_warm", return_value=False), \
             patch("backend.app.services.news._fetch_google_news", new_callable=AsyncMock, return_value=[]), \
             patch("backend.app.services.news._fetch_direct_feed", new_callable=AsyncMock, return_value=[]):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is None


def test_fetch_search_context_handles_feed_errors():
    """Tolerates individual feed failures without crashing."""
    async def _run():
        with patch("backend.app.services.news._cache_is_warm", return_value=False), \
             patch("backend.app.services.news._fetch_google_news", new_callable=AsyncMock,
                   side_effect=Exception("Network error")), \
             patch("backend.app.services.news._fetch_direct_feed", new_callable=AsyncMock, return_value=[
                 {"title": "Tariff news affects shipping supply chain", "source": "FreightWaves",
                  "url": "", "summary": "", "published": "", "title_hash": "fw1"},
             ]), \
             patch("backend.app.services.news._enrich_with_full_text", new_callable=AsyncMock), \
             patch("backend.app.db.database.save_news_articles", return_value=1), \
             patch("backend.app.db.database.prune_old_news", return_value=0):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is not None
    assert "Tariff news" in result
