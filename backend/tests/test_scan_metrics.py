"""Tests for the scan metrics endpoint (Task 2).

Validates GET /api/v1/scans/metrics returns structured operational metrics.
"""

import pytest

from backend.app.db.database import (
    get_scan_metrics,
    save_event_feedback,
    save_scan_record,
)


class TestGetScanMetrics:
    """Unit tests for get_scan_metrics()."""

    def test_empty_db_returns_structure(self):
        metrics = get_scan_metrics()
        assert "by_mode" in metrics
        assert "total_scans_24h" in metrics
        assert "total_scans_7d" in metrics
        assert "false_positive_rate_pct" in metrics
        assert "feedback_stats" in metrics
        for mode in ("disruptions", "geopolitical", "trade"):
            assert mode in metrics["by_mode"]
            m = metrics["by_mode"][mode]
            assert m["scans_24h"] == 0
            assert m["scans_7d"] == 0
            assert m["avg_events_per_scan"] == 0.0
            assert m["last_successful_scan"] is None

    def test_counts_scans_correctly(self):
        save_scan_record("s1", "disruptions", "live", 5, "2026-04-12T10:00:00Z", "2026-04-12T10:01:00Z")
        save_scan_record("s2", "disruptions", "live", 3, "2026-04-12T11:00:00Z", "2026-04-12T11:01:30Z")
        save_scan_record("s3", "geopolitical", "sample", 2, "2026-04-12T10:00:00Z")
        metrics = get_scan_metrics()
        # These were inserted "now" so they count for 24h and 7d
        assert metrics["by_mode"]["disruptions"]["scans_24h"] == 2
        assert metrics["by_mode"]["disruptions"]["scans_7d"] == 2
        assert metrics["by_mode"]["geopolitical"]["scans_24h"] == 1
        assert metrics["total_scans_24h"] == 3

    def test_avg_events_per_scan(self):
        save_scan_record("s1", "trade", "live", 4, "2026-04-12T10:00:00Z", "2026-04-12T10:02:00Z")
        save_scan_record("s2", "trade", "live", 6, "2026-04-12T11:00:00Z", "2026-04-12T11:02:00Z")
        metrics = get_scan_metrics()
        assert metrics["by_mode"]["trade"]["avg_events_per_scan"] == 5.0

    def test_last_successful_scan(self):
        save_scan_record("s1", "disruptions", "live", 5, "2026-04-12T10:00:00Z", "2026-04-12T10:01:00Z")
        metrics = get_scan_metrics()
        last = metrics["by_mode"]["disruptions"]["last_successful_scan"]
        assert last is not None
        assert last["scan_id"] == "s1"
        assert last["source"] == "live"
        assert last["item_count"] == 5

    def test_false_positive_rate(self):
        save_event_feedback("evt-1", "true_positive")
        save_event_feedback("evt-2", "true_positive")
        save_event_feedback("evt-3", "false_positive")
        metrics = get_scan_metrics()
        # 1 FP out of 3 (tp+fp) = 33.3%
        assert metrics["false_positive_rate_pct"] == pytest.approx(33.3, abs=0.1)

    def test_no_feedback_returns_none_rate(self):
        metrics = get_scan_metrics()
        assert metrics["false_positive_rate_pct"] is None

    def test_avg_duration_calculated(self):
        save_scan_record("s1", "disruptions", "live", 5, "2026-04-12T10:00:00+00:00", "2026-04-12T10:00:30+00:00")
        save_scan_record("s2", "disruptions", "live", 3, "2026-04-12T11:00:00+00:00", "2026-04-12T11:01:00+00:00")
        metrics = get_scan_metrics()
        # (30 + 60) / 2 = 45
        avg = metrics["by_mode"]["disruptions"]["avg_duration_seconds"]
        assert avg == pytest.approx(45.0, abs=0.5)
