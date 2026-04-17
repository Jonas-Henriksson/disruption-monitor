"""Tests for the executive summary service."""

import pytest
from unittest.mock import patch, AsyncMock


def _make_event(title: str, severity: str, region: str, status: str = "active") -> dict:
    return {
        "id": title.lower().replace(" ", "-")[:30],
        "event": title,
        "severity": severity,
        "region": region,
        "status": status,
        "affected_sites": [{"name": "Gothenburg"}],
        "first_seen": "2026-04-10T00:00:00Z",
        "last_seen": "2026-04-17T00:00:00Z",
        "scan_count": 5,
    }


def test_build_executive_summary_structure():
    from backend.app.services.executive import build_executive_summary

    events = [
        _make_event("Red Sea Closure", "Critical", "Middle East"),
        _make_event("Aluminium Crisis", "High", "Global"),
        _make_event("Port Strike", "Medium", "Europe"),
    ]
    weekly = {
        "severity_snapshot": {"Critical": 1, "High": 1, "Medium": 1, "Low": 0},
        "escalated_events": [events[1]],
        "resolved_events": [],
        "period": {"from": "2026-04-10", "to": "2026-04-17"},
    }
    bu_exposure = [
        {"bu": "Industrial", "active_disruption_count": 2, "total_affected_sites": 3, "max_severity": "Critical"},
    ]

    result = build_executive_summary(events, weekly, bu_exposure)

    assert result["risk_level"] in ("STABLE", "ELEVATED", "HIGH")
    assert result["risk_level"] == "ELEVATED"  # 1 Critical
    assert result["severity_counts"]["Critical"] == 1
    assert len(result["actively_bleeding"]) <= 3
    assert len(result["escalating"]) <= 3
    assert len(result["recently_resolved"]) <= 3
    assert isinstance(result["bu_exposure"], list)
    assert "period" in result


def test_risk_level_stable():
    from backend.app.services.executive import _compute_risk_level

    assert _compute_risk_level({"Critical": 0, "High": 2, "Medium": 5, "Low": 3}) == "STABLE"


def test_risk_level_elevated():
    from backend.app.services.executive import _compute_risk_level

    assert _compute_risk_level({"Critical": 1, "High": 2, "Medium": 0, "Low": 0}) == "ELEVATED"


def test_risk_level_high():
    from backend.app.services.executive import _compute_risk_level

    assert _compute_risk_level({"Critical": 3, "High": 5, "Medium": 1, "Low": 0}) == "HIGH"
