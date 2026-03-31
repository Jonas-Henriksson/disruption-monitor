"""Tests for backend.app.services.scanner — response parsing and edge cases.

Focus: adversarial inputs, malformed JSON, ID generation, fallback behavior.
"""

import pytest

from backend.app.services.scanner import (
    _make_disruption_id,
    _make_geopolitical_id,
    _make_trade_id,
    _parse_json_response,
)


# ── JSON parsing (the most critical path for live data) ──────────


class TestParseJsonResponse:
    def test_clean_json_array(self):
        text = '[{"event": "Fire", "severity": "High"}]'
        result = _parse_json_response(text)
        assert len(result) == 1
        assert result[0]["event"] == "Fire"

    def test_json_with_markdown_fences(self):
        text = '```json\n[{"event": "Fire"}]\n```'
        result = _parse_json_response(text)
        assert len(result) == 1

    def test_json_with_plain_fences(self):
        text = '```\n[{"event": "Fire"}]\n```'
        result = _parse_json_response(text)
        assert len(result) == 1

    def test_json_with_surrounding_text(self):
        """Claude sometimes adds preamble text before/after the JSON."""
        text = 'Here are the current disruptions:\n\n[{"event": "Fire"}]\n\nThese are based on...'
        result = _parse_json_response(text)
        assert len(result) == 1

    def test_empty_response(self):
        result = _parse_json_response("")
        assert result == []

    def test_no_json_array(self):
        result = _parse_json_response("No disruptions found today.")
        assert result == []

    def test_malformed_json(self):
        """Truncated or invalid JSON should not crash, should return empty."""
        text = '[{"event": "Fire", "severity": "Hig'
        result = _parse_json_response(text)
        assert result == []

    def test_single_object_not_array(self):
        """Claude might return a single object instead of an array."""
        text = '{"event": "Fire", "severity": "High"}'
        # Current implementation looks for [ ], so this should fail gracefully
        result = _parse_json_response(text)
        # Should return empty since no array brackets found
        assert result == []

    def test_nested_brackets_in_strings(self):
        """JSON with brackets inside string values should parse correctly."""
        text = '[{"event": "Port [Shanghai] Closure", "region": "China"}]'
        result = _parse_json_response(text)
        assert len(result) == 1
        assert "[Shanghai]" in result[0]["event"]

    def test_unicode_content(self):
        text = '[{"event": "Erdbeben in T\u00fcrkiye", "region": "Europe"}]'
        result = _parse_json_response(text)
        assert len(result) == 1

    def test_multiple_arrays_takes_outermost(self):
        """If response has nested arrays, rfind(']') should capture the full outer array."""
        text = '[{"event": "Fire", "sources": ["a", "b"]}]'
        result = _parse_json_response(text)
        assert len(result) == 1
        assert result[0]["sources"] == ["a", "b"]

    def test_large_response(self):
        """Simulate a 12-item response (typical live scan)."""
        items = [{"event": f"Event {i}", "severity": "Medium", "region": "Europe"} for i in range(12)]
        import json
        text = json.dumps(items)
        result = _parse_json_response(text)
        assert len(result) == 12

    def test_stray_brackets_in_preamble(self):
        """Claude sometimes writes '[note: ...]' in preamble text before the JSON.

        The parser must skip past these stray brackets and find the real array.
        """
        text = 'Here are the results [note: abbreviated]:\n\n[{"event": "Fire"}]'
        result = _parse_json_response(text)
        assert len(result) == 1
        assert result[0]["event"] == "Fire"

    def test_multiple_stray_brackets(self):
        """Multiple false-start brackets before the real JSON."""
        text = 'Based on [sources] and [analysis], here:\n[{"event": "Fire"}]'
        result = _parse_json_response(text)
        assert len(result) == 1


# ── ID generation ────────────────────────────────────────────────


class TestIDGeneration:
    def test_disruption_id_format(self):
        item = {"event": "Factory Fire in Gothenburg", "region": "Europe"}
        id_ = _make_disruption_id(item)
        assert "|" in id_
        assert "europe" in id_
        assert "factory-fire" in id_

    def test_disruption_id_truncation(self):
        """Long event names should be truncated to 40 chars."""
        item = {"event": "A" * 100, "region": "Europe"}
        id_ = _make_disruption_id(item)
        slug_part = id_.split("|")[0]
        assert len(slug_part) <= 40

    def test_geopolitical_id_format(self):
        item = {"risk": "US-China Trade War Escalation"}
        id_ = _make_geopolitical_id(item)
        assert "us-china" in id_
        # No pipe — geo IDs don't include region
        assert "|" not in id_

    def test_trade_id_format(self):
        item = {"event": "EU Steel Tariffs", "region": "Europe"}
        id_ = _make_trade_id(item)
        assert "|" in id_
        assert "europe" in id_

    def test_missing_event_field(self):
        """If event field is missing, should use 'unknown' as fallback."""
        item = {"region": "Europe"}
        id_ = _make_disruption_id(item)
        assert id_.startswith("unknown|")

    def test_missing_region_field(self):
        item = {"event": "Fire"}
        id_ = _make_disruption_id(item)
        assert id_.endswith("|unknown")

    def test_id_stability(self):
        """Same input should always produce the same ID."""
        item = {"event": "Port Strike", "region": "Europe"}
        id1 = _make_disruption_id(item)
        id2 = _make_disruption_id(item)
        assert id1 == id2

    def test_special_characters_in_event(self):
        """Special chars should be preserved (only spaces become dashes)."""
        item = {"event": "US/China Tariff (Phase 2)", "region": "Global"}
        id_ = _make_disruption_id(item)
        assert " " not in id_


# ── Adversarial: ID collisions between live and sample data ──────


class TestIDCollisions:
    def test_sample_disruption_ids_are_deterministic(self):
        """Sample data IDs should be stable across loads."""
        from backend.app.data import load_disruptions
        data1 = load_disruptions()
        data2 = load_disruptions()
        ids1 = {d["id"] for d in data1}
        ids2 = {d["id"] for d in data2}
        assert ids1 == ids2

    def test_live_id_format_matches_sample(self):
        """Live-generated IDs should use the same format as sample data."""
        from backend.app.data import load_disruptions
        sample_ids = [d["id"] for d in load_disruptions()]
        # All sample IDs should contain a pipe
        for sid in sample_ids:
            assert "|" in sid, f"Sample ID missing pipe separator: {sid}"
        # A live-generated ID should also have a pipe
        live_id = _make_disruption_id({"event": "Test Event", "region": "Europe"})
        assert "|" in live_id
