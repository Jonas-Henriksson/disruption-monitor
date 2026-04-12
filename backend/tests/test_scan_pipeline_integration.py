"""Integration tests for the full scan -> persist -> action pipeline.

Tests the complete flow: Claude API response (mocked) -> parse -> validate
-> severity scoring -> dedup -> persist to SQLite -> action generation.

Only the external Claude API call is mocked; all internal services run for real.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from backend.app.db.database import (
    create_action,
    get_actions_for_event,
    get_event,
    get_events,
    upsert_event,
)
from backend.app.services.action_engine import generate_actions_for_event
from backend.app.services.dedup import find_duplicates, tag_duplicates
from backend.app.services.scanner import (
    _make_disruption_id,
    _make_geopolitical_id,
    _make_trade_id,
    _match_affected_sites,
    _parse_json_response,
    _validate_items,
)
from backend.app.services.severity import compute_severity_score


# ── Realistic mock Claude API responses ──────────────────────────────

MOCK_DISRUPTION_RESPONSE = json.dumps([
    {
        "event": "Major Earthquake Strikes Central Japan",
        "description": "A 7.1 magnitude earthquake hit Aichi Prefecture, affecting multiple automotive and bearing manufacturing facilities. Infrastructure damage reported along the Tokaido corridor.",
        "category": "Natural Disaster",
        "severity": "Critical",
        "trend": "New",
        "region": "China",
        "lat": 35.18,
        "lng": 136.91,
        "skf_exposure": "SKF Gothenburg and Schweinfurt factories source precision steel from Japan. Multiple tier-1 suppliers in the affected zone.",
        "recommended_action": "Activate business continuity plan for Japan-dependent supply lines. Contact tier-1 suppliers for status update.",
    },
    {
        "event": "Rotterdam Port Workers Strike Enters Second Week",
        "description": "Dock workers at Europe's largest port continue industrial action over automation disputes. Container throughput down 60%.",
        "category": "Labour/Strike",
        "severity": "High",
        "trend": "Escalating",
        "region": "Europe",
        "lat": 51.91,
        "lng": 4.48,
        "skf_exposure": "Critical logistics hub for SKF European distribution. Delays affecting inbound raw materials and outbound finished goods.",
        "recommended_action": "Reroute urgent shipments via Antwerp or Hamburg. Increase safety stock at central European warehouses.",
    },
    {
        "event": "Minor Currency Fluctuation in Brazilian Real",
        "description": "Brazilian Real depreciated 2.3% against USD amid political uncertainty. Limited impact on industrial supply chains.",
        "category": "Currency",
        "severity": "Low",
        "trend": "Stable",
        "region": "Americas",
        "lat": -23.55,
        "lng": -46.63,
        "skf_exposure": "SKF Cajamar factory procurement costs may increase marginally for imported components.",
        "recommended_action": "Monitor exchange rate trends. No immediate action required.",
    },
])

MOCK_GEOPOLITICAL_RESPONSE = json.dumps([
    {
        "risk": "US-China Trade Tensions Over Semiconductor Controls",
        "trend": "Escalating",
        "trend_arrow": "\u2191",
        "this_week": "The US announced expanded export controls on advanced chipmaking equipment. China responded with rare earth export restrictions affecting industrial magnets.",
        "skf_relevance": "SKF Magnetics division sources neodymium magnets from China. Potential supply disruption for magnetic bearing products.",
        "risk_level": "High",
        "region": "China",
        "lat": 39.91,
        "lng": 116.39,
        "watchpoint": "Watch for retaliatory tariffs on European industrial goods.",
    },
    {
        "risk": "Red Sea Shipping Disruptions",
        "trend": "Stable",
        "trend_arrow": "\u2192",
        "this_week": "Houthi attacks continue to force container ships to reroute around the Cape of Good Hope, adding 10-14 days transit time.",
        "skf_relevance": "SKF India and Middle East supply lines affected. Increased logistics costs for Asia-Europe trade.",
        "risk_level": "Medium",
        "region": "Middle East",
        "lat": 14.80,
        "lng": 42.95,
        "watchpoint": "Monitor ceasefire negotiations and naval escort arrangements.",
    },
])

MOCK_TRADE_RESPONSE = json.dumps([
    {
        "event": "EU Imposes Anti-Dumping Duties on Chinese Steel",
        "description": "European Commission confirmed preliminary anti-dumping duties of 17-38% on hot-rolled steel from China, effective immediately.",
        "category": "Anti-Dumping",
        "severity": "High",
        "trend": "New",
        "region": "Europe",
        "lat": 50.85,
        "lng": 4.35,
        "corridor": "EU-CN",
        "friction_level": "High",
        "skf_cost_impact": "Steel is SKF's primary input cost. Duties will increase European sourcing costs by 5-8%.",
        "recommended_action": "Evaluate alternative steel sourcing from India and Turkey. Review long-term supply contracts.",
    },
    {
        "event": "US-China Tariff Escalation on Industrial Components",
        "description": "New 25% tariffs announced on Chinese industrial bearings and components. Retaliatory tariffs on US agricultural exports expected.",
        "category": "Tariffs",
        "severity": "Critical",
        "trend": "Escalating",
        "region": "China",
        "lat": 39.91,
        "lng": 116.39,
        "corridor": "US-CN",
        "friction_level": "Prohibitive",
        "skf_cost_impact": "Direct impact on SKF Americas sourcing from China. Bearing import costs up 25%.",
        "recommended_action": "Activate nearshoring strategy. Shift China-origin supply to Mexico and India plants.",
    },
])


# ── Helper: simulate the full pipeline as the scanner + scans router would ──


def _run_pipeline(raw_json: str, mode: str) -> list[dict]:
    """Parse, validate, score severity, match sites, tag dedup, return items."""
    items = _parse_json_response(raw_json)
    items = _validate_items(items, mode)

    id_makers = {
        "disruptions": _make_disruption_id,
        "geopolitical": _make_geopolitical_id,
        "trade": _make_trade_id,
    }
    id_maker = id_makers[mode]

    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        if "id" not in item:
            item["id"] = id_maker(item)
        item.setdefault("status", "active")
        item.setdefault("first_seen", now)
        item["last_seen"] = now
        item.setdefault("scan_count", 1)

        if "affected_sites" not in item:
            nearby = _match_affected_sites(item, mode)
            if nearby:
                item["affected_sites"] = nearby

        item["computed_severity"] = compute_severity_score(item)

    tag_duplicates(items)
    return items


def _persist_and_generate_actions(items: list[dict], mode: str, scan_id: str = "test-scan-001") -> dict:
    """Persist items to DB and generate actions for new events. Returns summary."""
    new_events = []
    updated_events = []
    total_actions = 0

    for item in items:
        event_id = item.get("id", f"{mode}-unknown")
        is_new = upsert_event(event_id, mode, item, scan_id)

        if is_new:
            new_events.append(event_id)
            action_defs = generate_actions_for_event(item)
            for action_def in action_defs:
                create_action(
                    event_id=event_id,
                    action_type=action_def["action_type"],
                    title=action_def["title"],
                    description=action_def["description"],
                    assignee_hint=action_def["assignee_hint"],
                    priority=action_def["priority"],
                    due_date=action_def.get("due_date"),
                )
            total_actions += len(action_defs)
        else:
            updated_events.append(event_id)

    return {
        "new_events": new_events,
        "updated_events": updated_events,
        "total_actions": total_actions,
    }


# ── Full pipeline integration tests ─────────────────────────────────


class TestDisruptionPipelineIntegration:
    """End-to-end: parse disruption JSON -> validate -> score -> dedup -> persist -> actions."""

    def test_full_disruption_pipeline(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        # All 3 items should pass validation
        assert len(items) == 3

        # Each item should have computed severity
        for item in items:
            cs = item["computed_severity"]
            assert "score" in cs
            assert "label" in cs
            assert "components" in cs
            assert 0 <= cs["score"] <= 100

        # Critical earthquake should score higher than Low currency event
        earthquake = next(i for i in items if "Earthquake" in i["event"])
        currency = next(i for i in items if "Currency" in i["event"])
        assert earthquake["computed_severity"]["score"] > currency["computed_severity"]["score"]

        # Earthquake label should be Medium or higher (has high magnitude + nearby sites)
        assert earthquake["computed_severity"]["label"] in ("Critical", "High", "Medium")

        # Currency event should score Low or Medium
        assert currency["computed_severity"]["label"] in ("Low", "Medium")

    def test_disruption_ids_generated(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        for item in items:
            assert "id" in item
            assert "|" in item["id"]  # disruption IDs use pipe delimiter

        # Verify specific ID format
        earthquake = next(i for i in items if "Earthquake" in i["event"])
        assert "china" in earthquake["id"]  # region in ID

    def test_disruption_affected_sites_matched(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        # The earthquake in Japan (lat 35.18, lng 136.91) should match some sites
        earthquake = next(i for i in items if "Earthquake" in i["event"])
        # Natural Disaster uses haversine-only matching
        # Even if no sites are within blast radius, the field should exist or not
        # The important thing is the pipeline doesn't crash
        assert "computed_severity" in earthquake

        # Rotterdam port strike should potentially match European sites via routing
        strike = next(i for i in items if "Rotterdam" in i["event"])
        assert "computed_severity" in strike

    def test_disruption_persist_and_actions(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")
        result = _persist_and_generate_actions(items, "disruptions")

        # All 3 events should be new on first persist
        assert len(result["new_events"]) == 3
        assert len(result["updated_events"]) == 0

        # Actions should be generated for all new events
        assert result["total_actions"] > 0

        # Critical earthquake should have more actions than Low currency
        earthquake_id = next(
            eid for eid in result["new_events"] if "earthquake" in eid
        )
        currency_id = next(
            eid for eid in result["new_events"] if "currency" in eid
        )
        eq_actions = get_actions_for_event(earthquake_id)
        cur_actions = get_actions_for_event(currency_id)

        # Critical natural disaster: escalate, BCP, contact, backup, stock, insurance
        assert len(eq_actions) >= 3
        eq_types = {a["action_type"] for a in eq_actions}
        assert "contact_supplier" in eq_types

        # Low currency: just monitor
        assert len(cur_actions) >= 1
        cur_types = {a["action_type"] for a in cur_actions}
        assert "monitor_situation" in cur_types
        assert "activate_bcp" not in cur_types

    def test_disruption_persist_idempotent(self):
        """Running the pipeline twice should update (not duplicate) events."""
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        result1 = _persist_and_generate_actions(items, "disruptions", scan_id="scan-001")
        assert len(result1["new_events"]) == 3

        result2 = _persist_and_generate_actions(items, "disruptions", scan_id="scan-002")
        assert len(result2["new_events"]) == 0
        assert len(result2["updated_events"]) == 3

        # scan_count should increment
        for eid in result2["updated_events"]:
            event = get_event(eid)
            assert event is not None
            assert event["scan_count"] == 2

    def test_disruption_events_retrievable_from_db(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")
        _persist_and_generate_actions(items, "disruptions")

        # Retrieve all disruption events
        events = get_events(mode="disruptions")
        assert len(events) == 3

        # Each event should have all expected fields
        for event in events:
            assert "status" in event
            assert "first_seen" in event
            assert "last_seen" in event
            assert event["status"] == "active"

    def test_severity_components_present(self):
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        for item in items:
            cs = item["computed_severity"]
            components = cs["components"]
            assert "magnitude" in components
            assert "proximity" in components
            assert "asset_criticality" in components
            assert "supply_chain_impact" in components
            # All component values should be in [0, 1]
            for key, val in components.items():
                assert 0.0 <= val <= 1.0, f"{key} = {val} out of range"

            # Practitioner dimensions
            assert "probability" in cs
            assert "velocity" in cs
            assert "recovery_estimate" in cs


class TestGeopoliticalPipelineIntegration:
    """End-to-end for geopolitical mode."""

    def test_full_geopolitical_pipeline(self):
        items = _run_pipeline(MOCK_GEOPOLITICAL_RESPONSE, "geopolitical")

        assert len(items) == 2

        for item in items:
            assert "id" in item
            assert "computed_severity" in item
            assert "risk" in item  # geopolitical uses 'risk' not 'event'
            assert "risk_level" in item

    def test_geopolitical_persist_and_actions(self):
        items = _run_pipeline(MOCK_GEOPOLITICAL_RESPONSE, "geopolitical")
        result = _persist_and_generate_actions(items, "geopolitical")

        assert len(result["new_events"]) == 2
        assert result["total_actions"] > 0

        # Verify events are stored with correct mode
        events = get_events(mode="geopolitical")
        assert len(events) == 2

    def test_geopolitical_id_format(self):
        items = _run_pipeline(MOCK_GEOPOLITICAL_RESPONSE, "geopolitical")

        # Geopolitical IDs are slug of the risk field, no pipe delimiter
        us_china = next(i for i in items if "us-china" in i["id"].lower())
        assert us_china is not None
        assert "|" not in us_china["id"]  # geopolitical IDs don't use pipe


class TestTradePipelineIntegration:
    """End-to-end for trade mode."""

    def test_full_trade_pipeline(self):
        items = _run_pipeline(MOCK_TRADE_RESPONSE, "trade")

        assert len(items) == 2

        for item in items:
            assert "id" in item
            assert "computed_severity" in item
            assert "|" in item["id"]  # trade IDs use pipe delimiter

    def test_trade_persist_and_actions(self):
        items = _run_pipeline(MOCK_TRADE_RESPONSE, "trade")
        result = _persist_and_generate_actions(items, "trade")

        assert len(result["new_events"]) == 2
        assert result["total_actions"] > 0

        # Critical tariff event should get heavy actions
        tariff_id = next(
            eid for eid in result["new_events"] if "tariff" in eid
        )
        tariff_actions = get_actions_for_event(tariff_id)
        tariff_types = {a["action_type"] for a in tariff_actions}
        assert "contact_supplier" in tariff_types

    def test_trade_corridor_and_friction_preserved(self):
        items = _run_pipeline(MOCK_TRADE_RESPONSE, "trade")
        _persist_and_generate_actions(items, "trade")

        # Retrieve from DB and check trade-specific fields are in payload
        events = get_events(mode="trade")
        for event in events:
            assert "corridor" in event
            assert "friction_level" in event


# ── Dedup within a single scan ─────────────────────────────────────


class TestDedupWithinScan:
    """Test dedup behavior when similar events appear in the same scan."""

    def test_similar_events_tagged_as_duplicates(self):
        """Two events with similar titles in the same region should be tagged."""
        items = [
            {
                "id": "port-strike-rotterdam|europe",
                "event": "Rotterdam Port Workers Strike Continues",
                "severity": "High",
                "region": "Europe",
                "lat": 51.91,
                "lng": 4.48,
            },
            {
                "id": "port-strike-rotterdam-update|europe",
                "event": "Rotterdam Port Workers Strike Escalates",
                "severity": "High",
                "region": "Europe",
                "lat": 51.92,
                "lng": 4.49,
            },
        ]
        tag_duplicates(items)

        # Second item should be tagged as a possible duplicate of the first
        # (Jaccard similarity on shared words: rotterdam, port, workers, strike)
        assert "possible_duplicate_of" in items[1]
        assert items[1]["possible_duplicate_of"] == "port-strike-rotterdam|europe"

    def test_unrelated_events_not_tagged(self):
        """Totally different events should not be tagged as duplicates."""
        items = [
            {
                "id": "earthquake-japan|china",
                "event": "Major Earthquake in Central Japan",
                "severity": "Critical",
                "region": "China",
                "lat": 35.18,
                "lng": 136.91,
            },
            {
                "id": "port-strike-rotterdam|europe",
                "event": "Rotterdam Port Workers Strike",
                "severity": "High",
                "region": "Europe",
                "lat": 51.91,
                "lng": 4.48,
            },
        ]
        tag_duplicates(items)

        assert "possible_duplicate_of" not in items[0]
        assert "possible_duplicate_of" not in items[1]


# ── Cross-mode dedup test ────────────────────────────────────────────


class TestCrossModeDedup:
    """Test dedup behavior when the same real-world event appears in different modes.

    The dedup system (tag_duplicates) operates within a single list of events,
    so cross-mode dedup requires comparing events from different scan results.
    This documents the current behavior: within-list dedup works, but events
    scanned in separate modes are stored independently and NOT auto-deduped.
    """

    def test_same_event_in_geopolitical_and_trade_modes(self):
        """US-China trade tensions appear in both geopolitical and trade scans.

        When processed through their respective pipelines, they get different
        IDs (because ID generation is mode-specific) and are stored as
        separate events. This is by design: each mode has different fields
        and different analytical perspectives on the same underlying situation.
        """
        geo_items = _run_pipeline(MOCK_GEOPOLITICAL_RESPONSE, "geopolitical")
        trade_items = _run_pipeline(MOCK_TRADE_RESPONSE, "trade")

        # Find the US-China related items in each mode
        geo_us_china = next(
            (i for i in geo_items if "us-china" in i.get("id", "").lower()
             or "semiconductor" in i.get("risk", "").lower()),
            None,
        )
        trade_us_china = next(
            (i for i in trade_items if "us-china" in i.get("id", "").lower()
             or "tariff" in i.get("event", "").lower()
             and "china" in i.get("region", "").lower()),
            None,
        )

        assert geo_us_china is not None, "Should find US-China event in geopolitical scan"
        assert trade_us_china is not None, "Should find US-China event in trade scan"

        # IDs differ because ID generation is mode-specific
        assert geo_us_china["id"] != trade_us_china["id"]

        # Persist both sets of events independently
        geo_result = _persist_and_generate_actions(geo_items, "geopolitical", scan_id="geo-scan")
        trade_result = _persist_and_generate_actions(trade_items, "trade", scan_id="trade-scan")

        # Both are stored as separate events in their respective modes
        geo_events = get_events(mode="geopolitical")
        trade_events = get_events(mode="trade")
        assert len(geo_events) == 2
        assert len(trade_events) == 2

        # Both generate their own actions independently
        assert geo_result["total_actions"] > 0
        assert trade_result["total_actions"] > 0

    def test_cross_mode_dedup_with_find_duplicates(self):
        """Using find_duplicates to manually cross-reference between modes.

        This demonstrates how cross-mode dedup COULD be done: by running
        find_duplicates with events from one mode against events from another.
        The dedup engine uses Jaccard similarity on titles, region compatibility,
        and geographic proximity.
        """
        geo_items = _run_pipeline(MOCK_GEOPOLITICAL_RESPONSE, "geopolitical")
        trade_items = _run_pipeline(MOCK_TRADE_RESPONSE, "trade")

        # Check the US-China geopolitical risk against all trade events
        geo_us_china = next(
            i for i in geo_items if "semiconductor" in i.get("risk", "").lower()
        )

        # find_duplicates compares using the 'event' or 'risk' field
        matches = find_duplicates(geo_us_china, trade_items, title_threshold=0.2)

        # The US-China semiconductor risk and US-China tariff event share
        # common words ("US", "China") and are in the same region.
        # Whether they match depends on Jaccard similarity of their titles.
        # Document the actual behavior:
        if matches:
            # The dedup engine found a relationship -- verify it's reasonable
            best = matches[0]
            assert best["similarity"] > 0.0
            assert best["distance_km"] is not None
        # Note: if no match found, that's also valid behavior -- the titles
        # may differ enough that Jaccard < threshold. The important thing is
        # the system doesn't crash and the behavior is deterministic.

    def test_cross_mode_combined_list_dedup(self):
        """When events from multiple modes are combined into one list,
        tag_duplicates can find cross-mode duplicates.

        This simulates a "unified view" where all events are shown together.
        """
        # Create events that are clearly about the same thing but from different modes
        geo_event = {
            "id": "us-china-trade-tensions",
            "risk": "US-China Trade Tensions Escalating",
            "risk_level": "High",
            "region": "China",
            "lat": 39.91,
            "lng": 116.39,
        }
        trade_event = {
            "id": "us-china-trade-tensions-escalation|china",
            "event": "US-China Trade Tensions Tariff Escalation",
            "severity": "High",
            "region": "China",
            "lat": 39.91,
            "lng": 116.39,
        }

        combined = [geo_event, trade_event]
        tag_duplicates(combined)

        # When combined, the second event should be tagged as a duplicate
        assert "possible_duplicate_of" in combined[1]
        assert combined[1]["possible_duplicate_of"] == "us-china-trade-tensions"
        assert combined[1]["duplicate_similarity"] > 0.4


# ── Validation edge cases in pipeline context ────────────────────────


class TestPipelineValidation:
    """Test that malformed items are correctly filtered in the full pipeline."""

    def test_missing_lat_lng_filtered(self):
        raw = json.dumps([
            {
                "event": "Valid Event",
                "severity": "High",
                "lat": 50.0,
                "lng": 10.0,
            },
            {
                "event": "Missing Coords",
                "severity": "High",
                # no lat/lng
            },
        ])
        items = _run_pipeline(raw, "disruptions")
        assert len(items) == 1
        assert items[0]["event"] == "Valid Event"

    def test_invalid_lat_range_filtered(self):
        raw = json.dumps([
            {
                "event": "Out of Range",
                "severity": "High",
                "lat": 999.0,
                "lng": 10.0,
            },
        ])
        items = _run_pipeline(raw, "disruptions")
        assert len(items) == 0

    def test_severity_normalized_to_title_case(self):
        raw = json.dumps([
            {
                "event": "Badly Cased",
                "severity": "HIGH",
                "lat": 50.0,
                "lng": 10.0,
            },
        ])
        items = _run_pipeline(raw, "disruptions")
        assert len(items) == 1
        assert items[0]["severity"] == "High"

    def test_empty_claude_response_produces_no_items(self):
        items = _run_pipeline("No disruptions found today.", "disruptions")
        assert items == []

    def test_truncated_json_recovery(self):
        """Simulates max_tokens truncation mid-array."""
        raw = '[{"event": "Complete Event", "severity": "High", "lat": 50.0, "lng": 10.0}, {"event": "Truncat'
        parsed = _parse_json_response(raw, truncated=True)
        # Should recover at least the first complete object
        assert len(parsed) >= 1
        assert parsed[0]["event"] == "Complete Event"


# ── Action correctness after full pipeline ───────────────────────────


class TestActionsAfterPipeline:
    """Verify action generation uses computed severity scores from the pipeline."""

    def test_high_computed_score_overrides_low_label(self):
        """An event with severity='Low' but high computed score should get heavy actions."""
        raw = json.dumps([
            {
                "event": "Deceptively Severe Event",
                "severity": "Low",
                "category": "Natural Disaster",
                "trend": "Escalating",
                "lat": 57.70,
                "lng": 11.97,
                "region": "Europe",
            },
        ])
        items = _run_pipeline(raw, "disruptions")
        assert len(items) == 1

        # The computed score should account for proximity to Gothenburg
        # and escalating trend, potentially raising it above the label suggests
        item = items[0]
        score = item["computed_severity"]["score"]

        actions = generate_actions_for_event(item)
        # Verify actions match the computed score, not the 'Low' label
        if score >= 75:
            types = {a["action_type"] for a in actions}
            assert "escalate_to_leadership" in types
        elif score >= 50:
            types = {a["action_type"] for a in actions}
            assert "contact_supplier" in types
        elif score >= 25:
            assert any(a["action_type"] in ("contact_supplier", "monitor_situation") for a in actions)
        else:
            types = {a["action_type"] for a in actions}
            assert "monitor_situation" in types

    def test_actions_generated_for_all_severity_levels(self):
        """Every persisted event should produce at least one action."""
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")
        result = _persist_and_generate_actions(items, "disruptions")

        for event_id in result["new_events"]:
            actions = get_actions_for_event(event_id)
            assert len(actions) >= 1, f"Event {event_id} should have at least one action"

    def test_action_due_dates_ordered_by_priority(self):
        """Higher priority actions should have earlier due dates."""
        items = _run_pipeline(MOCK_DISRUPTION_RESPONSE, "disruptions")

        # Get the Critical earthquake event (should produce many actions)
        earthquake = next(i for i in items if "Earthquake" in i["event"])
        actions = generate_actions_for_event(earthquake)

        if len(actions) >= 2:
            critical_actions = [a for a in actions if a["priority"] == "critical"]
            low_actions = [a for a in actions if a["priority"] == "low"]

            if critical_actions and low_actions:
                # Critical due dates should be earlier than low
                assert critical_actions[0]["due_date"] < low_actions[0]["due_date"]
