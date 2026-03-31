"""Tests for ticket API endpoints.

Covers: GET/POST/PATCH /events/{event_id}/ticket, GET /tickets,
        upsert behavior, status transitions, filtering by owner/status,
        and tickets for non-existent events.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

EVENT_ID = "ticket-test-event|europe"
EVENT_ID_2 = "ticket-test-event-2|asia"
PREFIX = "/api/v1"


@pytest.fixture
def _seed_event(sample_payload):
    """Seed a single event into the DB for ticket tests."""
    from backend.app.db.database import upsert_event

    payload = {**sample_payload, "id": EVENT_ID}
    upsert_event(EVENT_ID, "disruptions", payload, "seed-test")
    return EVENT_ID


@pytest.fixture
def _seed_two_events(sample_payload):
    """Seed two events for multi-ticket tests."""
    from backend.app.db.database import upsert_event

    p1 = {**sample_payload, "id": EVENT_ID}
    p2 = {**sample_payload, "id": EVENT_ID_2, "event": "Second Test Event"}
    upsert_event(EVENT_ID, "disruptions", p1, "seed-test")
    upsert_event(EVENT_ID_2, "disruptions", p2, "seed-test")
    return [EVENT_ID, EVENT_ID_2]


# ── GET /events/{event_id}/ticket ────────────────────────────────


class TestGetEventTicket:
    def test_returns_null_when_no_ticket(self, _seed_event):
        """A missing ticket is normal, not an error -- return null."""
        r = client.get(f"{PREFIX}/events/{EVENT_ID}/ticket")
        assert r.status_code == 200
        assert r.json() is None

    def test_returns_ticket_after_creation(self, _seed_event):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "jh"})
        r = client.get(f"{PREFIX}/events/{EVENT_ID}/ticket")
        assert r.status_code == 200
        data = r.json()
        assert data["event_id"] == EVENT_ID
        assert data["owner"] == "jh"
        assert data["status"] == "open"


# ── POST /events/{event_id}/ticket (upsert) ─────────────────────


class TestCreateOrUpdateTicket:
    def test_creates_ticket(self, _seed_event):
        r = client.post(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"owner": "alice", "notes": "Investigating"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["event_id"] == EVENT_ID
        assert data["owner"] == "alice"
        assert data["notes"] == "Investigating"
        assert data["status"] == "open"
        assert "id" in data

    def test_upsert_updates_existing(self, _seed_event):
        """POST twice for the same event should update, not create a duplicate."""
        r1 = client.post(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"owner": "alice"},
        )
        ticket_id_1 = r1.json()["id"]

        r2 = client.post(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"owner": "bob", "notes": "Reassigned"},
        )
        ticket_id_2 = r2.json()["id"]

        # Same ticket, not a new one
        assert ticket_id_1 == ticket_id_2
        assert r2.json()["owner"] == "bob"
        assert r2.json()["notes"] == "Reassigned"

    def test_rejects_ticket_for_nonexistent_event(self):
        """FK constraint prevents orphan tickets -- event must exist first."""
        r = client.post(
            f"{PREFIX}/events/phantom-event|nowhere/ticket",
            json={"owner": "jh"},
        )
        assert r.status_code == 422
        assert "event not found" in r.json()["detail"].lower()

    def test_creates_ticket_with_empty_body(self, _seed_event):
        r = client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={})
        assert r.status_code == 200
        data = r.json()
        assert data["owner"] is None
        assert data["status"] == "open"


# ── PATCH /events/{event_id}/ticket ──────────────────────────────


class TestUpdateEventTicket:
    def test_updates_status(self, _seed_event):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "jh"})
        r = client.patch(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"status": "in_progress"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_status_transitions(self, _seed_event):
        """Walk through a full lifecycle: open -> assigned -> in_progress -> done."""
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "jh"})

        for status in ["assigned", "in_progress", "done"]:
            r = client.patch(
                f"{PREFIX}/events/{EVENT_ID}/ticket",
                json={"status": status},
            )
            assert r.status_code == 200
            assert r.json()["status"] == status

    def test_updates_owner_and_notes(self, _seed_event):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "alice"})
        r = client.patch(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"owner": "bob", "notes": "Handed off"},
        )
        assert r.status_code == 200
        assert r.json()["owner"] == "bob"
        assert r.json()["notes"] == "Handed off"

    def test_patch_creates_if_missing(self, _seed_event):
        """PATCH gracefully creates a ticket if none exists."""
        r = client.patch(
            f"{PREFIX}/events/{EVENT_ID}/ticket",
            json={"owner": "jh", "status": "assigned"},
        )
        assert r.status_code == 200
        assert r.json()["owner"] == "jh"
        assert r.json()["status"] == "assigned"


# ── GET /tickets (list with filters) ────────────────────────────


class TestListTickets:
    def test_list_empty(self):
        r = client.get(f"{PREFIX}/tickets")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_all_tickets(self, _seed_two_events):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "alice"})
        client.post(f"{PREFIX}/events/{EVENT_ID_2}/ticket", json={"owner": "bob"})

        r = client.get(f"{PREFIX}/tickets")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_filter_by_status(self, _seed_two_events):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "alice"})
        client.patch(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"status": "done"})
        client.post(f"{PREFIX}/events/{EVENT_ID_2}/ticket", json={"owner": "bob"})

        r = client.get(f"{PREFIX}/tickets?status=done")
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert results[0]["status"] == "done"

    def test_filter_by_owner(self, _seed_two_events):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "alice"})
        client.post(f"{PREFIX}/events/{EVENT_ID_2}/ticket", json={"owner": "bob"})

        r = client.get(f"{PREFIX}/tickets?owner=alice")
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert results[0]["owner"] == "alice"

    def test_filter_by_owner_and_status(self, _seed_two_events):
        client.post(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"owner": "alice"})
        client.patch(f"{PREFIX}/events/{EVENT_ID}/ticket", json={"status": "in_progress"})
        client.post(f"{PREFIX}/events/{EVENT_ID_2}/ticket", json={"owner": "alice"})

        r = client.get(f"{PREFIX}/tickets?owner=alice&status=in_progress")
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert results[0]["event_id"] == EVENT_ID
