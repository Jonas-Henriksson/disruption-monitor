"""Tests for Gap #2: ITSM Bridge.

Tests the abstract ITSMBridge interface, ITSMStub implementation,
and config-driven provider selection via get_itsm_bridge().
All ITSM methods are async, so tests use pytest-asyncio.
"""

from __future__ import annotations

from abc import ABC
from unittest.mock import patch

import pytest

from backend.app.services.itsm import ITSMBridge, get_itsm_bridge
from backend.app.services.itsm_stub import ITSMStub


# ── Abstract interface tests ─────────────────────────────────────


class TestITSMInterface:
    """Verify the abstract ITSMBridge interface."""

    def test_is_abstract(self):
        assert issubclass(ITSMBridge, ABC)

    def test_cannot_instantiate(self):
        with pytest.raises(TypeError):
            ITSMBridge()

    def test_has_create_ticket(self):
        assert hasattr(ITSMBridge, "create_ticket")

    def test_has_update_ticket(self):
        assert hasattr(ITSMBridge, "update_ticket")

    def test_has_sync_status(self):
        assert hasattr(ITSMBridge, "sync_status")

    def test_has_list_tickets(self):
        assert hasattr(ITSMBridge, "list_tickets")

    def test_abstract_methods_count(self):
        abstract_methods = getattr(ITSMBridge, "__abstractmethods__", set())
        assert len(abstract_methods) >= 4


# ── Stub implementation tests ─────────────────────────────────────


