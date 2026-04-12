"""Algorithmic severity scoring engine.

Replaces AI-assigned severities with a deterministic score based on:
    Severity = f(Event Magnitude, Proximity, Asset Criticality, Supply Chain Impact)

Returns a numeric score (0-100) and a severity label.
"""

from __future__ import annotations

import math
from typing import Any

from ..data import load_sites, load_suppliers, BU_MAP, SUPPLY_GRAPH
from ..utils.geo import haversine_km

# ── Asset criticality weights by site type ──────────────────────
# Manufacturing and aerospace sites are mission-critical (1.0),
# logistics hubs are important (0.7), sales/admin are lower priority.
SITE_TYPE_CRITICALITY: dict[str, float] = {
    "mfg": 1.0,
    "va": 0.8,       # value-added services
    "service": 0.7,
    "log": 0.7,
    "sales": 0.3,
    "admin": 0.1,
    "other": 0.2,
}

# Business-unit criticality multiplier (aerospace = premium)
BU_CRITICALITY: dict[str, float] = {
    "ind": 1.0,        # Industrial bearings — core business
    "sis-aero": 1.0,   # Aerospace — safety-critical, high margin
    "sis-seal": 0.8,
    "sis-lube": 0.7,
    "sis-mag": 0.6,
}

# ── Event magnitude by category ─────────────────────────────────
# Base magnitude for each disruption category (0.0-1.0)
CATEGORY_MAGNITUDE: dict[str, float] = {
    "Natural Disaster": 0.9,
    "Geopolitical": 0.8,
    "Logistics/Port": 0.7,
    "Labour/Strike": 0.6,
    "Trade Policy": 0.5,
    "Currency": 0.4,
    "Other": 0.5,
    # Geopolitical mode
    "Critical": 0.9,
    "High": 0.7,
    "Medium": 0.5,
    "Low": 0.3,
    # Trade mode
    "Tariffs": 0.7,
    "Anti-Dumping": 0.6,
    "Export Controls": 0.8,
    "FTA": 0.4,
    "Sanctions": 0.9,
}

# Severity label from AI as a magnitude hint (fallback)
_SEVERITY_MAGNITUDE: dict[str, float] = {
    "Critical": 1.0,
    "High": 0.75,
    "Medium": 0.5,
    "Low": 0.25,
}

# ── Supplier tier criticality multipliers ──────────────────────
# Applied to supply_chain_impact based on the highest-tier input
# sourced from the disrupted region by affected sites.
# Tier 1 sole-source = maximum risk amplification (1.5x)
# Tier 1 non-sole-source = elevated risk (1.2x)
# Tier 2 = baseline (1.0x, no change)
# Tier 3 = commodity/replaceable, slightly reduces severity (0.8x)
TIER_MULTIPLIER: dict[str, float] = {
    "tier1_sole": 1.5,
    "tier1": 1.2,
    "tier2": 1.0,
    "tier3": 0.8,
}

# Blast radius for proximity scoring (km)
_MAX_PROXIMITY_KM = 3000.0


# Re-export for backward compatibility (tests import _haversine_km from here)
_haversine_km = haversine_km


def _proximity_score(distance_km: float) -> float:
    """Score from 1.0 (on top of site) to 0.0 (beyond max radius).

    Uses square-root decay for realistic threat modeling.
    """
    if distance_km <= 0:
        return 1.0
    if distance_km >= _MAX_PROXIMITY_KM:
        return 0.0
    # Smooth decay: 1 - (d / max)^0.5  (square-root gives gentler falloff)
    return 1.0 - (distance_km / _MAX_PROXIMITY_KM) ** 0.5


def _site_criticality(site: dict) -> float:
    """Compute criticality weight for a single site."""
    type_weight = SITE_TYPE_CRITICALITY.get(site.get("type", "other"), 0.2)
    bu = site.get("business_unit")
    bu_weight = BU_CRITICALITY.get(bu, 0.5) if bu else 0.5
    return type_weight * bu_weight


