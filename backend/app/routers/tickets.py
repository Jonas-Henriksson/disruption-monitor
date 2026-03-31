"""Ticket endpoints -- lightweight task tracking linked to disruption events."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..db.database import create_ticket, get_tickets, update_ticket
from ..models.schemas import Ticket, TicketCreate, TicketUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tickets"])


def _ticket_from_row(row: dict) -> Ticket:
    """Convert a raw DB row dict into a validated Ticket model."""
    return Ticket(**row)


def _upsert_ticket(event_id: str, owner: str | None = None, notes: str | None = None) -> dict:
    """Create a ticket if none exists for event_id, otherwise update the existing one.

    Returns the full ticket row dict after the operation.
    """
    existing = get_tickets(event_id=event_id)
    if existing:
        ticket_row = existing[0]
        # Build updates from provided fields
        has_update = False
        if owner is not None:
            has_update = True
        if notes is not None:
            has_update = True
        if has_update:
            update_ticket(ticket_row["id"], owner=owner, notes=notes)
            # Re-fetch to get updated values
            return get_tickets(event_id=event_id)[0]
        return ticket_row
    else:
        try:
            ticket_id = create_ticket(event_id, owner=owner, notes=notes)
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=422,
                detail=f"Event not found: {event_id}. Cannot create ticket for non-existent event.",
            )
        rows = get_tickets(event_id=event_id)
        return rows[0]


# ── GET /events/{event_id}/ticket ────────────────────────────────


@router.get("/events/{event_id}/ticket")
async def get_event_ticket(event_id: str):
    """Get the ticket for an event. Returns null if no ticket exists (not 404)."""
    tickets = get_tickets(event_id=event_id)
    if not tickets:
        return None
    return _ticket_from_row(tickets[0])


# ── POST /events/{event_id}/ticket ───────────────────────────────


@router.post("/events/{event_id}/ticket", response_model=Ticket, status_code=200)
async def create_or_update_ticket(event_id: str, body: TicketUpdate):
    """Create or update (upsert) a ticket for an event.

    If a ticket already exists for this event_id, updates it with the
    provided fields. Otherwise creates a new ticket. This is the
    'assign to someone' action.
    """
    row = _upsert_ticket(event_id, owner=body.owner, notes=body.notes)
    return _ticket_from_row(row)


# ── PATCH /events/{event_id}/ticket ──────────────────────────────


@router.patch("/events/{event_id}/ticket", response_model=Ticket)
async def update_event_ticket(event_id: str, body: TicketUpdate):
    """Update ticket status, owner, or notes.

    Returns the updated ticket. Creates a new ticket if none exists
    (graceful — avoids forcing callers to POST first).
    """
    existing = get_tickets(event_id=event_id)
    if not existing:
        # Graceful creation on PATCH — lightweight tickets shouldn't require
        # a strict POST-before-PATCH ceremony.
        try:
            ticket_id = create_ticket(event_id, owner=body.owner, notes=body.notes)
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=422,
                detail=f"Event not found: {event_id}. Cannot create ticket for non-existent event.",
            )
        rows = get_tickets(event_id=event_id)
        if body.status and body.status != "open":
            update_ticket(rows[0]["id"], status=body.status)
            rows = get_tickets(event_id=event_id)
        return _ticket_from_row(rows[0])

    ticket_row = existing[0]
    updated = update_ticket(
        ticket_row["id"],
        owner=body.owner,
        status=body.status,
        notes=body.notes,
    )
    refreshed = get_tickets(event_id=event_id)
    return _ticket_from_row(refreshed[0])


# ── GET /tickets ─────────────────────────────────────────────────


@router.get("/tickets", response_model=list[Ticket])
async def list_tickets(
    status: str | None = Query(None, description="Filter by status (open, assigned, in_progress, blocked, done)"),
    owner: str | None = Query(None, description="Filter by owner"),
):
    """List all tickets, optionally filtered by status or owner.

    Useful for a 'my tasks' view.
    """
    all_tickets = get_tickets()

    results = all_tickets
    if status:
        results = [t for t in results if t.get("status") == status]
    if owner:
        results = [t for t in results if t.get("owner") == owner]

    return [_ticket_from_row(t) for t in results]
