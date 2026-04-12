"""Stub ITSM bridge -- logs all operations without calling any external system.

Used when TARS_ITSM_PROVIDER is "none" (default) or during development.
All operations succeed immediately and return synthetic responses.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from .itsm import ITSMBridge

logger = logging.getLogger(__name__)


class ITSMStub(ITSMBridge):
    """No-op ITSM bridge that logs operations for development and testing.

    Each instance maintains its own in-memory ticket store.
    """

    def __init__(self) -> None:
        self._tickets: dict[str, dict] = {}

    async def create_ticket(
        self,
        event_id: str,
        title: str,
        description: str = "",
        priority: str = "normal",
        assignee: str | None = None,
        labels: list[str] | None = None,
        **kwargs: Any,
    ) -> dict:
        external_id = f"STUB-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc).isoformat()

        ticket = {
            "id": external_id,
            "external_id": external_id,
            "event_id": event_id,
            "title": title,
            "description": description,
            "priority": priority,
            "assignee": assignee,
            "labels": labels or [],
            "status": "open",
            "url": None,
            "created_at": now,
            "updated_at": now,
        }
        # Store any extra kwargs (e.g. severity) on the ticket
        for k, v in kwargs.items():
            ticket.setdefault(k, v)

        self._tickets[external_id] = ticket

        logger.info(
            "[ITSM Stub] Created ticket %s for event %s: %s (priority=%s, assignee=%s)",
            external_id, event_id, title, priority, assignee,
        )
        return {
            "id": external_id,
            "external_id": external_id,
            "url": None,
            "status": "open",
        }

    async def update_ticket(
        self,
        external_id: str,
        status: str | None = None,
        assignee: str | None = None,
        comment: str | None = None,
        priority: str | None = None,
    ) -> dict:
        ticket = self._tickets.get(external_id)
        if ticket is None:
            logger.warning("[ITSM Stub] Ticket %s not found for update", external_id)
            return {"external_id": external_id, "status": "not_found"}

        if status:
            ticket["status"] = status
        if assignee:
            ticket["assignee"] = assignee
        if priority:
            ticket["priority"] = priority
        ticket["updated_at"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "[ITSM Stub] Updated ticket %s: status=%s, assignee=%s, comment=%s",
            external_id, status, assignee, comment[:50] if comment else None,
        )
        return {
            "external_id": external_id,
            "status": ticket["status"],
            "assignee": ticket["assignee"],
            "updated_at": ticket["updated_at"],
        }

    async def sync_status(self, external_id: str) -> dict:
        ticket = self._tickets.get(external_id)
        if ticket is None:
            logger.info("[ITSM Stub] sync_status for unknown ticket %s", external_id)
            return {
                "external_id": external_id,
                "status": "unknown",
                "assignee": None,
                "updated_at": None,
            }

        logger.info("[ITSM Stub] sync_status for %s -> %s", external_id, ticket["status"])
        return {
            "external_id": external_id,
            "status": ticket["status"],
            "assignee": ticket["assignee"],
            "updated_at": ticket["updated_at"],
        }

    async def list_tickets(
        self,
        query: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        results = list(self._tickets.values())

        if status:
            results = [t for t in results if t["status"] == status]
        if query:
            q = query.lower()
            results = [t for t in results if q in t["title"].lower() or q in t.get("description", "").lower()]

        logger.info("[ITSM Stub] list_tickets: query=%s, status=%s -> %d results", query, status, len(results[:limit]))
        return results[:limit]
