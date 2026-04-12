"""Narrative generation service — Claude-powered executive briefings.

Produces structured SITUATION/EXPOSURE/ACTIONS/OUTLOOK briefings for
disruption events. Falls back to template-based generation when Claude
API is unavailable.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field

from ..config import settings

logger = logging.getLogger(__name__)


# ── Models ──────────────────────────────────────────────────────────


class TalkingPoints(BaseModel):
    """Structured talking points for executive briefings."""

    situation: list[str] = Field(default_factory=list)
    exposure: list[str] = Field(default_factory=list)
    action: list[str] = Field(default_factory=list)
    outlook: list[str] = Field(default_factory=list)


# ── Prompt ──────────────────────────────────────────────────────────

_NARRATIVE_PROMPT = """\
You are a supply chain intelligence analyst at SKF Group preparing a structured \
executive briefing for senior SC leadership.

Given the disruption event data below, produce a briefing in EXACTLY this format \
with these 4 sections. Use bullet points, not paragraphs. Be concrete — cite \
specific factory names, supplier counts, and numbers.

SITUATION:
• One bullet: what is happening, severity level, trend direction

EXPOSURE:
• Which specific SKF manufacturing sites are in the blast radius (name them)
• How many suppliers are affected and in which countries
• Estimated units/week at risk if known

RECOMMENDED ACTIONS:
• Action 1 with owner and timeframe (e.g., "Procurement: activate backup suppliers in Germany within 48h")
• Action 2 with owner and timeframe
• Action 3 if applicable

OUTLOOK:
• Recovery timeline with vs without mitigation
• Key risk: what could make this worse

No preamble, no sign-off, no hedging. Start directly with "SITUATION:".

Event data:
{event_json}
"""


# ── Claude narrative generation ─────────────────────────────────────


async def generate_claude_narrative(event: dict) -> str:
    """Call Claude to generate an executive narrative for an event."""
    from .scanner import _get_claude_client

    client = _get_claude_client()

    # Build a focused subset of event data for the prompt
    event_subset = {
        k: v
        for k, v in event.items()
        if k
        not in ("first_seen", "last_seen", "scan_count", "status", "lat", "lng", "trend_arrow")
    }
    event_json = json.dumps(event_subset, indent=2, default=str)

    response = await client.messages.create(
        model=settings.resolved_model,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": _NARRATIVE_PROMPT.format(event_json=event_json),
            }
        ],
    )

    # Extract text
    for block in response.content:
        if hasattr(block, "text"):
            return block.text.strip()

    narrative, _ = build_fallback_narrative(event)
    return narrative


# ── Talking-points parsing helpers ──────────────────────────────────


def parse_talking_points(raw: str) -> TalkingPoints:
    """Parse Claude's response into structured TalkingPoints.

    Tries JSON first (with optional markdown fences), then falls back
    to section-header parsing.
    """
    if not raw or not raw.strip():
        return TalkingPoints()

    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()

    # Try JSON parse
    try:
        data = json.loads(text)
        return TalkingPoints(
            situation=data.get("situation", []),
            exposure=data.get("exposure", []),
            action=data.get("action", []),
            outlook=data.get("outlook", []),
        )
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # Fall back to section-header parsing
    return parse_sections_fallback(raw)


def parse_sections_fallback(text: str) -> TalkingPoints:
    """Parse a section-header formatted response into TalkingPoints.

    Recognizes headers like SITUATION:, EXPOSURE:, RECOMMENDED ACTIONS:,
    ACTIONS:, OUTLOOK: and extracts bullet points (bullet or dash).
    """
    section_map = {
        "situation": "situation",
        "exposure": "exposure",
        "recommended actions": "action",
        "actions": "action",
        "action": "action",
        "outlook": "outlook",
    }

    result: dict[str, list[str]] = {"situation": [], "exposure": [], "action": [], "outlook": []}
    current_section: str | None = None

    for line in text.split("\n"):
        stripped = line.strip()
        # Check if this is a section header
        header_match = re.match(r"^([A-Z][A-Z\s]+):\s*$", stripped)
        if header_match:
            header = header_match.group(1).strip().lower()
            current_section = section_map.get(header)
            continue
        # Extract bullet content
        if current_section and stripped:
            bullet_match = re.match(r"^[•\-\*]\s*(.+)$", stripped)
            if bullet_match:
                result[current_section].append(bullet_match.group(1).strip())

    return TalkingPoints(**result)


def talking_points_to_narrative(tp: TalkingPoints) -> str:
    """Flatten TalkingPoints into a sectioned plain-text narrative."""
    sections = [
        ("SITUATION:", tp.situation),
        ("EXPOSURE:", tp.exposure),
        ("ACTIONS:", tp.action),
        ("OUTLOOK:", tp.outlook),
    ]
    has_content = any(points for _, points in sections)
    if not has_content:
        return "No narrative available."

    parts: list[str] = []
    for header, points in sections:
        if points:
            parts.append(header)
            for p in points:
                parts.append(f"  • {p}")
            parts.append("")

    return "\n".join(parts).strip()


# ── Fallback narrative builder ──────────────────────────────────────


def build_fallback_narrative(event: dict) -> tuple[str, TalkingPoints]:
    """Build a narrative and TalkingPoints from structured event data when Claude is unavailable.

    Returns a (narrative_string, TalkingPoints) tuple.
    """
    title = event.get("event") or event.get("risk", "Unknown event")
    severity = event.get("severity") or event.get("risk_level", "Medium")
    trend = event.get("trend", "")
    exposure_text = (
        event.get("skf_exposure")
        or event.get("skf_relevance")
        or event.get("skf_cost_impact", "")
    )
    action = event.get("recommended_action", "")

    # Build structured talking points
    situation_points: list[str] = [f"{title} — severity {severity}{f', trend {trend}' if trend else ''}"]

    exposure_points: list[str] = []
    if exposure_text:
        exposure_points.append(exposure_text)

    impact = event.get("impact")
    if impact:
        affected_sites = impact.get("affected_sites", [])
        if affected_sites:
            names = [s["name"] for s in affected_sites[:4]]
            exposure_points.append(f"Affected sites: {', '.join(names)}")
        affected_suppliers = impact.get("affected_suppliers")
        if affected_suppliers:
            count = affected_suppliers.get("count", 0)
            countries = affected_suppliers.get("countries", [])
            if count:
                exposure_points.append(f"{count} suppliers affected in {', '.join(countries)}")
        units = impact.get("estimated_units_per_week")
        if units:
            exposure_points.append(f"{units:,} units/week at risk")

    action_points: list[str] = []
    actions_list = event.get("actions", [])
    if actions_list:
        for a in actions_list[:3]:
            owner = a.get("owner", "")
            urgency = a.get("urgency", "")
            label = a.get("action", "")
            parts = [label]
            if owner:
                parts.append(f"({owner})")
            if urgency:
                parts.append(f"[{urgency}]")
            action_points.append(" ".join(parts))
    elif action:
        action_points.append(action)

    outlook_points: list[str] = []
    if impact:
        with_mit = impact.get("recovery_weeks_with_mitigation")
        without_mit = impact.get("recovery_weeks_without")
        if with_mit and without_mit:
            outlook_points.append(f"Recovery: {with_mit}w with mitigation, {without_mit}w without")
        elif with_mit:
            outlook_points.append(f"Recovery: {with_mit}w with mitigation")

    tp = TalkingPoints(
        situation=situation_points,
        exposure=exposure_points,
        action=action_points,
        outlook=outlook_points,
    )

    narrative = talking_points_to_narrative(tp)
    return narrative, tp
