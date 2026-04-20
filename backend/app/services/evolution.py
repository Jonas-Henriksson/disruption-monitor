"""Evolution analyzer — tracks how disruption events evolve over time.

Generates periodic AI summaries (daily/weekly/monthly) using hierarchical
compression so Opus never sees the full raw history. Detects phase transitions,
exposure drift, and forward projections.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import settings
from ..db.database import (
    get_event,
    get_event_severity_history,
    get_evolution_summaries,
    get_latest_evolution_summary,
    save_evolution_summary,
    delete_evolution_summaries,
    get_events,
)

logger = logging.getLogger(__name__)


def _extract_sev_values(snapshots: list) -> list[float]:
    """Extract numeric severity scores from various snapshot shapes.

    Handles: severity_history dicts ({score: N}), full event dicts
    ({computed_severity: {score: N}}), and evolution summary dicts.
    """
    values = []
    for s in snapshots:
        if not isinstance(s, dict):
            continue
        # Direct score (from get_event_severity_history)
        sc = s.get("score")
        if sc is not None and isinstance(sc, (int, float)) and sc > 0:
            values.append(float(sc))
            continue
        # Nested in computed_severity (from full event payload)
        cs = s.get("computed_severity")
        if isinstance(cs, str):
            try:
                cs = json.loads(cs)
            except (json.JSONDecodeError, TypeError):
                cs = {}
        if isinstance(cs, dict):
            sc = cs.get("score")
            if sc is not None and isinstance(sc, (int, float)):
                values.append(float(sc))
                continue
        # Nested in payload
        payload = s.get("payload")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except (json.JSONDecodeError, TypeError):
                payload = {}
        if isinstance(payload, dict):
            cs2 = payload.get("computed_severity", {})
            if isinstance(cs2, dict):
                sc = cs2.get("score")
                if sc is not None and isinstance(sc, (int, float)):
                    values.append(float(sc))
                    continue
        values.append(0)
    return values


# Cadence per severity tier (hours between evolution analyses)
_CADENCE: dict[str, int] = {
    "Critical": 6,
    "High": 24,
    "Medium": 168,   # weekly
    "Low": 168,       # weekly
}

_WATCHING_MIN_HOURS = 24


def get_evolution_cadence_hours(severity: str, watching: bool = False) -> int:
    """Return the analysis cadence in hours for a severity level."""
    base = _CADENCE.get(severity, 168)
    if watching:
        return min(base, _WATCHING_MIN_HOURS)
    return base


# ── Prompt for Opus ──────────────────────────────────────────────

_EVOLUTION_PROMPT = """\
You are a supply chain intelligence analyst at SKF Group analyzing how a \
disruption event has evolved over the {period_type} period from {period_start} \
to {period_end}.

Event: {title} in {region} (currently {severity}, score {score})

Phase history so far:
{phase_chain}

Recent data points (severity snapshots for this period):
{snapshots_json}

Produce a JSON object with exactly these fields:
{{
  "phase_label": "name of the current phase (or same as previous if unchanged)",
  "phase_number": {next_phase_number},
  "key_developments": [
    {{"date": "YYYY-MM-DD", "description": "what changed"}}
  ],
  "exposure_delta": "how SKF exposure changed this period (empty string if unchanged)",
  "forward_outlook": "1-2 sentences: what happens next if nothing changes",
  "narrative": "3-5 sentence plain-text evolution assessment"
}}

