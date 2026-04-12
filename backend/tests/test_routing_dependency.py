"""Tests for routing dependency scoring in severity engine.

Covers: route proximity detection, chokepoint detection, blended scoring,
backwards compatibility (no route data), and integration with compute_severity_score.
"""

import pytest

from backend.app.services.severity import (
    _air_route_passes_near,
    _route_passes_near,
    _routing_dependency_score,
    compute_severity_score,
)
from backend.app.data.routes import (
    AIR_ROUTES,
    CHOKEPOINTS,
    ORIGIN_ROUTE_INDEX,
    PORTS,
    SEA_ROUTES,
)


# ── Route data integrity ─────────────────────────────────────────


class TestRouteData:
    def test_sea_routes_not_empty(self):
        assert len(SEA_ROUTES) > 0

    def test_air_routes_not_empty(self):
        assert len(AIR_ROUTES) > 0

    def test_chokepoints_not_empty(self):
        assert len(CHOKEPOINTS) > 0

    def test_ports_not_empty(self):
        assert len(PORTS) > 0

    def test_origin_route_index_not_empty(self):
        assert len(ORIGIN_ROUTE_INDEX) > 0

    def test_sea_routes_have_required_fields(self):
        for route in SEA_ROUTES:
            assert "pts" in route
            assert "label" in route
            assert "corridor" in route
            assert "origin" in route
            assert len(route["pts"]) >= 2

    def test_air_routes_have_required_fields(self):
        for route in AIR_ROUTES:
            assert "from" in route
            assert "to" in route
            assert "label" in route
            assert "corridor" in route
            assert "origin" in route

    def test_chokepoints_have_required_fields(self):
        for cp in CHOKEPOINTS:
            assert "name" in cp
            assert "lat" in cp
            assert "lng" in cp

    def test_known_origins_in_index(self):
        """Key factories should appear in the origin route index."""
        assert "Schweinfurt" in ORIGIN_ROUTE_INDEX
        assert "Gothenburg" in ORIGIN_ROUTE_INDEX
        assert "Airasca" in ORIGIN_ROUTE_INDEX


# ── Route proximity detection ────────────────────────────────────


class TestRoutePassesNear:
    def test_point_on_route_returns_true(self):
        """A point right on a waypoint should be detected."""
        route_pts = [[53.54, 9.97], [56.0, 4.0], [51.5, 1.5]]
        assert _route_passes_near(route_pts, 53.54, 9.97, 10.0) is True

    def test_point_near_route_returns_true(self):
        """A point close to a waypoint should be detected."""
        route_pts = [[53.54, 9.97], [56.0, 4.0], [51.5, 1.5]]
        # ~50km from Hamburg port
        assert _route_passes_near(route_pts, 53.8, 10.2, 100.0) is True

    def test_point_far_from_route_returns_false(self):
        """A point far from all waypoints should not be detected."""
        route_pts = [[53.54, 9.97], [56.0, 4.0], [51.5, 1.5]]
        # South Pacific -- far from any European route
        assert _route_passes_near(route_pts, -40.0, -150.0, 300.0) is False

    def test_suez_canal_detected_on_eu_cn_route(self):
        """The EU-CN sea route passes through the Suez Canal area."""
        eu_cn_route = SEA_ROUTES[0]  # Hamburg->Shanghai
        # Suez Canal coordinates
        assert _route_passes_near(eu_cn_route["pts"], 30.46, 32.34, 300.0) is True

    def test_south_pacific_not_on_eu_cn_route(self):
        eu_cn_route = SEA_ROUTES[0]
        assert _route_passes_near(eu_cn_route["pts"], -50.0, -150.0, 300.0) is False


class TestAirRoutePassesNear:
    def test_near_origin_airport(self):
        route = AIR_ROUTES[0]  # Frankfurt->Atlanta
        # Near Frankfurt
        assert _air_route_passes_near(route, 50.0, 8.5, 100.0) is True

    def test_near_destination_airport(self):
        route = AIR_ROUTES[0]  # Frankfurt->Atlanta
        # Near Atlanta
        assert _air_route_passes_near(route, 33.6, -84.4, 100.0) is True

    def test_midpoint_not_detected(self):
        """Air routes only check endpoints, not the midpoint."""
        route = AIR_ROUTES[0]  # Frankfurt->Atlanta
        # Mid-Atlantic -- far from both endpoints
        assert _air_route_passes_near(route, 40.0, -40.0, 100.0) is False


# ── Routing dependency score ──────────────────────────────────────


