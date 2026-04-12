"""Tests for the outbound webhook publisher service."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.webhooks import (
    _build_payload,
    _get_webhook_urls,
    get_webhook_status,
    publish_event,
    publish_scan_complete,
)


# ── Payload construction ─────────────────────────────────────────


def test_build_payload_structure():
    event = {"id": "test-1", "event": "Test event", "severity": "Critical"}
    payload = _build_payload(event, "new_critical_event", {"mode": "disruptions"})

    assert payload["source"] == "sc-hub-disruption-monitor"
    assert payload["trigger"] == "new_critical_event"
    assert "timestamp" in payload
    assert payload["event"] == event
    assert payload["metadata"] == {"mode": "disruptions"}


def test_build_payload_default_metadata():
    payload = _build_payload({"id": "x"}, "test")
    assert payload["metadata"] == {}


# ── URL parsing ──────────────────────────────────────────────────


@patch("backend.app.services.webhooks.settings")
def test_get_webhook_urls_empty(mock_settings):
    mock_settings.webhook_urls = ""
    assert _get_webhook_urls() == []


@patch("backend.app.services.webhooks.settings")
def test_get_webhook_urls_single(mock_settings):
    mock_settings.webhook_urls = "https://example.com/hook"
    assert _get_webhook_urls() == ["https://example.com/hook"]


@patch("backend.app.services.webhooks.settings")
def test_get_webhook_urls_multiple(mock_settings):
    mock_settings.webhook_urls = "https://a.com/hook, https://b.com/hook , https://c.com/hook"
    urls = _get_webhook_urls()
    assert len(urls) == 3
    assert urls[0] == "https://a.com/hook"
    assert urls[1] == "https://b.com/hook"
    assert urls[2] == "https://c.com/hook"


@patch("backend.app.services.webhooks.settings")
def test_get_webhook_urls_ignores_blanks(mock_settings):
    mock_settings.webhook_urls = "https://a.com,, ,https://b.com"
    urls = _get_webhook_urls()
    assert len(urls) == 2


# ── Status ───────────────────────────────────────────────────────


@patch("backend.app.services.webhooks.settings")
def test_webhook_status_unconfigured(mock_settings):
    mock_settings.webhook_urls = ""
    mock_settings.sns_topic_arn = ""
    status = get_webhook_status()
    assert status["configured"] is False
    assert status["webhook_url_count"] == 0
    assert status["sns_topic_arn"] is None


@patch("backend.app.services.webhooks.settings")
def test_webhook_status_with_urls(mock_settings):
    mock_settings.webhook_urls = "https://a.com,https://b.com"
    mock_settings.sns_topic_arn = ""
    status = get_webhook_status()
    assert status["configured"] is True
    assert status["webhook_url_count"] == 2


@patch("backend.app.services.webhooks.settings")
def test_webhook_status_with_sns(mock_settings):
    mock_settings.webhook_urls = ""
    mock_settings.sns_topic_arn = "arn:aws:sns:eu-west-1:123456:topic"
    status = get_webhook_status()
    assert status["configured"] is True
    assert status["sns_topic_arn"] == "arn:aws:sns:eu-west-1:123456:topic"


# ── publish_event ────────────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.app.services.webhooks.settings")
async def test_publish_event_no_channels(mock_settings):
    """When nothing is configured, publish_event returns immediately."""
    mock_settings.webhook_urls = ""
    mock_settings.sns_topic_arn = ""
    # Should not raise
    await publish_event({"id": "x"}, "test")


@pytest.mark.asyncio
@patch("backend.app.services.webhooks._post_webhook", new_callable=AsyncMock)
@patch("backend.app.services.webhooks.settings")
async def test_publish_event_posts_to_urls(mock_settings, mock_post):
    mock_settings.webhook_urls = "https://a.com/hook,https://b.com/hook"
    mock_settings.sns_topic_arn = ""

    await publish_event({"id": "test-1"}, "new_critical_event")

    assert mock_post.call_count == 2
    # Verify payloads
    for call in mock_post.call_args_list:
        payload = call[0][1]
        assert payload["trigger"] == "new_critical_event"
        assert payload["source"] == "sc-hub-disruption-monitor"


@pytest.mark.asyncio
@patch("backend.app.services.webhooks._publish_sns", new_callable=AsyncMock)
@patch("backend.app.services.webhooks._post_webhook", new_callable=AsyncMock)
@patch("backend.app.services.webhooks.settings")
async def test_publish_event_posts_and_sns(mock_settings, mock_post, mock_sns):
    mock_settings.webhook_urls = "https://a.com/hook"
    mock_settings.sns_topic_arn = "arn:aws:sns:eu-west-1:123:topic"

    await publish_event({"id": "test-1"}, "test")

    assert mock_post.call_count == 1
    assert mock_sns.call_count == 1


# ── publish_scan_complete ────────────────────────────────────────


@pytest.mark.asyncio
@patch("backend.app.services.webhooks.publish_event", new_callable=AsyncMock)
async def test_publish_scan_complete_fires_for_critical(mock_publish):
    items = [
        {"id": "crit-1", "event": "Critical event", "severity": "Critical"},
        {"id": "high-1", "event": "High event", "severity": "High"},
        {"id": "med-1", "event": "Medium event", "severity": "Medium"},
        {"id": "low-1", "event": "Low event", "severity": "Low"},
    ]

    await publish_scan_complete(
        mode="disruptions",
        scan_id="abc123",
        source="live",
        item_count=4,
        items=items,
    )

    # Should fire: 2 individual (Critical + High) + 1 scan_complete = 3 calls
    assert mock_publish.call_count == 3

    triggers = [call[1]["trigger"] for call in mock_publish.call_args_list]
    assert triggers.count("new_critical_event") == 2
    assert triggers.count("scan_complete") == 1


@pytest.mark.asyncio
@patch("backend.app.services.webhooks.publish_event", new_callable=AsyncMock)
async def test_publish_scan_complete_geopolitical_uses_risk_level(mock_publish):
    items = [
        {"id": "geo-1", "risk": "Conflict escalation", "risk_level": "Critical"},
        {"id": "geo-2", "risk": "Trade tension", "risk_level": "Low"},
    ]

    await publish_scan_complete(
        mode="geopolitical",
        scan_id="def456",
        source="live",
        item_count=2,
        items=items,
    )

    # 1 individual (Critical) + 1 scan_complete = 2 calls
    assert mock_publish.call_count == 2


@pytest.mark.asyncio
@patch("backend.app.services.webhooks.publish_event", new_callable=AsyncMock)
async def test_publish_scan_complete_no_critical_only_summary(mock_publish):
    items = [
        {"id": "med-1", "event": "Medium event", "severity": "Medium"},
    ]

    await publish_scan_complete(
        mode="trade",
        scan_id="ghi789",
        source="sample",
        item_count=1,
        items=items,
    )

    # Only scan_complete, no individual event webhooks
    assert mock_publish.call_count == 1
    assert mock_publish.call_args_list[0][1]["trigger"] == "scan_complete"
