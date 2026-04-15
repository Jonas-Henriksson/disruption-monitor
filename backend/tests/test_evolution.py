"""Tests for evolution intelligence — DB schema, queries, and analyzer."""

import json
import pytest
from backend.app.db.database import (
    get_db,
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