class TestRoutingDependencyScore:
    def test_no_affected_sites_returns_zero(self):
        score, reasons = _routing_dependency_score(30.46, 32.34, [])
        assert score == 0.0
        assert reasons == []

    def test_no_coords_returns_zero(self):
        score, reasons = _routing_dependency_score(None, None, [{"name": "Schweinfurt"}])
        assert score == 0.0
        assert reasons == []

    def test_suez_disruption_affects_schweinfurt(self):
        """A disruption near the Suez Canal should affect Schweinfurt's EU-CN route."""
        sites = [
            {"name": "Schweinfurt", "type": "mfg", "distance_km": 2500},
        ]
        score, reasons = _routing_dependency_score(30.46, 32.34, sites)
        assert score > 0.0
        assert len(reasons) > 0

    def test_suez_disruption_affects_gothenburg(self):
        """Gothenburg has EU-CN routes through Suez."""
        sites = [
            {"name": "Gothenburg", "type": "mfg", "distance_km": 3000},
        ]
        score, reasons = _routing_dependency_score(30.46, 32.34, sites)
        assert score > 0.0

    def test_south_pacific_no_route_dependency(self):
        """A disruption in the South Pacific should not affect EU factory routes."""
        sites = [
            {"name": "Schweinfurt", "type": "mfg", "distance_km": 15000},
        ]
        score, reasons = _routing_dependency_score(-50.0, -150.0, sites)
        assert score == 0.0
        assert reasons == []

    def test_site_without_routes_ignored(self):
        """Sites not in the ORIGIN_ROUTE_INDEX should not contribute."""
        sites = [
            {"name": "NonexistentSite", "type": "mfg", "distance_km": 100},
        ]
        score, reasons = _routing_dependency_score(30.46, 32.34, sites)
        assert score == 0.0

    def test_chokepoint_proximity_detected(self):
        """A disruption near a known chokepoint should be detected."""
        # Near Strait of Malacca -- affects EU-CN and EU-ASEAN routes
        sites = [
            {"name": "Gothenburg", "type": "mfg", "distance_km": 10000},
        ]
        score, reasons = _routing_dependency_score(2.5, 101.2, sites)
        assert score > 0.0
        has_chokepoint_reason = any("Chokepoint" in r or "Malacca" in r for r in reasons)
        assert has_chokepoint_reason or any("route" in r.lower() for r in reasons)

    def test_multiple_sites_blended(self):
        """Multiple affected sites should blend scores."""
        sites = [
            {"name": "Schweinfurt", "type": "mfg", "distance_km": 2500},
            {"name": "Gothenburg", "type": "mfg", "distance_km": 3000},
        ]
        score, reasons = _routing_dependency_score(30.46, 32.34, sites)
        assert score > 0.5  # Both factories have routes through Suez

    def test_score_bounded_0_to_1(self):
        """Score should always be between 0 and 1."""
        sites = [
            {"name": "Schweinfurt", "type": "mfg", "distance_km": 100},
            {"name": "Gothenburg", "type": "mfg", "distance_km": 200},
            {"name": "Airasca", "type": "mfg", "distance_km": 300},
        ]
        score, _ = _routing_dependency_score(30.46, 32.34, sites)
        assert 0.0 <= score <= 1.0


# ── Integration with compute_severity_score ─────────────────────


class TestRoutingDependencyIntegration:
    def test_suez_event_boosts_proximity_for_distant_factory(self):
        """A Suez Canal disruption should boost proximity score for Gothenburg
        even though Gothenburg is 3000+ km away, because of routing dependency."""
        # Event at Suez Canal
        event_with_routing = {
            "lat": 30.46, "lng": 32.34,
            "category": "Logistics/Port",
            "severity": "High",
            "trend": "Escalating",
            "region": "Egypt",
            "affected_sites": [
                {"name": "Gothenburg", "type": "mfg", "distance_km": 3500, "business_unit": "ind"},
            ],
        }
        # Same event but with a site that has no routing dependency
        event_without_routing = {
            "lat": 30.46, "lng": 32.34,
            "category": "Logistics/Port",
            "severity": "High",
            "trend": "Escalating",
            "region": "Egypt",
            "affected_sites": [
                {"name": "UnknownSite", "type": "mfg", "distance_km": 3500, "business_unit": "ind"},
            ],
        }
        result_with = compute_severity_score(event_with_routing)
        result_without = compute_severity_score(event_without_routing)

        # Routing dependency should boost the proximity component
        assert result_with["components"]["proximity"] > result_without["components"]["proximity"]

    def test_routing_dependency_context_in_result(self):
        """When routing dependency is detected, the result should include context."""
        event = {
            "lat": 30.46, "lng": 32.34,
            "category": "Logistics/Port",
            "severity": "High",
            "region": "Egypt",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 2500, "business_unit": "ind"},
            ],
        }
        result = compute_severity_score(event)
        assert "routing_dependency" in result
        assert result["routing_dependency"]["score"] > 0
        assert len(result["routing_dependency"]["reasons"]) > 0

    def test_no_routing_dependency_no_context(self):
        """When no routing dependency, the key should not be in the result."""
        event = {
            "lat": -50.0, "lng": -150.0,
            "category": "Other",
            "severity": "Low",
            "affected_sites": [
                {"name": "SomeSite", "type": "sales", "distance_km": 5000},
            ],
        }
        result = compute_severity_score(event)
        assert "routing_dependency" not in result

    def test_backwards_compatible_no_sites(self):
        """Events without affected sites should still work (no routing)."""
        result = compute_severity_score({
            "lat": 30.46, "lng": 32.34,
            "severity": "High",
            "category": "Logistics/Port",
        })
        assert "score" in result
        assert "label" in result
        assert 0 <= result["score"] <= 100

    def test_backwards_compatible_no_coords(self):
        """Events without coordinates should still work."""
        result = compute_severity_score({
            "severity": "High",
            "category": "Logistics/Port",
        })
        assert "score" in result
        assert result["components"]["proximity"] == 0.0

    def test_result_still_has_all_fields(self):
        """All original fields should still be present."""
        result = compute_severity_score({
            "lat": 50.0, "lng": 10.0,
            "severity": "Medium",
            "category": "Other",
        })
        assert "score" in result
        assert "label" in result
        assert "components" in result
        assert "affected_site_count" in result
        assert "probability" in result
        assert "velocity" in result
        assert "recovery_estimate" in result
        assert "impact_magnitude" in result
