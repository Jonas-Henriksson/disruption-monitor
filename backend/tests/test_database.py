"""Tests for backend.app.db.database — SQLite CRUD operations.

Covers: init, upsert_event, get_events, get_event, update_event_status,
        save/get scan_records, seed_if_empty idempotency, tickets, edits.
"""

import json

import pytest

from backend.app.db.database import (
    auto_archive_stale_events,
    create_ticket,
    get_db,
    get_db_stats,
    get_event,
    get_event_edits,
    get_events,
    get_latest_scan,
    get_scan_history,
    get_tickets,
    save_event_edit,
    save_scan_record,
    update_event_status,
    update_ticket,
    upsert_event,
)


# ── Schema / init ────────────────────────────────────────────────


class TestDBInit:
    def test_tables_exist(self):
        """All expected tables should be created on first connection."""
        with get_db() as conn:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            table_names = {row["name"] for row in tables}

        expected = {"scan_records", "events", "event_snapshots", "tickets", "event_edits"}
        assert expected.issubset(table_names), f"Missing tables: {expected - table_names}"

    def test_wal_mode_enabled(self):
        """WAL journal mode should be set for concurrent read performance."""
        with get_db() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode == "wal"

    def test_foreign_keys_enabled(self):
        with get_db() as conn:
            fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        assert fk == 1


# ── Upsert event ─────────────────────────────────────────────────


class TestUpsertEvent:
    def test_insert_returns_true(self, sample_payload):
        """First upsert of a new event should return True (inserted)."""
        result = upsert_event("new-event|test", "disruptions", sample_payload, "scan-001")
        assert result is True

    def test_update_returns_false(self, sample_payload):
        """Second upsert of the same event should return False (updated)."""
        upsert_event("dup-event|test", "disruptions", sample_payload, "scan-001")
        result = upsert_event("dup-event|test", "disruptions", sample_payload, "scan-002")
        assert result is False

    def test_scan_count_increments(self, sample_payload):
        """scan_count should increment on each upsert."""
        upsert_event("count-test|eu", "disruptions", sample_payload, "s1")
        upsert_event("count-test|eu", "disruptions", sample_payload, "s2")
        upsert_event("count-test|eu", "disruptions", sample_payload, "s3")
        event = get_event("count-test|eu")
        assert event["scan_count"] == 3

    def test_snapshot_created_on_insert(self, sample_payload):
        """An event_snapshot row should be created alongside the event."""
        upsert_event("snap-test|eu", "disruptions", sample_payload, "scan-snap")
        with get_db() as conn:
            snaps = conn.execute(
                "SELECT * FROM event_snapshots WHERE event_id = ?", ("snap-test|eu",)
            ).fetchall()
        assert len(snaps) == 1
        assert snaps[0]["scan_id"] == "scan-snap"

    def test_snapshot_created_on_update(self, sample_payload):
        """Each upsert should add another snapshot row."""
        upsert_event("snap2|eu", "disruptions", sample_payload, "s1")
        upsert_event("snap2|eu", "disruptions", sample_payload, "s2")
        with get_db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM event_snapshots WHERE event_id = ?", ("snap2|eu",)
            ).fetchone()[0]
        assert count == 2

    def test_payload_stored_as_json(self, sample_payload):
        """The payload column should contain valid JSON matching the input."""
        upsert_event("json-test|eu", "disruptions", sample_payload, "s1")
        with get_db() as conn:
            row = conn.execute("SELECT payload FROM events WHERE id = ?", ("json-test|eu",)).fetchone()
        parsed = json.loads(row["payload"])
        assert parsed["event"] == "Test Factory Fire"

    def test_severity_extracted_for_disruptions(self, sample_payload):
        upsert_event("sev-test|eu", "disruptions", sample_payload, "s1")
        with get_db() as conn:
            row = conn.execute("SELECT severity FROM events WHERE id = ?", ("sev-test|eu",)).fetchone()
        assert row["severity"] == "High"

    def test_severity_extracted_for_geopolitical(self, sample_geopolitical_payload):
        """Geopolitical events use risk_level for severity."""
        upsert_event("geo-sev", "geopolitical", sample_geopolitical_payload, "s1")
        with get_db() as conn:
            row = conn.execute("SELECT severity FROM events WHERE id = ?", ("geo-sev",)).fetchone()
        assert row["severity"] == "High"

    def test_title_extracted_for_disruptions(self, sample_payload):
        upsert_event("title-d|eu", "disruptions", sample_payload, "s1")
        with get_db() as conn:
            row = conn.execute("SELECT event_title FROM events WHERE id = ?", ("title-d|eu",)).fetchone()
        assert row["event_title"] == "Test Factory Fire"

    def test_title_extracted_for_geopolitical(self, sample_geopolitical_payload):
        """Geopolitical events use 'risk' field for title."""
        upsert_event("title-g", "geopolitical", sample_geopolitical_payload, "s1")
        with get_db() as conn:
            row = conn.execute("SELECT event_title FROM events WHERE id = ?", ("title-g",)).fetchone()
        assert row["event_title"] == "Test Geopolitical Risk"


