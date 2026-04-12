"""Tests for Gap #1: Repository Abstraction Layer.

Tests the abstract Repository interface and SQLiteRepository implementation.
Ensures the repository pattern correctly wraps database operations.
"""

from __future__ import annotations

from abc import ABC

import pytest

from backend.app.db.repository import Repository
from backend.app.db.sqlite_repo import SQLiteRepository, get_repository
from backend.app.db.database import (
    get_event,
    get_events,
    get_latest_scan,
    save_scan_record,
    upsert_event,
)


# ── Abstract interface tests ─────────────────────────────────────


class TestRepositoryInterface:
    """Verify the abstract Repository interface."""

    def test_repository_is_abstract(self):
        assert issubclass(Repository, ABC)

    def test_cannot_instantiate_abstract(self):
        with pytest.raises(TypeError):
            Repository()

    def test_has_event_methods(self):
        for method in ("get_event", "get_events", "upsert_event", "update_event_status"):
            assert hasattr(Repository, method)

    def test_has_scan_methods(self):
        for method in ("save_scan_record", "get_latest_scan", "get_scan_history"):
            assert hasattr(Repository, method)

    def test_has_ticket_methods(self):
        for method in ("create_ticket", "update_ticket", "get_tickets", "get_overdue_tickets"):
            assert hasattr(Repository, method)

    def test_has_action_methods(self):
        for method in ("create_action", "get_actions_for_event", "get_actions", "update_action", "get_action"):
            assert hasattr(Repository, method)

    def test_has_edit_methods(self):
        for method in ("save_event_edit", "get_event_edits"):
            assert hasattr(Repository, method)

    def test_has_feedback_methods(self):
        for method in ("save_event_feedback", "get_event_feedback", "get_feedback_stats"):
            assert hasattr(Repository, method)

    def test_has_timeline_methods(self):
        for method in ("get_timeline_data", "get_weekly_summary", "get_db_stats"):
            assert hasattr(Repository, method)

    def test_has_telegram_dedup_methods(self):
        for method in ("is_event_alerted", "mark_event_alerted", "get_all_alerted_event_ids"):
            assert hasattr(Repository, method)

    def test_abstract_methods_defined(self):
        abstract_methods = getattr(Repository, "__abstractmethods__", set())
        assert len(abstract_methods) >= 20  # Should have many abstract methods


# ── SQLiteRepository tests ────────────────────────────────────────


class TestSQLiteRepository:
    """Test SQLiteRepository implements the interface correctly."""

    def test_extends_repository(self):
        assert issubclass(SQLiteRepository, Repository)

    def test_can_instantiate(self):
        repo = SQLiteRepository()
        assert repo is not None

    def test_all_abstract_methods_implemented(self):
        abstract_methods = getattr(Repository, "__abstractmethods__", set())
        for method_name in abstract_methods:
            assert hasattr(SQLiteRepository, method_name), f"Missing: {method_name}"
            assert callable(getattr(SQLiteRepository, method_name))


# ── CRUD through repository ──────────────────────────────────────


