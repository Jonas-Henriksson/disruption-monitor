"""Abstract repository interface for the Disruption Monitor persistence layer.

This abstraction decouples routers and services from the concrete storage backend
(currently SQLite). When the time comes to migrate to DynamoDB or another store,
implement the Repository protocol and swap the binding -- no router changes needed.

Usage:
    from ..db.repository import get_repository
    repo = get_repository()
    events = repo.get_events(mode="disruptions")
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Repository(ABC):
    """Abstract persistence interface.

    Every method corresponds to a database operation currently in database.py.
    Implementations must be safe to call from async context (either natively
    async or wrapped in asyncio.to_thread).
    """

    # ── Scan records ──────────────────────────────────────────────

    @abstractmethod
    def save_scan_record(
        self,
        scan_id: str,
        mode: str,
        source: str,
        item_count: int,
        started_at: str,
        completed_at: str | None = None,
        status: str = "completed",
    ) -> None: ...

    @abstractmethod
    def get_latest_scan(self, mode: str) -> dict | None: ...

    @abstractmethod
    def get_scan_history(self, mode: str | None = None, limit: int = 50) -> list[dict]: ...

    # ── Events ────────────────────────────────────────────────────

    @abstractmethod
    def upsert_event(self, event_id: str, mode: str, payload: dict, scan_id: str) -> bool: ...

    @abstractmethod
    def get_events(self, mode: str | None = None, status: str | None = None, limit: int = 100) -> list[dict]: ...

    @abstractmethod
    def get_event(self, event_id: str) -> dict | None: ...

    @abstractmethod
    def update_event_status(self, event_id: str, status: str) -> bool: ...

    # ── Tickets ───────────────────────────────────────────────────

    @abstractmethod
    def create_ticket(
        self,
        event_id: str,
        owner: str | None = None,
        notes: str | None = None,
        due_date: str | None = None,
        priority: str | None = None,
    ) -> int: ...

    @abstractmethod
    def update_ticket(
        self,
        ticket_id: int,
        owner: str | None = None,
        status: str | None = None,
        notes: str | None = None,
        due_date: str | None = None,
        priority: str | None = None,
    ) -> bool: ...

    @abstractmethod
    def get_tickets(self, event_id: str | None = None) -> list[dict]: ...

    @abstractmethod
    def get_overdue_tickets(self) -> list[dict]: ...

    # ── Actions (structured workflows) ────────────────────────────

    @abstractmethod
    def create_action(
        self,
        event_id: str,
        action_type: str,
        title: str,
        description: str | None = None,
        assignee_hint: str | None = None,
        priority: str = "normal",
        due_date: str | None = None,
    ) -> int: ...

    @abstractmethod
    def get_actions_for_event(self, event_id: str) -> list[dict]: ...

    @abstractmethod
    def get_actions(self, status: str | None = None, event_id: str | None = None, limit: int = 100) -> list[dict]: ...

    @abstractmethod
    def update_action(
        self,
        action_id: int,
        status: str | None = None,
        assignee_hint: str | None = None,
        due_date: str | None = None,
        priority: str | None = None,
    ) -> bool: ...

    @abstractmethod
    def get_action(self, action_id: int) -> dict | None: ...

    # ── Event edits (audit trail) ─────────────────────────────────

    @abstractmethod
    def save_event_edit(self, event_id: str, field: str, original_value: str, edited_value: str, edited_by: str = "jh") -> None: ...

    @abstractmethod
    def get_event_edits(self, event_id: str) -> list[dict]: ...

    # ── Event feedback ────────────────────────────────────────────

    @abstractmethod
    def save_event_feedback(self, event_id: str, outcome: str, actual_impact: str | None = None, feedback_by: str = "unknown") -> int: ...

    @abstractmethod
    def get_event_feedback(self, event_id: str) -> list[dict]: ...

    @abstractmethod
    def get_feedback_stats(self) -> dict: ...

    # ── Timeline & stats ──────────────────────────────────────────

    @abstractmethod
    def get_timeline_data(self, days: int = 30) -> list[dict]: ...

    @abstractmethod
    def get_weekly_summary(self, days: int = 7) -> dict: ...

    @abstractmethod
    def get_db_stats(self) -> dict: ...

    # ── Telegram dedup ────────────────────────────────────────────

    @abstractmethod
    def is_event_alerted(self, event_id: str) -> bool: ...

    @abstractmethod
    def mark_event_alerted(self, event_id: str) -> None: ...

    @abstractmethod
    def get_all_alerted_event_ids(self) -> set[str]: ...
