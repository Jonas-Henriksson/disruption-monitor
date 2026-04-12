"""Action endpoints -- structured, trackable workflow actions for disruption events."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth.dependencies import get_current_user
from ..db.database import (
    create_action,
    get_action,
    get_actions,
    get_actions_for_event,
    get_event,
    update_action,
)
from ..models.schemas import Action, ActionCreate, ActionUpdate
from ..services.action_engine import generate_actions_for_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["actions"])


# ── GET /events/{event_id}/actions ─────────────────────────────────


@router.get("/events/{event_id}/actions", response_model=list[Action])
async def list_event_actions(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """List all structured actions for a disruption event.

    Returns actions sorted by priority (critical first).
    """
    event = get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    return get_actions_for_event(event_id)


# ── POST /events/{event_id}/actions ────────────────────────────────


@router.post("/events/{event_id}/actions", response_model=Action, status_code=201)
async def create_event_action(event_id: str, body: ActionCreate, user: dict[str, Any] = Depends(get_current_user)):
    """Manually create a new action for an event.

    Use this to add custom actions beyond what the auto-generator produces.
    """
    event = get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    due_str = body.due_date.isoformat() if body.due_date else None
    action_id = create_action(
        event_id=event_id,
        action_type=body.action_type,
        title=body.title,
        description=body.description,
        assignee_hint=body.assignee_hint,
        priority=body.priority,
        due_date=due_str,
    )
    row = get_action(action_id)
    return row


# ── POST /events/{event_id}/actions/generate ──────────────────────


@router.post("/events/{event_id}/actions/generate", response_model=list[Action])
async def generate_event_actions(event_id: str, user: dict[str, Any] = Depends(get_current_user)):
    """Auto-generate structured actions for an event based on severity and category.

    This replaces any existing pending actions for the event. Actions that are
    already in_progress or completed are preserved.
    """
    event = get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")

    # Generate actions from the rule engine
    action_defs = generate_actions_for_event(event)

    # Check existing actions to avoid duplicating types already being worked on
    existing = get_actions_for_event(event_id)
    active_types = {
        a["action_type"]
        for a in existing
        if a["status"] in ("in_progress", "completed")
    }

    created_actions = []
    for action_def in action_defs:
        if action_def["action_type"] in active_types:
            continue
        action_id = create_action(
            event_id=event_id,
            action_type=action_def["action_type"],
            title=action_def["title"],
            description=action_def["description"],
            assignee_hint=action_def["assignee_hint"],
            priority=action_def["priority"],
            due_date=action_def.get("due_date"),
        )
        row = get_action(action_id)
        if row:
            created_actions.append(row)

    return created_actions


# ── PATCH /actions/{action_id} ─────────────────────────────────────


@router.patch("/actions/{action_id}", response_model=Action)
async def patch_action(action_id: int, body: ActionUpdate, user: dict[str, Any] = Depends(get_current_user)):
    """Update an action's status, assignee, priority, or due date."""
    existing = get_action(action_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Action not found: {action_id}")

    due_str = body.due_date.isoformat() if body.due_date else None
    updated = update_action(
        action_id=action_id,
        status=body.status,
        assignee_hint=body.assignee_hint,
        priority=body.priority,
        due_date=due_str,
    )
    if not updated and body.status is None and body.assignee_hint is None and body.priority is None and body.due_date is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    return get_action(action_id)


# ── GET /actions ───────────────────────────────────────────────────


@router.get("/actions", response_model=list[Action])
async def list_actions(
    status: str | None = Query(None, description="Filter by status: pending, in_progress, completed, dismissed"),
    event_id: str | None = Query(None, description="Filter by event ID"),
    limit: int = Query(100, ge=1, le=500),
    user: dict[str, Any] = Depends(get_current_user),
):
    """List all actions across events with optional filters.

    Use ?status=pending to see all outstanding actions across the system.
    """
    return get_actions(status=status, event_id=event_id, limit=limit)
