"""Event endpoints -- retrieve disruption details, recommendations, and manage lifecycle."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth.dependencies import get_current_user
from ..config import settings
from ..data import load_disruptions, load_geopolitical, load_trade
from ..db.database import get_event, get_event_edits, get_event_feedback, get_event_severity_history, get_events, get_feedback_stats, get_timeline_data, get_weekly_summary, save_event_edit, save_event_feedback, update_event_status
from ..models.schemas import EventFeedbackCreate, EventRecommendationsResponse, FeedbackStats
from ..services.narrative import (
    TalkingPoints,
    build_fallback_narrative,
    generate_claude_narrative,
    parse_talking_points,
)
from ..services.telegram import _format_alert, send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


class StatusUpdate(BaseModel):
    status: str


class EventEditCreate(BaseModel):
    field: str
    old_value: str
    new_value: str


class NarrativeUpdate(BaseModel):
    narrative: str


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
async def list_events(mode: str | None = None, status: str | None = None, limit: int = 100, user: dict[str, Any] = Depends(get_current_user)):
    """List events with optional filters."""
    return get_events(mode=mode, status=status, limit=limit)


@router.get("/feedback/stats", response_model=FeedbackStats)
async def feedback_stats():
    """Return aggregate event accuracy statistics.

    Precision = true_positives / (true_positives + false_positives).
    """
    return get_feedback_stats()


@router.get("/timeline")
async def get_timeline(days: int = 30, user: dict[str, Any] = Depends(get_current_user)):
    """Return risk data over time, grouped by day.

    Powers the Layer 2 risk timeline chart. Queries event_snapshots
    to build a daily breakdown of event counts by severity.
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="days must be between 1 and 365")
    return get_timeline_data(days=days)


@router.get("/weekly-summary")
async def weekly_summary(days: int = 7, user: dict[str, Any] = Depends(get_current_user)):
    """Return a curated weekly summary for Monday-morning executive review.

    Includes new, escalated, and resolved events; severity snapshot;
    overdue tickets; top regions; and week-over-week deltas.
    """
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="days must be between 1 and 90")
    return get_weekly_summary(days=days)


@router.get("/{event_id}")
async def get_event_detail(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Return full event detail with severity history for sparkline rendering."""
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    # Attach severity history from snapshots (powers frontend sparkline)
    event["severity_history"] = get_event_severity_history(event_id)
    return event


@router.get("/{event_id}/recommendations", response_model=EventRecommendationsResponse)
async def get_event_recommendations(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
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


@router.post("/{event_id}/feedback")
async def submit_event_feedback(event_id: str, body: EventFeedbackCreate):
    """Submit accuracy feedback for an event (true_positive, false_positive, missed)."""
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    feedback_id = save_event_feedback(
        event_id=event_id,
        outcome=body.outcome,
        actual_impact=body.actual_impact,
        feedback_by=body.feedback_by,
    )
    return {"id": feedback_id, "event_id": event_id, "outcome": body.outcome}


@router.get("/{event_id}/feedback")
async def get_event_feedback_entries(event_id: str):
    """Get all feedback entries for a specific event."""
    return get_event_feedback(event_id)


# ── Event edits ─────────────────────────────────────────────────────


@router.post("/{event_id}/edits")
async def create_event_edit(event_id: str, body: EventEditCreate, user: dict[str, Any] = Depends(get_current_user)):
    """Save a user edit to an AI-generated field (audit trail)."""
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    save_event_edit(event_id, body.field, body.old_value, body.new_value)
    return {"event_id": event_id, "field": body.field, "saved": True}


@router.get("/{event_id}/edits")
async def list_event_edits(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Return all user edits for an event."""
    return get_event_edits(event_id)


@router.patch("/{event_id}/narrative")
async def save_narrative_edit(event_id: str, body: NarrativeUpdate, user: dict[str, Any] = Depends(get_current_user)):
    """Save a user-edited narrative for an event.

    Stores the edit in event_edits with field='narrative'.
    Future narrative requests will return this version instead of calling Claude.
    """
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    # Check for existing narrative edits to use as old_value
    edits = get_event_edits(event_id)
    narrative_edits = [e for e in edits if e["field"] == "narrative"]
    old_value = narrative_edits[0]["edited_value"] if narrative_edits else "(ai-generated)"

    save_event_edit(event_id, "narrative", old_value, body.narrative)
    return {"event_id": event_id, "narrative": body.narrative, "edited": True}


# ── Narrative generation ──────────────────────────────────────────


class NarrativeResponse(BaseModel):
    event_id: str
    narrative: str
    talking_points: TalkingPoints | None = None
    generated_by: str = "claude"
    generated_at: str | None = None


# Keep underscore-prefixed aliases for backward compatibility with tests
# that import directly from this module.
_parse_talking_points = parse_talking_points
from ..services.narrative import parse_sections_fallback as _parse_sections_fallback
from ..services.narrative import talking_points_to_narrative as _talking_points_to_narrative
_build_fallback_narrative = build_fallback_narrative


@router.post("/{event_id}/narrative", response_model=NarrativeResponse)
async def generate_narrative(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Generate a Claude-powered SKF-specific exposure narrative for a disruption.

    Returns a structured executive briefing suitable for Monday leadership meetings.
    If the user has previously edited the narrative, returns the edited version instead.
    Requires ANTHROPIC_API_KEY to be configured; returns a pre-built fallback otherwise.
    """
    event = _find_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    now = datetime.now(timezone.utc).isoformat()

    # Check if user has edited the narrative — return their version instead of regenerating
    edits = get_event_edits(event_id)
    narrative_edits = [e for e in edits if e["field"] == "narrative"]
    if narrative_edits:
        user_narrative = narrative_edits[0]["edited_value"]
        tp = parse_talking_points(user_narrative)
        return NarrativeResponse(
            event_id=event_id, narrative=user_narrative, talking_points=tp,
            generated_by="user-edited", generated_at=narrative_edits[0].get("edited_at", now),
        )

    if not settings.has_claude_api:
        narrative, tp = build_fallback_narrative(event)
        return NarrativeResponse(
            event_id=event_id, narrative=narrative, talking_points=tp,
            generated_by="fallback", generated_at=now,
        )

    try:
        narrative = await generate_claude_narrative(event)
        tp = parse_talking_points(narrative)
        return NarrativeResponse(
            event_id=event_id, narrative=narrative, talking_points=tp,
            generated_by="claude", generated_at=now,
        )
    except Exception as exc:
        logger.error("Narrative generation failed for %s: %s", event_id, exc)
        narrative, tp = build_fallback_narrative(event)
        return NarrativeResponse(
            event_id=event_id, narrative=narrative, talking_points=tp,
            generated_by="fallback", generated_at=now,
        )
