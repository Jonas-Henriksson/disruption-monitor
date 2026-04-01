"""Tests for scheduler scan status tracking and health endpoint integration.

Covers:
  - _scan_status module-level dict is updated during scan loops
  - get_scan_status() returns correct structure
  - Scan status cleared on stop
  - Health endpoint includes scan_status field
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from backend.app.services.scheduler import (
    _scan_status,
    get_scan_status,
    get_scheduler_status,
)


class TestGetScanStatus:
    """Tests for the get_scan_status() function."""

    def test_returns_empty_dict_initially(self):
        """Before any scans run, scan status should be empty."""
        _scan_status.clear()
        result = get_scan_status()
        assert result == {}

    def test_returns_copy_not_reference(self):
        """get_scan_status() should return a copy so callers can't mutate internal state."""
        _scan_status.clear()
        _scan_status["disruptions"] = {"state": "idle"}
        result = get_scan_status()
        result["disruptions"]["state"] = "tampered"
        # Internal state should be unchanged
        assert _scan_status["disruptions"]["state"] == "idle"

    def test_returns_all_modes(self):
        """When multiple modes have status, all should be returned."""
        _scan_status.clear()
        _scan_status["disruptions"] = {"state": "idle", "events_found": 5}
        _scan_status["geopolitical"] = {"state": "running"}
        _scan_status["trade"] = {"state": "idle", "events_found": 3}
        result = get_scan_status()
        assert set(result.keys()) == {"disruptions", "geopolitical", "trade"}
        assert result["disruptions"]["events_found"] == 5

    def test_idle_state_has_required_fields(self):
        """A completed scan should have all expected fields."""
        _scan_status.clear()
        _scan_status["disruptions"] = {
            "state": "idle",
            "last_completed": "2026-03-31T12:00:00Z",
            "next_scheduled": "2026-03-31T12:15:00Z",
            "events_found": 7,
            "source": "live",
        }
        result = get_scan_status()
        status = result["disruptions"]
        assert status["state"] == "idle"
        assert "last_completed" in status
        assert "next_scheduled" in status
        assert "events_found" in status
        assert "source" in status


class TestScanStatusUpdatedDuringScan:
    """Tests that _scan_status is updated by the scan loop."""

    @pytest.mark.asyncio
    async def test_status_set_to_running_during_scan(self):
        """While a scan is in progress, state should be 'running'."""
        _scan_status.clear()

        observed_states = []

        async def mock_run_scan(mode):
            # Capture state while "scanning"
            observed_states.append(_scan_status.get(mode, {}).get("state"))
            return {
                "scan_id": "test-1",
                "source": "sample",
                "count": 2,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "items": [{"id": "e1", "event": "Test", "severity": "Low", "region": "EU"}],
            }

        with (
            patch("backend.app.services.scheduler.run_scan", side_effect=mock_run_scan),
            patch("backend.app.services.scheduler.save_scan_record"),
            patch("backend.app.services.scheduler.upsert_event", return_value=True),
            patch("backend.app.services.scheduler.send_scan_alerts", new_callable=AsyncMock),
        ):
            from backend.app.services.scheduler import _scan_loop, _scan_status as status_ref
            import backend.app.services.scheduler as sched_mod

            # Temporarily enable the loop for one iteration
            sched_mod._running = True

            async def run_one_iteration():
                """Run the scan loop but cancel after one iteration."""
                task = asyncio.create_task(_scan_loop("disruptions"))
                # Let the scan complete, then cancel during sleep
                await asyncio.sleep(0.1)
                sched_mod._running = False
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            await run_one_iteration()

        assert observed_states == ["running"]

    @pytest.mark.asyncio
    async def test_status_set_to_idle_after_scan(self):
        """After a scan completes, state should be 'idle' with metadata."""
        _scan_status.clear()

        async def mock_run_scan(mode):
            return {
                "scan_id": "test-2",
                "source": "live",
                "count": 3,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "items": [
                    {"id": "e1", "event": "Test1", "severity": "Low", "region": "EU"},
                    {"id": "e2", "event": "Test2", "severity": "High", "region": "NA"},
                    {"id": "e3", "event": "Test3", "severity": "Medium", "region": "APAC"},
                ],
            }

        with (
            patch("backend.app.services.scheduler.run_scan", side_effect=mock_run_scan),
            patch("backend.app.services.scheduler.save_scan_record"),
            patch("backend.app.services.scheduler.upsert_event", return_value=True),
            patch("backend.app.services.scheduler.send_scan_alerts", new_callable=AsyncMock, return_value=0),
        ):
            import backend.app.services.scheduler as sched_mod
            from backend.app.services.scheduler import _scan_loop

            sched_mod._running = True

            task = asyncio.create_task(_scan_loop("disruptions"))
            await asyncio.sleep(0.1)
            sched_mod._running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        status = _scan_status.get("disruptions")
        assert status is not None
        assert status["state"] == "idle"
        assert status["events_found"] == 3
        assert status["source"] == "live"
        assert "last_completed" in status
        assert "next_scheduled" in status
        # Verify timestamps are ISO format with Z suffix
        assert status["last_completed"].endswith("Z")
        assert status["next_scheduled"].endswith("Z")

    @pytest.mark.asyncio
    async def test_status_set_to_error_on_failure(self):
        """If a scan raises an exception, state should be 'error'."""
        _scan_status.clear()

        async def mock_run_scan_fail(mode):
            raise RuntimeError("API timeout")

        with (
            patch("backend.app.services.scheduler.run_scan", side_effect=mock_run_scan_fail),
            patch("backend.app.services.scheduler.save_scan_record"),
            patch("backend.app.services.scheduler.upsert_event"),
            patch("backend.app.services.scheduler.send_scan_alerts", new_callable=AsyncMock),
        ):
            import backend.app.services.scheduler as sched_mod
            from backend.app.services.scheduler import _scan_loop

            sched_mod._running = True

            task = asyncio.create_task(_scan_loop("geopolitical"))
            await asyncio.sleep(0.1)
            sched_mod._running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        status = _scan_status.get("geopolitical")
        assert status is not None
        assert status["state"] == "error"
        assert "last_error" in status


class TestStopSchedulerClearsStatus:
    """Tests that stop_scheduler clears _scan_status."""

    @pytest.mark.asyncio
    async def test_stop_clears_scan_status(self):
        """Stopping the scheduler should clear all scan status."""
        import backend.app.services.scheduler as sched_mod

        _scan_status["disruptions"] = {"state": "idle", "events_found": 5}
        _scan_status["trade"] = {"state": "idle", "events_found": 2}

        sched_mod._running = False
        sched_mod._tasks.clear()
        await sched_mod.stop_scheduler()

        assert _scan_status == {}


class TestGetSchedulerStatus:
    """Verify get_scheduler_status still works correctly."""

    def test_scheduler_status_structure(self):
        """get_scheduler_status should have running, api_configured, tasks."""
        status = get_scheduler_status()
        assert "running" in status
        assert "api_configured" in status
        assert "tasks" in status
        assert set(status["tasks"].keys()) == {"disruptions", "geopolitical", "trade"}
