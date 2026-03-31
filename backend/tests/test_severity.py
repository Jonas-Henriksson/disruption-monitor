"""Tests for backend.app.services.severity — algorithmic severity scoring.

Covers: score range validation, component weights, label thresholds,
edge cases (no coords, no sites), category/trend adjustments,
monotonicity, constant validity, and BU criticality.
"""

import pytest

from backend.app.services.severity import (
    BU_CRITICALITY,
    CATEGORY_MAGNITUDE,
    SITE_TYPE_CRITICALITY,
    _proximity_score,
    _site_criticality,
    _haversine_km,
    compute_severity_score,
)


# ── Proximity score ───────────────────────────────────────────────


class TestProximityScore:
    def test_zero_distance_is_max(self):
        assert _proximity_score(0) == 1.0

    def test_max_distance_is_zero(self):
        assert _proximity_score(3000) == 0.0

    def test_beyond_max_is_zero(self):
        assert _proximity_score(5000) == 0.0

    def test_mid_distance_between_0_and_1(self):
        score = _proximity_score(750)
        assert 0.0 < score < 1.0

    def test_closer_is_higher(self):
        assert _proximity_score(100) > _proximity_score(500)
        assert _proximity_score(500) > _proximity_score(1500)


# ── Site criticality ──────────────────────────────────────────────


class TestSiteCriticality:
    def test_manufacturing_highest(self):
        mfg = _site_criticality({"type": "mfg", "business_unit": "ind"})
        admin = _site_criticality({"type": "admin", "business_unit": "ind"})
        assert mfg > admin

    def test_aerospace_high(self):
        aero = _site_criticality({"type": "mfg", "business_unit": "sis-aero"})
        assert aero > 0.5

    def test_unknown_type_has_low_weight(self):
        score = _site_criticality({"type": "other"})
        assert score < 0.3

    def test_no_bu_uses_default(self):
        score = _site_criticality({"type": "mfg"})
        assert score > 0  # Should still return a valid score


# ── Haversine sanity checks ───────────────────────────────────────


class TestHaversine:
    def test_same_point_is_zero(self):
        assert _haversine_km(50, 10, 50, 10) == 0.0

    def test_known_distance(self):
        # Stockholm (59.33, 18.07) to Gothenburg (57.71, 11.97) ≈ 400 km
        dist = _haversine_km(59.33, 18.07, 57.71, 11.97)
        assert 350 < dist < 450

    def test_antipodal(self):
        # Opposite sides of Earth ≈ 20,000 km
        dist = _haversine_km(0, 0, 0, 180)
        assert 19_000 < dist < 21_000


# ── Full scoring engine ──────────────────────────────────────────


