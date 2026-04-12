"""AI-powered disruption scanning service using Claude API with web search.

Provides live scanning when ANTHROPIC_API_KEY is configured,
and gracefully falls back to sample data otherwise.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from ..config import settings
from .metrics import emit_count, emit_metric
from ..data import load_disruptions, load_geopolitical, load_sites, load_trade, SUPPLY_GRAPH
from ..services.dedup import tag_duplicates
from ..services.serper import fetch_search_context
from ..services.severity import compute_severity_score
from ..utils.geo import haversine_km
from ..utils.retry import retry_async

logger = logging.getLogger(__name__)

ScanMode = Literal["disruptions", "geopolitical", "trade"]

# Track in-progress scans to prevent concurrent scans for the same mode
# Lazily initialized to avoid creating Locks outside an event loop
_scan_locks: dict[str, asyncio.Lock] = {}


def _get_scan_lock(mode: str) -> asyncio.Lock:
    """Get or create a per-mode scan lock (lazy init)."""
    if mode not in _scan_locks:
        _scan_locks[mode] = asyncio.Lock()
    return _scan_locks[mode]

# ── Prompts per scan mode ────────────────────────────────────────

_DISRUPTION_PROMPT = """\
You are an expert supply chain intelligence analyst for SKF Group, a global
bearing manufacturer with 238 sites across 69 countries and 5,090 suppliers
across 53 countries.

Search the web for current supply chain disruptions that could affect SKF's
global operations. Focus on:
- Natural disasters (earthquakes, floods, typhoons) near industrial regions
- Geopolitical events (sanctions, conflicts, trade restrictions)
- Logistics disruptions (port closures, shipping delays, canal blockages)
- Labour actions (strikes, work stoppages) at major ports or industrial areas
- Supplier risks (bankruptcies, factory fires, quality recalls)
- Currency and economic shocks affecting manufacturing regions

For each disruption found, return a JSON object with these exact fields:
- event: string (short title)
- description: string (2-3 sentence summary)
- category: string (Natural Disaster | Geopolitical | Logistics/Port | Labour/Strike | Trade Policy | Currency | Other)
- severity: string (Critical | High | Medium | Low)
- trend: string (Escalating | Stable | De-escalating | New)
- region: string (Europe | Americas | China | India | Middle East | Africa | Global)
- lat: number (latitude of event epicenter)
- lng: number (longitude of event epicenter)
- skf_exposure: string (how this affects SKF specifically — mention specific factories or suppliers)
- recommended_action: string (concrete mitigation steps)

Return all significant disruptions you find. If fewer than 5 exist, return fewer. Do not pad with low-relevance items. Order by severity (Critical first).
Only return the JSON array, no other text.
"""

_GEOPOLITICAL_PROMPT = """\
You are an expert geopolitical risk analyst for SKF Group, a global bearing
manufacturer with 238 sites across 69 countries and 5,090 suppliers across
53 countries.

Search the web for current geopolitical risks that could affect global supply
chains and industrial manufacturing. Focus on:
- Active conflicts and their evolution
- US-China strategic competition and technology decoupling
- Trade bloc formation and fragmentation
- Sanctions regimes and compliance risks
- Political instability in manufacturing regions
- Nearshoring/friendshoring trends

For each risk, return a JSON object with these exact fields:
- risk: string (short title)
- trend: string (Escalating | Stable | De-escalating)
- trend_arrow: string (use unicode arrows)
- this_week: string (2-3 sentences on latest developments)
- skf_relevance: string (how this affects SKF specifically)
- risk_level: string (Critical | High | Medium | Low)
- region: string (Europe | Americas | China | India | Middle East | Africa | Global)
- lat: number (latitude center)
- lng: number (longitude center)
- watchpoint: string (what to watch for next)

