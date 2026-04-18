"""Tests for action assignment, completion, and dismissal."""
import pytest
from datetime import datetime, timezone
from backend.app.db.database import (
    create_action, get_action, get_actions, get_actions_for_event,
    update_action, _init_db, get_db,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr("backend.app.db.database.DB_PATH", db_path)
    monkeypatch.setattr("backend.app.db.database.settings.db_path", db_path)
    _init_db()
    # Insert a test event
    with get_db() as conn:
        conn.execute(
            "INSERT INTO events (id, mode, event_title, severity, payload, status, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("test-event|europe", "disruptions", "Test Event", "High", "{}", "active",
             datetime.now(timezone.utc).isoformat(), datetime.now(timezone.utc).isoformat()),
        )
    yield


class TestActionAssignment:
    def test_create_action_with_source(self):
        aid = create_action(
            "test-event|europe", "contact_supplier",
            title="Call Tata Steel",
            source="manual",
            created_by_email="jonas@skf.com",
            created_by_name="Jonas Henriksson",
        )
        action = get_action(aid)
        assert action["source"] == "manual"
        assert action["created_by_email"] == "jonas@skf.com"
        assert action["created_by_name"] == "Jonas Henriksson"

    def test_assign_action(self):
        aid = create_action("test-event|europe", "contact_supplier")
        ok = update_action(
            aid,
            status="assigned",
            assignee_email="maria@skf.com",
            assignee_name="Maria Lindberg",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "assigned"
        assert action["assignee_email"] == "maria@skf.com"
        assert action["assignee_name"] == "Maria Lindberg"

    def test_complete_action_with_note(self):
        aid = create_action("test-event|europe", "contact_supplier")
        ok = update_action(
            aid,
            status="completed",
            completion_note="Spoke to supplier, 6-week lead time confirmed",
            evidence_url="https://teams.microsoft.com/msg/123",
            completed_by_email="maria@skf.com",
            completed_by_name="Maria Lindberg",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "completed"
        assert action["completion_note"] == "Spoke to supplier, 6-week lead time confirmed"
        assert action["evidence_url"] == "https://teams.microsoft.com/msg/123"
        assert action["completed_at"] is not None

    def test_dismiss_action_with_reason(self):
        aid = create_action("test-event|europe", "monitor_situation")
        ok = update_action(
            aid,
            status="dismissed",
            dismissed_reason="Already handled by Munich office",
            dismissed_by_email="jonas@skf.com",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "dismissed"
        assert action["dismissed_reason"] == "Already handled by Munich office"
        assert action["dismissed_at"] is not None

    def test_get_actions_by_assignee(self):
        create_action("test-event|europe", "contact_supplier",
                       assignee_email="maria@skf.com", status="assigned")
        create_action("test-event|europe", "monitor_situation",
                       assignee_email="erik@skf.com", status="assigned")
        create_action("test-event|europe", "reroute_shipment",
                       assignee_email="maria@skf.com", status="in_progress")

        maria_actions = get_actions(assignee_email="maria@skf.com")
        assert len(maria_actions) == 2
        assert all(a["assignee_email"] == "maria@skf.com" for a in maria_actions)

    def test_custom_action_type(self):
        aid = create_action(
            "test-event|europe", "custom",
            title="Verify warehouse inventory levels",
            description="Check Gothenburg warehouse for backup stock",
            source="manual",
        )
        action = get_action(aid)
        assert action["action_type"] == "custom"
        assert action["source"] == "manual"
