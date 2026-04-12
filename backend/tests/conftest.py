"""Shared fixtures for backend tests.

Uses a temporary SQLite database for every test to ensure isolation.
"""

import os
import tempfile

import pytest

# Point DB_PATH to a temp file BEFORE importing any app code
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["TARS_DB_PATH"] = _tmp_db.name


@pytest.fixture(autouse=True)
def _clean_db(tmp_path):
    """Give each test a fresh database by overriding DB_PATH."""
    from backend.app.db import database

    db_file = tmp_path / "test.db"
    database.DB_PATH = db_file
    database._init_db()
    yield
    # Cleanup happens automatically when tmp_path is removed


@pytest.fixture
def sample_payload():
    """A minimal disruption payload matching the expected schema."""
    return {
        "id": "test-event|europe",
        "event": "Test Factory Fire",
        "description": "A test disruption event for unit testing.",
        "category": "Other",
        "severity": "High",
        "trend": "Stable",
        "region": "Europe",
        "lat": 50.0,
        "lng": 10.0,
        "skf_exposure": "Test exposure description.",
        "recommended_action": "Take test action.",
        "status": "active",
        "first_seen": "2026-03-28T00:00:00Z",
        "last_seen": "2026-03-28T12:00:00Z",
        "scan_count": 1,
    }


@pytest.fixture
def sample_geopolitical_payload():
    """A minimal geopolitical payload."""
    return {
        "id": "test-geo-risk",
        "risk": "Test Geopolitical Risk",
        "trend": "Escalating",
        "trend_arrow": "\u2191",
        "this_week": "Test developments this week.",
        "skf_relevance": "Test relevance.",
        "risk_level": "High",
        "region": "Europe",
        "lat": 48.0,
        "lng": 16.0,
        "watchpoint": "Watch for test events.",
        "status": "active",
    }


@pytest.fixture
def seeded_db(sample_payload, sample_geopolitical_payload):
    """Seed the test DB with a couple of events and return their IDs."""
    from backend.app.db.database import upsert_event

    upsert_event("test-event|europe", "disruptions", sample_payload, "seed-test")
    upsert_event("test-geo-risk", "geopolitical", sample_geopolitical_payload, "seed-test")
    return ["test-event|europe", "test-geo-risk"]
