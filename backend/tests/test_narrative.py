"""Tests for the narrative endpoint — structured talking points.

Validates the new talking_points structure, backward-compatible narrative field,
fallback generation, and section parsing logic.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routers.events import (
    TalkingPoints,
    _build_fallback_narrative,
    _parse_sections_fallback,
    _parse_talking_points,
    _talking_points_to_narrative,
)

client = TestClient(app)


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def rich_event():
    """An event with full impact/actions data for narrative generation."""
    return {
        "id": "earthquake-izmir|middle-east",
        "event": "Earthquake in Izmir, Turkey",
        "description": "Magnitude 6.2 earthquake struck Izmir region",
        "category": "Natural Disaster",
        "severity": "Critical",
        "trend": "De-escalating",
        "region": "Middle East",
        "lat": 38.42,
        "lng": 27.14,
        "skf_exposure": "2 manufacturing sites within 50km, 8 suppliers affected",
        "recommended_action": "Activate backup suppliers in Romania and Germany",
        "status": "active",
        "impact": {
            "affected_sites": [
                {"name": "Izmir MFG", "type": "mfg", "distance_km": 12.0},
                {"name": "Ankara VA", "type": "va", "distance_km": 45.0},
            ],
            "affected_suppliers": {"count": 8, "countries": ["Turkey", "Greece"]},
            "estimated_units_per_week": 12000,
            "recovery_weeks_with_mitigation": 2,
            "recovery_weeks_without": 6,
        },
        "actions": [
            {"priority": 1, "action": "Contact Turkish suppliers for status", "owner": "Procurement", "urgency": "immediate"},
            {"priority": 2, "action": "Activate backup suppliers in Romania", "owner": "Procurement", "urgency": "48h"},
        ],
        "confidence": 0.85,
        "sources": ["USGS", "Reuters"],
    }


@pytest.fixture
def minimal_event():
    """A minimal event without impact/actions data."""
    return {
        "id": "storm-pacific|apac",
        "event": "Tropical Storm in Pacific",
        "description": "Category 2 storm approaching shipping lanes",
        "category": "Natural Disaster",
        "severity": "Medium",
        "trend": "Escalating",
        "region": "APAC",
        "lat": 20.0,
        "lng": 130.0,
        "skf_exposure": "Minor exposure to APAC logistics",
        "recommended_action": "Monitor situation",
    }


# ── TalkingPoints parsing ────────────────────────────────────────


class TestParseTalkingPoints:
    def test_parse_valid_json(self):
        raw = json.dumps({
            "situation": ["Earthquake struck Izmir"],
            "exposure": ["2 sites affected"],
            "action": ["Activate backups"],
            "outlook": ["Recovery in 2 weeks"],
        })
        tp = _parse_talking_points(raw)
        assert tp.situation == ["Earthquake struck Izmir"]
        assert tp.exposure == ["2 sites affected"]
        assert tp.action == ["Activate backups"]
        assert tp.outlook == ["Recovery in 2 weeks"]

    def test_parse_json_with_markdown_fences(self):
        raw = '```json\n{"situation": ["Test"], "exposure": [], "action": [], "outlook": []}\n```'
        tp = _parse_talking_points(raw)
        assert tp.situation == ["Test"]

    def test_parse_malformed_json_falls_back_to_sections(self):
        raw = """SITUATION:
• Earthquake struck Izmir
EXPOSURE:
• 2 sites affected
RECOMMENDED ACTIONS:
• Activate backups
OUTLOOK:
• Recovery in 2 weeks"""
        tp = _parse_talking_points(raw)
        assert len(tp.situation) >= 1
        assert "Earthquake" in tp.situation[0]
        assert len(tp.action) >= 1

    def test_parse_empty_string(self):
        tp = _parse_talking_points("")
        # Should not crash, all fields default to empty lists
        assert isinstance(tp.situation, list)
        assert isinstance(tp.exposure, list)


class TestParseSectionsFallback:
    def test_parses_all_sections(self):
        text = """SITUATION:
• First point
• Second point
EXPOSURE:
• Exposure detail
ACTIONS:
• Do something
OUTLOOK:
• Looking good"""
        tp = _parse_sections_fallback(text)
        assert len(tp.situation) == 2
        assert len(tp.exposure) == 1
        assert len(tp.action) == 1
        assert len(tp.outlook) == 1

    def test_handles_dash_bullets(self):
        text = """SITUATION:
