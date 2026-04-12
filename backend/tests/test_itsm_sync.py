"""Tests for ITSM sync log persistence.

Validates that the ITSMStub writes audit trail entries to the itsm_sync_log
table, that sync history can be queried, and that the response format
includes the log_id and stub-mode indicator.
"""

from __future__ import annotations

import json

import pytest

from backend.app.db.database import (
    create_itsm_sync_log,
    get_db,
    get_itsm_sync_log,
    get_itsm_sync_log_entry,
)
from backend.app.services.itsm_stub import ITSMStub


# ── Direct database layer tests ────────────────────────────────────


class TestItsmSyncLogDB:
    """Test the itsm_sync_log database functions directly."""

    def setup_method(self):
        """Clear sync log before each test."""
        with get_db() as conn:
            conn.execute("DELETE FROM itsm_sync_log")

    def test_create_sync_log_returns_id(self):
        log_id = create_itsm_sync_log(
            event_id="evt-1|europe",
            action="create_ticket",
            payload_json='{"title": "Test"}',
            status="stub",
            provider="stub",
            external_id="STUB-ABCD1234",
        )
        assert isinstance(log_id, int)
        assert log_id > 0

    def test_create_sync_log_persists_data(self):
        log_id = create_itsm_sync_log(
            event_id="evt-2|asia",
            action="update_ticket",
            payload_json='{"status": "in_progress"}',
            status="stub",
            provider="stub",
            external_id="STUB-EFGH5678",
        )
        entry = get_itsm_sync_log_entry(log_id)
        assert entry is not None
        assert entry["event_id"] == "evt-2|asia"
        assert entry["action"] == "update_ticket"
        assert entry["status"] == "stub"
        assert entry["provider"] == "stub"
        assert entry["external_id"] == "STUB-EFGH5678"
        assert entry["created_at"] is not None

    def test_create_sync_log_stores_payload(self):
        payload = {"title": "Fire in Stuttgart", "priority": "critical"}
        log_id = create_itsm_sync_log(
            event_id="evt-3",
            action="create_ticket",
            payload_json=json.dumps(payload),
        )
        entry = get_itsm_sync_log_entry(log_id)
        stored = json.loads(entry["payload_json"])
        assert stored["title"] == "Fire in Stuttgart"
        assert stored["priority"] == "critical"

    def test_get_sync_log_entry_nonexistent(self):
        entry = get_itsm_sync_log_entry(999999)
        assert entry is None

    def test_query_sync_log_by_event_id(self):
        create_itsm_sync_log(event_id="evt-A", action="create_ticket")
        create_itsm_sync_log(event_id="evt-A", action="update_ticket")
        create_itsm_sync_log(event_id="evt-B", action="create_ticket")

        logs_a = get_itsm_sync_log(event_id="evt-A")
        assert len(logs_a) == 2

        logs_b = get_itsm_sync_log(event_id="evt-B")
        assert len(logs_b) == 1

    def test_query_sync_log_by_action(self):
        create_itsm_sync_log(event_id="evt-X", action="create_ticket")
        create_itsm_sync_log(event_id="evt-Y", action="update_ticket")
        create_itsm_sync_log(event_id="evt-Z", action="sync_status")

        creates = get_itsm_sync_log(action="create_ticket")
        assert len(creates) == 1
        assert creates[0]["event_id"] == "evt-X"

    def test_query_sync_log_all(self):
        create_itsm_sync_log(event_id="evt-1", action="create_ticket")
        create_itsm_sync_log(event_id="evt-2", action="update_ticket")
        create_itsm_sync_log(event_id="evt-3", action="sync_status")

        all_logs = get_itsm_sync_log()
        assert len(all_logs) == 3

    def test_query_sync_log_respects_limit(self):
        for i in range(5):
            create_itsm_sync_log(event_id=f"evt-{i}", action="create_ticket")

        logs = get_itsm_sync_log(limit=3)
        assert len(logs) == 3

    def test_query_sync_log_returns_newest_first(self):
        id1 = create_itsm_sync_log(event_id="evt-first", action="create_ticket")
        id2 = create_itsm_sync_log(event_id="evt-second", action="create_ticket")

        logs = get_itsm_sync_log()
        # Both entries present, higher ID was inserted later
        ids = [log["id"] for log in logs]
        assert id1 in ids
        assert id2 in ids
        assert id2 > id1

    def test_sync_log_default_values(self):
        log_id = create_itsm_sync_log(
            event_id="evt-defaults",
            action="create_ticket",
        )
        entry = get_itsm_sync_log_entry(log_id)
        assert entry["payload_json"] == "{}"
        assert entry["status"] == "stub"
        assert entry["provider"] == "stub"
        assert entry["external_id"] is None


