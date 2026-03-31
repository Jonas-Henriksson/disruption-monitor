"""Tests for backend.app.services.telegram — formatting, alerting logic, dedup.

All tests mock httpx so no real Telegram API calls are made.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.telegram import (
    _alerted_events,
    _format_alert,
    _should_alert,
    clear_alerted_cache,
    send_scan_alerts,
    send_telegram_message,
)


# ── Helpers ────────────────────────────────────────────────────────


def _make_disruption(**overrides) -> dict:
    base = {
        "id": "test-fire|europe",
        "event": "Factory Fire in Gothenburg",
        "description": "A major fire at a bearing factory.",
        "severity": "High",
        "region": "Europe",
        "trend": "Escalating",
        "lat": 57.7,
        "lng": 12.0,
        "skf_exposure": "Direct impact on Gothenburg MFG.",
        "recommended_action": "Activate contingency plan.",
    }
    base.update(overrides)
    return base


def _make_geo(**overrides) -> dict:
    base = {
        "id": "us-china-tensions",
        "risk": "US-China Trade War",
        "risk_level": "Critical",
        "region": "Global",
        "trend": "Escalating",
        "lat": 39.9,
        "lng": 116.4,
        "this_week": "New export controls announced.",
        "skf_relevance": "China operations affected.",
        "watchpoint": "Watch for retaliatory measures.",
    }
    base.update(overrides)
    return base


def _make_trade(**overrides) -> dict:
    base = {
        "id": "eu-steel-tariffs|europe",
        "event": "EU Steel Safeguard Extension",
        "description": "EU extends steel import quotas.",
        "severity": "Medium",
        "region": "Europe",
        "trend": "Stable",
        "lat": 50.8,
        "lng": 4.4,
        "skf_cost_impact": "2-3% raw material cost increase.",
        "recommended_action": "Renegotiate supplier contracts.",
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _clear_cache():
    """Ensure the alerted cache is clean for every test."""
    clear_alerted_cache()
    yield
    clear_alerted_cache()


# ── _format_alert ──────────────────────────────────────────────────


class TestFormatAlert:
    def test_disruption_format_contains_title(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "Factory Fire in Gothenburg" in msg

    def test_disruption_format_contains_severity(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "HIGH" in msg

    def test_disruption_format_contains_mode_label(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "Disruption" in msg

    def test_disruption_format_contains_region(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "Europe" in msg

    def test_disruption_format_contains_description(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "major fire" in msg

    def test_disruption_format_contains_exposure(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "SKF Impact" in msg
        assert "Gothenburg MFG" in msg

    def test_disruption_format_contains_action(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "Action" in msg
        assert "contingency" in msg

    def test_geopolitical_format(self):
        msg = _format_alert(_make_geo(), "geopolitical")
        assert "US-China Trade War" in msg
        assert "CRITICAL" in msg
        assert "Geopolitical" in msg
        assert "export controls" in msg

    def test_trade_format(self):
        msg = _format_alert(_make_trade(), "trade")
        assert "EU Steel Safeguard" in msg
        assert "Trade" in msg

    def test_critical_severity_icon(self):
        msg = _format_alert(_make_disruption(severity="Critical"), "disruptions")
        assert "[!!!]" in msg

    def test_high_severity_icon(self):
        msg = _format_alert(_make_disruption(severity="High"), "disruptions")
        assert "[!!]" in msg

    def test_medium_severity_icon(self):
        msg = _format_alert(_make_disruption(severity="Medium"), "disruptions")
        assert "[!]" in msg

    def test_low_severity_icon(self):
        msg = _format_alert(_make_disruption(severity="Low"), "disruptions")
        assert "[i]" in msg

    def test_with_affected_sites(self):
        item = _make_disruption(affected_sites=[
            {"name": "Gothenburg MFG", "type": "mfg", "distance_km": 5.2},
            {"name": "Gothenburg Office", "type": "office", "distance_km": 6.0},
            {"name": "Lulea MFG", "type": "mfg", "distance_km": 800.0},
        ])
        msg = _format_alert(item, "disruptions")
        assert "MFG Sites" in msg
        assert "Gothenburg MFG" in msg
        assert "Lulea MFG" in msg
        # Office site should NOT be in MFG Sites line
        # (the formatting filters by type=mfg)

    def test_without_affected_sites(self):
        """Events without affected_sites should still format correctly."""
        item = _make_disruption()
        # No affected_sites key at all
        msg = _format_alert(item, "disruptions")
        assert "MFG Sites" not in msg

    def test_many_affected_sites_truncated(self):
        """More than 5 MFG sites should show '+N more'."""
        sites = [{"name": f"Site {i}", "type": "mfg", "distance_km": i * 10} for i in range(8)]
        item = _make_disruption(affected_sites=sites)
        msg = _format_alert(item, "disruptions")
        assert "+3 more" in msg

    def test_timestamp_in_footer(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "UTC" in msg
        assert "SC Hub Disruption Monitor" in msg

    def test_html_tags_present(self):
        msg = _format_alert(_make_disruption(), "disruptions")
        assert "<b>" in msg
        assert "</b>" in msg


# ── _should_alert ──────────────────────────────────────────────────


class TestShouldAlert:
    def test_critical_alerts(self):
        assert _should_alert({"severity": "Critical"}) is True

    def test_high_alerts(self):
        assert _should_alert({"severity": "High"}) is True

    def test_medium_does_not_alert(self):
        """Default threshold is High, so Medium should not trigger."""
        assert _should_alert({"severity": "Medium"}) is False

    def test_low_does_not_alert(self):
        assert _should_alert({"severity": "Low"}) is False

    def test_geopolitical_uses_risk_level(self):
        assert _should_alert({"risk_level": "Critical"}) is True
        assert _should_alert({"risk_level": "Medium"}) is False

    def test_missing_severity_defaults_low(self):
        """Items with no severity or risk_level should default to Low (no alert)."""
        assert _should_alert({}) is False

    def test_with_custom_min_severity(self):
        """When min_severity is changed to Medium, Medium should alert."""
        from backend.app.config import settings
        original = settings.telegram_min_severity
        try:
            settings.telegram_min_severity = "Medium"
            assert _should_alert({"severity": "Medium"}) is True
            assert _should_alert({"severity": "Low"}) is False
        finally:
            settings.telegram_min_severity = original


# ── Alert dedup ────────────────────────────────────────────────────


class TestAlertDedup:
    @pytest.mark.asyncio
    async def test_same_event_not_alerted_twice(self):
        """The same event ID should only trigger one alert."""
        items = [_make_disruption(id="dup-event|eu", severity="Critical")]

        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "12345"
        mock_settings.telegram_min_severity = "High"

        mock_response = AsyncMock()
        mock_response.status_code = 200

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.send_telegram_message", new_callable=AsyncMock, return_value=True) as mock_send:
            sent1 = await send_scan_alerts(items, "disruptions")
            sent2 = await send_scan_alerts(items, "disruptions")

        assert sent1 == 1
        assert sent2 == 0  # Same ID, should be deduped

    @pytest.mark.asyncio
    async def test_different_events_both_alerted(self):
        items1 = [_make_disruption(id="event-1|eu", severity="Critical")]
        items2 = [_make_disruption(id="event-2|eu", severity="Critical")]

        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_min_severity = "High"

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.send_telegram_message", new_callable=AsyncMock, return_value=True):
            sent1 = await send_scan_alerts(items1, "disruptions")
            sent2 = await send_scan_alerts(items2, "disruptions")

        assert sent1 == 1
        assert sent2 == 1

    @pytest.mark.asyncio
    async def test_clear_cache_allows_realert(self):
        items = [_make_disruption(id="cache-test|eu", severity="Critical")]

        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_min_severity = "High"

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.send_telegram_message", new_callable=AsyncMock, return_value=True):
            sent1 = await send_scan_alerts(items, "disruptions")
            clear_alerted_cache()
            sent2 = await send_scan_alerts(items, "disruptions")

        assert sent1 == 1
        assert sent2 == 1


# ── send_telegram_message (mocked httpx) ───────────────────────────


class TestSendTelegramMessage:
    @pytest.mark.asyncio
    async def test_returns_false_when_not_configured(self):
        """Without telegram config, should return False immediately."""
        from backend.app.config import settings
        original_token = settings.telegram_bot_token
        original_ids = settings.telegram_chat_ids
        try:
            settings.telegram_bot_token = ""
            settings.telegram_chat_ids = ""
            result = await send_telegram_message("test")
            assert result is False
        finally:
            settings.telegram_bot_token = original_token
            settings.telegram_chat_ids = original_ids

    @pytest.mark.asyncio
    async def test_sends_to_configured_chat_ids(self):
        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "111,222"

        mock_response = AsyncMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.httpx.AsyncClient", return_value=mock_client):
            result = await send_telegram_message("Hello")

        assert result is True
        assert mock_client.post.call_count == 2
        # Verify both chat IDs were used
        calls = mock_client.post.call_args_list
        chat_ids_called = [c[1]["json"]["chat_id"] for c in calls]
        assert "111" in chat_ids_called
        assert "222" in chat_ids_called

    @pytest.mark.asyncio
    async def test_uses_specific_chat_id_when_provided(self):
        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "111,222"

        mock_response = AsyncMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.httpx.AsyncClient", return_value=mock_client):
            result = await send_telegram_message("Hello", chat_id="999")

        assert result is True
        assert mock_client.post.call_count == 1
        assert mock_client.post.call_args[1]["json"]["chat_id"] == "999"

    @pytest.mark.asyncio
    async def test_returns_false_on_api_error(self):
        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "111"

        mock_response = AsyncMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.httpx.AsyncClient", return_value=mock_client):
            result = await send_telegram_message("Hello")

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_exception(self):
        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "111"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("Network error"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.httpx.AsyncClient", return_value=mock_client):
            result = await send_telegram_message("Hello")

        assert result is False

    @pytest.mark.asyncio
    async def test_html_parse_mode_set(self):
        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_bot_token = "fake-token"
        mock_settings.telegram_chat_ids = "111"

        mock_response = AsyncMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.httpx.AsyncClient", return_value=mock_client):
            await send_telegram_message("<b>Test</b>")

        payload = mock_client.post.call_args[1]["json"]
        assert payload["parse_mode"] == "HTML"
        assert payload["disable_web_page_preview"] is True


# ── send_scan_alerts integration ───────────────────────────────────


class TestSendScanAlerts:
    @pytest.mark.asyncio
    async def test_returns_zero_when_not_configured(self):
        from backend.app.config import settings
        original_token = settings.telegram_bot_token
        original_ids = settings.telegram_chat_ids
        try:
            settings.telegram_bot_token = ""
            settings.telegram_chat_ids = ""
            sent = await send_scan_alerts([_make_disruption()], "disruptions")
            assert sent == 0
        finally:
            settings.telegram_bot_token = original_token
            settings.telegram_chat_ids = original_ids

    @pytest.mark.asyncio
    async def test_skips_low_severity(self):
        items = [_make_disruption(id="low-sev|eu", severity="Low")]

        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_min_severity = "High"

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.send_telegram_message", new_callable=AsyncMock, return_value=True) as mock_send:
            sent = await send_scan_alerts(items, "disruptions")

        assert sent == 0
        mock_send.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_items_without_id(self):
        items = [{"severity": "Critical", "event": "No ID event"}]

        mock_settings = MagicMock()
        mock_settings.has_telegram = True
        mock_settings.telegram_min_severity = "High"

        with patch("backend.app.services.telegram.settings", mock_settings), \
             patch("backend.app.services.telegram.send_telegram_message", new_callable=AsyncMock, return_value=True) as mock_send:
            sent = await send_scan_alerts(items, "disruptions")

        assert sent == 0
