"""Integration tests: severity scoring wired into scanner + seed pipeline.

Verifies that _build_sample_result() and seed_if_empty() attach computed_severity
to every event, and that the field survives DB round-trips.
"""

import json

import pytest

from backend.app.db.database import get_event, upsert_event
from backend.app.services.scanner import _build_sample_result
from backend.app.services.severity import compute_severity_score


# ── Sample result includes computed_severity ─────────────────────


class TestSeverityInSampleResult:
    """Verify _build_sample_result attaches computed_severity to all items."""

    def _get_sample_result(self, mode: str) -> dict:
        from datetime import datetime, timezone
        return _build_sample_result(mode, "test-scan-001", datetime.now(timezone.utc))

    @pytest.mark.parametrize("mode", ["disruptions", "geopolitical", "trade"])
    def test_all_items_have_computed_severity(self, mode):
        result = self._get_sample_result(mode)
        for item in result["items"]:
            assert "computed_severity" in item, f"Missing computed_severity in {mode} item: {item.get('event', item.get('risk', '?'))}"

    @pytest.mark.parametrize("mode", ["disruptions", "geopolitical", "trade"])
    def test_computed_severity_score_range(self, mode):
        result = self._get_sample_result(mode)
        for item in result["items"]:
            cs = item["computed_severity"]
            assert 0 <= cs["score"] <= 100, f"Score {cs['score']} out of range for {item.get('event', '?')}"

    @pytest.mark.parametrize("mode", ["disruptions", "geopolitical", "trade"])
    def test_computed_severity_label_valid(self, mode):
        result = self._get_sample_result(mode)
        valid_labels = {"Critical", "High", "Medium", "Low"}
        for item in result["items"]:
            cs = item["computed_severity"]
            assert cs["label"] in valid_labels, f"Invalid label '{cs['label']}' for {item.get('event', '?')}"

    @pytest.mark.parametrize("mode", ["disruptions", "geopolitical", "trade"])
    def test_computed_severity_components_keys(self, mode):
        result = self._get_sample_result(mode)
        expected_keys = {"magnitude", "proximity", "asset_criticality", "supply_chain_impact"}
        for item in result["items"]:
            cs = item["computed_severity"]
            assert set(cs["components"].keys()) == expected_keys, (
                f"Component keys mismatch: {set(cs['components'].keys())} != {expected_keys}"
            )


# ── Severity survives DB round-trip ──────────────────────────────


class TestSeverityDBPersistence:
    """Verify that computed_severity survives upsert_event -> get_event."""

    def test_computed_severity_persists_in_payload(self, sample_payload):
        # Attach computed_severity to the payload (as scanner/seed would do)
        sample_payload["computed_severity"] = compute_severity_score(sample_payload)
        upsert_event("sev-persist|eu", "disruptions", sample_payload, "test-scan")

        # Retrieve and verify
        event = get_event("sev-persist|eu")
        assert event is not None
        assert "computed_severity" in event
        cs = event["computed_severity"]
        assert 0 <= cs["score"] <= 100
        assert cs["label"] in {"Critical", "High", "Medium", "Low"}
        assert "components" in cs

    def test_severity_score_matches_direct_computation(self, sample_payload):
        """Score from scanner pipeline should match direct compute_severity_score."""
        direct = compute_severity_score(sample_payload)
        sample_payload["computed_severity"] = direct
        upsert_event("sev-match|eu", "disruptions", sample_payload, "test-scan")

        event = get_event("sev-match|eu")
        assert event["computed_severity"]["score"] == direct["score"]
        assert event["computed_severity"]["label"] == direct["label"]


# ── Seed pipeline integration ────────────────────────────────────


class TestSeedSeverityIntegration:
    """Verify seed_if_empty attaches computed_severity to seeded events."""

    def test_seed_attaches_severity(self):
        from backend.app.seed.seed_db import seed_if_empty

        count = seed_if_empty()
        assert count > 0, "Seed should insert events"

        # Check a disruptions event
        from backend.app.db.database import get_events
        events = get_events(mode="disruptions")
        assert len(events) > 0
        for evt in events:
            assert "computed_severity" in evt, f"Seeded event missing computed_severity: {evt.get('event', '?')}"
            cs = evt["computed_severity"]
            assert 0 <= cs["score"] <= 100
            assert cs["label"] in {"Critical", "High", "Medium", "Low"}
