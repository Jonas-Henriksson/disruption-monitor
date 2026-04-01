"""Event endpoints -- retrieve disruption details, recommendations, and manage lifecycle."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth.dependencies import get_current_user
from ..config import settings
from ..data import load_disruptions, load_geopolitical, load_trade
from ..db.database import get_event, get_events, get_timeline_data, update_event_status
from ..models.schemas import EventRecommendationsResponse
from ..services.telegram import _format_alert, send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


class StatusUpdate(BaseModel):
    status: str


def _find_event(event_id: str) -> dict | None:
    """Look up a disruption event by ID, first from DB then from sample data."""
    event = get_event(event_id)
    if event:
        return event
    # Fall back to sample data across all modes
    for loader in (load_disruptions, load_geopolitical, load_trade):
        for evt in loader():
            if evt["id"] == event_id:
                return evt
    return None


@router.get("")
async def list_events(mode: str | None = None, status: str | None = None, limit: int = 100):
    """List events with optional filters."""
    return get_events(mode=mode, status=status, limit=limit)


@router.get("/timeline")
async def get_timeline(days: int = 30):
    """Return risk data over time, grouped by day.

    Powers the Layer 2 risk timeline chart. Queries event_snapshots
    to build a daily breakdown of event counts by severity.
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="days must be between 1 and 365")
    return get_timeline_data(days=days)


@router.get("/{event_id}")
async def get_event_detail(event_id: str):
    """Return full event detail."""
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    return event


@router.get("/{event_id}/recommendations", response_model=EventRecommendationsResponse)
async def get_event_recommendations(event_id: str):
    """Return structured recommendations for a specific disruption event.

    Includes impact chain (affected sites, suppliers, unit exposure),
    prioritized recommended actions, confidence score, and sources.
    """
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    impact = event.get("impact")
    actions = event.get("actions")

    if impact is None or actions is None:
        raise HTTPException(
            status_code=404,
            detail=f"No structured recommendations available for event: {event_id}",
        )

    # Support different field names across disruption / geopolitical / trade events
    event_title = event.get("event") or event.get("risk", "Unknown")
    severity = event.get("severity") or event.get("risk_level", "Medium")
    skf_exposure = event.get("skf_exposure") or event.get("skf_relevance") or event.get("skf_cost_impact", "")

    return EventRecommendationsResponse(
        event_id=event["id"],
        event=event_title,
        severity=severity,
        impact=impact,
        actions=actions,
        confidence=event.get("confidence", 0.0),
        sources=event.get("sources", []),
        skf_exposure=skf_exposure,
    )


@router.patch("/{event_id}/status")
async def patch_event_status(event_id: str, body: StatusUpdate, user: dict[str, Any] = Depends(get_current_user)):
    """Update event lifecycle status (active, watching, archived)."""
    if body.status not in ("active", "watching", "archived"):
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    updated = update_event_status(event_id, body.status)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    return {"event_id": event_id, "status": body.status}


@router.post("/{event_id}/alert")
async def send_event_alert(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Send a Telegram alert for a specific event on demand."""
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    # Determine mode from event fields
    mode = "geopolitical" if "risk" in event and "event" not in event else "trade" if "corridor" in event else "disruptions"
    message = _format_alert(event, mode)
    ok = await send_telegram_message(message)
    return {"sent": ok, "event_id": event_id}


# ── Narrative generation ──────────────────────────────────────────


class NarrativeResponse(BaseModel):
    event_id: str
    narrative: str
    generated_by: str = "claude"


_NARRATIVE_PROMPT = """\
You are a supply chain intelligence analyst at SKF Group preparing a structured \
executive briefing for senior SC leadership.

Given the disruption event data below, produce a briefing in EXACTLY this format \
with these 4 sections. Use bullet points, not paragraphs. Be concrete — cite \
specific factory names, supplier counts, and numbers.

SITUATION:
• One bullet: what is happening, severity level, trend direction

EXPOSURE:
• Which specific SKF manufacturing sites are in the blast radius (name them)
• How many suppliers are affected and in which countries
• Estimated units/week at risk if known

RECOMMENDED ACTIONS:
• Action 1 with owner and timeframe (e.g., "Procurement: activate backup suppliers in Germany within 48h")
• Action 2 with owner and timeframe
• Action 3 if applicable

OUTLOOK:
• Recovery timeline with vs without mitigation
• Key risk: what could make this worse

No preamble, no sign-off, no hedging. Start directly with "SITUATION:".

Event data:
{event_json}
"""


@router.post("/{event_id}/narrative", response_model=NarrativeResponse)
async def generate_narrative(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Generate a Claude-powered SKF-specific exposure narrative for a disruption.

    Returns a 2-3 sentence executive briefing suitable for Monday leadership meetings.
    Requires ANTHROPIC_API_KEY to be configured; returns a pre-built fallback otherwise.
    """
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    if not settings.has_claude_api:
        # Build a decent fallback narrative from the event data itself
        narrative = _build_fallback_narrative(event)
        return NarrativeResponse(event_id=event_id, narrative=narrative, generated_by="fallback")

    try:
        narrative = await _generate_claude_narrative(event)
        return NarrativeResponse(event_id=event_id, narrative=narrative, generated_by="claude")
    except Exception as exc:
        logger.error("Narrative generation failed for %s: %s", event_id, exc)
        narrative = _build_fallback_narrative(event)
        return NarrativeResponse(event_id=event_id, narrative=narrative, generated_by="fallback")


async def _generate_claude_narrative(event: dict) -> str:
    """Call Claude to generate an executive narrative for an event."""
    import asyncio

    from ..services.scanner import _get_claude_client

    client = _get_claude_client()

    # Build a focused subset of event data for the prompt
    event_subset = {
        k: v
        for k, v in event.items()
        if k
        not in ("first_seen", "last_seen", "scan_count", "status", "lat", "lng", "trend_arrow")
    }
    event_json = json.dumps(event_subset, indent=2, default=str)

    # Run the synchronous Claude API call in a thread to avoid blocking the event loop
    response = await asyncio.to_thread(
        client.messages.create,
        model=settings.claude_model,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": _NARRATIVE_PROMPT.format(event_json=event_json),
            }
        ],
    )

    # Extract text
    for block in response.content:
        if hasattr(block, "text"):
            return block.text.strip()

    return _build_fallback_narrative(event)


def _build_fallback_narrative(event: dict) -> str:
    """Build a narrative from structured event data when Claude is unavailable."""
    title = event.get("event") or event.get("risk", "Unknown event")
    severity = event.get("severity") or event.get("risk_level", "Medium")
    exposure = (
        event.get("skf_exposure")
        or event.get("skf_relevance")
        or event.get("skf_cost_impact", "")
    )
    action = event.get("recommended_action", "")

    # Get affected site names from impact data if available
    impact = event.get("impact")
    site_names = ""
    if impact and impact.get("affected_sites"):
        names = [s["name"] for s in impact["affected_sites"][:4]]
        site_names = f" Affected sites: {', '.join(names)}."

    parts = [f"{title} ({severity})."]
    if exposure:
        parts.append(exposure)
    if site_names:
        parts.append(site_names.strip())
    if action:
        parts.append(f"Recommended action: {action}")

    return " ".join(parts)
