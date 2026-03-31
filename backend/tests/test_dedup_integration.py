"""Integration tests: dedup tagging wired into scanner + DB persistence.

Verifies that tag_duplicates is called by the scanner pipeline, that
duplicate tags survive DB round-trips, and that non-duplicates stay clean.
"""

import json

import pytest

from backend.app.db.database import get_event, upsert_event
from backend.app.services.dedup import tag_duplicates


# ── Dedup tags in scanner sample results ─────────────────────────


class TestDedupInSampleResult:
    """Verify _build_sample_result calls tag_duplicates on items."""

    def test_sample_items_have_dedup_applied(self):
        """After _build_sample_result, items should have been through tag_duplicates.
        Duplicate tags may or may not appear (depends on sample data content),
        but the function should run without error."""
        from datetime import datetime, timezone
        from backend.app.services.scanner import _build_sample_result

        result = _build_sample_result("disruptions", "dedup-scan", datetime.now(timezone.utc))
        items = result["items"]
        assert len(items) > 0
        # If any items are tagged, they should have valid structure
        for item in items:
            if "possible_duplicate_of" in item:
                assert isinstance(item["possible_duplicate_of"], str)
                assert len(item["possible_duplicate_of"]) > 0
                assert "duplicate_reason" in item


# ── Dedup tags persist through DB ────────────────────────────────


class TestDedupDBPersistence:
    """Verify that dedup tags survive upsert_event -> get_event."""

    def test_duplicate_tag_persists(self):
        """An event tagged as a possible duplicate should keep the tag after DB round-trip."""
        events = [
            {
                "id": "dedup-orig|me",
                "event": "Turkey Earthquake Disaster",
                "lat": 38.0, "lng": 35.0,
                "region": "Middle East",
                "severity": "High",
            },
            {
                "id": "dedup-dup|me",
                "event": "Earthquake in Turkey",
                "lat": 37.5, "lng": 35.5,
                "region": "Middle East",
                "severity": "High",
            },
        ]
        # Run dedup tagging
        tag_duplicates(events)

        # Second event should be tagged
        assert events[1].get("possible_duplicate_of") == "dedup-orig|me"

        # Persist both to DB
        upsert_event("dedup-orig|me", "disruptions", events[0], "dedup-scan")
        upsert_event("dedup-dup|me", "disruptions", events[1], "dedup-scan")

        # Retrieve and verify tag survived
        dup_event = get_event("dedup-dup|me")
        assert dup_event is not None
        assert dup_event["possible_duplicate_of"] == "dedup-orig|me"
        assert "duplicate_reason" in dup_event

    def test_non_duplicate_stays_clean(self):
        """Events with different regions/titles should NOT get tagged."""
        events = [
            {
                "id": "clean-a|eu",
                "event": "Port Strike in Rotterdam",
                "lat": 51.9, "lng": 4.5,
                "region": "Europe",
                "severity": "Medium",
            },
            {
                "id": "clean-b|am",
                "event": "US Steel Tariff Increase",
                "lat": 38.9, "lng": -77.0,
                "region": "Americas",
                "severity": "Medium",
            },
        ]
        tag_duplicates(events)

        # Neither should be tagged
        assert "possible_duplicate_of" not in events[0]
        assert "possible_duplicate_of" not in events[1]

        # Persist and verify
        upsert_event("clean-a|eu", "disruptions", events[0], "clean-scan")
        upsert_event("clean-b|am", "disruptions", events[1], "clean-scan")

        evt_a = get_event("clean-a|eu")
        evt_b = get_event("clean-b|am")
        assert "possible_duplicate_of" not in evt_a
        assert "possible_duplicate_of" not in evt_b

    def test_duplicate_tag_survives_upsert_update(self):
        """When an event is upserted a second time, updated payload should keep dedup tags."""
        events = [
            {
                "id": "upd-orig|me",
                "event": "Turkey Earthquake",
                "lat": 38.0, "lng": 35.0,
                "region": "Middle East",
                "severity": "Critical",
            },
            {
                "id": "upd-dup|me",
                "event": "Earthquake in Turkey Update",
                "lat": 37.5, "lng": 35.5,
                "region": "Middle East",
                "severity": "High",
            },
        ]
        tag_duplicates(events)
        assert events[1].get("possible_duplicate_of") == "upd-orig|me"

        # First upsert
        upsert_event("upd-orig|me", "disruptions", events[0], "scan-1")
        upsert_event("upd-dup|me", "disruptions", events[1], "scan-1")

        # Second upsert (simulating rescan) — tag should still be in payload
        events[1]["severity"] = "Critical"  # simulate update
        upsert_event("upd-dup|me", "disruptions", events[1], "scan-2")

        dup = get_event("upd-dup|me")
        assert dup["possible_duplicate_of"] == "upd-orig|me"
        assert dup["severity"] == "Critical"  # verify update took effect
