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
