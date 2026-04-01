"""Tests for the Serper web search integration."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.serper import (
    _format_articles,
    _get_api_key_from_secrets_manager,
    fetch_search_context,
)


# ── _format_articles ────────────────────────────────────────────


def test_format_articles_empty():
    assert _format_articles([]) == ""


def test_format_articles_basic():
    articles = [
        {"title": "Port Strike Hits LA", "snippet": "Workers walked out.", "source": "Reuters", "date": "2h ago"},
        {"title": "Floods in Thailand", "snippet": "Industrial parks flooded.", "source": "BBC", "date": "4h ago"},
    ]
    result = _format_articles(articles)
    assert "Port Strike Hits LA" in result
    assert "Reuters, 2h ago" in result
    assert "Workers walked out." in result
    assert "Floods in Thailand" in result


def test_format_articles_deduplicates():
    articles = [
        {"title": "Same Headline", "snippet": "First version.", "source": "A"},
        {"title": "Same Headline", "snippet": "Duplicate.", "source": "B"},
        {"title": "same headline", "snippet": "Case variant.", "source": "C"},
    ]
    result = _format_articles(articles)
    assert result.count("Same Headline") == 1


def test_format_articles_missing_fields():
    articles = [
        {"title": "Bare Title"},
        {"title": "With Source", "source": "AP"},
        {"title": "With Date", "date": "1h ago"},
    ]
    result = _format_articles(articles)
    assert "Bare Title" in result
    assert "(AP)" in result
    assert "(1h ago)" in result


def test_format_articles_skips_empty_titles():
    articles = [
        {"title": "", "snippet": "No title here"},
        {"title": "  ", "snippet": "Blank title"},
        {"title": "Valid", "snippet": "OK"},
    ]
    result = _format_articles(articles)
    assert "Valid" in result
    assert "No title here" not in result


# ── _get_api_key_from_secrets_manager ───────────────────────────


def test_api_key_from_env_var(monkeypatch):
    """Env var SERPER_API_KEY takes priority over Secrets Manager."""
    monkeypatch.setenv("SERPER_API_KEY", "test-key-123")
    _get_api_key_from_secrets_manager.cache_clear()
    key = _get_api_key_from_secrets_manager()
    assert key == "test-key-123"
    _get_api_key_from_secrets_manager.cache_clear()


def test_api_key_from_secrets_manager_json(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    _get_api_key_from_secrets_manager.cache_clear()

    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {
        "SecretString": json.dumps({"api_key": "sm-key-456"})
    }

    with patch("boto3.client", return_value=mock_client):
        key = _get_api_key_from_secrets_manager()

    assert key == "sm-key-456"
    _get_api_key_from_secrets_manager.cache_clear()


def test_api_key_from_secrets_manager_plain_string(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    _get_api_key_from_secrets_manager.cache_clear()

    mock_client = MagicMock()
    mock_client.get_secret_value.return_value = {"SecretString": "plain-key-789"}

    with patch("boto3.client", return_value=mock_client):
        key = _get_api_key_from_secrets_manager()

    assert key == "plain-key-789"
    _get_api_key_from_secrets_manager.cache_clear()


def test_api_key_secrets_manager_failure(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    _get_api_key_from_secrets_manager.cache_clear()

    with patch("boto3.client", side_effect=Exception("Connection refused")):
        key = _get_api_key_from_secrets_manager()

    assert key is None
    _get_api_key_from_secrets_manager.cache_clear()


# ── fetch_search_context ────────────────────────────────────────


def test_fetch_search_context_no_api_key():
    """Returns None gracefully when no API key is available."""
    async def _run():
        with patch(
            "backend.app.services.serper._get_api_key_from_secrets_manager",
            return_value=None,
        ):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is None


def test_fetch_search_context_success():
    """Returns formatted context when Serper returns articles."""
    mock_articles = [
        {"title": "LA Port Backup", "snippet": "Ships queuing.", "source": "Reuters", "date": "2h ago"},
    ]

    async def _run():
        with patch(
            "backend.app.services.serper._get_api_key_from_secrets_manager",
            return_value="test-key",
        ), patch(
            "backend.app.services.serper._fetch_serper_news",
            new_callable=AsyncMock,
            return_value=mock_articles,
        ):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is not None
    assert "LA Port Backup" in result


def test_fetch_search_context_serper_failure():
    """Returns None when Serper API call raises an exception."""
    async def _run():
        with patch(
            "backend.app.services.serper._get_api_key_from_secrets_manager",
            return_value="test-key",
        ), patch(
            "backend.app.services.serper._fetch_serper_news",
            new_callable=AsyncMock,
            side_effect=Exception("Serper 500"),
        ):
            return await fetch_search_context("disruptions")

    result = asyncio.run(_run())
    assert result is None
