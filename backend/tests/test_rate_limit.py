"""Tests for scan rate limiting (cooldown enforcement)."""

from __future__ import annotations

import time

import pytest

from backend.app.routers.scans import (
    SCAN_COOLDOWN_SECONDS,
    _last_scan_completed,
    get_scan_cooldowns,
)


@pytest.fixture(autouse=True)
def _reset_cooldowns():
    """Ensure each test starts with a clean cooldown state."""
    _last_scan_completed.clear()
    yield
    _last_scan_completed.clear()


class TestGetScanCooldowns:
    """Unit tests for the get_scan_cooldowns helper."""

    def test_all_modes_ready_when_no_scans(self):
        result = get_scan_cooldowns()
        assert set(result.keys()) == {"disruptions", "geopolitical", "trade"}
        for mode in result:
            assert result[mode]["ready"] is True
            assert result[mode]["retry_after_seconds"] == 0

    def test_mode_not_ready_after_scan(self):
        _last_scan_completed["disruptions"] = time.monotonic()
        result = get_scan_cooldowns()
        assert result["disruptions"]["ready"] is False
        assert result["disruptions"]["retry_after_seconds"] > 0
        # Other modes remain ready
        assert result["geopolitical"]["ready"] is True
        assert result["trade"]["ready"] is True

    def test_mode_ready_after_cooldown_expires(self):
        # Simulate a scan that completed well past the cooldown
        _last_scan_completed["trade"] = time.monotonic() - SCAN_COOLDOWN_SECONDS - 1
        result = get_scan_cooldowns()
        assert result["trade"]["ready"] is True
        assert result["trade"]["retry_after_seconds"] == 0

    def test_retry_after_decreases_over_time(self):
        _last_scan_completed["geopolitical"] = time.monotonic() - 30
        result = get_scan_cooldowns()
        remaining = result["geopolitical"]["retry_after_seconds"]
        # Should be roughly 30 seconds remaining (60 - 30)
        assert 25 <= remaining <= 35


class TestCooldownEnforcement:
    """Integration-style tests using the FastAPI test client."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app
        return TestClient(app)

    def test_first_scan_not_rate_limited(self, client):
        """First scan for a mode should never be rate-limited."""
        # We just check it doesn't return 429.
        # The actual scan may fail for other reasons (no API key), but not 429.
        resp = client.post("/api/v1/scans", json={"mode": "disruptions"})
        assert resp.status_code != 429

    def test_second_scan_returns_429(self, client):
        """Immediately triggering the same mode should hit cooldown."""
        # Simulate a completed scan
        _last_scan_completed["disruptions"] = time.monotonic()
        resp = client.post("/api/v1/scans", json={"mode": "disruptions"})
        assert resp.status_code == 429
        body = resp.json()
        assert "cooldown" in body["detail"].lower()

    def test_different_mode_not_blocked(self, client):
        """Cooldown for one mode should not block another mode."""
        _last_scan_completed["disruptions"] = time.monotonic()
        resp = client.post("/api/v1/scans", json={"mode": "geopolitical"})
        # Should not be 429 -- different mode
        assert resp.status_code != 429

    def test_scan_allowed_after_cooldown(self, client):
        """After cooldown expires, scan should be allowed again."""
        _last_scan_completed["trade"] = time.monotonic() - SCAN_COOLDOWN_SECONDS - 1
        resp = client.post("/api/v1/scans", json={"mode": "trade"})
        assert resp.status_code != 429
