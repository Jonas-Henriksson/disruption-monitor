"""Tests for API endpoints via FastAPI TestClient.

Covers: health, events CRUD, scans, sites, suppliers.
Tests both happy paths and error cases (404, 400).
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.db.database import upsert_event, save_scan_record
from backend.app.main import app

client = TestClient(app)


# ── Health ───────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_200(self):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "database" in data
        assert "scheduler" in data

    def test_health_database_stats_shape(self):
        r = client.get("/api/v1/health")
        db = r.json()["database"]
        assert "events" in db
        assert "scans" in db
        assert "tickets" in db


# ── Events ───────────────────────────────────────────────────────


class TestEventsEndpoints:
    def test_list_events_empty(self):
        r = client.get("/api/v1/events")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_events_with_data(self, seeded_db):
        r = client.get("/api/v1/events")
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 2

    def test_list_events_filter_mode(self, seeded_db):
        r = client.get("/api/v1/events?mode=disruptions")
        assert r.status_code == 200
        events = r.json()
        assert len(events) >= 1

    def test_list_events_filter_status(self, seeded_db):
        r = client.get("/api/v1/events?status=active")
        assert r.status_code == 200

    def test_get_event_detail(self, seeded_db):
        r = client.get("/api/v1/events/test-event|europe")
        assert r.status_code == 200
        data = r.json()
        assert data["event"] == "Test Factory Fire"

    def test_get_event_404(self):
        r = client.get("/api/v1/events/nonexistent-id")
        assert r.status_code == 404

    def test_get_recommendations_404_no_event(self):
        r = client.get("/api/v1/events/nonexistent-id/recommendations")
        assert r.status_code == 404

    def test_get_recommendations_404_no_structured_recs(self, seeded_db):
        """Events without impact/actions should 404 on recommendations."""
        r = client.get("/api/v1/events/test-event|europe/recommendations")
        assert r.status_code == 404
        assert "No structured recommendations" in r.json()["detail"]

    def test_get_recommendations_with_structured_data(self):
        """Events WITH impact and actions should return properly."""
        payload = {
            "id": "recs-test|eu",
            "event": "Recs Test Event",
            "description": "Test",
            "category": "Other",
            "severity": "High",
            "trend": "Stable",
            "region": "Europe",
            "lat": 50.0,
            "lng": 10.0,
            "skf_exposure": "Test exposure",
            "recommended_action": "Take action",
            "impact": {
                "affected_sites": [{"name": "Gothenburg MFG", "type": "mfg", "distance_km": 0}],
                "affected_suppliers": {"count": 5, "countries": ["Germany"]},
                "estimated_units_per_week": 10000,
                "recovery_weeks_with_mitigation": 4,
                "recovery_weeks_without": 12,
            },
            "actions": [
                {"priority": 1, "action": "Do something", "owner": "Procurement", "urgency": "immediate"},
            ],
            "confidence": 0.85,
            "sources": ["Test Source"],
        }
        upsert_event("recs-test|eu", "disruptions", payload, "s-recs")
        r = client.get("/api/v1/events/recs-test|eu/recommendations")
        assert r.status_code == 200
        data = r.json()
        assert data["event_id"] == "recs-test|eu"
        assert len(data["actions"]) == 1
        assert data["confidence"] == 0.85


# ── Event status PATCH ───────────────────────────────────────────


class TestEventStatusPatch:
    def test_valid_status_change(self, seeded_db):
        r = client.patch(
            "/api/v1/events/test-event|europe/status",
            json={"status": "watching"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "watching"

    def test_invalid_status_returns_400(self, seeded_db):
        r = client.patch(
            "/api/v1/events/test-event|europe/status",
            json={"status": "deleted"},
        )
        assert r.status_code == 400

    def test_nonexistent_event_returns_404(self):
        r = client.patch(
            "/api/v1/events/no-such-event/status",
            json={"status": "watching"},
        )
        assert r.status_code == 404


# ── Scans ────────────────────────────────────────────────────────


class TestScansEndpoints:
    def test_trigger_scan_disruptions(self):
        """POST /scans should return a scan result with items."""
        r = client.post("/api/v1/scans", json={"mode": "disruptions"})
        assert r.status_code == 200
        data = r.json()
        assert data["mode"] == "disruptions"
        assert data["status"] == "completed"
        assert "items" in data
        assert data["count"] > 0
        # Source depends on whether API key is configured
        assert data["source"] in ("sample", "live")

    def test_trigger_scan_geopolitical(self):
        r = client.post("/api/v1/scans", json={"mode": "geopolitical"})
        assert r.status_code == 200
        assert r.json()["mode"] == "geopolitical"

    def test_trigger_scan_trade(self):
        r = client.post("/api/v1/scans", json={"mode": "trade"})
        assert r.status_code == 200
        assert r.json()["mode"] == "trade"

    def test_trigger_scan_persists_to_db(self):
        """After triggering a scan, events should be in the DB."""
        client.post("/api/v1/scans", json={"mode": "disruptions"})
        r = client.get("/api/v1/events?mode=disruptions")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_get_latest_scan(self):
        """After a scan, GET /scans/latest/{mode} should return results."""
        client.post("/api/v1/scans", json={"mode": "disruptions"})
        r = client.get("/api/v1/scans/latest/disruptions")
        assert r.status_code == 200
        data = r.json()
        assert data["mode"] == "disruptions"
        assert data["count"] > 0

    def test_get_latest_scan_no_data_falls_back(self):
        """Without any scans, latest should fall back to sample data."""
        r = client.get("/api/v1/scans/latest/disruptions")
        assert r.status_code == 200
        data = r.json()
        assert data["source"] in ("sample", "database")

    def test_scan_history(self):
        client.post("/api/v1/scans", json={"mode": "disruptions"})
        r = client.get("/api/v1/scans/history")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_scan_history_filter_mode(self):
        client.post("/api/v1/scans", json={"mode": "disruptions"})
        client.post("/api/v1/scans", json={"mode": "trade"})
        r = client.get("/api/v1/scans/history?mode=disruptions")
        assert r.status_code == 200
        history = r.json()
        assert all(h["mode"] == "disruptions" for h in history)

    def test_scan_record_has_audit_fields(self):
        """Scan records should capture scan_id, source, timestamps."""
        client.post("/api/v1/scans", json={"mode": "disruptions"})
        r = client.get("/api/v1/scans/history?mode=disruptions")
        record = r.json()[0]
        assert "scan_id" in record
        assert "source" in record
        assert "started_at" in record
        assert "item_count" in record


# ── Sites ────────────────────────────────────────────────────────


class TestSitesEndpoint:
    def test_sites_returns_200(self):
        r = client.get("/api/v1/sites")
        assert r.status_code == 200

    def test_sites_shape(self):
        r = client.get("/api/v1/sites")
        data = r.json()
        assert "sites" in data
        assert "stats" in data
        assert "total" in data
        assert data["total"] > 200  # Should have ~245 sites

    def test_sites_have_required_fields(self):
        r = client.get("/api/v1/sites")
        site = r.json()["sites"][0]
        for field in ("name", "lat", "lng", "type", "country", "iso", "region"):
            assert field in site, f"Missing field: {field}"


# ── Suppliers ────────────────────────────────────────────────────


class TestSuppliersEndpoint:
    def test_suppliers_returns_200(self):
        r = client.get("/api/v1/suppliers")
        assert r.status_code == 200

    def test_suppliers_shape(self):
        r = client.get("/api/v1/suppliers")
        data = r.json()
        assert "suppliers" in data
        assert "total" in data
        assert "countries" in data
        assert data["total"] > 4000  # Should be ~5090

    def test_suppliers_have_required_fields(self):
        r = client.get("/api/v1/suppliers")
        supplier = r.json()["suppliers"][0]
        for field in ("country", "lat", "lng", "count", "relationships", "region"):
            assert field in supplier, f"Missing field: {field}"


# ── Timeline ────────────────────────────────────────────────────


class TestTimelineEndpoint:
    def test_timeline_returns_200(self):
        r = client.get("/api/v1/events/timeline")
        assert r.status_code == 200

    def test_timeline_empty_db_returns_empty_list(self):
        r = client.get("/api/v1/events/timeline")
        assert r.status_code == 200
        assert r.json() == []

    def test_timeline_with_data(self, seeded_db):
        r = client.get("/api/v1/events/timeline")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        day = data[-1]
        for key in ("date", "event_count", "critical_count", "high_count", "affected_sites_count"):
            assert key in day, f"Missing key: {key}"

    def test_timeline_days_zero_returns_400(self):
        r = client.get("/api/v1/events/timeline?days=0")
        assert r.status_code == 400

    def test_timeline_days_366_returns_400(self):
        r = client.get("/api/v1/events/timeline?days=366")
        assert r.status_code == 400

    def test_timeline_days_365_ok(self):
        r = client.get("/api/v1/events/timeline?days=365")
        assert r.status_code == 200

    def test_timeline_days_1_ok(self):
        r = client.get("/api/v1/events/timeline?days=1")
        assert r.status_code == 200

    def test_timeline_response_shape(self, seeded_db):
        """Each item in the timeline response should be a dict with all required keys."""
        r = client.get("/api/v1/events/timeline?days=30")
        assert r.status_code == 200
        for entry in r.json():
            assert isinstance(entry, dict)
            assert isinstance(entry["date"], str)
            assert isinstance(entry["event_count"], int)
            assert isinstance(entry["critical_count"], int)
            assert isinstance(entry["high_count"], int)
            assert isinstance(entry["affected_sites_count"], int)
