"""Tests for the timeline endpoint and get_timeline_data."""

import json

import pytest

from backend.app.db.database import get_timeline_data, upsert_event


class TestGetTimelineData:
    def test_empty_db_returns_empty(self):
        result = get_timeline_data(days=30)
        assert result == []

    def test_seeded_event_appears_in_timeline(self, sample_payload):
        upsert_event("test-event|europe", "disruptions", sample_payload, "scan-1")
        result = get_timeline_data(days=30)
        assert len(result) >= 1
        day = result[-1]  # most recent day
        assert day["event_count"] >= 1
        assert "date" in day
        assert "critical_count" in day
        assert "high_count" in day
        assert "affected_sites_count" in day

    def test_severity_counted_correctly(self):
        # Insert a High severity event
        high_payload = {
            "id": "high-event|eu",
            "event": "High Severity Event",
            "severity": "High",
            "region": "Europe",
            "lat": 50, "lng": 10,
        }
        upsert_event("high-event|eu", "disruptions", high_payload, "scan-1")

        # Insert a Critical severity event
        crit_payload = {
            "id": "crit-event|eu",
            "event": "Critical Severity Event",
            "severity": "Critical",
            "region": "Europe",
            "lat": 51, "lng": 11,
        }
        upsert_event("crit-event|eu", "disruptions", crit_payload, "scan-2")

        result = get_timeline_data(days=30)
        assert len(result) >= 1
        day = result[-1]
        assert day["high_count"] >= 1
        assert day["critical_count"] >= 1

    def test_affected_sites_counted(self):
        payload = {
            "id": "sites-event|eu",
            "event": "Test with sites",
            "severity": "High",
            "region": "Europe",
            "lat": 50, "lng": 10,
            "affected_sites": [
                {"name": "Site1", "type": "mfg", "distance_km": 100},
                {"name": "Site2", "type": "log", "distance_km": 200},
            ],
        }
        upsert_event("sites-event|eu", "disruptions", payload, "scan-1")
        result = get_timeline_data(days=30)
        day = result[-1]
        assert day["affected_sites_count"] >= 2
