"""Tests for scheduled daily digest."""


def test_digest_config_has_schedule_hour():
    """Config should expose digest_schedule_hour with a sane default."""
    from backend.app.config import settings
    hour = getattr(settings, "digest_schedule_hour", None)
    assert hour is not None
    assert 0 <= hour <= 23


def test_digest_builder_produces_valid_payload():
    """build_daily_digest should return a well-shaped digest dict even with empty DB."""
    from backend.app.services.digest import build_daily_digest
    result = build_daily_digest()
    assert "headline" in result
    assert "severity_counts" in result
    assert "generated_at" in result


def test_scheduler_has_digest_task():
    """Scheduler should expose a start_digest_schedule function."""
    from backend.app.services.scheduler import start_digest_schedule
    assert callable(start_digest_schedule)
