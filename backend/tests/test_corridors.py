"""Tests for the corridor summary service."""

from backend.app.services.corridors import build_corridor_summary


def _make_trade_event(
    title: str,
    corridor: str,
    friction: str,
    severity: str = "High",
    trend: str = "Stable",
    region: str = "Global",
) -> dict:
    return {
        "id": title.lower().replace(" ", "-")[:30],
        "event": title,
        "corridor": corridor,
        "friction_level": friction,
        "severity": severity,
        "trend": trend,
        "region": region,
        "description": f"Description of {title}.",
        "status": "active",
    }


def test_build_corridor_summary_groups_by_corridor():
    events = [
        _make_trade_event("Tariff Hike", "US-CN", "High", "Critical", "Escalating"),
        _make_trade_event("Export Controls", "US-CN", "Moderate", "High", "Escalating"),
        _make_trade_event("Steel Safeguard", "EU-CN", "Moderate", "High", "Stable"),
    ]
    result = build_corridor_summary(events)
    corridors = {c["corridor"]: c for c in result["corridors"]}

    assert len(corridors) == 2
    assert "US-CN" in corridors
    assert "EU-CN" in corridors


def test_worst_friction_wins():
    events = [
        _make_trade_event("Event A", "US-CN", "Moderate", "Medium"),
        _make_trade_event("Event B", "US-CN", "High", "Critical"),
    ]
    result = build_corridor_summary(events)
    us_cn = result["corridors"][0]

    assert us_cn["corridor"] == "US-CN"
    assert us_cn["friction_level"] == "High"
    assert us_cn["max_severity"] == "Critical"


def test_trend_escalating_wins():
    events = [
        _make_trade_event("Stable Event", "EU-US", "Low", "Medium", "Stable"),
        _make_trade_event("Escalating Event", "EU-US", "Low", "High", "Escalating"),
    ]
    result = build_corridor_summary(events)

    assert result["corridors"][0]["trend"] == "Escalating"


def test_sorted_by_friction_severity():
    events = [
        _make_trade_event("Low Risk", "EU-IN", "Low", "Low", "Stable"),
        _make_trade_event("High Risk", "US-CN", "High", "Critical", "Escalating"),
        _make_trade_event("Med Risk", "EU-US", "Moderate", "High", "Stable"),
    ]
    result = build_corridor_summary(events)
    codes = [c["corridor"] for c in result["corridors"]]

    assert codes[0] == "US-CN"  # worst first
    assert codes[-1] == "EU-IN"  # lowest last


def test_empty_events():
    result = build_corridor_summary([])
    assert result["corridors"] == []
    assert "generated_at" in result


def test_corridor_has_expected_fields():
    events = [
        _make_trade_event("Tariff Hike", "US-CN", "High", "Critical", "Escalating"),
    ]
    result = build_corridor_summary(events)
    c = result["corridors"][0]

    assert "corridor" in c
    assert "label" in c
    assert "friction_level" in c
    assert "trend" in c
    assert "event_count" in c
    assert "top_event" in c
    assert "top_event_id" in c
    assert "max_severity" in c
    assert "trajectory_text" in c
    assert "skf_sites_affected" in c
    assert "skf_suppliers_affected" in c
    assert "last_updated" in c
