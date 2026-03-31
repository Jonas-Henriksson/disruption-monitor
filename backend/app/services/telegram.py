"""Telegram push notification service for the Disruption Monitor.

Sends alerts when Critical or High severity disruptions are detected.
Uses the Telegram Bot API directly (no SDK dependency).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from urllib.parse import quote

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# Track which events we've already alerted on to avoid duplicate notifications
_alerted_events: set[str] = set()

# Severity ranking for filtering
_SEV_RANK = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


def _should_alert(item: dict) -> bool:
    """Check if an event meets the severity threshold for alerting."""
    severity = item.get("severity") or item.get("risk_level", "Low")
    min_rank = _SEV_RANK.get(settings.telegram_min_severity, 3)
    return _SEV_RANK.get(severity, 0) >= min_rank


def _format_alert(item: dict, mode: str) -> str:
    """Format a disruption event as a Telegram message with HTML formatting."""
    severity = item.get("severity") or item.get("risk_level", "Medium")
    title = item.get("event") or item.get("risk", "Unknown Event")
    region = item.get("region", "Global")
    trend = item.get("trend", "")

    # Severity indicator (ASCII-safe)
    sev_icon = {"Critical": "[!!!]", "High": "[!!]", "Medium": "[!]", "Low": "[i]"}.get(severity, "[?]")

    # Mode label
    mode_label = {"disruptions": "Disruption", "geopolitical": "Geopolitical", "trade": "Trade"}.get(mode, "Alert")

    # Build plain text message (HTML parse mode for simpler formatting)
    lines = [
        f"{sev_icon} <b>{severity.upper()}: {title}</b>",
        f"{mode_label} | {region} | {trend}",
        "",
    ]

    # Description
    desc = item.get("description") or item.get("this_week", "")
    if desc:
        lines.append(desc[:300])
        lines.append("")

    # SKF exposure
    exposure = item.get("skf_exposure") or item.get("skf_relevance") or item.get("skf_cost_impact", "")
    if exposure:
        lines.append(f"<b>SKF Impact:</b> {exposure[:200]}")
        lines.append("")

    # Affected sites
    affected = item.get("affected_sites", [])
    if affected:
        mfg_sites = [s for s in affected if s.get("type") == "mfg"]
        if mfg_sites:
            site_names = ", ".join(s["name"] for s in mfg_sites[:5])
            lines.append(f"<b>MFG Sites:</b> {site_names}")
            if len(mfg_sites) > 5:
                lines.append(f"   +{len(mfg_sites) - 5} more")

    # Recommended action
    action = item.get("recommended_action") or item.get("watchpoint", "")
    if action:
        lines.append(f"<b>Action:</b> {action[:200]}")

    lines.append("")
    lines.append(f"{datetime.now(timezone.utc).strftime('%H:%M UTC')} | SC Hub Disruption Monitor")

    return "\n".join(lines)


async def send_telegram_message(text: str, chat_id: str | None = None) -> bool:
    """Send a message to a Telegram chat via the Bot API.

    Returns True if sent successfully.
    """
    if not settings.has_telegram:
        return False

    token = settings.telegram_bot_token
    ids = [chat_id] if chat_id else [cid.strip() for cid in settings.telegram_chat_ids.split(",") if cid.strip()]

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    success = True

    async with httpx.AsyncClient(timeout=10.0) as client:
        for cid in ids:
            try:
                resp = await client.post(url, json={
                    "chat_id": cid,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                })
                if resp.status_code == 200:
                    logger.info("Telegram alert sent to %s", cid)
                else:
                    logger.warning("Telegram API error for %s: %s %s", cid, resp.status_code, resp.text[:200])
                    success = False
            except Exception as exc:
                logger.error("Failed to send Telegram message to %s: %s", cid, exc)
                success = False

    return success


async def send_scan_alerts(items: list[dict], mode: str) -> int:
    """Send Telegram alerts for new Critical/High events from a scan.

    Returns the number of alerts sent.
    """
    if not settings.has_telegram:
        return 0

    sent = 0
    for item in items:
        event_id = item.get("id", "")
        if not event_id or event_id in _alerted_events:
            continue
        if not _should_alert(item):
            continue

        message = _format_alert(item, mode)
        ok = await send_telegram_message(message)
        if ok:
            _alerted_events.add(event_id)
            sent += 1

    if sent:
        logger.info("Sent %d Telegram alerts for %s scan", sent, mode)
    return sent


def clear_alerted_cache() -> None:
    """Clear the alerted events cache (for testing)."""
    _alerted_events.clear()


def get_telegram_status() -> dict:
    """Return Telegram configuration status."""
    return {
        "configured": settings.has_telegram,
        "min_severity": settings.telegram_min_severity,
        "chat_ids": len([c for c in settings.telegram_chat_ids.split(",") if c.strip()]) if settings.telegram_chat_ids else 0,
        "alerted_events": len(_alerted_events),
    }