# ── Stub integration tests (sync log written by ITSMStub) ──────────


class TestItsmStubSyncLog:
    """Test that ITSMStub operations create itsm_sync_log entries."""

    def setup_method(self):
        with get_db() as conn:
            conn.execute("DELETE FROM itsm_sync_log")

    @pytest.fixture
    def stub(self):
        s = ITSMStub()
        s._tickets.clear()
        return s

    @pytest.mark.asyncio
    async def test_create_ticket_logs_sync(self, stub):
        result = await stub.create_ticket(
            event_id="evt-log-test|eu",
            title="Port Closure Rotterdam",
            description="Major port disruption",
            priority="high",
            assignee="logistics-team",
        )

        assert "log_id" in result
        assert result["mode"] == "stub"

        entry = get_itsm_sync_log_entry(result["log_id"])
        assert entry is not None
        assert entry["event_id"] == "evt-log-test|eu"
        assert entry["action"] == "create_ticket"
        assert entry["provider"] == "stub"
        assert entry["external_id"] == result["external_id"]

        payload = json.loads(entry["payload_json"])
        assert payload["title"] == "Port Closure Rotterdam"
        assert payload["priority"] == "high"

    @pytest.mark.asyncio
    async def test_update_ticket_logs_sync(self, stub):
        created = await stub.create_ticket(
            event_id="evt-upd-log|eu",
            title="Update Log Test",
        )
        ext_id = created["external_id"]

        updated = await stub.update_ticket(ext_id, status="in_progress", comment="Starting work")

        assert "log_id" in updated
        assert updated["mode"] == "stub"

        entry = get_itsm_sync_log_entry(updated["log_id"])
        assert entry is not None
        assert entry["action"] == "update_ticket"
        assert entry["external_id"] == ext_id

    @pytest.mark.asyncio
    async def test_sync_status_logs_sync(self, stub):
        created = await stub.create_ticket(
            event_id="evt-sync-log|eu",
            title="Sync Log Test",
        )
        ext_id = created["external_id"]

        synced = await stub.sync_status(ext_id)

        assert "log_id" in synced
        assert synced["mode"] == "stub"

        entry = get_itsm_sync_log_entry(synced["log_id"])
        assert entry is not None
        assert entry["action"] == "sync_status"

    @pytest.mark.asyncio
    async def test_list_tickets_logs_sync(self, stub):
        await stub.create_ticket(event_id="evt-list", title="List Test")
        await stub.list_tickets()

        logs = get_itsm_sync_log(action="list_tickets")
        assert len(logs) == 1
        payload = json.loads(logs[0]["payload_json"])
        assert payload["result_count"] == 1

    @pytest.mark.asyncio
    async def test_full_lifecycle_creates_audit_trail(self, stub):
        """A complete ticket lifecycle should produce a full audit trail."""
        # Create
        created = await stub.create_ticket(
            event_id="evt-lifecycle|eu",
            title="Earthquake Alert",
            priority="critical",
        )
        ext_id = created["external_id"]

        # Update status
        await stub.update_ticket(ext_id, status="in_progress", assignee="ops")

        # Sync
        await stub.sync_status(ext_id)

        # Resolve
        await stub.update_ticket(ext_id, status="resolved", comment="Resolved")

        # Check full audit trail
        logs = get_itsm_sync_log(event_id="evt-lifecycle|eu")
        assert len(logs) == 4

        actions = [log["action"] for log in sorted(logs, key=lambda x: x["id"])]
        assert actions == ["create_ticket", "update_ticket", "sync_status", "update_ticket"]

    @pytest.mark.asyncio
    async def test_response_format_includes_stub_mode(self, stub):
        """All stub responses should indicate mode=stub and include log_id."""
        result = await stub.create_ticket(
            event_id="evt-format",
            title="Format Test",
        )
        assert result["mode"] == "stub"
        assert isinstance(result["log_id"], int)
        assert result["log_id"] > 0