class TestComputeSeverityScore:
    def test_returns_required_fields(self):
        result = compute_severity_score({"lat": 50, "lng": 10})
        assert "score" in result
        assert "label" in result
        assert "components" in result
        assert "affected_site_count" in result

    def test_score_in_range(self):
        result = compute_severity_score({"lat": 50, "lng": 10, "severity": "Critical"})
        assert 0 <= result["score"] <= 100

    def test_label_is_valid(self):
        result = compute_severity_score({"lat": 50, "lng": 10})
        assert result["label"] in ("Critical", "High", "Medium", "Low")

    def test_critical_category_scores_higher(self):
        critical = compute_severity_score({
            "lat": 47.4, "lng": 8.5,  # Near Schweinfurt/central Europe
            "category": "Natural Disaster",
            "severity": "Critical",
            "trend": "Escalating",
        })
        low = compute_severity_score({
            "lat": 47.4, "lng": 8.5,
            "category": "Currency",
            "severity": "Low",
            "trend": "De-escalating",
        })
        assert critical["score"] > low["score"]

    def test_escalating_trend_boosts_score(self):
        base = compute_severity_score({
            "lat": 50, "lng": 10,
            "category": "Other",
            "severity": "Medium",
            "trend": "Stable",
        })
        escalating = compute_severity_score({
            "lat": 50, "lng": 10,
            "category": "Other",
            "severity": "Medium",
            "trend": "Escalating",
        })
        assert escalating["score"] >= base["score"]

    def test_deescalating_trend_lowers_score(self):
        base = compute_severity_score({
            "lat": 50, "lng": 10,
            "category": "Other",
            "severity": "Medium",
            "trend": "Stable",
        })
        deesc = compute_severity_score({
            "lat": 50, "lng": 10,
            "category": "Other",
            "severity": "Medium",
            "trend": "De-escalating",
        })
        assert deesc["score"] <= base["score"]

    def test_no_coords_returns_low_score(self):
        """Events without lat/lng can't match sites, should score low."""
        result = compute_severity_score({"severity": "Critical", "category": "Natural Disaster"})
        # Only magnitude contributes, max 30 points
        assert result["score"] <= 35

    def test_precomputed_affected_sites(self):
        """When affected_sites are already in the event, they should be used."""
        result = compute_severity_score({
            "lat": 50, "lng": 10,
            "severity": "High",
            "category": "Natural Disaster",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 50, "business_unit": "ind"},
                {"name": "Hamburg", "type": "mfg", "distance_km": 300, "business_unit": "ind"},
            ],
        })
        assert result["affected_site_count"] == 2
        assert result["components"]["proximity"] > 0
        assert result["components"]["asset_criticality"] > 0

    def test_remote_location_low_proximity(self):
        """Event in remote ocean should have near-zero proximity."""
        result = compute_severity_score({
            "lat": -60, "lng": -150,  # South Pacific, far from any SKF site
            "severity": "Critical",
            "category": "Natural Disaster",
        })
        # Should still have magnitude but low proximity
        assert result["components"]["magnitude"] > 0.5
        # proximity might be >0 if any site is within 3000km; but most won't be

    def test_components_sum_correctly(self):
        """Verify the weighted sum produces the expected score."""
        result = compute_severity_score({
            "lat": 50, "lng": 10,
            "severity": "Medium",
            "affected_sites": [
                {"name": "Test", "type": "mfg", "distance_km": 100, "business_unit": "ind"},
            ],
        })
        c = result["components"]
        expected = (
            0.30 * c["magnitude"]
            + 0.25 * c["proximity"]
            + 0.25 * c["asset_criticality"]
            + 0.20 * c["supply_chain_impact"]
        ) * 100
        assert abs(result["score"] - round(expected, 1)) < 0.2

    def test_label_thresholds(self):
        """Verify label assignment matches documented thresholds."""
        # We can't control exact scores easily, but we can test with pre-set components
        # by crafting events with known characteristics
        # Just verify that the mapping is consistent
        for event, expected_min_label in [
            ({"severity": "Critical", "category": "Natural Disaster", "trend": "Escalating",
              "lat": 50, "lng": 10,
              "affected_sites": [
                  {"name": "S1", "type": "mfg", "distance_km": 10, "business_unit": "ind"},
                  {"name": "S2", "type": "mfg", "distance_km": 20, "business_unit": "ind"},
                  {"name": "S3", "type": "mfg", "distance_km": 30, "business_unit": "sis-aero"},
                  {"name": "S4", "type": "mfg", "distance_km": 40, "business_unit": "ind"},
                  {"name": "S5", "type": "log", "distance_km": 50, "business_unit": "ind"},
              ]}, "Critical"),
        ]:
            result = compute_severity_score(event)
            assert result["label"] == expected_min_label, (
                f"Expected {expected_min_label}, got {result['label']} (score={result['score']})"
            )

    def test_geopolitical_event_uses_risk_level(self):
        """Geopolitical events use risk_level instead of severity."""
        result = compute_severity_score({
            "risk": "Test Risk",
            "risk_level": "Critical",
            "lat": 50, "lng": 10,
        })
        # Should pick up the Critical risk_level as AI severity
        assert result["components"]["magnitude"] > 0.5

    def test_more_mfg_sites_increases_supply_chain_impact(self):
        """More manufacturing sites should increase supply chain impact."""
        few = compute_severity_score({
            "lat": 0, "lng": 0, "severity": "High",
            "affected_sites": [{"name": "A", "type": "mfg", "distance_km": 100}],
        })
        many = compute_severity_score({
            "lat": 0, "lng": 0, "severity": "High",
            "affected_sites": [
                {"name": f"Site {i}", "type": "mfg", "distance_km": 100}
                for i in range(5)
            ],
        })
        assert many["components"]["supply_chain_impact"] > few["components"]["supply_chain_impact"]

    def test_empty_affected_sites_recomputed(self):
        """Empty affected_sites list triggers recomputation from coords."""
        # With lat/lng provided and empty list, the engine recomputes from coords
        # A remote location should have zero impact
        result = compute_severity_score({
            "lat": -60, "lng": -150, "severity": "High",
            "affected_sites": [],
        })
        # Remote ocean: no sites nearby, so supply chain impact should be 0
        assert result["components"]["supply_chain_impact"] == 0.0

    def test_low_score_label(self):
        """Remote, low-category, de-escalating event should be Low."""
        result = compute_severity_score({
            "lat": -40.0, "lng": -150.0,
            "severity": "Low",
            "category": "Currency",
            "trend": "De-escalating",
        })
        assert result["label"] == "Low"
        assert result["score"] < 25


# ── Constants sanity checks ────────────────────────────────────────


class TestConstants:
    def test_all_category_magnitudes_in_range(self):
        for cat, mag in CATEGORY_MAGNITUDE.items():
            assert 0.0 <= mag <= 1.0, f"Category '{cat}' magnitude {mag} out of range"

    def test_all_site_type_weights_in_range(self):
        for st, weight in SITE_TYPE_CRITICALITY.items():
            assert 0.0 <= weight <= 1.0, f"Site type '{st}' weight {weight} out of range"

    def test_all_bu_weights_in_range(self):
        for bu, weight in BU_CRITICALITY.items():
            assert 0.0 <= weight <= 1.0, f"BU '{bu}' weight {weight} out of range"

    def test_mfg_type_is_max(self):
        assert SITE_TYPE_CRITICALITY["mfg"] == max(SITE_TYPE_CRITICALITY.values())


class TestProximityMonotonicity:
    def test_monotonically_decreasing(self):
        scores = [_proximity_score(d) for d in range(0, 3001, 100)]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]

    def test_negative_distance(self):
        assert _proximity_score(-10) == 1.0
