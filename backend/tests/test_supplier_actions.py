"""Tests for supplier-specific action generation.

Covers: sole-source detection, non-sole-source alternatives,
region matching, SUPPLY_GRAPH cross-referencing, and integration
with the main generate_actions_for_event function.
"""

import pytest

from backend.app.services.action_engine import (
    _generate_supplier_specific_actions,
    generate_actions_for_event,
)
from backend.app.data import SUPPLY_GRAPH


# ── Supplier-specific action generation ──────────────────────────


class TestGenerateSupplierSpecificActions:
    def test_sole_source_generates_critical_action(self):
        """A sole-source input in the disrupted region should produce a critical action."""
        # Hofors has sole-source Steel billets from Sweden
        event = {
            "id": "disruption|sweden",
            "region": "Sweden",
            "affected_sites": [
                {"name": "Hofors", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        assert len(actions) > 0

        sole_source_actions = [a for a in actions if a.get("sole_source")]
        assert len(sole_source_actions) >= 1

        action = sole_source_actions[0]
        assert action["priority"] == "critical"
        assert "Hofors" in action["title"]
        assert "Steel billets" in action["title"]
        assert action["assignee_hint"] == "Procurement"

    def test_non_sole_source_generates_high_action(self):
        """A non-sole-source tier 1 input should produce a high-priority action."""
        # Schweinfurt has tier 1 Steel rings (not sole source) from Germany
        event = {
            "id": "disruption|germany",
            "region": "Germany",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 10},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        assert len(actions) > 0

        non_sole = [a for a in actions if not a.get("sole_source")]
        assert len(non_sole) >= 1

        action = non_sole[0]
        assert action["priority"] == "high"
        assert "Schweinfurt" in action["title"]
        assert "alternative" in action["title"].lower() or "review" in action["title"].lower()

    def test_no_affected_sites_returns_empty(self):
        event = {"id": "test", "region": "Sweden", "affected_sites": []}
        actions = _generate_supplier_specific_actions(event)
        assert actions == []

    def test_no_region_returns_empty(self):
        event = {
            "id": "test",
            "region": "",
            "affected_sites": [{"name": "Hofors", "type": "mfg", "distance_km": 50}],
        }
        actions = _generate_supplier_specific_actions(event)
        assert actions == []

    def test_unmatched_region_returns_empty(self):
        """If the region doesn't match any supplier country, no actions generated."""
        event = {
            "id": "test",
            "region": "Antarctica",
            "affected_sites": [{"name": "Hofors", "type": "mfg", "distance_km": 50}],
        }
        actions = _generate_supplier_specific_actions(event)
        assert actions == []

    def test_site_not_in_supply_graph_skipped(self):
        """Sites not in SUPPLY_GRAPH should be silently skipped."""
        event = {
            "id": "test",
            "region": "Sweden",
            "affected_sites": [
                {"name": "NonexistentFactory", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        assert actions == []

    def test_multiple_sites_multiple_actions(self):
        """Multiple affected sites in the same region should each get actions."""
        event = {
            "id": "disruption|germany",
            "region": "Germany",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 10},
                {"name": "Hamburg", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        site_names = {a.get("site_name") for a in actions}
        assert "Schweinfurt" in site_names
        assert "Hamburg" in site_names

    def test_aerospace_sole_source_detected(self):
        """Aerospace sites with sole-source specialty alloys should be flagged."""
        # Falconer, NY has sole-source Specialty alloys from US
        event = {
            "id": "disruption|us",
            "region": "United States",
            "affected_sites": [
                {"name": "Falconer, NY", "type": "mfg", "distance_km": 100},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        sole = [a for a in actions if a.get("sole_source")]
        assert len(sole) >= 1
        assert "Specialty alloys" in sole[0]["title"]

    def test_description_contains_context(self):
        """Descriptions should contain relevant context about the input and sourcing."""
        event = {
            "id": "disruption|sweden",
            "region": "Sweden",
            "affected_sites": [
                {"name": "Hofors", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        for action in actions:
            desc = action["description"]
            assert "Hofors" in desc or "Sweden" in desc
            assert len(desc) > 20

    def test_all_actions_have_required_fields(self):
        """Every generated action should have all required fields."""
        event = {
            "id": "disruption|germany",
            "region": "Germany",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 10},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        for action in actions:
            assert "event_id" in action
            assert "action_type" in action
            assert "title" in action
            assert "description" in action
            assert "assignee_hint" in action
            assert "priority" in action
            assert "due_date" in action

    def test_deduplication_same_input_same_site(self):
        """If the same input/site combo matches multiple countries, deduplicate."""
        event = {
            "id": "disruption|europe",
            "region": "Germany",
            "affected_sites": [
                {"name": "Schweinfurt", "type": "mfg", "distance_km": 10},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        # Each input should appear at most once per site
        keys = [f"{a.get('input_name')}|{a.get('site_name')}" for a in actions]
        assert len(keys) == len(set(keys))

    def test_owner_hint_is_procurement(self):
        """Supplier-specific actions should have owner_hint set to Procurement."""
        event = {
            "id": "disruption|sweden",
            "region": "Sweden",
            "affected_sites": [
                {"name": "Hofors", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = _generate_supplier_specific_actions(event)
        for action in actions:
            assert action["owner_hint"] == "Procurement"


# ── Integration with generate_actions_for_event ───────────────────


class TestSupplierActionsIntegration:
    def test_supplier_actions_appended_to_generic(self):
        """Supplier-specific actions should appear alongside generic ones."""
        event = {
            "id": "disruption|sweden",
            "event": "Major Fire in Swedish Steel Mill",
            "description": "Fire at steel production facility.",
            "category": "Natural Disaster",
            "severity": "Critical",
            "trend": "Escalating",
            "region": "Sweden",
            "lat": 60.6, "lng": 15.8,
            "skf_exposure": "Hofors sole-source steel at risk.",
            "recommended_action": "Activate backup.",
            "computed_severity": {"score": 85.0},
            "affected_sites": [
                {"name": "Hofors", "type": "mfg", "distance_km": 50},
            ],
        }
        actions = generate_actions_for_event(event)
        types = [a["action_type"] for a in actions]

        # Should have generic actions (BCP, escalate, etc.)
        assert "activate_bcp" in types
        assert "escalate_to_leadership" in types

        # Should also have supplier-specific activate_backup_supplier actions
        backup_actions = [a for a in actions if a["action_type"] == "activate_backup_supplier"]
        assert len(backup_actions) >= 2  # at least generic + supplier-specific

        # The supplier-specific one should mention Hofors
        supplier_specific = [a for a in backup_actions if "Hofors" in a.get("title", "")]
        assert len(supplier_specific) >= 1

    def test_low_severity_no_supplier_actions(self):
        """Low severity events with no affected sites in supply graph get no supplier actions."""
        event = {
            "id": "minor|antarctica",
            "event": "Minor weather event",
            "category": "Other",
            "severity": "Low",
            "trend": "Stable",
            "region": "Antarctica",
            "lat": -80.0, "lng": 0.0,
            "affected_sites": [],
        }
        actions = generate_actions_for_event(event)
        # Should only have generic monitor action, no supplier-specific
        supplier_specific = [a for a in actions if a.get("site_name")]
        assert len(supplier_specific) == 0

    def test_medium_severity_with_graph_match_gets_actions(self):
        """Medium severity events with graph matches should still get supplier actions."""
        event = {
            "id": "tension|italy",
            "event": "Supply chain disruption in Italy",
            "category": "Logistics/Port",
            "severity": "Medium",
            "trend": "Stable",
            "region": "Italy",
            "lat": 44.0, "lng": 11.0,
            "computed_severity": {"score": 35.0},
            "affected_sites": [
                {"name": "Massa", "type": "mfg", "distance_km": 100},
            ],
        }
        actions = generate_actions_for_event(event)
        # Massa has sole-source Steel from Italy -- should get supplier-specific action
        supplier_specific = [a for a in actions if "Massa" in a.get("title", "")]
        assert len(supplier_specific) >= 1
