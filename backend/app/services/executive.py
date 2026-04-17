"""Executive summary assembly — aggregates weekly data, BU exposure, and risk posture."""

from __future__ import annotations

import logging
from typing import Any

from ..config import settings

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


# ── AI One-Liner Generation ─────────────────────────────────────────


_ONE_LINER_PROMPT = """\
You are a supply chain risk analyst. Given the active disruptions below, \
write exactly ONE sentence (max 30 words) answering: "What should a VP know right now?"
Focus on convergent risks and operational impact. No hedging. No preamble.

Active Critical events:
{critical_events}

Active High events:
{high_events}
"""


def _get_client():
    """Get the Anthropic/Bedrock client (same pattern as narrative.py)."""
    from .scanner import _get_claude_client
    return _get_claude_client()


def _build_fallback_one_liner(events: list[dict]) -> str:
    """Template-based one-liner when Claude API is unavailable."""
    critical = [e for e in events if e.get("severity") == "Critical" or e.get("risk_level") == "Critical"]
    high = [e for e in events if e.get("severity") == "High" or e.get("risk_level") == "High"]
    regions = set()
    for e in critical + high:
        r = e.get("region", "")
        if r:
            regions.add(r)

    if critical:
        return (
            f"{len(critical)} critical disruption{'s' if len(critical) != 1 else ''} "
            f"across {', '.join(sorted(regions)[:3]) or 'multiple regions'} "
            f"with {len(high)} high-severity events requiring monitoring."
        )
    if high:
        return f"{len(high)} high-severity events active across {', '.join(sorted(regions)[:3]) or 'multiple regions'}."
    return "No critical or high-severity disruptions currently active."


async def generate_executive_one_liner(events: list[dict]) -> str:
    """Generate a single-sentence executive risk summary."""
    if not settings.has_claude_api:
        return _build_fallback_one_liner(events)

    critical = [e for e in events if e.get("severity") == "Critical" or e.get("risk_level") == "Critical"]
    high = [e for e in events if e.get("severity") == "High" or e.get("risk_level") == "High"]

    critical_text = "\n".join(
        f"- {e.get('event', e.get('risk', '?'))}: {e.get('region', '?')}" for e in critical[:5]
    ) or "None"
    high_text = "\n".join(
        f"- {e.get('event', e.get('risk', '?'))}: {e.get('region', '?')}" for e in high[:5]
    ) or "None"

    prompt = _ONE_LINER_PROMPT.format(critical_events=critical_text, high_events=high_text)

    try:
        client = _get_client()
        response = await client.messages.create(
            model=settings.scan_model,
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        return text
    except Exception as exc:
        logger.warning("One-liner generation failed: %s — using fallback", exc)
        return _build_fallback_one_liner(events)
