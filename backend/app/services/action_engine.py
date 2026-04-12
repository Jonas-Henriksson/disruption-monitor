"""Action generation engine -- produces structured, trackable actions from disruption events.

Given an event's severity, category, and affected sites, this engine generates
specific actions that procurement, logistics, and leadership teams can execute.

Action types:
    activate_backup_supplier  -- Switch to alternate sourcing
    increase_safety_stock     -- Buffer inventory for affected inputs
    reroute_shipment          -- Change logistics path
    contact_supplier          -- Verify supplier status
    monitor_situation         -- Watch and reassess
    escalate_to_leadership    -- Brief C-suite / BU heads
    file_insurance_claim      -- Trigger coverage for losses
    activate_bcp              -- Activate business continuity plan
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ── Action templates keyed by action_type ──────────────────────────

_ACTION_TEMPLATES: dict[str, dict[str, str]] = {
    "activate_backup_supplier": {
        "title": "Activate backup supplier for affected inputs",
        "description": "Identify and engage pre-qualified backup suppliers for inputs sourced from the disrupted region. Verify capacity, lead times, and quality certifications before switching.",
        "assignee_hint": "Procurement",
    },
    "increase_safety_stock": {
        "title": "Increase safety stock for at-risk materials",
        "description": "Raise safety stock levels for raw materials and components sourced from the affected region. Coordinate with planning to adjust MRP parameters.",
        "assignee_hint": "Supply Planning",
    },
    "reroute_shipment": {
        "title": "Reroute shipments away from disrupted corridor",
        "description": "Work with logistics providers to identify alternative shipping routes that avoid the affected area. Assess cost and lead-time impact of rerouting.",
        "assignee_hint": "Logistics",
    },
    "contact_supplier": {
        "title": "Contact affected suppliers for status update",
        "description": "Reach out to all suppliers in the disrupted region to assess their operational status, expected recovery timeline, and ability to fulfill open orders.",
        "assignee_hint": "Procurement",
    },
    "monitor_situation": {
        "title": "Monitor situation and reassess in 48 hours",
        "description": "Track the evolving situation through news feeds and supplier communications. Schedule a reassessment within 48 hours to determine if escalation is needed.",
        "assignee_hint": "Risk Management",
    },
    "escalate_to_leadership": {
        "title": "Escalate to BU leadership with impact brief",
        "description": "Prepare a concise impact assessment for BU leadership covering affected sites, revenue exposure, and recommended mitigation actions. Schedule an emergency briefing.",
        "assignee_hint": "VP Supply Chain",
    },
    "file_insurance_claim": {
        "title": "File insurance claim for disruption losses",
        "description": "Initiate business interruption insurance claim process. Document all disruption-related costs including expediting, rerouting, and lost production.",
        "assignee_hint": "Finance / Legal",
    },
    "activate_bcp": {
        "title": "Activate business continuity plan",
        "description": "Trigger the formal BCP for affected sites. Convene the crisis management team, activate predefined response protocols, and begin executing recovery procedures.",
        "assignee_hint": "Operations / BCP Lead",
    },
}


# ── Rules: which actions to generate based on severity + category ──

# Maps (severity_threshold, category_pattern) -> list of (action_type, priority)
# severity_threshold: minimum computed severity score (0-100)
# category_pattern: category substring match (empty = all categories)

_GENERATION_RULES: list[dict[str, Any]] = [
    # Critical severity (>= 75) -- full response
    {
        "min_score": 75,
        "categories": None,  # all categories
        "actions": [
            ("escalate_to_leadership", "critical"),
            ("activate_bcp", "critical"),
            ("contact_supplier", "critical"),
            ("activate_backup_supplier", "high"),
            ("increase_safety_stock", "high"),
        ],
    },
    # Critical natural disaster -- add insurance claim
    {
        "min_score": 75,
        "categories": ["Natural Disaster"],
        "actions": [
            ("file_insurance_claim", "high"),
        ],
    },
    # High severity (>= 50) -- proactive mitigation
    {
        "min_score": 50,
        "max_score": 75,
        "categories": None,
        "actions": [
            ("contact_supplier", "high"),
            ("activate_backup_supplier", "normal"),
            ("increase_safety_stock", "normal"),
            ("escalate_to_leadership", "normal"),
        ],
    },
    # High severity logistics -- reroute
    {
        "min_score": 50,
        "max_score": 75,
        "categories": ["Logistics", "Port", "Labour", "Strike"],
        "actions": [
            ("reroute_shipment", "high"),
        ],
    },
    # Medium severity (>= 25) -- watch and prepare
    {
        "min_score": 25,
        "max_score": 50,
        "categories": None,
        "actions": [
            ("contact_supplier", "normal"),
            ("monitor_situation", "normal"),
        ],
    },
    # Low severity (< 25) -- monitor only
    {
        "min_score": 0,
        "max_score": 25,
        "categories": None,
        "actions": [
            ("monitor_situation", "low"),
        ],
    },
]


def _get_severity_score(event: dict) -> float:
    """Extract the numeric severity score from an event payload."""
    cs = event.get("computed_severity")
    if isinstance(cs, dict):
        return cs.get("score", 0.0)
    # Fallback: map label to approximate score
    label = event.get("severity") or event.get("risk_level", "Medium")
    label_map = {"Critical": 85.0, "High": 60.0, "Medium": 35.0, "Low": 15.0}
    return label_map.get(label, 35.0)


def _matches_category(event: dict, category_patterns: list[str] | None) -> bool:
    """Check if the event's category matches any of the given patterns."""
    if category_patterns is None:
        return True
    category = event.get("category", "")
    return any(pat.lower() in category.lower() for pat in category_patterns)


