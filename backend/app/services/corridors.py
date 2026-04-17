"""Corridor risk summary — aggregates trade events by trade corridor."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from ..data import SUPPLY_GRAPH, REVERSE_GRAPH

logger = logging.getLogger(__name__)

# ── Corridor metadata ─────────────────────────────────────────
CORRIDOR_MAP: dict[str, dict[str, Any]] = {
    "EU-CN": {"label": "Europe — China", "countries_from": {"Germany", "Sweden", "Italy", "France", "Austria", "Finland", "Poland", "Czech Republic", "United Kingdom", "Spain", "Netherlands", "Belgium"}, "countries_to": {"China"}},
    "US-CN": {"label": "United States — China", "countries_from": {"United States", "Canada"}, "countries_to": {"China"}},
    "EU-US": {"label": "Europe — United States", "countries_from": {"Germany", "Sweden", "Italy", "France", "Austria", "Finland", "United Kingdom"}, "countries_to": {"United States", "Canada"}},
    "JP-CN": {"label": "Japan — China", "countries_from": {"Japan", "South Korea"}, "countries_to": {"China"}},
    "EU-IN": {"label": "Europe — India", "countries_from": {"Germany", "Sweden", "Italy", "France", "Austria"}, "countries_to": {"India"}},
    "US-MX": {"label": "United States — Mexico", "countries_from": {"United States"}, "countries_to": {"Mexico"}},
    "EU-RU": {"label": "Europe — Russia", "countries_from": {"Germany", "Sweden", "Finland", "Poland"}, "countries_to": {"Russia"}},
    "GLOBAL": {"label": "Global", "countries_from": set(), "countries_to": set()},
}

# ── Ranking helpers ────────────────────────────────────────────
_FRICTION_RANK = {"Prohibitive": 5, "High": 4, "Moderate": 3, "Low": 2, "Free": 1}
_SEV_RANK = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
_TREND_RANK = {"Escalating": 3, "New": 2, "Stable": 1, "De-escalating": 0}


def _count_affected(corridor_code: str) -> tuple[int, int]:
    """Count SKF sites and suppliers affected by a corridor."""
    meta = CORRIDOR_MAP.get(corridor_code, {})
    target_countries = meta.get("countries_to", set())

    if not target_countries:
        return len(SUPPLY_GRAPH), sum(len(v) for v in REVERSE_GRAPH.values())

    sites = 0
    for factory, graph in SUPPLY_GRAPH.items():
        supplier_countries = set(graph.get("sup", []))
        if supplier_countries & target_countries:
            sites += 1

    suppliers = 0
    for country in target_countries:
        suppliers += len(REVERSE_GRAPH.get(country, []))

    return sites, suppliers


def build_corridor_summary(trade_events: list[dict]) -> dict[str, Any]:
    """Aggregate active trade events into corridor-level summaries."""
    groups: dict[str, list[dict]] = {}
    for evt in trade_events:
        corridor = evt.get("corridor", "GLOBAL")
        if corridor not in groups:
            groups[corridor] = []
        groups[corridor].append(evt)

    corridors = []
    for code, events in groups.items():
        friction = max(events, key=lambda e: _FRICTION_RANK.get(e.get("friction_level", "Free"), 0))
        best_friction = friction.get("friction_level", "Free")

        top_evt = max(events, key=lambda e: _SEV_RANK.get(e.get("severity", "Low"), 0))
        max_sev = top_evt.get("severity", "Low")

        trend_scores = [_TREND_RANK.get(e.get("trend", "Stable"), 1) for e in events]
        best_trend_score = max(trend_scores)
        trend_labels = {v: k for k, v in _TREND_RANK.items()}
        trend = trend_labels.get(best_trend_score, "Stable")

        meta = CORRIDOR_MAP.get(code, {})
        label = meta.get("label", code)

        sites_affected, suppliers_affected = _count_affected(code)

        trajectory = top_evt.get("description", "")
        if len(trajectory) > 200:
            trajectory = trajectory[:197] + "..."

        corridors.append({
            "corridor": code,
            "label": label,
            "friction_level": best_friction,
            "trend": trend,
            "event_count": len(events),
            "top_event": top_evt.get("event", ""),
            "top_event_id": top_evt.get("id", ""),
            "max_severity": max_sev,
            "skf_sites_affected": sites_affected,
            "skf_suppliers_affected": suppliers_affected,
            "trajectory_text": trajectory,
            "last_updated": max(
                (e.get("last_seen", "") for e in events),
                default="",
            ),
        })

    corridors.sort(
        key=lambda c: (
            -_FRICTION_RANK.get(c["friction_level"], 0),
            -_SEV_RANK.get(c["max_severity"], 0),
        )
    )

    return {
        "corridors": corridors,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
