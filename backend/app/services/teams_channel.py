"""Teams channel notifications via Incoming Webhook.

Posts adaptive cards to a configured Teams channel for:
- Scan alerts (new Critical/High events)
- Archive resurrection alerts
- Evolution phase transitions
- Daily digest summaries

Mirrors the Telegram service pattern: severity filtering, dedup, fire-and-forget.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import settings
from ..db.database import get_all_alerted_event_ids, mark_event_alerted

logger = logging.getLogger(__name__)

# In-memory dedup cache, same pattern as telegram.py
_alerted_events: set[str] = set()
_cache_loaded: bool = False

_SEV_RANK = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
_SEV_COLOR = {
    "Critical": "attention",
    "High": "warning",
    "Medium": "accent",
    "Low": "good",
}


def _ensure_cache_loaded() -> None:
    global _cache_loaded
    if not _cache_loaded:
        try:
            _alerted_events.update(get_all_alerted_event_ids())
        except Exception:
            logger.warning("Failed to load alerted events from DB for Teams")
        _cache_loaded = True


def _should_alert(item: dict) -> bool:
    """Check if an event meets the severity threshold."""
    severity = item.get("severity") or item.get("risk_level", "Low")
    min_rank = _SEV_RANK.get(settings.teams_min_severity, 3)
    return _SEV_RANK.get(severity, 0) >= min_rank


def _format_scan_alert_card(item: dict, mode: str) -> dict:
    """Format a scan alert as a Teams adaptive card message."""
    severity = item.get("severity") or item.get("risk_level", "Medium")
    title = item.get("event") or item.get("risk", "Unknown Event")
    region = item.get("region", "Global")
    description = item.get("description", "")
    score = (item.get("computed_severity") or {}).get("score", "")
    mode_label = {"disruptions": "Disruption", "geopolitical": "Geopolitical", "trade": "Trade"}.get(mode, mode)

    return {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": f"\U0001f534 {severity} \u2014 {mode_label} Alert",
                        "weight": "bolder",
                        "size": "medium",
                        "color": _SEV_COLOR.get(severity, "default"),
                    },
                    {
                        "type": "TextBlock",
                        "text": title,
                        "weight": "bolder",
                        "size": "large",
                        "wrap": True,
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Region", "value": region},
                            {"title": "Score", "value": str(score)},
                            {"title": "Severity", "value": severity},
                        ],
                    },
                    *([{"type": "TextBlock", "text": description[:300], "wrap": True, "size": "small"}] if description else []),
                ],
            },
        }],
    }


def _format_resurface_card(
    event_title: str, region: str, old_score: int, new_score: int, new_severity: str
) -> dict:
    """Format a resurrection alert as a Teams adaptive card."""
    delta = new_score - old_score
    return {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": f"\U0001f7e1 RESURFACED \u2014 Severity Increased (+{delta})",
                        "weight": "bolder",
                        "size": "medium",
                        "color": "warning",
                    },
                    {
                        "type": "TextBlock",
                        "text": event_title,
                        "weight": "bolder",
                        "size": "large",
                        "wrap": True,
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Region", "value": region},
                            {"title": "Was", "value": f"Archived at score {old_score}"},
                            {"title": "Now", "value": f"{new_severity} \u2014 score {new_score}"},
                        ],
                    },
                    {
                        "type": "TextBlock",
                        "text": "This event was previously archived but has resurfaced because its severity increased.",
                        "wrap": True,
                        "size": "small",
                        "isSubtle": True,
                    },
                ],
            },
        }],
    }


def _format_phase_transition_card(
    event_title: str, region: str, old_phase: str, new_phase: str, phase_number: int
) -> dict:
    """Format a phase transition alert as a Teams adaptive card."""
    return {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": f"\U0001f535 Phase Transition \u2014 Phase {phase_number}",
                        "weight": "bolder",
                        "size": "medium",
                        "color": "accent",
                    },
                    {
                        "type": "TextBlock",
                        "text": event_title,
                        "weight": "bolder",
                        "size": "large",
                        "wrap": True,
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Region", "value": region},
                            {"title": "Previous Phase", "value": old_phase or "Initial"},
                            {"title": "New Phase", "value": new_phase},
                        ],
                    },
                ],
            },
        }],
    }


async def send_teams_channel_message(card: dict, webhook_url: str | None = None) -> bool:
    """POST an adaptive card to a Teams Incoming Webhook URL."""
    url = webhook_url or settings.teams_webhook_url
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=card)
            if resp.status_code == 200:
                logger.info("Teams channel message sent successfully")
                return True
            logger.warning("Teams webhook returned %s: %s", resp.status_code, resp.text[:200])
            return False
    except Exception as exc:
        logger.error("Teams channel send failed: %s", exc)
        return False


async def send_scan_channel_alerts(items: list[dict], mode: str) -> int:
    """Send Teams channel alerts for new Critical/High events from a scan."""
    if not settings.has_teams_channel:
        return 0

    _ensure_cache_loaded()
    sent = 0

    for item in items:
        event_id = item.get("id", "")
        if not event_id or event_id in _alerted_events:
            continue
        if not _should_alert(item):
            continue

        card = _format_scan_alert_card(item, mode)
        ok = await send_teams_channel_message(card)
        if ok:
            _alerted_events.add(event_id)
            try:
                mark_event_alerted(event_id)
            except Exception:
                logger.warning("Failed to persist alerted event %s to DB", event_id)
            sent += 1

    if sent:
        logger.info("Sent %d Teams channel alerts for %s scan", sent, mode)
    return sent


async def send_resurface_alert(
    event_title: str, region: str, old_score: int, new_score: int, new_severity: str
) -> bool:
    """Send a resurrection alert to the Teams channel."""
    if not settings.has_teams_channel:
        return False
    card = _format_resurface_card(event_title, region, old_score, new_score, new_severity)
    return await send_teams_channel_message(card)


async def send_phase_transition_alert(
    event_title: str, region: str, old_phase: str, new_phase: str, phase_number: int
) -> bool:
    """Send a phase transition alert to the Teams channel."""
    if not settings.has_teams_channel:
        return False
    card = _format_phase_transition_card(event_title, region, old_phase, new_phase, phase_number)
    return await send_teams_channel_message(card)


def get_teams_channel_status() -> dict[str, Any]:
    """Return Teams channel integration status for health endpoint."""
    return {
        "configured": settings.has_teams_channel,
        "min_severity": settings.teams_min_severity,
        "digest_enabled": settings.teams_digest_enabled,
    }