def _get_tier_multiplier(affected_sites: list[dict], event: dict) -> float:
    """Determine the supply chain tier multiplier based on SUPPLY_GRAPH tiering.

    For each affected site in the SUPPLY_GRAPH, checks if the event's region
    overlaps with any supplier countries and what tier those inputs are.
    Returns the highest (worst-case) multiplier found.

    The event region is matched against supplier countries in the graph entry
    to determine which inputs are at risk.
    """
    event_region = (event.get("region") or "").strip()
    if not event_region or not affected_sites:
        return TIER_MULTIPLIER["tier2"]  # no data → neutral

    worst_multiplier = TIER_MULTIPLIER["tier3"]  # start optimistic

    for site in affected_sites:
        site_name = site.get("name", "")
        graph_entry = SUPPLY_GRAPH.get(site_name)
        if not graph_entry or "input_details" not in graph_entry:
            continue

        sup_countries = graph_entry.get("sup", [])

        # Check if the event region matches any supplier country for this site.
        # Region can be a country name ("Germany") or broad region ("Europe").
        # We do a simple substring/containment check both ways.
        region_lower = event_region.lower()
        matched_country = False
        for country in sup_countries:
            country_lower = country.lower()
            if country_lower in region_lower or region_lower in country_lower:
                matched_country = True
                break

        if not matched_country:
            continue

        # This site sources from the disrupted region — check input tiers
        for detail in graph_entry["input_details"]:
            tier = detail.get("tier", 2)
            sole = detail.get("sole_source", False)
            if tier == 1 and sole:
                return TIER_MULTIPLIER["tier1_sole"]  # max — early exit
            elif tier == 1:
                worst_multiplier = max(worst_multiplier, TIER_MULTIPLIER["tier1"])
            elif tier == 2:
                worst_multiplier = max(worst_multiplier, TIER_MULTIPLIER["tier2"])
            # tier 3 already at baseline

    return worst_multiplier


