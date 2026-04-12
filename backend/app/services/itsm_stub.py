"""Stub ITSM bridge -- logs all operations without calling any external system.

Used when TARS_ITSM_PROVIDER is "none" (default) or during development.
All operations succeed immediately and return synthetic responses.
Every call is persisted to the itsm_sync_log table so there is a full
audit trail even before a real ServiceNow/Jira provider is connected.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from .itsm import ITSMBridge

logger = logging.getLogger(__name__)


class ITSMStub(ITSMBridge):
    """No-op ITSM bridge that logs operations for development and testing.

    Each instance maintains its own in-memory ticket store **and** persists
    every sync attempt to the ``itsm_sync_log`` database table.
    """

    def __init__(self) -> None:
        self._tickets: dict[str, dict] = {}

    def _log_sync(
        self,
        event_id: str,
        action: str,
        payload: dict,
        external_id: str | None = None,
    ) -> int:
        """Persist an ITSM sync attempt to the database and return the log entry ID."""
        from ..db.database import create_itsm_sync_log

        payload_json = json.dumps(payload, default=str)
        log_id = create_itsm_sync_log(
            event_id=event_id,
            action=action,
            payload_json=payload_json,
            status="stub",
            provider="stub",
            external_id=external_id,
        )
        return log_id

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

        # Persist to sync log
        log_payload = {
            "event_id": event_id,
            "title": title,
            "description": description,
            "priority": priority,
            "assignee": assignee,
            "labels": labels or [],
            **{k: v for k, v in kwargs.items()},
        }
        log_id = self._log_sync(event_id, "create_ticket", log_payload, external_id)

        logger.info(
            "[ITSM Stub] Created ticket %s for event %s: %s (priority=%s, assignee=%s, log_id=%d)",
            external_id, event_id, title, priority, assignee, log_id,
        )
        return {
            "id": external_id,
            "external_id": external_id,
            "url": None,
            "status": "open",
            "mode": "stub",
            "log_id": log_id,
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

        event_id = ticket.get("event_id", "unknown")

        if status:
            ticket["status"] = status
        if assignee:
            ticket["assignee"] = assignee
        if priority:
            ticket["priority"] = priority
        ticket["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Persist to sync log
        log_payload = {
            "external_id": external_id,
            "status": status,
            "assignee": assignee,
            "comment": comment,
            "priority": priority,
        }
        log_id = self._log_sync(event_id, "update_ticket", log_payload, external_id)

        logger.info(
            "[ITSM Stub] Updated ticket %s: status=%s, assignee=%s, comment=%s, log_id=%d",
            external_id, status, assignee, comment[:50] if comment else None, log_id,
        )
        return {
            "external_id": external_id,
            "status": ticket["status"],
            "assignee": ticket["assignee"],
            "updated_at": ticket["updated_at"],
            "mode": "stub",
            "log_id": log_id,
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

        event_id = ticket.get("event_id", "unknown")

        # Persist to sync log
        log_payload = {"external_id": external_id}
        log_id = self._log_sync(event_id, "sync_status", log_payload, external_id)

        logger.info("[ITSM Stub] sync_status for %s -> %s (log_id=%d)", external_id, ticket["status"], log_id)
        return {
            "external_id": external_id,
            "status": ticket["status"],
            "assignee": ticket["assignee"],
            "updated_at": ticket["updated_at"],
            "mode": "stub",
            "log_id": log_id,
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

        # Persist to sync log
        log_payload = {"query": query, "status": status, "limit": limit, "result_count": len(results[:limit])}
        log_id = self._log_sync("_list", "list_tickets", log_payload)

        logger.info("[ITSM Stub] list_tickets: query=%s, status=%s -> %d results (log_id=%d)", query, status, len(results[:limit]), log_id)
        return results[:limit]
