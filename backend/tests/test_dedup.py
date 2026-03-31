"""Tests for backend.app.services.dedup — event deduplication helper."""

import pytest

from backend.app.services.dedup import (
    _normalize_title,
    _title_similarity,
    _regions_compatible,
    find_duplicates,
    tag_duplicates,
)


class TestTitleSimilarity:
    def test_identical_titles(self):
        assert _title_similarity("Port Strike in Rotterdam", "Port Strike in Rotterdam") == 1.0

    def test_similar_titles(self):
        sim = _title_similarity("Port Strike in Rotterdam", "Rotterdam Port Workers Strike")
        assert sim > 0.3

    def test_different_titles(self):
        sim = _title_similarity("Earthquake in Japan", "Tariff Policy Update USA")
        assert sim < 0.2

    def test_empty_title(self):
        assert _title_similarity("", "Something") == 0.0
        assert _title_similarity("", "") == 0.0

    def test_case_insensitive(self):
        assert _title_similarity("PORT STRIKE", "port strike") == 1.0


class TestRegionsCompatible:
    def test_same_region(self):
        assert _regions_compatible("Europe", "Europe")

    def test_adjacent_regions(self):
        assert _regions_compatible("Europe", "Middle East")
        assert _regions_compatible("India", "China")

    def test_non_adjacent_regions(self):
        assert not _regions_compatible("Americas", "China")

    def test_global_matches_all(self):
        assert _regions_compatible("Global", "Europe")
        assert _regions_compatible("Global", "Americas")


class TestFindDuplicates:
    def test_finds_obvious_duplicate(self):
        new_event = {
            "id": "new-1",
            "event": "Earthquake in Turkey",
            "lat": 38.0, "lng": 35.0,
            "region": "Middle East",
        }
        existing = [{
            "id": "old-1",
            "event": "Turkey Earthquake Disaster",
            "lat": 37.5, "lng": 35.5,
            "region": "Middle East",
        }]
        matches = find_duplicates(new_event, existing)
        assert len(matches) == 1
        assert matches[0]["existing_event_id"] == "old-1"

    def test_no_match_for_different_events(self):
        new_event = {
            "id": "new-1",
            "event": "Earthquake in Turkey",
            "lat": 38.0, "lng": 35.0,
            "region": "Middle East",
        }
        existing = [{
            "id": "old-1",
            "event": "US Steel Tariff Increase",
            "lat": 38.9, "lng": -77.0,
            "region": "Americas",
        }]
        matches = find_duplicates(new_event, existing)
        assert len(matches) == 0

    def test_no_match_when_too_far(self):
        new_event = {
            "id": "new-1",
            "event": "Port Strike Rotterdam",
            "lat": 51.9, "lng": 4.5,
            "region": "Europe",
        }
        existing = [{
            "id": "old-1",
            "event": "Port Strike in Shanghai",
            "lat": 31.2, "lng": 121.5,
            "region": "China",
        }]
        matches = find_duplicates(new_event, existing)
        assert len(matches) == 0

    def test_skips_self(self):
        event = {
            "id": "evt-1",
            "event": "Test Event",
            "lat": 50, "lng": 10,
            "region": "Europe",
        }
        matches = find_duplicates(event, [event])
        assert len(matches) == 0

    def test_match_without_coords(self):
        """High title similarity + same region should still match without coords."""
        new_event = {
            "id": "new-1",
            "event": "EU Steel Tariff Increase 2026",
            "region": "Europe",
        }
        existing = [{
            "id": "old-1",
            "event": "EU Steel Tariff Increase 2026 Update",
            "region": "Europe",
        }]
        matches = find_duplicates(new_event, existing)
        assert len(matches) == 1


class TestTagDuplicates:
    def test_tags_duplicate_events(self):
        events = [
            {"id": "evt-1", "event": "Turkey Earthquake", "lat": 38.0, "lng": 35.0, "region": "Middle East"},
            {"id": "evt-2", "event": "Earthquake in Turkey", "lat": 37.5, "lng": 35.5, "region": "Middle East"},
        ]
        tagged = tag_duplicates(events)
        assert "possible_duplicate_of" not in tagged[0]
        assert tagged[1].get("possible_duplicate_of") == "evt-1"

    def test_no_tags_for_unique_events(self):
        events = [
            {"id": "evt-1", "event": "Turkey Earthquake", "lat": 38.0, "lng": 35.0, "region": "Middle East"},
            {"id": "evt-2", "event": "US Steel Tariffs", "lat": 38.9, "lng": -77.0, "region": "Americas"},
        ]
        tagged = tag_duplicates(events)
        assert "possible_duplicate_of" not in tagged[0]
        assert "possible_duplicate_of" not in tagged[1]

    def test_single_event_no_tags(self):
        events = [{"id": "evt-1", "event": "Test", "lat": 0, "lng": 0, "region": "Global"}]
        tagged = tag_duplicates(events)
        assert "possible_duplicate_of" not in tagged[0]