If nothing significant changed, return empty key_developments array and keep \
the same phase_label. Be specific to THIS event — name regions, sites, \
chokepoints where relevant. Return ONLY valid JSON, no markdown fences.
"""


async def generate_evolution_summary(
    event_id: str,
    period_type: str,
    period_start: str,
    period_end: str,
) -> dict:
    """Generate an AI evolution summary for an event."""
    event = get_event(event_id)
    if not event:
        raise ValueError(f"Event not found: {event_id}")

    # Gather input data based on period type
    if period_type == "daily":
        # get_event_severity_history has no limit param — slice in Python
        snapshots = get_event_severity_history(event_id)[-7:]
    elif period_type == "weekly":
        snapshots = get_evolution_summaries(event_id, period_type="daily", limit=7)
    else:  # monthly
        snapshots = get_evolution_summaries(event_id, period_type="weekly", limit=4)

    if not snapshots:
        return build_fallback_evolution_summary(
            event_id, [], period_type, period_start, period_end, []
        )

    # Build phase chain from existing summaries
    all_summaries = get_evolution_summaries(event_id)
    prior_phases = []
    for s in all_summaries:
        if s.get("phase_label"):
            prior_phases.append({
                "phase": s["phase_label"],
                "number": s.get("phase_number", 1),
                "period": s["period_start"],
            })

    # Try AI generation
    if settings.has_claude_api:
        try:
            return await _generate_with_claude(
                event, event_id, snapshots, period_type,
                period_start, period_end, prior_phases,
            )
        except Exception as exc:
            logger.error("Evolution analysis failed for %s: %s", event_id, exc)

    return build_fallback_evolution_summary(
        event_id, snapshots, period_type, period_start, period_end, prior_phases,
    )


async def _generate_with_claude(
    event: dict,
    event_id: str,
    snapshots: list,
    period_type: str,
    period_start: str,
    period_end: str,
    prior_phases: list[dict],
) -> dict:
    """Call Opus to generate an evolution summary."""
    from .scanner import _get_claude_client

    client = _get_claude_client()

    title = event.get("event") or event.get("risk", "Unknown")
    region = event.get("region", "Unknown")
    severity = event.get("severity", "Medium")
    score = (event.get("computed_severity") or {}).get("score", 0)

    phase_chain = " → ".join(
        f"Phase {p['number']}: \"{p['phase']}\" ({p['period']})"
        for p in prior_phases
    ) or "No prior phases (first analysis)"

    next_phase = (prior_phases[-1]["number"] if prior_phases else 0) + 1

    snapshots_json = json.dumps(snapshots[:7], indent=2, default=str)

    prompt = _EVOLUTION_PROMPT.format(
        period_type=period_type,
        period_start=period_start,
        period_end=period_end,
        title=title,
        region=region,
        severity=severity,
        score=score,
        phase_chain=phase_chain,
        snapshots_json=snapshots_json,
        next_phase_number=next_phase,
    )

    response = await client.messages.create(
        model=settings.analysis_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text = block.text.strip()
            break

    # Parse JSON response
    import re
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)

    parsed = json.loads(text)

    # Extract severity values from snapshots
    # Snapshots may be severity_history dicts ({score: N}) or full event dicts
    sev_values = _extract_sev_values(snapshots)

    return {
        "event_id": event_id,
        "period_type": period_type,
        "period_start": period_start,
        "period_end": period_end,
        "severity_values": json.dumps(sev_values),
        "phase_label": parsed.get("phase_label", ""),
        "phase_number": parsed.get("phase_number", 1),
        "key_developments": json.dumps(parsed.get("key_developments", [])),
        "exposure_delta": parsed.get("exposure_delta", ""),
        "forward_outlook": parsed.get("forward_outlook", ""),
        "narrative": parsed.get("narrative", ""),
        "generated_by": "claude",
    }


def build_fallback_evolution_summary(
    event_id: str,
    snapshots: list,
    period_type: str,
    period_start: str,
    period_end: str,
    prior_phases: list[dict],
) -> dict:
    """Template-based fallback when Claude is unavailable."""
    sev_values = _extract_sev_values(snapshots)

    phase_number = (prior_phases[-1]["number"] + 1) if prior_phases else 1
    phase_label = prior_phases[-1]["phase"] if prior_phases else "Initial Detection"

    avg_sev = round(sum(sev_values) / len(sev_values)) if sev_values else 0
    narrative = (
        f"This event has been tracked across {len(snapshots)} data points in this {period_type} period. "
        f"Average severity score: {avg_sev}. "
        f"Currently in phase: {phase_label}."
    )

    return {
        "event_id": event_id,
        "period_type": period_type,
        "period_start": period_start,
        "period_end": period_end,
        "severity_values": json.dumps(sev_values),
        "phase_label": phase_label,
        "phase_number": phase_number,
        "key_developments": json.dumps([]),
        "exposure_delta": "",
        "forward_outlook": "",
        "narrative": narrative,
        "generated_by": "fallback",
    }


# ── Compression ──────────────────────────────────────────────────


def compress_daily_to_weekly(event_id: str, week_start: str, week_end: str) -> dict | None:
    """Compress 7 daily summaries into one weekly summary. Deterministic, no AI."""
    dailies = get_evolution_summaries(event_id, period_type="daily", limit=100)
    in_range = [d for d in dailies if week_start <= d["period_start"] <= week_end]
    if not in_range:
        return None

    all_sevs: list[int] = []
    all_milestones: list[dict] = []
    latest_phase = in_range[-1].get("phase_label", "")
    latest_phase_num = in_range[-1].get("phase_number", 1)

    for d in in_range:
        all_sevs.extend(json.loads(d.get("severity_values", "[]")))
        all_milestones.extend(json.loads(d.get("key_developments", "[]")))

    # Dedup milestones by date+description
    seen = set()
    unique_milestones = []
    for m in all_milestones:
        key = f"{m.get('date')}|{m.get('description', '')}"
        if key not in seen:
            seen.add(key)
            unique_milestones.append(m)

    summary = {
        "event_id": event_id,
        "period_type": "weekly",
        "period_start": week_start,
        "period_end": week_end,
        "severity_values": json.dumps(all_sevs),
        "phase_label": latest_phase,
        "phase_number": latest_phase_num,
        "key_developments": json.dumps(unique_milestones),
        "exposure_delta": in_range[-1].get("exposure_delta", ""),
        "forward_outlook": in_range[-1].get("forward_outlook", ""),
        "narrative": in_range[-1].get("narrative", ""),
        "generated_by": "compression",
    }
    save_evolution_summary(summary)
    return summary


def compress_weekly_to_monthly(event_id: str, month_start: str, month_end: str) -> dict | None:
    """Compress ~4 weekly summaries into one monthly summary. Deterministic, no AI."""
    weeklies = get_evolution_summaries(event_id, period_type="weekly", limit=100)
    in_range = [w for w in weeklies if month_start <= w["period_start"] <= month_end]
    if not in_range:
        return None

    all_sevs: list[int] = []
    all_milestones: list[dict] = []
    latest_phase = in_range[-1].get("phase_label", "")
    latest_phase_num = in_range[-1].get("phase_number", 1)

    for w in in_range:
        all_sevs.extend(json.loads(w.get("severity_values", "[]")))
        all_milestones.extend(json.loads(w.get("key_developments", "[]")))

    seen = set()
    unique_milestones = []
    for m in all_milestones:
        key = f"{m.get('date')}|{m.get('description', '')}"
        if key not in seen:
            seen.add(key)
            unique_milestones.append(m)

    summary = {
        "event_id": event_id,
        "period_type": "monthly",
        "period_start": month_start,
        "period_end": month_end,
        "severity_values": json.dumps(all_sevs),
        "phase_label": latest_phase,
        "phase_number": latest_phase_num,
        "key_developments": json.dumps(unique_milestones),
        "exposure_delta": in_range[-1].get("exposure_delta", ""),
        "forward_outlook": in_range[-1].get("forward_outlook", ""),
        "narrative": in_range[-1].get("narrative", ""),
        "generated_by": "compression",
    }
    save_evolution_summary(summary)
    return summary
