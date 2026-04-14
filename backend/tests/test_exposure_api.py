"""Tests for BU exposure summary and What-If simulation endpoints."""

from backend.app.db.database import get_bu_exposure_summary


def test_bu_exposure_summary_returns_all_bus(seeded_db):
    """BU exposure should return entries for each business unit with active events."""
    result = get_bu_exposure_summary()
    assert isinstance(result, list)
    for entry in result:
        assert "bu" in entry
        assert "exposed_spend_pct" in entry
        assert "factory_count" in entry
        assert "sole_source_count" in entry
        assert "top_threats" in entry


def test_bu_exposure_summary_no_raw_spend(seeded_db):
    """BU exposure must NEVER return raw spend — only percentages."""
    result = get_bu_exposure_summary()
    for entry in result:
        for key in entry:
            assert "sek" not in key.lower(), f"Raw spend field found: {key}"
            assert "spend_sek" not in key.lower(), f"Raw spend field: {key}"


def test_bu_exposure_summary_empty_when_no_events():
    """With no active events, BU exposure should return empty or zero-exposure."""
    result = get_bu_exposure_summary()
    total_exposure = sum(e.get("exposed_spend_pct", 0) for e in result)
    assert total_exposure == 0


def test_bu_exposure_sole_source_flagged(seeded_db):
    """Sole-source inputs should be counted per BU."""
    result = get_bu_exposure_summary()
    for entry in result:
        assert isinstance(entry["sole_source_count"], int)
        assert entry["sole_source_count"] >= 0


# ── What-If Simulation Tests ─────────────────────────────────────

from backend.app.db.database import simulate_what_if


def test_what_if_port_closure():
    """Simulating a port closure should return affected factories and BU impact."""
    result = simulate_what_if(
        scenario_type="region_disruption",
        target="Germany",
        duration_weeks=2,
    )
    assert "affected_factories" in result
    assert "bu_impact" in result
    assert "sole_source_risks" in result
    assert "total_factories_affected" in result
    assert result["total_factories_affected"] > 0


def test_what_if_no_raw_spend():
    """What-If results must not expose raw spend figures."""
    result = simulate_what_if(
        scenario_type="region_disruption",
        target="Japan",
        duration_weeks=4,
    )
    import json
    result_str = json.dumps(result).lower()
    assert "spend_sek" not in result_str


def test_what_if_chokepoint():
    """Simulating a chokepoint closure should identify factories on affected routes."""
    result = simulate_what_if(
        scenario_type="chokepoint_closure",
        target="Suez Canal",
        duration_weeks=1,
    )
    assert "affected_factories" in result
    assert isinstance(result["affected_factories"], list)


def test_what_if_unknown_target_returns_empty():
    """An unrecognized target should return zero impact, not error."""
    result = simulate_what_if(
        scenario_type="region_disruption",
        target="Atlantis",
        duration_weeks=1,
    )
    assert result["total_factories_affected"] == 0