# ── Get events ───────────────────────────────────────────────────


class TestGetEvents:
    def test_returns_list(self, seeded_db):
        events = get_events()
        assert isinstance(events, list)
        assert len(events) >= 2

    def test_filter_by_mode(self, seeded_db):
        events = get_events(mode="disruptions")
        assert all(e.get("category") or e.get("event") for e in events)
        # Should not include geopolitical
        geo = get_events(mode="geopolitical")
        assert len(geo) >= 1

    def test_filter_by_status(self, seeded_db):
        events = get_events(status="active")
        assert len(events) >= 2  # Both seeded events are active

    def test_limit(self, seeded_db):
        events = get_events(limit=1)
        assert len(events) == 1

    def test_lifecycle_fields_overlaid(self, seeded_db):
        """DB lifecycle fields should override payload values."""
        events = get_events(mode="disruptions")
        assert len(events) >= 1
        event = events[0]
        assert "status" in event
        assert "first_seen" in event
        assert "last_seen" in event
        assert "scan_count" in event

    def test_empty_db_returns_empty_list(self):
        events = get_events()
        assert events == []


# ── Get single event ─────────────────────────────────────────────


class TestGetEvent:
    def test_existing_event(self, seeded_db):
        event = get_event("test-event|europe")
        assert event is not None
        assert event["event"] == "Test Factory Fire"

    def test_missing_event_returns_none(self):
        assert get_event("nonexistent-id") is None


# ── Update event status ──────────────────────────────────────────


class TestUpdateEventStatus:
    def test_valid_status_update(self, seeded_db):
        result = update_event_status("test-event|europe", "watching")
        assert result is True
        event = get_event("test-event|europe")
        assert event["status"] == "watching"

    def test_archive_status(self, seeded_db):
        update_event_status("test-event|europe", "archived")
        event = get_event("test-event|europe")
        assert event["status"] == "archived"

    def test_nonexistent_event(self):
        result = update_event_status("no-such-event", "watching")
        assert result is False

    def test_invalid_status_rejected_by_db(self, seeded_db):
        """The CHECK constraint should reject invalid status values."""
        with pytest.raises(Exception):
            update_event_status("test-event|europe", "invalid_status")


# ── Scan records ─────────────────────────────────────────────────


class TestScanRecords:
    def test_save_and_get_latest(self):
        save_scan_record(
            scan_id="scan-001",
            mode="disruptions",
            source="sample",
            item_count=10,
            started_at="2026-03-28T00:00:00Z",
            completed_at="2026-03-28T00:01:00Z",
        )
        latest = get_latest_scan("disruptions")
        assert latest is not None
        assert latest["scan_id"] == "scan-001"
        assert latest["item_count"] == 10

    def test_get_latest_returns_most_recent(self):
        save_scan_record("s1", "disruptions", "sample", 5, "2026-03-28T00:00:00Z")
        save_scan_record("s2", "disruptions", "live", 12, "2026-03-28T01:00:00Z")
        latest = get_latest_scan("disruptions")
        assert latest["scan_id"] == "s2"
        assert latest["source"] == "live"

    def test_get_latest_wrong_mode_returns_none(self):
        save_scan_record("s1", "disruptions", "sample", 5, "2026-03-28T00:00:00Z")
        assert get_latest_scan("trade") is None

    def test_scan_history(self):
        save_scan_record("h1", "disruptions", "sample", 5, "2026-03-28T00:00:00Z")
        save_scan_record("h2", "geopolitical", "sample", 3, "2026-03-28T01:00:00Z")
        save_scan_record("h3", "disruptions", "live", 10, "2026-03-28T02:00:00Z")

        # All modes
        history = get_scan_history()
        assert len(history) == 3

        # Filter by mode
        d_history = get_scan_history(mode="disruptions")
        assert len(d_history) == 2

    def test_scan_history_limit(self):
        for i in range(5):
            save_scan_record(f"lim-{i}", "disruptions", "sample", i, f"2026-03-28T0{i}:00:00Z")
        history = get_scan_history(mode="disruptions", limit=3)
        assert len(history) == 3

    def test_invalid_mode_rejected(self):
        """The CHECK constraint should reject modes outside the allowed set."""
        with pytest.raises(Exception):
            save_scan_record("bad", "invalid_mode", "sample", 0, "2026-03-28T00:00:00Z")


# ── Seed idempotency ─────────────────────────────────────────────


class TestSeedIfEmpty:
    def test_seeds_empty_db(self):
        from backend.app.seed.seed_db import seed_if_empty

        count = seed_if_empty()
        assert count > 0
        # Verify events actually exist
        events = get_events()
        assert len(events) == count

    def test_idempotent_on_populated_db(self, seeded_db):
        from backend.app.seed.seed_db import seed_if_empty

        count = seed_if_empty()
        assert count == 0  # Should skip because DB has events