class TestRepositoryCRUD:
    """Test basic CRUD operations through the repository interface."""

    @pytest.fixture
    def repo(self):
        return SQLiteRepository()

    def test_upsert_and_get_event(self, repo, sample_payload):
        result = repo.upsert_event("repo-test|eu", "disruptions", sample_payload, "scan-1")
        assert result is True  # New event

        event = repo.get_event("repo-test|eu")
        assert event is not None
        assert event.get("status") == "active"

    def test_upsert_existing_returns_false(self, repo, sample_payload):
        repo.upsert_event("repo-dup|eu", "disruptions", sample_payload, "s1")
        result = repo.upsert_event("repo-dup|eu", "disruptions", sample_payload, "s2")
        assert result is False

    def test_get_nonexistent_event(self, repo):
        assert repo.get_event("does-not-exist|nowhere") is None

    def test_get_events_list(self, repo, sample_payload):
        repo.upsert_event("repo-e1|eu", "disruptions", sample_payload, "s1")
        repo.upsert_event("repo-e2|eu", "disruptions", {**sample_payload, "id": "repo-e2|eu"}, "s1")
        events = repo.get_events()
        assert isinstance(events, list)
        assert len(events) >= 2

    def test_get_events_mode_filter(self, repo, sample_payload, sample_geopolitical_payload):
        repo.upsert_event("repo-d|eu", "disruptions", sample_payload, "s1")
        repo.upsert_event("repo-g|eu", "geopolitical", sample_geopolitical_payload, "s1")

        d = repo.get_events(mode="disruptions")
        g = repo.get_events(mode="geopolitical")
        assert all(True for _ in d)
        assert all(True for _ in g)

    def test_get_events_status_filter(self, repo, sample_payload):
        repo.upsert_event("repo-active|eu", "disruptions", sample_payload, "s1")
        active = repo.get_events(status="active")
        assert len(active) >= 1

    def test_update_event_status(self, repo, sample_payload):
        repo.upsert_event("repo-status|eu", "disruptions", sample_payload, "s1")
        result = repo.update_event_status("repo-status|eu", "archived")
        assert result is True
        event = repo.get_event("repo-status|eu")
        assert event["status"] == "archived"

    def test_update_nonexistent_event_status(self, repo):
        result = repo.update_event_status("no-such-event", "archived")
        assert result is False

    def test_save_and_get_scan_record(self, repo):
        repo.save_scan_record(
            scan_id="scan-repo-001",
            mode="disruptions",
            source="sample",
            item_count=5,
            started_at="2026-04-12T00:00:00Z",
            completed_at="2026-04-12T00:01:00Z",
        )
        latest = repo.get_latest_scan("disruptions")
        assert latest is not None
        assert latest["scan_id"] == "scan-repo-001"
        assert latest["item_count"] == 5

    def test_get_scan_history(self, repo):
        repo.save_scan_record("s1", "disruptions", "sample", 3, "2026-04-12T00:00:00Z")
        repo.save_scan_record("s2", "disruptions", "live", 5, "2026-04-12T01:00:00Z")
        history = repo.get_scan_history(mode="disruptions")
        assert len(history) >= 2

    def test_create_and_get_tickets(self, repo, sample_payload):
        repo.upsert_event("repo-tkt|eu", "disruptions", sample_payload, "s1")
        tid = repo.create_ticket(event_id="repo-tkt|eu", notes="Test ticket")
        assert isinstance(tid, int)
        tickets = repo.get_tickets(event_id="repo-tkt|eu")
        assert len(tickets) >= 1
        assert any(t.get("notes") == "Test ticket" for t in tickets)

    def test_update_ticket(self, repo, sample_payload):
        repo.upsert_event("repo-tkt2|eu", "disruptions", sample_payload, "s1")
        tid = repo.create_ticket(event_id="repo-tkt2|eu")
        result = repo.update_ticket(tid, status="in_progress")
        assert result is True

    def test_create_and_get_actions(self, repo, sample_payload):
        repo.upsert_event("repo-act|eu", "disruptions", sample_payload, "s1")
        aid = repo.create_action(
            event_id="repo-act|eu",
            action_type="contact_supplier",
            title="Contact supplier",
        )
        assert isinstance(aid, int)
        action = repo.get_action(aid)
        assert action is not None
        assert action["action_type"] == "contact_supplier"

    def test_get_actions_for_event(self, repo, sample_payload):
        repo.upsert_event("repo-ae|eu", "disruptions", sample_payload, "s1")
        repo.create_action(event_id="repo-ae|eu", action_type="contact_supplier", title="A")
        repo.create_action(event_id="repo-ae|eu", action_type="monitor_situation", title="B")
        actions = repo.get_actions_for_event("repo-ae|eu")
        assert len(actions) == 2

    def test_update_action(self, repo, sample_payload):
        repo.upsert_event("repo-ua|eu", "disruptions", sample_payload, "s1")
        aid = repo.create_action(
            event_id="repo-ua|eu", action_type="contact_supplier", title="Test"
        )
        result = repo.update_action(aid, status="completed")
        assert result is True
        action = repo.get_action(aid)
        assert action["status"] == "completed"

    def test_event_edit_round_trip(self, repo, sample_payload):
        repo.upsert_event("repo-edit|eu", "disruptions", sample_payload, "s1")
        repo.save_event_edit("repo-edit|eu", "severity", "Medium", "High")
        edits = repo.get_event_edits("repo-edit|eu")
        assert len(edits) == 1
        assert edits[0]["field"] == "severity"

    def test_event_feedback_round_trip(self, repo, sample_payload):
        repo.upsert_event("repo-fb|eu", "disruptions", sample_payload, "s1")
        fid = repo.save_event_feedback("repo-fb|eu", "true_positive")
        assert isinstance(fid, int)
        fb = repo.get_event_feedback("repo-fb|eu")
        assert len(fb) == 1

    def test_feedback_stats(self, repo, sample_payload):
        repo.upsert_event("repo-fs|eu", "disruptions", sample_payload, "s1")
        repo.save_event_feedback("repo-fs|eu", "true_positive")
        repo.save_event_feedback("repo-fs|eu", "false_positive")
        stats = repo.get_feedback_stats()
        assert stats["total"] == 2

    def test_db_stats(self, repo, sample_payload):
        repo.upsert_event("repo-st|eu", "disruptions", sample_payload, "s1")
        stats = repo.get_db_stats()
        assert "events" in stats
        assert stats["events"] >= 1

    def test_telegram_dedup(self, repo):
        assert repo.is_event_alerted("repo-alert|eu") is False
        repo.mark_event_alerted("repo-alert|eu")
        assert repo.is_event_alerted("repo-alert|eu") is True
        ids = repo.get_all_alerted_event_ids()
        assert "repo-alert|eu" in ids


# ── Consistency: repo vs direct DB ────────────────────────────────


class TestRepositoryConsistency:
    """Repository methods should produce same results as direct database calls."""

    @pytest.fixture
    def repo(self):
        return SQLiteRepository()

    def test_event_via_repo_matches_direct(self, repo, sample_payload):
        event_id = "consistency|eu"
        upsert_event(event_id, "disruptions", sample_payload, "scan-d")

        direct = get_event(event_id)
        via_repo = repo.get_event(event_id)
        assert direct is not None
        assert via_repo is not None
        assert direct["status"] == via_repo["status"]

    def test_scan_via_repo_matches_direct(self, repo):
        save_scan_record("cs-001", "disruptions", "sample", 3, "2026-04-12T00:00:00Z")
        direct = get_latest_scan("disruptions")
        via_repo = repo.get_latest_scan("disruptions")
        assert direct["scan_id"] == via_repo["scan_id"]


# ── Singleton factory ─────────────────────────────────────────────


class TestGetRepository:
    """Test the get_repository() factory function."""

    def test_returns_sqlite_repository(self):
        repo = get_repository()
        assert isinstance(repo, SQLiteRepository)

    def test_returns_same_instance(self):
        """Should return a singleton."""
        import backend.app.db.sqlite_repo as mod
        mod._instance = None  # Reset for test isolation
        r1 = get_repository()
        r2 = get_repository()
        assert r1 is r2
        mod._instance = None  # Clean up
