"""Tests for Teams channel notification service."""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from backend.app.services.teams_channel import (
    _format_scan_alert_card,
    _format_resurface_card,
    _format_phase_transition_card,
    _should_alert,
    send_teams_channel_message,
    send_scan_channel_alerts,
)


class TestShouldAlert:
    def test_critical_event_passes(self):
        assert _should_alert({"severity": "Critical"}) is True

    def test_high_event_passes(self):
        assert _should_alert({"severity": "High"}) is True

    def test_medium_event_blocked_by_default(self):
        assert _should_alert({"severity": "Medium"}) is False

    def test_low_event_blocked(self):
        assert _should_alert({"severity": "Low"}) is False

    def test_risk_level_fallback(self):
        assert _should_alert({"risk_level": "Critical"}) is True


class TestFormatCards:
    def test_scan_alert_card_has_required_fields(self):
        item = {
            "id": "test|europe",
            "event": "Port Strike",
            "severity": "Critical",
            "region": "Northern Europe",
            "description": "Major port strike disrupting shipments.",
        }
        card = _format_scan_alert_card(item, "disruptions")
        assert card["type"] == "message"
        body = json.dumps(card)
        assert "Port Strike" in body
        assert "Critical" in body
        assert "Northern Europe" in body

    def test_resurface_card_shows_delta(self):
        card = _format_resurface_card(
            event_title="Ukraine Conflict",
            region="Eastern Europe",
            old_score=52,
            new_score=73,
            new_severity="High",
        )
        body = json.dumps(card)
        assert "RESURFACED" in body
        assert "52" in body
        assert "73" in body

    def test_phase_transition_card(self):
        card = _format_phase_transition_card(
            event_title="Ukraine Conflict",
            region="Eastern Europe",
            old_phase="Active Conflict",
            new_phase="Structural Trade Shift",
            phase_number=3,
        )
        body = json.dumps(card)
        assert "Phase 3" in body or "PHASE 3" in body
        assert "Structural Trade Shift" in body


class TestSendMessage:
    @pytest.mark.asyncio
    async def test_send_posts_to_webhook_url(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await send_teams_channel_message(
                {"type": "message", "attachments": []},
                "https://example.webhook.office.com/test",
            )
        assert result is True
        mock_client.post.assert_called_once()


class TestSendScanAlerts:
    @pytest.mark.asyncio
    async def test_dedup_prevents_duplicate_alerts(self):
        items = [
            {"id": "evt-1", "severity": "Critical", "event": "Event 1", "region": "EU"},
            {"id": "evt-1", "severity": "Critical", "event": "Event 1", "region": "EU"},
        ]
        with patch("backend.app.services.teams_channel.send_teams_channel_message", new_callable=AsyncMock, return_value=True) as mock_send, \
             patch("backend.app.services.teams_channel.settings") as mock_settings, \
             patch("backend.app.services.teams_channel._alerted_events", new=set()), \
             patch("backend.app.services.teams_channel._cache_loaded", True), \
             patch("backend.app.services.teams_channel.mark_event_alerted"):
            mock_settings.has_teams_channel = True
            mock_settings.teams_webhook_url = "https://example.webhook.office.com/test"
            mock_settings.teams_min_severity = "High"
            sent = await send_scan_channel_alerts(items, "disruptions")
        assert sent == 1  # dedup prevents second
