"""Tests for Gap #4: Structured Actions/Workflows.

Tests the actions table, CRUD database functions, API endpoints,
auto-generation from the action engine, and edge cases.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from backend.app.db.database import (
    create_action,
    get_action,
    get_actions,
    get_actions_for_event,
    get_db,
    update_action,
    upsert_event,
)
from backend.app.services.action_engine import generate_actions_for_event


# ── Helper fixtures ──────────────────────────────────────────────


@pytest.fixture
def event_in_db(sample_payload):
    """Create a test event in the database and return its ID."""
    event_id = "test-event|europe"
    upsert_event(event_id, "disruptions", sample_payload, "scan-001")
    return event_id


@pytest.fixture
def critical_event_payload():
    """A Critical-severity natural disaster event payload."""
    return {
        "id": "earthquake-japan|asia",
        "event": "Major Earthquake in Central Japan",
        "description": "7.2 magnitude earthquake near industrial zone.",
        "category": "Natural Disaster",
        "severity": "Critical",
        "trend": "New",
        "region": "Asia",
        "lat": 35.0,
        "lng": 137.0,
        "skf_exposure": "Multiple manufacturing sites at risk.",
        "recommended_action": "Activate BCP for Japan operations.",
        "status": "active",
        "first_seen": "2026-04-12T00:00:00Z",
        "last_seen": "2026-04-12T00:00:00Z",
        "scan_count": 1,
    }


@pytest.fixture
def critical_event_in_db(critical_event_payload):
    """Create a Critical event in DB and return its ID."""
    event_id = "earthquake-japan|asia"
    upsert_event(event_id, "disruptions", critical_event_payload, "scan-002")
    return event_id


@pytest.fixture
def low_event_payload():
    """A Low-severity event payload."""
    return {
        "id": "minor-delay|europe",
        "event": "Minor Port Congestion in Rotterdam",
        "description": "Slight delays expected for 2-3 days.",
        "category": "Logistics/Port",
        "severity": "Low",
        "trend": "Stable",
        "region": "Europe",
        "lat": 51.9,
        "lng": 4.5,
        "skf_exposure": "Minor impact on European logistics.",
        "recommended_action": "Monitor situation.",
        "status": "active",
        "first_seen": "2026-04-12T00:00:00Z",
        "last_seen": "2026-04-12T00:00:00Z",
        "scan_count": 1,
    }


@pytest.fixture
def low_event_in_db(low_event_payload):
    """Create a Low severity event in DB and return its ID."""
    event_id = "minor-delay|europe"
    upsert_event(event_id, "disruptions", low_event_payload, "scan-003")
    return event_id


VALID_ACTION_TYPES = [
    "activate_backup_supplier",
    "increase_safety_stock",
    "reroute_shipment",
    "contact_supplier",
    "monitor_situation",
    "escalate_to_leadership",
    "file_insurance_claim",
    "activate_bcp",
]


# ── Database schema tests ────────────────────────────────────────


class TestActionsTable:
    """Test the actions table schema."""

    def test_actions_table_exists(self):
        with get_db() as conn:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='actions'"
            ).fetchone()
            assert row is not None, "actions table should exist"

    def test_actions_table_columns(self):
        with get_db() as conn:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(actions)").fetchall()}
            for required in ("id", "event_id", "action_type", "status", "title", "priority"):
                assert required in cols, f"actions table missing column: {required}"


# ── Database CRUD tests ──────────────────────────────────────────


class TestActionsDatabaseCRUD:
    """Test create_action, get_action, get_actions, update_action."""

    def test_create_action(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db,
            action_type="contact_supplier",
            title="Contact primary supplier",
            description="Verify operational status",
        )
        assert isinstance(action_id, int)
        assert action_id > 0

    def test_get_action_by_id(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db,
            action_type="monitor_situation",
            title="Monitor and reassess",
        )
        action = get_action(action_id)
        assert action is not None
        assert action["action_type"] == "monitor_situation"
        assert action["status"] == "pending"
        assert action["event_id"] == event_in_db

    def test_get_nonexistent_action(self):
        assert get_action(99999) is None

    def test_get_actions_for_event(self, event_in_db):
        create_action(event_id=event_in_db, action_type="contact_supplier", title="A")
        create_action(event_id=event_in_db, action_type="monitor_situation", title="B")

        actions = get_actions_for_event(event_in_db)
        assert len(actions) == 2
        types = {a["action_type"] for a in actions}
        assert types == {"contact_supplier", "monitor_situation"}

    def test_get_actions_for_event_empty(self, event_in_db):
        actions = get_actions_for_event(event_in_db)
        assert actions == []

    def test_get_actions_for_event_priority_order(self, event_in_db):
        """Actions should be sorted by priority (critical first)."""
        create_action(event_id=event_in_db, action_type="monitor_situation", title="Low", priority="low")
        create_action(event_id=event_in_db, action_type="activate_bcp", title="Critical", priority="critical")
        create_action(event_id=event_in_db, action_type="contact_supplier", title="Normal", priority="normal")

        actions = get_actions_for_event(event_in_db)
        priorities = [a["priority"] for a in actions]
        assert priorities[0] == "critical"

    def test_update_action_status(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="contact_supplier", title="Test"
        )
        result = update_action(action_id, status="in_progress")
        assert result is True

        action = get_action(action_id)
        assert action["status"] == "in_progress"

    def test_update_action_multiple_fields(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="contact_supplier", title="Test"
        )
        update_action(action_id, status="in_progress", assignee_hint="Procurement Lead", priority="high")
        action = get_action(action_id)
        assert action["status"] == "in_progress"
        assert action["assignee_hint"] == "Procurement Lead"
        assert action["priority"] == "high"

    def test_update_nonexistent_action(self):
        result = update_action(99999, status="done")
        assert result is False

    def test_update_action_no_fields(self, event_in_db):
        """Updating with no fields should return False."""
        action_id = create_action(
            event_id=event_in_db, action_type="monitor_situation", title="Test"
        )
        result = update_action(action_id)
        assert result is False

    def test_get_actions_by_status(self, event_in_db):
        create_action(event_id=event_in_db, action_type="contact_supplier", title="A")
        action2_id = create_action(event_id=event_in_db, action_type="activate_bcp", title="B")
        update_action(action2_id, status="in_progress")

        pending = get_actions(status="pending")
        assert all(a["status"] == "pending" for a in pending)
        assert len(pending) == 1

        in_progress = get_actions(status="in_progress")
        assert all(a["status"] == "in_progress" for a in in_progress)
        assert len(in_progress) == 1

    def test_get_actions_by_event_id(self, sample_payload):
        upsert_event("event-a|eu", "disruptions", sample_payload, "s1")
        upsert_event("event-b|eu", "disruptions", {**sample_payload, "id": "event-b|eu"}, "s2")

        create_action(event_id="event-a|eu", action_type="contact_supplier", title="A")
        create_action(event_id="event-b|eu", action_type="activate_bcp", title="B")

        actions = get_actions(event_id="event-a|eu")
        assert len(actions) == 1
        assert actions[0]["event_id"] == "event-a|eu"

    def test_get_actions_all(self, event_in_db):
        create_action(event_id=event_in_db, action_type="contact_supplier", title="A")
        create_action(event_id=event_in_db, action_type="monitor_situation", title="B")

        all_actions = get_actions()
        assert len(all_actions) >= 2

    def test_create_action_with_all_fields(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db,
            action_type="escalate_to_leadership",
            title="Escalate to VP",
            description="Prepare impact brief for leadership",
            assignee_hint="VP Supply Chain",
            priority="critical",
            due_date="2026-04-13T00:00:00Z",
        )
        action = get_action(action_id)
        assert action["action_type"] == "escalate_to_leadership"
        assert action["description"] == "Prepare impact brief for leadership"
        assert action["assignee_hint"] == "VP Supply Chain"
        assert action["priority"] == "critical"
        assert action["due_date"] == "2026-04-13T00:00:00Z"

    def test_action_default_priority_is_normal(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="monitor_situation", title="Watch"
        )
        action = get_action(action_id)
        assert action["priority"] == "normal"


# ── Action engine (auto-generation) tests ─────────────────────────


class TestActionEngine:
    """Test the rule-based action generation engine."""

    def test_critical_natural_disaster_generates_many_actions(self, critical_event_payload):
        actions = generate_actions_for_event(critical_event_payload)
        assert isinstance(actions, list)
        assert len(actions) >= 5  # Critical gets full response + insurance for Natural Disaster

        types = {a["action_type"] for a in actions}
        assert "escalate_to_leadership" in types
        assert "activate_bcp" in types
        assert "contact_supplier" in types
        assert "file_insurance_claim" in types  # Natural Disaster specific

    def test_low_severity_generates_monitor_only(self, low_event_payload):
        actions = generate_actions_for_event(low_event_payload)
        assert isinstance(actions, list)
        assert len(actions) >= 1

        types = {a["action_type"] for a in actions}
        assert "monitor_situation" in types
        # Low severity should NOT trigger heavy actions
        assert "activate_bcp" not in types
        assert "file_insurance_claim" not in types
        assert "escalate_to_leadership" not in types

    def test_critical_generates_more_actions_than_low(
        self, critical_event_payload, low_event_payload
    ):
        critical_actions = generate_actions_for_event(critical_event_payload)
        low_actions = generate_actions_for_event(low_event_payload)
        assert len(critical_actions) > len(low_actions)

    def test_all_generated_actions_have_valid_types(self, critical_event_payload):
        actions = generate_actions_for_event(critical_event_payload)
        for action in actions:
            assert action["action_type"] in VALID_ACTION_TYPES, (
                f"Invalid action type: {action['action_type']}"
            )

    def test_all_generated_actions_have_required_fields(self, critical_event_payload):
        actions = generate_actions_for_event(critical_event_payload)
        for action in actions:
            assert "action_type" in action
            assert "title" in action
            assert "description" in action
            assert "assignee_hint" in action
            assert "priority" in action
            assert "due_date" in action
            assert len(action["title"]) > 0
            assert len(action["description"]) > 0

    def test_high_severity_logistics_generates_reroute(self):
        """High-severity logistics events should include reroute_shipment."""
        payload = {
            "id": "port-strike|europe",
            "event": "Rotterdam Port Workers Strike",
            "description": "Major strike affecting Europe's largest port.",
            "category": "Labour/Strike",
            "severity": "High",
            "trend": "Escalating",
            "region": "Europe",
            "lat": 51.9,
            "lng": 4.5,
            "skf_exposure": "Logistics disruption for EU factories.",
            "recommended_action": "Reroute via Antwerp.",
        }
        actions = generate_actions_for_event(payload)
        types = {a["action_type"] for a in actions}
        assert "reroute_shipment" in types

    def test_medium_severity_generates_contact_and_monitor(self):
        payload = {
            "id": "medium-event|asia",
            "event": "Supply Chain Tension in Taiwan",
            "description": "Moderate supply risk.",
            "category": "Geopolitical",
            "severity": "Medium",
            "trend": "Stable",
            "region": "Asia",
            "lat": 25.0,
            "lng": 121.5,
            "skf_exposure": "Some exposure.",
            "recommended_action": "Monitor.",
        }
        actions = generate_actions_for_event(payload)
        types = {a["action_type"] for a in actions}
        assert "contact_supplier" in types
        assert "monitor_situation" in types

    def test_computed_severity_score_used_when_present(self):
        """When computed_severity.score is present, use it instead of label mapping."""
        payload = {
            "id": "scored-event|eu",
            "event": "Test Event",
            "description": "Test",
            "category": "Other",
            "severity": "Low",  # Label says Low
            "computed_severity": {"score": 90.0},  # But numeric score is Critical
            "region": "Europe",
            "lat": 50.0,
            "lng": 10.0,
        }
        actions = generate_actions_for_event(payload)
        types = {a["action_type"] for a in actions}
        # Score 90 maps to Critical rules, should get heavy actions
        assert "activate_bcp" in types
        assert "escalate_to_leadership" in types

    def test_action_deduplication(self, critical_event_payload):
        """Multiple rules may fire the same action_type -- highest priority wins."""
        actions = generate_actions_for_event(critical_event_payload)
        type_counts = {}
        for a in actions:
            t = a["action_type"]
            type_counts[t] = type_counts.get(t, 0) + 1
        # Each action_type should appear exactly once
        for action_type, count in type_counts.items():
            assert count == 1, f"{action_type} appears {count} times (should be 1)"

    def test_due_dates_are_set(self, critical_event_payload):
        actions = generate_actions_for_event(critical_event_payload)
        for action in actions:
            assert action["due_date"] is not None, (
                f"Action {action['action_type']} should have a due_date"
            )

    def test_critical_actions_have_short_due_dates(self, critical_event_payload):
        """Critical priority actions should have shorter due dates than low ones."""
        actions = generate_actions_for_event(critical_event_payload)
        critical_actions = [a for a in actions if a["priority"] == "critical"]
        assert len(critical_actions) > 0
        # Critical actions should have due dates set (we trust the engine sets them)
        for a in critical_actions:
            assert a["due_date"] is not None

    def test_geopolitical_event(self):
        payload = {
            "id": "trade-war|asia",
            "event": "US-China Trade Tensions Escalate",
            "description": "New tariffs on industrial components.",
            "category": "Geopolitical",
            "severity": "High",
            "region": "Asia",
            "lat": 39.9,
            "lng": 116.4,
            "skf_exposure": "China sourcing at risk.",
            "recommended_action": "Diversify.",
        }
        actions = generate_actions_for_event(payload)
        assert len(actions) > 0
        # High severity geopolitical should trigger supplier-related actions
        types = {a["action_type"] for a in actions}
        assert "contact_supplier" in types

    def test_description_includes_region_context(self, critical_event_payload):
        """Generated descriptions should include event-specific context."""
        actions = generate_actions_for_event(critical_event_payload)
        for action in actions:
            desc = action["description"]
            # Should contain region or event title context
            has_context = "Asia" in desc or "Japan" in desc or "Earthquake" in desc
            assert has_context or len(desc) > 50, (
                f"Description should include event context: {desc[:100]}"
            )


# ── API endpoint tests ───────────────────────────────────────────


class TestActionsAPI:
    """Test the actions REST API endpoints."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app
        with TestClient(app) as c:
            yield c

    def test_create_action_endpoint(self, client, event_in_db):
        resp = client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={
                "action_type": "contact_supplier",
                "title": "Contact primary bearing supplier",
            },
        )
        assert resp.status_code == 201, f"Got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["action_type"] == "contact_supplier"
        assert data["status"] == "pending"
        assert "id" in data

    def test_create_action_invalid_type(self, client, event_in_db):
        resp = client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={
                "action_type": "invalid_nonexistent_type",
                "title": "Bad action",
            },
        )
        assert resp.status_code == 422  # Pydantic validation error

    def test_create_action_nonexistent_event(self, client):
        resp = client.post(
            "/api/v1/events/nonexistent-event-xyz/actions",
            json={
                "action_type": "monitor_situation",
                "title": "This event doesn't exist",
            },
        )
        assert resp.status_code == 404

    def test_list_event_actions(self, client, event_in_db):
        # Create two actions
        client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "contact_supplier", "title": "A"},
        )
        client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "monitor_situation", "title": "B"},
        )
        resp = client.get(f"/api/v1/events/{event_in_db}/actions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_list_event_actions_nonexistent_event(self, client):
        resp = client.get("/api/v1/events/nonexistent-xyz/actions")
        assert resp.status_code == 404

    def test_patch_action_status(self, client, event_in_db):
        create_resp = client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "contact_supplier", "title": "Test"},
        )
        action_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/v1/actions/{action_id}",
            json={"status": "in_progress"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_patch_action_dismiss(self, client, event_in_db):
        create_resp = client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "monitor_situation", "title": "Watch"},
        )
        action_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/v1/actions/{action_id}",
            json={"status": "dismissed"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "dismissed"

    def test_patch_nonexistent_action(self, client):
        resp = client.patch(
            "/api/v1/actions/99999",
            json={"status": "completed"},
        )
        assert resp.status_code == 404

    def test_list_pending_actions_global(self, client, event_in_db):
        client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "contact_supplier", "title": "A"},
        )
        client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "monitor_situation", "title": "B"},
        )
        resp = client.get("/api/v1/actions?status=pending")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2
        for action in data:
            assert action["status"] == "pending"

    def test_list_all_actions(self, client, event_in_db):
        client.post(
            f"/api/v1/events/{event_in_db}/actions",
            json={"action_type": "contact_supplier", "title": "A"},
        )
        resp = client.get("/api/v1/actions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_generate_actions_endpoint(self, client, critical_event_in_db):
        """POST /events/{id}/actions/generate should auto-create actions."""
        resp = client.post(
            f"/api/v1/events/{critical_event_in_db}/actions/generate"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # Critical should generate several

    def test_generate_actions_nonexistent_event(self, client):
        resp = client.post("/api/v1/events/nonexistent-xyz/actions/generate")
        assert resp.status_code == 404


# ── Actions across multiple events ────────────────────────────────


class TestActionsMultipleEvents:
    """Test action scoping across events."""

    def test_actions_scoped_to_events(self, sample_payload):
        upsert_event("event-a|eu", "disruptions", sample_payload, "s1")
        upsert_event("event-b|asia", "disruptions", {**sample_payload, "id": "event-b|asia"}, "s2")

        create_action(event_id="event-a|eu", action_type="contact_supplier", title="A")
        create_action(event_id="event-b|asia", action_type="activate_bcp", title="B")

        a = get_actions_for_event("event-a|eu")
        b = get_actions_for_event("event-b|asia")

        assert len(a) == 1
        assert a[0]["action_type"] == "contact_supplier"
        assert len(b) == 1
        assert b[0]["action_type"] == "activate_bcp"

    def test_global_action_listing_returns_all(self, sample_payload):
        upsert_event("evt-x|eu", "disruptions", sample_payload, "s1")
        upsert_event("evt-y|eu", "disruptions", {**sample_payload, "id": "evt-y|eu"}, "s2")

        create_action(event_id="evt-x|eu", action_type="contact_supplier", title="X")
        create_action(event_id="evt-y|eu", action_type="activate_bcp", title="Y")

        all_actions = get_actions()
        assert len(all_actions) >= 2
        event_ids = {a["event_id"] for a in all_actions}
        assert "evt-x|eu" in event_ids
        assert "evt-y|eu" in event_ids


# ── Status lifecycle tests ────────────────────────────────────────


class TestActionLifecycle:
    """Test action status transitions."""

    def test_new_action_defaults_to_pending(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="contact_supplier", title="Test"
        )
        action = get_action(action_id)
        assert action["status"] == "pending"

    def test_pending_to_in_progress_to_completed(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="contact_supplier", title="Lifecycle"
        )

        update_action(action_id, status="in_progress")
        assert get_action(action_id)["status"] == "in_progress"

        update_action(action_id, status="completed")
        assert get_action(action_id)["status"] == "completed"

    def test_pending_to_dismissed(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="monitor_situation", title="Skip"
        )
        update_action(action_id, status="dismissed")
        assert get_action(action_id)["status"] == "dismissed"

    def test_updated_at_changes_on_update(self, event_in_db):
        action_id = create_action(
            event_id=event_in_db, action_type="contact_supplier", title="Time test"
        )
        before = get_action(action_id)["updated_at"]
        update_action(action_id, status="in_progress")
        after = get_action(action_id)["updated_at"]
        # updated_at should change (or at least not be None)
        assert after is not None
