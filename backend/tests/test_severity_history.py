"""Tests for event severity history in event detail (Task 3).

Validates get_event_severity_history() and the enhanced GET /events/{id} response.
"""

import json

import pytest

from backend.app.db.database import (
    get_event,
    get_event_severity_history,
    upsert_event,
)


class TestGetEventSeverityHistory:
    """Unit tests for get_event_severity_history()."""

    def test_empty_for_nonexistent_event(self):
        history = get_event_severity_history("nonexistent-id")
        assert history == []

    def test_single_snapshot(self, sample_payload):
        upsert_event("sev-hist-1|eu", "disruptions", sample_payload, "scan-001")
        history = get_event_severity_history("sev-hist-1|eu")
        assert len(history) == 1
        assert history[0]["scan_id"] == "scan-001"
        assert history[0]["severity"] == "High"
        assert history[0]["timestamp"] is not None

    def test_multiple_snapshots_ordered(self, sample_payload):
        upsert_event("sev-hist-2|eu", "disruptions", sample_payload, "scan-001")
        # Update with different severity
        updated = {**sample_payload, "severity": "Critical", "severity_score": 85}
        upsert_event("sev-hist-2|eu", "disruptions", updated, "scan-002")
        # Third scan back to High
        updated2 = {**sample_payload, "severity": "High", "severity_score": 60}
        upsert_event("sev-hist-2|eu", "disruptions", updated2, "scan-003")

        history = get_event_severity_history("sev-hist-2|eu")
        assert len(history) == 3
        assert history[0]["severity"] == "High"
        assert history[1]["severity"] == "Critical"
        assert history[1]["score"] == 85
        assert history[2]["severity"] == "High"
        # Should be in chronological order
        assert history[0]["timestamp"] <= history[1]["timestamp"] <= history[2]["timestamp"]

    def test_geopolitical_event_uses_risk_level(self, sample_geopolitical_payload):
        upsert_event("sev-hist-geo", "geopolitical", sample_geopolitical_payload, "scan-g1")
        history = get_event_severity_history("sev-hist-geo")
        assert len(history) == 1
        assert history[0]["severity"] == "High"

    def test_score_none_when_missing(self, sample_payload):
        """If payload has no severity_score or score field, score should be None."""
        payload = {k: v for k, v in sample_payload.items() if k not in ("severity_score", "score")}
        upsert_event("sev-no-score|eu", "disruptions", payload, "scan-ns")
        history = get_event_severity_history("sev-no-score|eu")
        assert len(history) == 1
        assert history[0]["score"] is None


class TestEventDetailIncludesSeverityHistory:
    """Verify get_event() integration -- severity_history is attached by the router."""

    def test_severity_history_function_available(self, sample_payload):
        """Verify the DB function works standalone (router attachment tested via API tests)."""
        upsert_event("detail-test|eu", "disruptions", sample_payload, "scan-d1")
        upsert_event("detail-test|eu", "disruptions", {**sample_payload, "severity": "Critical"}, "scan-d2")
        history = get_event_severity_history("detail-test|eu")
        assert len(history) == 2
        assert history[0]["severity"] == "High"
        assert history[1]["severity"] == "Critical"
