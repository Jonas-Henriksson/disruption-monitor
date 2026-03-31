"""Tests for scanner._validate_items() — field validation, lat/lng, severity normalization.

Covers:
- Missing required fields cause items to be dropped
- Out-of-range lat/lng cause items to be dropped
- Severity normalization (lowercase -> title case)
- Unknown severity defaults to Medium
- Valid items pass through unchanged
- Count warnings (< 3, > 20 items)
"""

import logging

import pytest

from backend.app.services.scanner import _validate_items


# ── Helpers ────────────────────────────────────────────────────────

def _make_disruption(**overrides) -> dict:
    """Build a minimal valid disruption item."""
    base = {"event": "Test Fire", "severity": "High", "lat": 50.0, "lng": 10.0}
    base.update(overrides)
    return base


def _make_geo(**overrides) -> dict:
    """Build a minimal valid geopolitical item."""
    base = {"risk": "US-China Tensions", "risk_level": "High", "lat": 39.9, "lng": 116.4}
    base.update(overrides)
    return base


def _make_trade(**overrides) -> dict:
    """Build a minimal valid trade item."""
    base = {"event": "Steel Tariffs", "severity": "Medium", "lat": 50.0, "lng": 10.0}
    base.update(overrides)
    return base


# ── Missing required fields ────────────────────────────────────────


class TestMissingRequiredFields:
    def test_disruption_missing_event(self):
        items = [{"severity": "High", "lat": 50.0, "lng": 10.0}]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_disruption_missing_severity(self):
        items = [{"event": "Fire", "lat": 50.0, "lng": 10.0}]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_disruption_missing_lat(self):
        items = [{"event": "Fire", "severity": "High", "lng": 10.0}]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_disruption_missing_lng(self):
        items = [{"event": "Fire", "severity": "High", "lat": 50.0}]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_disruption_none_field_value(self):
        """A field set to None counts as missing."""
        items = [{"event": None, "severity": "High", "lat": 50.0, "lng": 10.0}]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_geopolitical_missing_risk(self):
        items = [{"risk_level": "High", "lat": 39.9, "lng": 116.4}]
        result = _validate_items(items, "geopolitical")
        assert len(result) == 0

    def test_geopolitical_missing_risk_level(self):
        items = [{"risk": "US-China", "lat": 39.9, "lng": 116.4}]
        result = _validate_items(items, "geopolitical")
        assert len(result) == 0

    def test_trade_missing_event(self):
        items = [{"severity": "Medium", "lat": 50.0, "lng": 10.0}]
        result = _validate_items(items, "trade")
        assert len(result) == 0

    def test_multiple_items_partial_drop(self):
        """Only invalid items are dropped; valid ones survive."""
        items = [
            _make_disruption(),  # valid
            {"severity": "High", "lat": 50.0, "lng": 10.0},  # missing event
            _make_disruption(event="Another Fire"),  # valid
        ]
        result = _validate_items(items, "disruptions")
        assert len(result) == 2
        assert result[0]["event"] == "Test Fire"
        assert result[1]["event"] == "Another Fire"


# ── Out-of-range lat/lng ───────────────────────────────────────────


class TestLatLngValidation:
    def test_lat_too_high(self):
        items = [_make_disruption(lat=91.0)]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_lat_too_low(self):
        items = [_make_disruption(lat=-91.0)]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_lng_too_high(self):
        items = [_make_disruption(lng=181.0)]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_lng_too_low(self):
        items = [_make_disruption(lng=-181.0)]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_boundary_values_accepted(self):
        """Exact boundary values (-90, 90, -180, 180) should pass."""
        items = [
            _make_disruption(lat=90.0, lng=180.0),
            _make_disruption(lat=-90.0, lng=-180.0, event="Boundary2"),
        ]
        result = _validate_items(items, "disruptions")
        assert len(result) == 2

    def test_zero_lat_lng_accepted(self):
        """0,0 (Gulf of Guinea) is a valid coordinate."""
        items = [_make_disruption(lat=0, lng=0)]
        result = _validate_items(items, "disruptions")
        assert len(result) == 1

    def test_non_numeric_lat(self):
        items = [_make_disruption(lat="fifty")]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0

    def test_non_numeric_lng(self):
        items = [_make_disruption(lng="ten")]
        result = _validate_items(items, "disruptions")
        assert len(result) == 0


# ── Severity normalization ─────────────────────────────────────────


