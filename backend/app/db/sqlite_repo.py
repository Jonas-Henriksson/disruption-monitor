"""SQLite implementation of the Repository interface.

Delegates all operations to the existing database.py module functions.
This adapter allows a future DynamoDB (or other) implementation to be
swapped in without changing any router or service code.

Usage:
    from ..db.sqlite_repo import SQLiteRepository
    repo = SQLiteRepository()
    events = repo.get_events(mode="disruptions")
"""

from __future__ import annotations

from . import database as db
from .repository import Repository


class SQLiteRepository(Repository):
    """Concrete repository backed by SQLite via database.py."""

    # ── Scan records ──────────────────────────────────────────────

    def save_scan_record(self, scan_id, mode, source, item_count, started_at, completed_at=None, status="completed"):
        return db.save_scan_record(scan_id, mode, source, item_count, started_at, completed_at, status)

    def get_latest_scan(self, mode):
        return db.get_latest_scan(mode)

    def get_scan_history(self, mode=None, limit=50):
        return db.get_scan_history(mode, limit)

    # ── Events ────────────────────────────────────────────────────

    def upsert_event(self, event_id, mode, payload, scan_id):
        return db.upsert_event(event_id, mode, payload, scan_id)

    def get_events(self, mode=None, status=None, limit=100):
        return db.get_events(mode, status, limit)

    def get_event(self, event_id):
        return db.get_event(event_id)

    def update_event_status(self, event_id, status):
        return db.update_event_status(event_id, status)

    # ── Tickets ───────────────────────────────────────────────────

    def create_ticket(self, event_id, owner=None, notes=None, due_date=None, priority=None):
        return db.create_ticket(event_id, owner, notes, due_date, priority)

    def update_ticket(self, ticket_id, owner=None, status=None, notes=None, due_date=None, priority=None):
        return db.update_ticket(ticket_id, owner, status, notes, due_date, priority)

    def get_tickets(self, event_id=None):
        return db.get_tickets(event_id)

    def get_overdue_tickets(self):
        return db.get_overdue_tickets()

    # ── Actions (structured workflows) ────────────────────────────

    def create_action(self, event_id, action_type, title, description=None, assignee_hint=None, priority="normal", due_date=None):
        return db.create_action(event_id, action_type, title, description, assignee_hint, priority, due_date)

    def get_actions_for_event(self, event_id):
        return db.get_actions_for_event(event_id)

    def get_actions(self, status=None, event_id=None, limit=100):
        return db.get_actions(status, event_id, limit)

    def update_action(self, action_id, status=None, assignee_hint=None, due_date=None, priority=None):
        return db.update_action(action_id, status, assignee_hint, due_date, priority)

    def get_action(self, action_id):
        return db.get_action(action_id)

    # ── Event edits (audit trail) ─────────────────────────────────

    def save_event_edit(self, event_id, field, original_value, edited_value, edited_by="jh"):
        return db.save_event_edit(event_id, field, original_value, edited_value, edited_by)

    def get_event_edits(self, event_id):
        return db.get_event_edits(event_id)

    # ── Event feedback ────────────────────────────────────────────

    def save_event_feedback(self, event_id, outcome, actual_impact=None, feedback_by="unknown"):
        return db.save_event_feedback(event_id, outcome, actual_impact, feedback_by)

    def get_event_feedback(self, event_id):
        return db.get_event_feedback(event_id)

    def get_feedback_stats(self):
        return db.get_feedback_stats()

    # ── Timeline & stats ──────────────────────────────────────────

    def get_timeline_data(self, days=30):
        return db.get_timeline_data(days)

    def get_weekly_summary(self, days=7):
        return db.get_weekly_summary(days)

    def get_db_stats(self):
        return db.get_db_stats()

    # ── Telegram dedup ────────────────────────────────────────────

    def is_event_alerted(self, event_id):
        return db.is_event_alerted(event_id)

    def mark_event_alerted(self, event_id):
        return db.mark_event_alerted(event_id)

    def get_all_alerted_event_ids(self):
        return db.get_all_alerted_event_ids()


# ── Singleton accessor ────────────────────────────────────────────

_instance: Repository | None = None


def get_repository() -> Repository:
    """Return the singleton Repository instance.

    Currently always returns SQLiteRepository. When DynamoDB is ready,
    this will check config to decide which implementation to instantiate.

    TODO: Read settings.db_backend (sqlite|dynamodb) and return the
    appropriate implementation. Example:
        if settings.db_backend == "dynamodb":
            from .dynamodb_repo import DynamoDBRepository
            _instance = DynamoDBRepository()
    """
    global _instance
    if _instance is None:
        _instance = SQLiteRepository()
    return _instance