def _compute_due_date(priority: str) -> str:
    """Compute a due date based on action priority."""
    now = datetime.now(timezone.utc)
    offsets = {
        "critical": timedelta(hours=4),
        "high": timedelta(hours=24),
        "normal": timedelta(days=3),
        "low": timedelta(days=7),
    }
    due = now + offsets.get(priority, timedelta(days=3))
    return due.isoformat()


def generate_actions_for_event(event: dict) -> list[dict]:
    """Generate structured actions for a disruption event.

    Returns a list of action dicts ready to be passed to create_action().
    Each dict has: action_type, title, description, assignee_hint, priority, due_date.

    Deduplicates by action_type -- if multiple rules fire, the highest-priority
    version wins.
    """
    score = _get_severity_score(event)
    event_id = event.get("id", "")

    # Collect candidate actions from all matching rules
    candidates: dict[str, dict] = {}  # keyed by action_type
    priority_rank = {"critical": 0, "high": 1, "normal": 2, "low": 3}

    for rule in _GENERATION_RULES:
        min_score = rule.get("min_score", 0)
        max_score = rule.get("max_score", 100)
        if not (min_score <= score < max_score if max_score < 100 else min_score <= score):
            continue
        if not _matches_category(event, rule.get("categories")):
            continue

        for action_type, priority in rule["actions"]:
            existing = candidates.get(action_type)
            if existing is None or priority_rank.get(priority, 2) < priority_rank.get(existing["priority"], 2):
                template = _ACTION_TEMPLATES[action_type]
                candidates[action_type] = {
                    "event_id": event_id,
                    "action_type": action_type,
                    "title": template["title"],
                    "description": _contextualize_description(template["description"], event),
                    "assignee_hint": template["assignee_hint"],
                    "priority": priority,
                    "due_date": _compute_due_date(priority),
                }

    # Sort by priority (critical first)
    actions = sorted(candidates.values(), key=lambda a: priority_rank.get(a["priority"], 2))

    logger.info(
        "Generated %d actions for event %s (score=%.1f)",
        len(actions), event_id, score,
    )
    return actions


def _contextualize_description(base_description: str, event: dict) -> str:
    """Add event-specific context to the generic action description."""
    region = event.get("region", "")
    event_title = event.get("event") or event.get("risk", "")

    affected_sites = event.get("affected_sites", [])
    site_names = []
    if isinstance(affected_sites, list):
        site_names = [s["name"] if isinstance(s, dict) else str(s) for s in affected_sites[:5]]

    parts = [base_description]
    if region:
        parts.append(f"Region: {region}.")
    if event_title:
        parts.append(f"Trigger: {event_title}.")
    if site_names:
        parts.append(f"Potentially affected sites: {', '.join(site_names)}.")

    return " ".join(parts)
