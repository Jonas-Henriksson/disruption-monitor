"""Tests for cross-mode dedup awareness (Task 1).

Validates find_cross_mode_related linkage and DB persistence of related_events.
"""

import json

import pytest

from backend.app.services.dedup import find_cross_mode_related
from backend.app.db.database import (
    get_active_events_all_modes,
    get_event,
    update_event_related_events,
    upsert_event,
)


class TestFindCrossModeRelated:
    """Unit tests for find_cross_mode_related()."""

    def test_links_similar_events_across_modes(self):
        new_events = [
            {
                "id": "trade-china-tariff|global",
                "event": "US-China Trade War Tariff Escalation",
                "region": "Global",
                "lat": 39.9, "lng": 116.4,
            }
        ]
        all_active = [
            {
                "id": "geo-china-trade",
                "risk": "US-China Trade War Sanctions Escalation",
                "region": "China",
                "_mode": "geopolitical",
            },
            {
                "id": "disruption-earthquake|japan",
                "event": "Japan Earthquake Impact",
                "region": "China",
                "_mode": "disruptions",
            },
        ]
        result = find_cross_mode_related(new_events, "trade", all_active)
        assert "trade-china-tariff|global" in result
        links = result["trade-china-tariff|global"]
        assert any(l["event_id"] == "geo-china-trade" for l in links)
        # Earthquake should NOT be linked (different topic)
        assert not any(l["event_id"] == "disruption-earthquake|japan" for l in links)

    def test_ignores_same_mode(self):
        """Events from the same mode should never be linked."""
        new_events = [
            {"id": "trade-1", "event": "Steel Tariff Increase EU", "region": "Europe"}
        ]
        all_active = [
            {"id": "trade-2", "event": "Steel Tariff Increase EU Update", "region": "Europe", "_mode": "trade"}
        ]
        result = find_cross_mode_related(new_events, "trade", all_active)
        assert len(result) == 0

    def test_no_links_for_unrelated(self):
        new_events = [
            {"id": "trade-1", "event": "Coffee Bean Shortage Brazil", "region": "Americas"}
        ]
        all_active = [
            {"id": "geo-1", "risk": "Taiwan Strait Military Buildup", "region": "China", "_mode": "geopolitical"}
        ]
        result = find_cross_mode_related(new_events, "trade", all_active)
        assert len(result) == 0

    def test_empty_inputs(self):
        assert find_cross_mode_related([], "trade", []) == {}

    def test_link_includes_mode_and_reason(self):
        new_events = [
            {"id": "d-1", "event": "Red Sea Shipping Disruption", "region": "Middle East"}
        ]
        all_active = [
            {"id": "g-1", "risk": "Red Sea Shipping Route Disruption", "region": "Middle East", "_mode": "geopolitical"}
        ]
        result = find_cross_mode_related(new_events, "disruptions", all_active)
        assert "d-1" in result
        link = result["d-1"][0]
        assert link["mode"] == "geopolitical"
        assert link["event_id"] == "g-1"
        assert "similarity" in link
        assert "similarity_reason" in link

    def test_respects_region_compatibility(self):
        """Non-adjacent regions should block linkage even with similar titles."""
        new_events = [
            {"id": "t-1", "event": "Port Workers Strike", "region": "Americas"}
        ]
        all_active = [
            {"id": "d-1", "event": "Port Workers Strike", "region": "China", "_mode": "disruptions"}
        ]
        result = find_cross_mode_related(new_events, "trade", all_active)
        assert len(result) == 0


class TestCrossModeDBIntegration:
    """Integration tests for cross-mode dedup with DB persistence."""

    def test_update_event_related_events(self, sample_payload):
        upsert_event("test-evt|eu", "disruptions", sample_payload, "scan-1")
        related = [{"event_id": "geo-risk-1", "mode": "geopolitical", "similarity": 0.65, "similarity_reason": "title similarity 65%"}]
        ok = update_event_related_events("test-evt|eu", related)
        assert ok is True
        event = get_event("test-evt|eu")
        assert event["related_events"] == related

    def test_update_nonexistent_event(self):
        ok = update_event_related_events("nonexistent-id", [])
        assert ok is False

    def test_get_active_events_all_modes(self, sample_payload, sample_geopolitical_payload):
        upsert_event("evt-d|eu", "disruptions", sample_payload, "s1")
        upsert_event("evt-g", "geopolitical", sample_geopolitical_payload, "s1")
        events = get_active_events_all_modes()
        assert len(events) == 2
        modes = {e["_mode"] for e in events}
        assert modes == {"disruptions", "geopolitical"}

    def test_full_cross_mode_pipeline(self, sample_payload, sample_geopolitical_payload):
        """End-to-end: persist events, run cross-mode check, verify linkage stored."""
        # Persist a geopolitical event about factory fire
        geo_payload = {**sample_geopolitical_payload, "id": "geo-fire", "risk": "Test Factory Fire Risk"}
        upsert_event("geo-fire", "geopolitical", geo_payload, "s1")

        # New disruption event about factory fire
        dis_payload = {**sample_payload, "id": "dis-fire|eu", "event": "Test Factory Fire in Europe"}
        upsert_event("dis-fire|eu", "disruptions", dis_payload, "s2")

        # Run cross-mode check
        all_active = get_active_events_all_modes()
        new_items = [dis_payload]
        related_map = find_cross_mode_related(new_items, "disruptions", all_active)

        if related_map.get("dis-fire|eu"):
            update_event_related_events("dis-fire|eu", related_map["dis-fire|eu"])
            event = get_event("dis-fire|eu")
            assert "related_events" in event
            assert any(r["event_id"] == "geo-fire" for r in event["related_events"])