class TestSeverityNormalization:
    def test_lowercase_to_title_case(self):
        items = [_make_disruption(severity="high")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "High"

    def test_uppercase_to_title_case(self):
        items = [_make_disruption(severity="CRITICAL")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "Critical"

    def test_mixed_case_to_title_case(self):
        items = [_make_disruption(severity="mEdIuM")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "Medium"

    def test_geopolitical_risk_level_normalized(self):
        items = [_make_geo(risk_level="low")]
        result = _validate_items(items, "geopolitical")
        assert result[0]["risk_level"] == "Low"

    def test_all_valid_severities(self):
        """All four valid severities should normalize correctly."""
        for sev in ["Critical", "High", "Medium", "Low"]:
            items = [_make_disruption(severity=sev.lower())]
            result = _validate_items(items, "disruptions")
            assert result[0]["severity"] == sev

    def test_whitespace_stripped(self):
        items = [_make_disruption(severity="  high  ")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "High"


# ── Unknown severity defaults to Medium ────────────────────────────


class TestUnknownSeverityDefault:
    def test_unknown_string_defaults_medium(self):
        items = [_make_disruption(severity="Extreme")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "Medium"

    def test_random_word_defaults_medium(self):
        items = [_make_disruption(severity="banana")]
        result = _validate_items(items, "disruptions")
        assert result[0]["severity"] == "Medium"

    def test_empty_string_defaults_medium(self):
        """Empty severity string defaults to Medium via .get default."""
        items = [_make_disruption(severity="")]
        result = _validate_items(items, "disruptions")
        # Empty string .strip().title() = "" which isn't in VALID_SEVERITIES
        assert result[0]["severity"] == "Medium"

    def test_geopolitical_unknown_defaults_medium(self):
        items = [_make_geo(risk_level="Catastrophic")]
        result = _validate_items(items, "geopolitical")
        assert result[0]["risk_level"] == "Medium"


# ── Valid items pass through unchanged ─────────────────────────────


class TestValidItemsPassThrough:
    def test_disruption_fields_preserved(self):
        item = _make_disruption(
            description="A big fire",
            category="Other",
            region="Europe",
            trend="Escalating",
        )
        result = _validate_items([item], "disruptions")
        assert len(result) == 1
        assert result[0]["description"] == "A big fire"
        assert result[0]["category"] == "Other"
        assert result[0]["region"] == "Europe"

    def test_geopolitical_fields_preserved(self):
        item = _make_geo(
            trend="Escalating",
            this_week="Tensions rose.",
            watchpoint="Watch for sanctions.",
        )
        result = _validate_items([item], "geopolitical")
        assert len(result) == 1
        assert result[0]["this_week"] == "Tensions rose."

    def test_trade_fields_preserved(self):
        item = _make_trade(corridor="EU-CN", friction_level="High")
        result = _validate_items([item], "trade")
        assert len(result) == 1
        assert result[0]["corridor"] == "EU-CN"

    def test_extra_fields_not_removed(self):
        """Validation should not strip unknown extra fields."""
        item = _make_disruption(custom_field="custom_value")
        result = _validate_items([item], "disruptions")
        assert result[0]["custom_field"] == "custom_value"


# ── Count warnings ─────────────────────────────────────────────────


class TestCountWarnings:
    def test_low_count_warns(self, caplog):
        """Fewer than 3 valid items should trigger a warning."""
        items = [_make_disruption(), _make_disruption(event="Fire 2")]
        with caplog.at_level(logging.WARNING):
            result = _validate_items(items, "disruptions")
        assert len(result) == 2
        assert any("Low item count" in m for m in caplog.messages)

    def test_high_count_warns(self, caplog):
        """More than 20 valid items should trigger a warning."""
        items = [_make_disruption(event=f"Fire {i}") for i in range(25)]
        with caplog.at_level(logging.WARNING):
            result = _validate_items(items, "disruptions")
        assert len(result) == 25
        assert any("High item count" in m for m in caplog.messages)

    def test_normal_count_no_warning(self, caplog):
        """Between 3 and 20 items should not trigger count warnings."""
        items = [_make_disruption(event=f"Fire {i}") for i in range(10)]
        with caplog.at_level(logging.WARNING):
            result = _validate_items(items, "disruptions")
        assert len(result) == 10
        count_warnings = [m for m in caplog.messages if "item count" in m.lower()]
        assert len(count_warnings) == 0

    def test_empty_list(self, caplog):
        """Empty input should trigger a low count warning."""
        with caplog.at_level(logging.WARNING):
            result = _validate_items([], "disruptions")
        assert result == []
        assert any("Low item count" in m for m in caplog.messages)
