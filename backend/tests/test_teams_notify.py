"""Tests for Teams chat notification service."""
import pytest
from backend.app.services.teams_notify import build_assignment_message


class TestMessageFormatting:
    def test_build_message_with_all_fields(self):
        msg = build_assignment_message(
            event_title="Red Sea Shipping Disruption",
            event_severity="Critical",
            action_title="Contact affected suppliers",
            priority="high",
            due_date="2026-04-20T12:00:00Z",
            assigner_name="Jonas Henriksson",
        )
        assert "Red Sea Shipping Disruption" in msg
        assert "Critical" in msg
        assert "Contact affected suppliers" in msg
        assert "high" in msg
        assert "Jonas Henriksson" in msg

    def test_build_message_without_due_date(self):
        msg = build_assignment_message(
            event_title="Test Event",
            event_severity="Medium",
            action_title="Monitor situation",
            priority="normal",
            due_date=None,
            assigner_name="Test User",
        )
        assert "No due date" in msg

    def test_build_message_with_deep_link(self):
        msg = build_assignment_message(
            event_title="Test Event",
            event_severity="High",
            action_title="Reroute shipment",
            priority="high",
            due_date="2026-04-25T00:00:00Z",
            assigner_name="Test User",
            deep_link="https://sc-hub.example.com/events/test-event",
        )
        assert "Open in SC Hub" in msg
        assert "https://sc-hub.example.com/events/test-event" in msg

    def test_severity_emojis(self):
        for sev, expected in [("Critical", "\U0001f534"), ("High", "\U0001f7e0"), ("Medium", "\U0001f7e1"), ("Low", "\U0001f7e2")]:
            msg = build_assignment_message(
                event_title="Test", event_severity=sev, action_title="Act",
                priority="normal", due_date=None, assigner_name="User",
            )
            assert expected in msg
