"""Tests for evolution intelligence — DB schema, queries, and analyzer."""

import json
import pytest
from backend.app.db.database import (
    get_db,
    get_event,
    upsert_event,
    get_evolution_summaries,
    save_evolution_summary,
)


def _seed_event(event_id="test-event|europe", mode="disruptions", severity="High", score=65):
    payload = {
        "id": event_id,
        "event": "Test Event",
        "region": "Europe",
        "severity": severity,
        "computed_severity": {"score": score},
        "lat": 52.0,
        "lng": 13.0,
    }
    upsert_event(event_id, mode, payload, "scan-001")
    return payload


class TestEvolutionSummariesTable:
    def test_save_and_retrieve_summary(self):
        _seed_event()
        summary = {
            "event_id": "test-event|europe",
            "period_type": "daily",
            "period_start": "2026-04-15",
            "period_end": "2026-04-15",
            "severity_values": json.dumps([65, 67, 66]),
            "phase_label": "Initial Detection",
            "phase_number": 1,
            "key_developments": json.dumps([{"date": "2026-04-15", "description": "First detected"}]),
            "exposure_delta": "",
            "forward_outlook": "Likely stable in the short term.",
            "narrative": "This event was first detected today.",
            "generated_by": "claude",
        }
        save_evolution_summary(summary)
        results = get_evolution_summaries("test-event|europe")
        assert len(results) == 1
        assert results[0]["phase_label"] == "Initial Detection"
        assert results[0]["phase_number"] == 1
        assert json.loads(results[0]["severity_values"]) == [65, 67, 66]

    def test_retrieve_by_period_type(self):
        _seed_event()
        for pt in ("daily", "daily", "weekly"):
            save_evolution_summary({
                "event_id": "test-event|europe",
                "period_type": pt,
                "period_start": "2026-04-15",
                "period_end": "2026-04-15",
                "severity_values": "[]",
                "phase_label": "Test",
                "phase_number": 1,
                "key_developments": "[]",
                "exposure_delta": "",
                "forward_outlook": "",
                "narrative": "",
                "generated_by": "fallback",
            })
        all_results = get_evolution_summaries("test-event|europe")
        assert len(all_results) == 3
        daily_only = get_evolution_summaries("test-event|europe", period_type="daily")
        assert len(daily_only) == 2

    def test_get_latest_summary(self):
        _seed_event()
        for i, label in enumerate(["Phase A", "Phase B"], 1):
            save_evolution_summary({
                "event_id": "test-event|europe",
                "period_type": "daily",
                "period_start": f"2026-04-{14 + i:02d}",
                "period_end": f"2026-04-{14 + i:02d}",
                "severity_values": "[]",
                "phase_label": label,
                "phase_number": i,
                "key_developments": "[]",
                "exposure_delta": "",
                "forward_outlook": "",
                "narrative": "",
                "generated_by": "fallback",
            })
        from backend.app.db.database import get_latest_evolution_summary
        latest = get_latest_evolution_summary("test-event|europe")
        assert latest is not None
        assert latest["phase_label"] == "Phase B"


class TestArchiveResurrection:
    def test_archived_event_resurfaces_on_higher_severity(self):
        """Archived at score 50, re-detected at 70 → should resurface."""
        _seed_event(score=50)
        # Archive it — simulate storing archived_severity
        with get_db() as conn:
            conn.execute(
                "UPDATE events SET status = 'archived', archived_severity = 50 WHERE id = ?",
                ("test-event|europe",),
            )
        # Re-detect at higher severity
        payload = {
            "id": "test-event|europe",
            "event": "Test Event",
            "region": "Europe",
            "severity": "High",
            "computed_severity": {"score": 70},
            "lat": 52.0,
            "lng": 13.0,
        }
        result = upsert_event("test-event|europe", "disruptions", payload, "scan-002")
        event = get_event("test-event|europe")
        assert event["status"] == "active"
        assert event.get("resurfaced_at") is not None

    def test_archived_event_stays_archived_on_same_severity(self):
        """Archived at score 50, re-detected at 45 → should stay archived."""
        _seed_event(score=50)
        with get_db() as conn:
            conn.execute(
                "UPDATE events SET status = 'archived', archived_severity = 50 WHERE id = ?",
                ("test-event|europe",),
            )
        payload = {
            "id": "test-event|europe",
            "event": "Test Event",
            "region": "Europe",
            "severity": "Medium",
            "computed_severity": {"score": 45},
            "lat": 52.0,
            "lng": 13.0,
        }
        upsert_event("test-event|europe", "disruptions", payload, "scan-002")
        event = get_event("test-event|europe")
        assert event["status"] == "archived"
        assert event.get("resurfaced_at") is None

    def test_active_event_not_affected_by_resurrection_logic(self):
        """Active events should not get resurfaced_at set."""
        _seed_event(score=50)
        payload = {
            "id": "test-event|europe",
            "event": "Test Event Updated",
            "region": "Europe",
            "severity": "Critical",
            "computed_severity": {"score": 80},
            "lat": 52.0,
            "lng": 13.0,
        }
        upsert_event("test-event|europe", "disruptions", payload, "scan-002")
        event = get_event("test-event|europe")
        assert event["status"] == "active"
        assert event.get("resurfaced_at") is None


from backend.app.services.evolution import (
    build_fallback_evolution_summary,
    get_evolution_cadence_hours,
)


class TestEvolutionAnalyzer:
    def test_fallback_summary_has_all_fields(self):
        snapshots = [
            {"severity": "High", "computed_severity": {"score": 65}, "event": "Test", "region": "EU"},
            {"severity": "High", "computed_severity": {"score": 68}, "event": "Test", "region": "EU"},
            {"severity": "High", "computed_severity": {"score": 66}, "event": "Test", "region": "EU"},
        ]
        result = build_fallback_evolution_summary(
            event_id="test|eu",
            snapshots=snapshots,
            period_type="daily",
            period_start="2026-04-15",
            period_end="2026-04-15",
            prior_phases=[],
        )
        assert result["event_id"] == "test|eu"
        assert result["period_type"] == "daily"
        assert result["generated_by"] == "fallback"
        assert result["phase_number"] >= 1
        assert result["narrative"] != ""
        sev_vals = json.loads(result["severity_values"])
        assert sev_vals == [65, 68, 66]

    def test_cadence_critical_is_6h(self):
        assert get_evolution_cadence_hours("Critical") == 6

    def test_cadence_high_is_24h(self):
        assert get_evolution_cadence_hours("High") == 24

    def test_cadence_medium_is_weekly(self):
        assert get_evolution_cadence_hours("Medium") == 168

    def test_cadence_watching_overrides_to_daily(self):
        assert get_evolution_cadence_hours("Medium", watching=True) == 24