Return a JSON array of 6-8 risks, ordered by risk_level.
Only return the JSON array, no other text.
"""

_TRADE_PROMPT = """\
You are an expert trade policy analyst for SKF Group, a global bearing
manufacturer with 238 sites across 69 countries and 5,090 suppliers across
53 countries. SKF produces bearings, seals, and lubrication systems.

Search the web for current trade policy developments that could affect SKF's
global operations. Focus on:
- Steel tariffs and safeguard measures (steel is SKF's #1 input cost)
- Anti-dumping duties on bearings
- Export controls on critical materials
- Free trade agreement negotiations
- Sanctions and trade restrictions
- Regional trade bloc developments (RCEP, EU FTAs, USMCA)

For each event, return a JSON object with these exact fields:
- event: string (short title)
- description: string (2-3 sentence summary)
- category: string (Tariffs | Anti-Dumping | Export Controls | FTA | Sanctions)
- severity: string (Critical | High | Medium | Low)
- trend: string (Escalating | Stable | De-escalating | New)
- region: string (Europe | Americas | China | India | Middle East | Africa | Global)
- lat: number (latitude)
- lng: number (longitude)
- corridor: string (trade corridor affected, e.g. EU-CN, EU-US, GLOBAL)
- friction_level: string (Free | Low | Moderate | High | Prohibitive)
- skf_cost_impact: string (cost impact description)
- recommended_action: string (concrete steps)

Focus on changes in the last 7 days. Prioritize tariff changes, sanctions updates, and export control modifications that directly affect bearing manufacturing supply chains.

Return a JSON array of 6-8 events, ordered by severity.
Only return the JSON array, no other text.
"""

_PROMPTS: dict[ScanMode, str] = {
    "disruptions": _DISRUPTION_PROMPT,
    "geopolitical": _GEOPOLITICAL_PROMPT,
    "trade": _TRADE_PROMPT,
}

# ── ID generation helpers ────────────────────────────────────────


def _make_disruption_id(item: dict) -> str:
    slug = item.get("event", "unknown").lower()[:40].replace(" ", "-")
    region = item.get("region", "unknown").lower().replace(" ", "-")
    return f"{slug}|{region}"


def _make_geopolitical_id(item: dict) -> str:
    return item.get("risk", "unknown").lower()[:50].replace(" ", "-")


def _make_trade_id(item: dict) -> str:
    slug = item.get("event", "unknown").lower()[:40].replace(" ", "-")
    region = item.get("region", "unknown").lower().replace(" ", "-")
    return f"{slug}|{region}"


_ID_MAKERS: dict[ScanMode, Any] = {
    "disruptions": _make_disruption_id,
    "geopolitical": _make_geopolitical_id,
    "trade": _make_trade_id,
}


# ── Geography helpers ──────────────────────────────────────────


_BLAST_RADIUS_KM: dict[str, float] = {
    "Critical": 2000.0,
    "High": 1500.0,
    "Medium": 1000.0,
    "Low": 500.0,
}


_haversine_km = haversine_km

# Categories where haversine blast-radius is the correct primary model
_DISTANCE_PRIMARY_CATEGORIES = {"Natural Disaster"}


def _resolve_event_country(item: dict, sites: list[dict]) -> str | None:
    """Resolve the country an event is located in.

    Strategy: find the nearest SKF site and use its country. This is a
    lightweight reverse-geocode that works well for industrial regions
    where SKF has presence.
    """
    lat = item.get("lat")
    lng = item.get("lng")
    if lat is None or lng is None:
        return None

    best_dist = float("inf")
    best_country = None
    for site in sites:
        dist = _haversine_km(lat, lng, site["lat"], site["lng"])
        if dist < best_dist:
            best_dist = dist
            best_country = site["country"]
    # Only trust the match if within 500 km — beyond that the event is
    # likely in an area without SKF sites and the country match is weak.
    if best_dist <= 500:
        return best_country
    return best_country  # still return best guess; routing check will validate


def _match_by_routing_dependency(item: dict, sites: list[dict]) -> list[dict]:
    """Find SKF factories affected via supply-chain routing dependency.

    For non-natural-disaster events (port closures, trade policy, strikes,
    geopolitical), a factory is affected if it sources inputs from the
    country where the event is occurring — regardless of geographic distance.

    Returns a list of {name, type, distance_km, match_reason, affected_inputs,
    max_input_tier} dicts.
    """
    event_country = _resolve_event_country(item, sites)
    if not event_country:
        return []

    # Build a name->site lookup for type and coords
    site_lookup: dict[str, dict] = {s["name"]: s for s in sites}

    lat = item.get("lat", 0)
    lng = item.get("lng", 0)

    affected: list[dict] = []
    for factory_name, graph_entry in SUPPLY_GRAPH.items():
        supplier_countries: list[str] = graph_entry.get("sup", [])
        if event_country not in supplier_countries:
            continue

        # Determine which inputs are affected and their tier
        input_details: list[dict] = graph_entry.get("input_details", [])
        affected_inputs: list[str] = []
        best_tier = 99
        has_sole_source = False

        for inp in input_details:
            # All inputs from this factory may be affected since the
            # supplier country is in the disruption zone.  We tag all
            # inputs; severity weighting uses the best (lowest) tier.
            affected_inputs.append(inp["name"])
            if inp["tier"] < best_tier:
                best_tier = inp["tier"]
            if inp.get("sole_source"):
                has_sole_source = True

        site_data = site_lookup.get(factory_name)
        if site_data:
            dist = _haversine_km(lat, lng, site_data["lat"], site_data["lng"])
            site_type = site_data["type"]
        else:
            dist = 0.0
            site_type = "mfg"

        affected.append({
            "name": factory_name,
            "type": site_type,
            "distance_km": round(dist, 1),
            "match_reason": "routing_dependency",
            "affected_inputs": affected_inputs,
            "max_input_tier": best_tier if best_tier < 99 else 2,
            "sole_source_risk": has_sole_source,
        })

    return affected


def _match_affected_sites(item: dict, mode: str) -> list[dict]:
    """Find SKF sites affected by a disruption event.

    Uses a DUAL model:
    - Natural Disaster events: haversine blast-radius as primary (distance
      propagation is correct for earthquakes, floods, typhoons).
    - All other categories (Logistics/Port, Geopolitical, Labour/Strike,
      Trade Policy, Currency): supply-chain routing dependency as primary,
      with haversine as a secondary signal for nearby factories.

    Returns a list of {name, type, distance_km, ...} dicts sorted by distance.
    """
    lat = item.get("lat")
    lng = item.get("lng")
    if lat is None or lng is None:
        return []

    severity = item.get("severity") or item.get("risk_level", "Medium")
    radius = _BLAST_RADIUS_KM.get(severity, 1000.0)
    category = item.get("category", "")

    sites = load_sites()

    # ── Haversine matches (always computed) ──────────────────────
    haversine_matches: list[dict] = []
    for site in sites:
        dist = _haversine_km(lat, lng, site["lat"], site["lng"])
        if dist <= radius:
            haversine_matches.append({
                "name": site["name"],
                "type": site["type"],
                "distance_km": round(dist, 1),
                "match_reason": "proximity",
            })

    # ── For natural disasters, haversine-only is correct ─────────
    if category in _DISTANCE_PRIMARY_CATEGORIES:
        haversine_matches.sort(key=lambda s: s["distance_km"])
        return haversine_matches

    # ── For all other events, routing dependency is primary ──────
    routing_matches = _match_by_routing_dependency(item, sites)

    # Merge: routing matches are primary, haversine adds nearby sites
    seen_names: set[str] = set()
    combined: list[dict] = []

    # Add routing-dependency matches first (they are the real signal)
    for match in routing_matches:
        seen_names.add(match["name"])
        combined.append(match)

    # Add haversine matches that aren't already covered by routing
    for match in haversine_matches:
        if match["name"] not in seen_names:
            seen_names.add(match["name"])
            combined.append(match)

    combined.sort(key=lambda s: s["distance_km"])
    return combined


# ── Core scanning logic ─────────────────────────────────────────


def _get_sample_data(mode: ScanMode) -> list[dict]:
    """Return sample data for a given scan mode."""
    loaders = {
        "disruptions": load_disruptions,
        "geopolitical": load_geopolitical,
        "trade": load_trade,
    }
    return loaders[mode]()


def _get_claude_client():
    """Create the appropriate async Anthropic client (direct API or Bedrock)."""
    import anthropic

    if settings.use_bedrock:
        return anthropic.AsyncAnthropicBedrock(aws_region=settings.aws_region)
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def check_claude_api_status() -> dict[str, str]:
    """Check if the Claude API is reachable and key is valid."""
    if not settings.has_claude_api:
        return {"status": "not_configured", "detail": "No ANTHROPIC_API_KEY or USE_BEDROCK set"}

    try:
        client = _get_claude_client()
        if settings.use_bedrock:
            # Bedrock health check: lightweight invoke attempt
            await client.messages.create(
                model=settings.claude_model,
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return {"status": "connected", "detail": f"Bedrock reachable ({settings.aws_region})"}
        else:
            await client.models.list(limit=1)
            return {"status": "connected", "detail": "Claude API reachable"}
    except Exception as exc:
        logger.warning("Claude API health check failed: %s", exc)
        return {"status": "error", "detail": str(exc)[:200]}


async def run_scan(mode: ScanMode) -> dict:
    """Run a disruption scan.

    Uses Claude API with web search when API key is available,
    otherwise returns sample data. Only one scan per mode runs at a time.
    """
    lock = _get_scan_lock(mode)
    if lock.locked():
        logger.info("Scan already in progress for %s -- skipping", mode)
        return {
            "scan_id": "skipped",
            "mode": mode,
            "status": "skipped",
            "source": "none",
            "progress": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "items": [],
            "count": 0,
            "detail": f"Scan already in progress for {mode}",
        }

    async with lock:
        scan_id = str(uuid.uuid4())[:8]
        started_at = datetime.now(timezone.utc)
        dims = {"mode": mode}

        if not settings.has_claude_api:
            logger.info("No Claude API key configured -- returning sample data for %s", mode)
            emit_count("scan.fallback_used", dimensions=dims)
            return _build_sample_result(mode, scan_id, started_at)

        t0 = time.monotonic()
        try:
            result = await _run_live_scan(mode, scan_id, started_at)
            elapsed_ms = (time.monotonic() - t0) * 1000
            emit_metric("scan.duration_ms", round(elapsed_ms, 1), unit="Milliseconds", dimensions=dims)
            emit_count("scan.success", dimensions=dims)
            emit_metric("scan.items_count", result.get("count", 0), unit="Count", dimensions=dims)
            return result
        except Exception as exc:
            elapsed_ms = (time.monotonic() - t0) * 1000
            emit_metric("scan.duration_ms", round(elapsed_ms, 1), unit="Milliseconds", dimensions=dims)
            emit_count("scan.failure", dimensions=dims)
            emit_count("scan.fallback_used", dimensions=dims)
            logger.error("Live scan failed for %s, falling back to sample data: %s", mode, exc)
            result = _build_sample_result(mode, scan_id, started_at)
            result["fallback"] = True
            result["error"] = str(exc)[:200]
            return result


def _build_sample_result(
    mode: ScanMode, scan_id: str, started_at: datetime
) -> dict:
    """Build a scan result from sample data."""
    data = _get_sample_data(mode)

    # Compute algorithmic severity scores for sample data
    for item in data:
        item["computed_severity"] = compute_severity_score(item)

    # Tag potential duplicates
    tag_duplicates(data)

    now = datetime.now(timezone.utc)
    return {
        "scan_id": scan_id,
        "mode": mode,
        "status": "completed",
        "source": "sample",
        "progress": 100,
        "started_at": started_at.isoformat(),
        "completed_at": now.isoformat(),
        "scanned_at": now.isoformat(),
        "items": data,
        "count": len(data),
    }


async def _run_live_scan(
    mode: ScanMode, scan_id: str, started_at: datetime
) -> dict:
    """Execute a live scan via Claude API (direct or Bedrock) with web search.

    Pre-step: fetch recent news via Serper API and inject as prompt context.
    Falls back gracefully if Serper is unavailable.
    """
    client = _get_claude_client()

    prompt = _PROMPTS[mode]
    id_maker = _ID_MAKERS[mode]

    logger.info("Starting live %s scan (id=%s) via %s", mode, scan_id, "Bedrock" if settings.use_bedrock else "Claude API")

    # ── Serper web search pre-step ──────────────────────────────
    search_context = await fetch_search_context(mode)
    if search_context:
        prompt = (
            f"{prompt}\n\n"
            f"── Recent news articles (from live web search) ──\n"
            f"Use these as primary source material. Cross-reference and verify "
            f"across multiple articles before including an event. Do NOT simply "
            f"repeat headlines — synthesize into actionable intelligence.\n\n"
            f"{search_context}"
        )
        logger.info("Injected Serper context into %s prompt (%d chars)", mode, len(search_context))
    else:
        logger.info("No Serper context for %s — Claude will use training knowledge only", mode)

    # Build request kwargs — web_search tool is only available on direct Anthropic API, not Bedrock
    create_kwargs: dict[str, Any] = {
        "model": settings.claude_model,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
    }
    if not settings.use_bedrock:
        create_kwargs["tools"] = [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 10,
            }
        ]

    # Call the async Claude API with retry on transient errors
    async def _call_claude():
        return await client.messages.create(**create_kwargs)

    response = await retry_async(
        _call_claude,
        max_retries=3,
        base_delay=1.0,
        operation=f"claude-scan-{mode}",
    )

    # Extract the text content from the response
    raw_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            raw_text += block.text

    logger.info("Claude response for %s: %d chars, stop_reason=%s", mode, len(raw_text), response.stop_reason)
    if response.stop_reason == "max_tokens":
        logger.warning("Claude response for %s was truncated (max_tokens) — attempting recovery", mode)

    # Parse JSON from the response — handle truncated output from max_tokens
    items = _parse_json_response(raw_text, truncated=(response.stop_reason == "max_tokens"))

    # Validate and filter items
    items = _validate_items(items, mode)

    # Add IDs, lifecycle fields, and affected sites
    now = datetime.now(timezone.utc)
    for item in items:
        if "id" not in item:
            item["id"] = id_maker(item)
        item.setdefault("status", "active")
        item.setdefault("first_seen", now.isoformat())
        item["last_seen"] = now.isoformat()
        item.setdefault("scan_count", 1)

        # Match nearby SKF sites if not already provided
        if "affected_sites" not in item:
            nearby = _match_affected_sites(item, mode)
            if nearby:
                item["affected_sites"] = nearby

    # Compute algorithmic severity scores (keeps AI severity intact)
    for item in items:
        item["computed_severity"] = compute_severity_score(item)

    # Tag potential duplicates
    tag_duplicates(items)

    return {
        "scan_id": scan_id,
        "mode": mode,
        "status": "completed",
        "source": "live",
        "progress": 100,
        "started_at": started_at.isoformat(),
        "completed_at": now.isoformat(),
        "scanned_at": now.isoformat(),
        "items": items,
        "count": len(items),
    }


_VALID_SEVERITIES = {"Critical", "High", "Medium", "Low"}

# Required fields per mode
_REQUIRED_FIELDS: dict[str, list[str]] = {
    "disruptions": ["event", "severity", "lat", "lng"],
    "geopolitical": ["risk", "risk_level", "lat", "lng"],
    "trade": ["event", "severity", "lat", "lng"],
}


def _validate_items(items: list[dict], mode: str) -> list[dict]:
    """Validate and filter scan result items. Drop malformed entries."""
    required = _REQUIRED_FIELDS.get(mode, ["lat", "lng"])
    valid = []

    for item in items:
        # Check required fields
        missing = [f for f in required if f not in item or item[f] is None]
        if missing:
            logger.warning("Dropping %s item missing fields %s: %s", mode, missing, (item.get("event") or item.get("risk") or "?")[:50])
            continue

        # Validate lat/lng ranges
        lat, lng = item.get("lat"), item.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            logger.warning("Dropping %s item with non-numeric lat/lng", mode)
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            logger.warning("Dropping %s item with out-of-range coords: lat=%s lng=%s", mode, lat, lng)
            continue

        # Normalize severity to title case
        sev_field = "risk_level" if mode == "geopolitical" else "severity"
        sev = item.get(sev_field, "Medium")
        if isinstance(sev, str):
            sev_title = sev.strip().title()
            if sev_title in _VALID_SEVERITIES:
                item[sev_field] = sev_title
            else:
                logger.warning("Unknown severity '%s' for %s, defaulting to Medium", sev, item.get("event", item.get("risk", "?")))
                item[sev_field] = "Medium"

        valid.append(item)

    if len(items) != len(valid):
        logger.info("Validated %s scan: %d/%d items passed", mode, len(valid), len(items))
    if len(valid) < 3:
        logger.warning("Low item count for %s scan: only %d valid items", mode, len(valid))
    elif len(valid) > 20:
        logger.warning("High item count for %s scan: %d items (expected 6-12)", mode, len(valid))

    return valid


def _parse_json_response(text: str, *, truncated: bool = False) -> list[dict]:
    """Extract a JSON array from Claude's response text.

    Handles cases where the JSON may be wrapped in markdown code fences,
    preceded by preamble text, or truncated mid-array due to max_tokens.
    """
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    # Try parsing candidate substrings from each '[' position.
    # Claude may include preamble text with stray brackets like
    # "Here are results [note: abbreviated]:" before the real JSON.
    end = text.rfind("]")
    if end != -1:
        pos = 0
        while True:
            start = text.find("[", pos)
            if start == -1 or start > end:
                break
            try:
                result = json.loads(text[start : end + 1])
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                pass
            pos = start + 1

    # If the response was truncated (max_tokens), try to recover complete
    # JSON objects from the partial array by closing it manually.
    if truncated:
        return _recover_truncated_json(text)

    logger.warning("No valid JSON array found in Claude response")
    return []


def _recover_truncated_json(text: str) -> list[dict]:
    """Recover complete JSON objects from a truncated JSON array.

    When Claude hits max_tokens, the response is cut mid-array like:
      [{...}, {...}, {"key": "val    <-- cut off here
    This finds the last complete object and closes the array.
    """
    # Find the start of the JSON array
    start = text.find("[")
    if start == -1:
        logger.warning("No JSON array start found in truncated response")
        return []

    fragment = text[start:]

    # Walk backwards from the end to find the last complete object boundary.
    # A complete object ends with '}' possibly followed by ',' or whitespace.
    # Find the last '}' that closes a top-level array element.
    depth = 0
    last_complete_end = -1
    in_string = False
    escape_next = False

    for i, ch in enumerate(fragment):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            if in_string:
                escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue

        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            # depth==1 means we just closed a top-level object in the array
            if depth == 1:
                last_complete_end = i

    if last_complete_end == -1:
        logger.warning("No complete objects found in truncated JSON")
        return []

    # Close the array after the last complete object
    repaired = fragment[: last_complete_end + 1] + "]"
    try:
        result = json.loads(repaired)
        if isinstance(result, list):
            logger.info("Recovered %d items from truncated JSON response", len(result))
            return result
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse repaired truncated JSON: %s", exc)

    return []