- Dash bullet point"""
        tp = _parse_sections_fallback(text)
        assert tp.situation == ["Dash bullet point"]


# ── Talking points to narrative ──────────────────────────────────


class TestTalkingPointsToNarrative:
    def test_flattens_to_sections(self):
        tp = TalkingPoints(
            situation=["Event happened"],
            exposure=["Sites affected"],
            action=["Take action"],
            outlook=["Will recover"],
        )
        narrative = _talking_points_to_narrative(tp)
        assert "SITUATION:" in narrative
        assert "EXPOSURE:" in narrative
        assert "ACTIONS:" in narrative
        assert "OUTLOOK:" in narrative

    def test_empty_points_yields_fallback(self):
        tp = TalkingPoints()
        narrative = _talking_points_to_narrative(tp)
        assert narrative == "No narrative available."


# ── Fallback narrative builder ───────────────────────────────────


class TestBuildFallbackNarrative:
    def test_rich_event_produces_all_sections(self, rich_event):
        narrative, tp = _build_fallback_narrative(rich_event)
        assert len(tp.situation) > 0
        assert len(tp.exposure) > 0
        assert len(tp.action) > 0
        assert len(tp.outlook) > 0
        assert "Earthquake" in tp.situation[0]
        assert "SITUATION:" in narrative

    def test_minimal_event_still_works(self, minimal_event):
        narrative, tp = _build_fallback_narrative(minimal_event)
        assert len(tp.situation) > 0
        assert "Tropical Storm" in tp.situation[0]
        assert isinstance(narrative, str)
        assert len(narrative) > 0

    def test_returns_tuple(self, rich_event):
        result = _build_fallback_narrative(rich_event)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], str)
        assert isinstance(result[1], TalkingPoints)

    def test_fallback_includes_site_names(self, rich_event):
        _, tp = _build_fallback_narrative(rich_event)
        exposure_text = " ".join(tp.exposure)
        assert "Izmir MFG" in exposure_text

    def test_fallback_includes_recovery_timeline(self, rich_event):
        _, tp = _build_fallback_narrative(rich_event)
        outlook_text = " ".join(tp.outlook)
        assert "2w" in outlook_text or "2" in outlook_text

    def test_fallback_includes_units_at_risk(self, rich_event):
        _, tp = _build_fallback_narrative(rich_event)
        exposure_text = " ".join(tp.exposure)
        assert "12,000" in exposure_text or "12000" in exposure_text


# ── API endpoint integration ─────────────────────────────────────


class TestNarrativeEndpoint:
    def test_narrative_404_for_unknown_event(self):
        r = client.post("/api/v1/events/nonexistent-event/narrative")
        assert r.status_code == 404

    def test_narrative_fallback_response_shape(self, seeded_db):
        """Without API key, should get fallback with talking_points."""
        r = client.post("/api/v1/events/test-event|europe/narrative")
        assert r.status_code == 200
        data = r.json()
        # Backward compat: narrative field exists
        assert "narrative" in data
        assert isinstance(data["narrative"], str)
        # New: talking_points structure
        assert "talking_points" in data
        tp = data["talking_points"]
        assert "situation" in tp
        assert "exposure" in tp
        assert "action" in tp
        assert "outlook" in tp
        assert isinstance(tp["situation"], list)
        # New: generated_at timestamp
        assert "generated_at" in data
        assert data["generated_at"] is not None
        # generated_by should be fallback (no API key in tests)
        assert data["generated_by"] == "fallback"

    def test_narrative_backward_compat_fields(self, seeded_db):
        """The response should still have event_id and generated_by for backward compat."""
        r = client.post("/api/v1/events/test-event|europe/narrative")
        data = r.json()
        assert data["event_id"] == "test-event|europe"
        assert "generated_by" in data

    def test_geopolitical_event_narrative(self, seeded_db):
        """Geopolitical events should also produce valid narratives."""
        r = client.post("/api/v1/events/test-geo-risk/narrative")
        assert r.status_code == 200
        data = r.json()
        assert "talking_points" in data
        assert len(data["talking_points"]["situation"]) > 0
