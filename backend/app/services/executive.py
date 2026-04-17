"""Executive summary assembly — aggregates weekly data, BU exposure, and risk posture."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_SEV_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


def _compute_risk_level(severity_counts: dict[str, int]) -> str:
    """Derive risk level from Critical event count: 0=STABLE, 1-2=ELEVATED, 3+=HIGH."""
    critical = severity_counts.get("Critical", 0)
    if critical >= 3:
        return "HIGH"
    if critical >= 1:
        return "ELEVATED"
    return "STABLE"


def build_executive_summary(
    active_events: list[dict],
    weekly_summary: dict,
    bu_exposure: list[dict],
    one_liner: str | None = None,
) -> dict[str, Any]:
    """Assemble the executive summary payload from pre-fetched data.

    Args:
        active_events: All active events (already sorted by severity).
        weekly_summary: Output of get_weekly_summary().
        bu_exposure: Output of get_bu_exposure_summary().
        one_liner: Optional AI-generated one-liner (pre-computed).
    """
    sev_counts = weekly_summary.get("severity_snapshot", {})
    risk_level = _compute_risk_level(sev_counts)

    # Top 3 actively bleeding (Critical/High, sorted by severity then recency)
    bleeding = [
        e for e in active_events
        if e.get("severity") in ("Critical", "High") or e.get("risk_level") in ("Critical", "High")
    ]
    bleeding.sort(key=lambda e: (_SEV_ORDER.get(e.get("severity", e.get("risk_level", "Low")), 3),))
    actively_bleeding = bleeding[:3]

    # Top 3 escalating
    escalating = weekly_summary.get("escalated_events", [])[:3]

    # Top 3 recently resolved
    resolved = weekly_summary.get("resolved_events", [])[:3]

    return {
        "risk_level": risk_level,
        "one_liner": one_liner or "",
        "severity_counts": sev_counts,
        "actively_bleeding": actively_bleeding,
        "escalating": escalating,
        "recently_resolved": resolved,
        "bu_exposure": bu_exposure,
        "period": weekly_summary.get("period", {}),
        "generated_at": None,  # filled by endpoint
    }