def compute_severity_score(event: dict) -> dict[str, Any]:
    """Compute an algorithmic severity score for a disruption event.

    Args:
        event: dict with at minimum lat, lng. Optional fields:
            - category / severity / risk_level: used for magnitude
            - affected_sites: pre-computed list of {name, type, distance_km}
              (if absent, will be computed from lat/lng)

    Returns:
        {
            "score": float (0-100),
            "label": str ("Critical" | "High" | "Medium" | "Low"),
            "components": {
                "magnitude": float (0-1),
                "proximity": float (0-1),
                "asset_criticality": float (0-1),
                "supply_chain_impact": float (0-1),
            },
            "affected_site_count": int,
        }
    """
    # ── 1. Event Magnitude (0-1) ──
    category = event.get("category", "")
    magnitude = CATEGORY_MAGNITUDE.get(category, 0.5)

    # Boost/adjust based on AI-assigned severity if available
    ai_severity = event.get("severity") or event.get("risk_level", "")
    ai_mag = _SEVERITY_MAGNITUDE.get(ai_severity, 0.5)
    # Blend: 60% category-based, 40% AI-severity hint
    magnitude = 0.6 * magnitude + 0.4 * ai_mag

    # Trend adjustment: escalating events score higher
    trend = (event.get("trend") or "").lower()
    if trend == "escalating":
        magnitude = min(1.0, magnitude * 1.15)
    elif trend == "de-escalating":
        magnitude *= 0.85

    # ── 2. Proximity & Asset Criticality (need sites) ──
    lat = event.get("lat")
    lng = event.get("lng")

    # Use pre-computed sites if the field exists (even if empty),
    # otherwise compute from coordinates
    has_precomputed = "affected_sites" in event
    affected_sites = event.get("affected_sites", [])

    if not has_precomputed and lat is not None and lng is not None:
        all_sites = load_sites()
        for site in all_sites:
            dist = _haversine_km(lat, lng, site["lat"], site["lng"])
            if dist <= _MAX_PROXIMITY_KM:
                affected_sites.append({
                    "name": site["name"],
                    "type": site.get("type", "other"),
                    "distance_km": round(dist, 1),
                    "business_unit": site.get("business_unit"),
                })

    if affected_sites:
        # Proximity: weighted average of proximity scores, biased toward closest
        prox_scores = []
        crit_scores = []
        for site in affected_sites:
            dist = site.get("distance_km", _MAX_PROXIMITY_KM)
            prox = _proximity_score(dist)
            crit = _site_criticality(site)
            prox_scores.append(prox)
            crit_scores.append(crit * prox)  # weight criticality by proximity

        # Use max proximity (closest site matters most) blended with mean
        proximity = 0.7 * max(prox_scores) + 0.3 * (sum(prox_scores) / len(prox_scores))
        asset_criticality = max(crit_scores)  # worst-case criticality
    else:
        proximity = 0.0
        asset_criticality = 0.0

    # ── 3. Supply Chain Impact (0-1) ──
    # Based on number of affected sites, their types, and supplier tiering.
    # The tier multiplier amplifies or dampens impact based on whether
    # affected sites source critical (Tier 1) or commodity (Tier 3) inputs
    # from the disrupted region.
    mfg_count = sum(1 for s in affected_sites if s.get("type") == "mfg")
    total_affected = len(affected_sites)

    # Logarithmic scaling: 1 site = 0.3, 5 sites = 0.7, 10+ = 0.9
    if total_affected == 0:
        supply_chain_impact = 0.0
    else:
        base_impact = min(1.0, 0.3 + 0.4 * math.log(1 + total_affected) / math.log(11))
        # Manufacturing sites count double
        mfg_bonus = min(0.3, mfg_count * 0.1)
        supply_chain_impact = min(1.0, base_impact + mfg_bonus)

    # Apply supplier tier multiplier to supply_chain_impact
    tier_mult = _get_tier_multiplier(affected_sites, event)
    supply_chain_impact = min(1.0, supply_chain_impact * tier_mult)

    # ── Combine into final score (0-100) ──
    # Weights: magnitude 30%, proximity 25%, criticality 25%, supply chain 20%
    raw_score = (
        0.30 * magnitude
        + 0.25 * proximity
        + 0.25 * asset_criticality
        + 0.20 * supply_chain_impact
    )
    score = round(raw_score * 100, 1)
    score = max(0, min(100, score))

    # ── Map to label ──
    if score >= 75:
        label = "Critical"
    elif score >= 50:
        label = "High"
    elif score >= 25:
        label = "Medium"
    else:
        label = "Low"

    # ── Practitioner dimensions ──
    # Probability (0-1): based on trend and category likelihood
    _CATEGORY_PROBABILITY: dict[str, float] = {
        "Natural Disaster": 0.9,   # already occurring
        "Geopolitical": 0.6,
        "Logistics/Port": 0.7,
        "Labour/Strike": 0.6,
        "Trade Policy": 0.7,       # announced / legislated
        "Currency": 0.5,
        "Other": 0.5,
        "Critical": 0.9,
        "High": 0.7,
        "Medium": 0.5,
        "Low": 0.3,
        "Tariffs": 0.8,
        "Anti-Dumping": 0.6,
        "Export Controls": 0.7,
        "FTA": 0.4,
        "Sanctions": 0.85,
    }
    trend_factor = 0.8 if trend == "escalating" else 0.2 if trend == "de-escalating" else 0.5
    cat_prob = _CATEGORY_PROBABILITY.get(category, 0.5)
    probability = round(min(1.0, trend_factor * 0.4 + cat_prob * 0.6), 3)

    # Impact magnitude (0-1): site count, criticality, manufacturing weight
    if total_affected == 0:
        impact_magnitude = round(magnitude * 0.3, 3)  # residual from event magnitude
    else:
        site_scale = min(1.0, total_affected / 20.0)  # 20 sites = max
        mfg_ratio = mfg_count / total_affected if total_affected else 0.0
        impact_magnitude = round(min(1.0, 0.3 * site_scale + 0.4 * asset_criticality + 0.3 * mfg_ratio), 3)

    # Velocity of onset
    _CATEGORY_VELOCITY: dict[str, str] = {
        "Natural Disaster": "immediate",
        "Geopolitical": "days",
        "Logistics/Port": "days",
        "Labour/Strike": "days",
        "Trade Policy": "weeks",
        "Currency": "months",
        "Other": "weeks",
        "Critical": "immediate",
        "High": "days",
        "Medium": "weeks",
        "Low": "months",
        "Tariffs": "weeks",
        "Anti-Dumping": "weeks",
        "Export Controls": "days",
        "FTA": "months",
        "Sanctions": "days",
    }
    velocity = _CATEGORY_VELOCITY.get(category, "unknown")

    # Recovery estimate
    _BASE_RECOVERY: dict[str, str] = {
        "Natural Disaster": "weeks",
        "Geopolitical": "months",
        "Logistics/Port": "weeks",
        "Labour/Strike": "days",
        "Trade Policy": "months",
        "Currency": "months",
        "Other": "weeks",
        "Critical": "months",
        "High": "weeks",
        "Medium": "days",
        "Low": "days",
        "Tariffs": "months",
        "Anti-Dumping": "months",
        "Export Controls": "months",
        "FTA": "weeks",
        "Sanctions": "months",
    }
    recovery_estimate = _BASE_RECOVERY.get(category, "unknown")
    # Upgrade recovery if score is very high
    if score >= 75 and recovery_estimate in ("days", "hours"):
        recovery_estimate = "weeks"
    elif score >= 50 and recovery_estimate == "hours":
        recovery_estimate = "days"

    return {
        "score": score,
        "label": label,
        "components": {
            "magnitude": round(magnitude, 3),
            "proximity": round(proximity, 3),
            "asset_criticality": round(asset_criticality, 3),
            "supply_chain_impact": round(supply_chain_impact, 3),
        },
        "affected_site_count": total_affected,
        "probability": probability,
        "impact_magnitude": impact_magnitude,
        "velocity": velocity,
        "recovery_estimate": recovery_estimate,
    }