class TestITSMStub:
    """Test the stub ITSM implementation."""

    @pytest.fixture
    def stub(self):
        s = ITSMStub()
        s._tickets.clear()  # Ensure clean state (class-level dict)
        return s

    def test_extends_bridge(self):
        assert issubclass(ITSMStub, ITSMBridge)

    def test_can_instantiate(self):
        stub = ITSMStub()
        assert stub is not None

    @pytest.mark.asyncio
    async def test_create_ticket_returns_dict(self, stub):
        result = await stub.create_ticket(
            event_id="test-event|europe",
            title="Test Disruption Alert",
            description="A factory fire in Germany",
        )
        assert isinstance(result, dict)
        assert "external_id" in result
        assert "status" in result
        assert result["status"] == "open"

    @pytest.mark.asyncio
    async def test_create_ticket_returns_unique_ids(self, stub):
        r1 = await stub.create_ticket(
            event_id="evt-1", title="Alert 1", description="D1"
        )
        r2 = await stub.create_ticket(
            event_id="evt-2", title="Alert 2", description="D2"
        )
        assert r1["external_id"] != r2["external_id"]

    @pytest.mark.asyncio
    async def test_create_ticket_starts_with_stub_prefix(self, stub):
        result = await stub.create_ticket(
            event_id="evt-1", title="T", description="D"
        )
        assert result["external_id"].startswith("STUB-")

    @pytest.mark.asyncio
    async def test_sync_status_after_create(self, stub):
        created = await stub.create_ticket(
            event_id="evt-sync", title="Sync Test", description="D"
        )
        ext_id = created["external_id"]

        status = await stub.sync_status(ext_id)
        assert status["external_id"] == ext_id
        assert status["status"] == "open"

    @pytest.mark.asyncio
    async def test_sync_status_nonexistent(self, stub):
        result = await stub.sync_status("nonexistent-ticket-12345")
        assert result["status"] == "unknown"
        assert result["external_id"] == "nonexistent-ticket-12345"

    @pytest.mark.asyncio
    async def test_update_ticket_changes_status(self, stub):
        created = await stub.create_ticket(
            event_id="evt-upd", title="Update Test", description="D"
        )
        ext_id = created["external_id"]

        updated = await stub.update_ticket(ext_id, status="in_progress")
        assert updated["status"] == "in_progress"

        # Verify via sync_status
        synced = await stub.sync_status(ext_id)
        assert synced["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_update_ticket_changes_assignee(self, stub):
        created = await stub.create_ticket(
            event_id="evt-a", title="Assign Test", description="D"
        )
        ext_id = created["external_id"]

        updated = await stub.update_ticket(ext_id, assignee="procurement-team")
        assert updated["assignee"] == "procurement-team"

    @pytest.mark.asyncio
    async def test_update_nonexistent_ticket(self, stub):
        result = await stub.update_ticket("nonexistent-123", status="done")
        assert result["status"] == "not_found"

    @pytest.mark.asyncio
    async def test_list_tickets_empty(self, stub):
        tickets = await stub.list_tickets()
        assert isinstance(tickets, list)
        assert len(tickets) == 0

    @pytest.mark.asyncio
    async def test_list_tickets_returns_created(self, stub):
        await stub.create_ticket(event_id="e1", title="T1", description="D1")
        await stub.create_ticket(event_id="e2", title="T2", description="D2")

        tickets = await stub.list_tickets()
        assert len(tickets) == 2

    @pytest.mark.asyncio
    async def test_list_tickets_filter_by_status(self, stub):
        r1 = await stub.create_ticket(event_id="e1", title="T1", description="D1")
        await stub.create_ticket(event_id="e2", title="T2", description="D2")
        await stub.update_ticket(r1["external_id"], status="closed")

        open_tickets = await stub.list_tickets(status="open")
        assert len(open_tickets) == 1

        closed_tickets = await stub.list_tickets(status="closed")
        assert len(closed_tickets) == 1

    @pytest.mark.asyncio
    async def test_list_tickets_with_query(self, stub):
        await stub.create_ticket(event_id="e1", title="Earthquake alert", description="Japan")
        await stub.create_ticket(event_id="e2", title="Port delay", description="Rotterdam")

        results = await stub.list_tickets(query="earthquake")
        assert len(results) == 1
        assert results[0]["title"] == "Earthquake alert"

    @pytest.mark.asyncio
    async def test_list_tickets_with_limit(self, stub):
        for i in range(5):
            await stub.create_ticket(event_id=f"e{i}", title=f"T{i}", description=f"D{i}")

        tickets = await stub.list_tickets(limit=3)
        assert len(tickets) == 3

    @pytest.mark.asyncio
    async def test_create_with_all_params(self, stub):
        result = await stub.create_ticket(
            event_id="full-params|eu",
            title="Full Params Test",
            description="Testing all parameters",
            priority="high",
            assignee="procurement",
            labels=["urgent", "natural-disaster"],
        )
        assert result["external_id"].startswith("STUB-")

    @pytest.mark.asyncio
    async def test_all_severity_levels(self, stub):
        """Stub should handle all priority/severity levels without errors."""
        for priority in ("critical", "high", "normal", "low"):
            result = await stub.create_ticket(
                event_id=f"sev-{priority}",
                title=f"{priority.capitalize()} event",
                description="Test",
                priority=priority,
            )
            assert result is not None


# ── Provider selection ────────────────────────────────────────────


class TestProviderSelection:
    """Test config-driven ITSM provider selection."""

    def test_default_returns_stub(self):
        bridge = get_itsm_bridge()
        assert isinstance(bridge, ITSMStub)

    def test_explicit_none_returns_stub(self):
        with patch("backend.app.services.itsm.settings") as mock_settings:
            mock_settings.itsm_provider = "none"
            bridge = get_itsm_bridge()
            assert isinstance(bridge, ITSMStub)

    def test_servicenow_not_implemented(self):
        with patch("backend.app.services.itsm.settings") as mock_settings:
            mock_settings.itsm_provider = "servicenow"
            with pytest.raises(NotImplementedError):
                get_itsm_bridge()

    def test_jira_not_implemented(self):
        with patch("backend.app.services.itsm.settings") as mock_settings:
            mock_settings.itsm_provider = "jira"
            with pytest.raises(NotImplementedError):
                get_itsm_bridge()


# ── Integration test ─────────────────────────────────────────────


class TestITSMIntegration:
    """End-to-end ITSM workflow tests."""

    @pytest.mark.asyncio
    async def test_full_ticket_lifecycle(self):
        stub = ITSMStub()
        stub._tickets.clear()

        # Create
        created = await stub.create_ticket(
            event_id="lifecycle-test|eu",
            title="Factory Fire in Stuttgart",
            description="Fire at bearing manufacturing facility",
            priority="critical",
        )
        ext_id = created["external_id"]
        assert created["status"] == "open"

        # Assign
        await stub.update_ticket(ext_id, assignee="ops-team", comment="Assigning to ops")

        # Progress
        await stub.update_ticket(ext_id, status="in_progress")
        synced = await stub.sync_status(ext_id)
        assert synced["status"] == "in_progress"
        assert synced["assignee"] == "ops-team"

        # Resolve
        await stub.update_ticket(ext_id, status="resolved", comment="Fire contained")
        synced = await stub.sync_status(ext_id)
        assert synced["status"] == "resolved"