# ── Tickets ──────────────────────────────────────────────────────


class TestTickets:
    def test_create_and_get(self, seeded_db):
        ticket_id = create_ticket("test-event|europe", owner="jh", notes="Test ticket")
        assert ticket_id is not None
        tickets = get_tickets(event_id="test-event|europe")
        assert len(tickets) == 1
        assert tickets[0]["owner"] == "jh"

    def test_update_ticket(self, seeded_db):
        ticket_id = create_ticket("test-event|europe")
        result = update_ticket(ticket_id, status="in_progress", owner="jh")
        assert result is True
        tickets = get_tickets(event_id="test-event|europe")
        assert tickets[0]["status"] == "in_progress"

    def test_update_nonexistent_ticket(self):
        result = update_ticket(9999, status="done")
        assert result is False


# ── Event edits (audit trail) ────────────────────────────────────


class TestEventEdits:
    def test_save_and_retrieve(self, seeded_db):
        save_event_edit("test-event|europe", "severity", "High", "Critical")
        edits = get_event_edits("test-event|europe")
        assert len(edits) == 1
        assert edits[0]["field"] == "severity"
        assert edits[0]["original_value"] == "High"
        assert edits[0]["edited_value"] == "Critical"
        assert edits[0]["edited_by"] == "jh"

    def test_no_edits_returns_empty(self):
        edits = get_event_edits("nonexistent")
        assert edits == []


# ── DB stats ─────────────────────────────────────────────────────


class TestDBStats:
    def test_stats_shape(self, seeded_db):
        stats = get_db_stats()
        assert "events" in stats
        assert "active_events" in stats
        assert "scans" in stats
        assert "tickets" in stats
        assert stats["events"] >= 2
        assert stats["active_events"] >= 2

    def test_stats_empty_db(self):
        stats = get_db_stats()
        assert stats["events"] == 0


# ── Auto-archive stale events ──────────────────────────────────


class TestAutoArchiveStaleEvents:
    def test_archives_stale_active_events(self, seeded_db):
        """Events with old last_seen should be archived."""
        # Backdate last_seen to 100 hours ago
        from datetime import datetime, timedelta, timezone
        old_time = (datetime.now(timezone.utc) - timedelta(hours=100)).isoformat()
        with get_db() as conn:
            conn.execute("UPDATE events SET last_seen = ? WHERE status = 'active'", (old_time,))

        archived = auto_archive_stale_events(max_age_hours=72)
        assert archived >= 2  # seeded_db creates at least 2 events

        # Verify they are now archived
        events = get_events(status="active")
        assert len(events) == 0

    def test_does_not_archive_fresh_events(self, seeded_db):
        """Events seen recently should not be archived."""
        archived = auto_archive_stale_events(max_age_hours=72)
        assert archived == 0

        events = get_events(status="active")
        assert len(events) >= 2

    def test_does_not_archive_watching_events(self, seeded_db):
        """Watching events should never be auto-archived, even if stale."""
        from datetime import datetime, timedelta, timezone
        old_time = (datetime.now(timezone.utc) - timedelta(hours=100)).isoformat()

        # Set one event to watching, backdate all last_seen
        with get_db() as conn:
            conn.execute("UPDATE events SET last_seen = ?", (old_time,))
            conn.execute(
                "UPDATE events SET status = 'watching' WHERE id = (SELECT id FROM events LIMIT 1)"
            )

        archived = auto_archive_stale_events(max_age_hours=72)
        # At least one watching event should remain
        watching = get_events(status="watching")
        assert len(watching) >= 1

    def test_stores_archived_severity(self, seeded_db):
        """Archived events should have their severity score preserved."""
        from datetime import datetime, timedelta, timezone
        old_time = (datetime.now(timezone.utc) - timedelta(hours=100)).isoformat()

        # Insert event with known computed_severity
        payload = {
            "id": "test-archive-sev|region",
            "event": "Test Severity Archive",
            "severity": "High",
            "region": "Europe",
            "computed_severity": {"score": 65},
        }
        upsert_event("test-archive-sev|region", "disruptions", payload, "scan-1")
        with get_db() as conn:
            conn.execute(
                "UPDATE events SET last_seen = ? WHERE id = ?",
                (old_time, "test-archive-sev|region"),
            )

        auto_archive_stale_events(max_age_hours=72)

        with get_db() as conn:
            row = conn.execute(
                "SELECT status, archived_severity FROM events WHERE id = ?",
                ("test-archive-sev|region",),
            ).fetchone()
        assert row["status"] == "archived"
        assert row["archived_severity"] == 65

    def test_returns_zero_when_no_stale(self):
        """Should return 0 when there are no events at all."""
        archived = auto_archive_stale_events(max_age_hours=72)
        assert archived == 0
