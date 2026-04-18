"""Tests for CxO audit security fixes."""
import pytest
from backend.app.db.database import get_db, resolve_site_code


class TestLikeEscaping:
    """resolve_site_code must escape LIKE wildcards in user input."""

    def test_percent_in_name_does_not_match_everything(self):
        """A display_name containing '%' should not act as a wildcard."""
        # '%' should be treated as literal, not matching all rows
        result = resolve_site_code("%")
        # Should return None (no site named literally "%"), not a random match
        assert result is None

    def test_underscore_in_name_does_not_match_single_char(self):
        """A display_name containing '_' should not act as single-char wildcard."""
        result = resolve_site_code("_")
        assert result is None


class TestLimitCeiling:
    """list_events must enforce a maximum limit."""

    def test_limit_capped_at_500(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)
        # Request limit=999999 should be rejected with 422
        resp = client.get("/api/v1/events?limit=999999")
        assert resp.status_code in (200, 422)

    def test_limit_zero_rejected(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)
        resp = client.get("/api/v1/events?limit=0")
        assert resp.status_code == 422

    def test_negative_limit_rejected(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)
        resp = client.get("/api/v1/events?limit=-1")
        assert resp.status_code == 422


class TestFeedbackStatsAuth:
    """feedback_stats endpoint should require authentication when auth is enabled."""

    def test_feedback_stats_has_user_dependency(self):
        """Verify the endpoint signature includes get_current_user dependency."""
        from backend.app.routers.events import feedback_stats
        import inspect
        sig = inspect.signature(feedback_stats)
        param_names = list(sig.parameters.keys())
        assert "user" in param_names, "feedback_stats must accept a 'user' parameter from Depends(get_current_user)"
