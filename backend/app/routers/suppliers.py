"""Suppliers endpoint -- returns aggregated supplier data by country."""

from __future__ import annotations

import math

from fastapi import APIRouter, HTTPException, Query

from ..data import load_suppliers
from ..models.schemas import SupplierAlternativesResponse
from ..utils.geo import haversine_km

router = APIRouter(tags=["suppliers"])

# ── Region adjacency map ────────────────────────────────────────
# Defines which regions are considered "adjacent" for fallback sourcing.
# Order matters: first entry is the closest alternative, last is furthest.
ADJACENT_REGIONS: dict[str, list[str]] = {
    "EU": ["MEA", "AM", "AF", "APAC"],
    "APAC": ["MEA", "EU", "AF", "AM"],
    "AM": ["EU", "MEA", "APAC", "AF"],
    "MEA": ["EU", "AF", "APAC", "AM"],
    "AF": ["MEA", "EU", "APAC", "AM"],
}


@router.get("/suppliers")
async def get_suppliers():
    """Return supplier summary data aggregated by country."""
    suppliers = load_suppliers()
    total = sum(s["count"] for s in suppliers)
    max_count = max(s["count"] for s in suppliers) if suppliers else 0

    return {
        "suppliers": suppliers,
        "total": total,
        "max_count": max_count,
        "countries": len(suppliers),
    }


@router.get("/suppliers/alternatives", response_model=SupplierAlternativesResponse)
async def get_supplier_alternatives(
    country: str | None = Query(None, description="Disrupted country name (e.g. 'Turkey')"),
    region: str | None = Query(None, description="Disrupted region code (e.g. 'APAC', 'EU')"),
    limit: int = Query(10, ge=1, le=50, description="Max alternatives to return"),
):
    """Return ranked supplier alternatives for a disrupted country or region.

    Given a disrupted country, returns other countries (same region first,
    then adjacent regions) ranked by category overlap and supplier density.

    Given a disrupted region, returns top countries outside that region
    ranked by supplier density with category coverage.

    At least one of `country` or `region` must be provided. If both are
    given, `country` takes precedence and `region` is used only as a
    fallback if the country isn't found.
    """
    if not country and not region:
        raise HTTPException(
            status_code=400,
            detail="At least one of 'country' or 'region' query parameters is required.",
        )

    suppliers = load_suppliers()
    suppliers_by_country: dict[str, dict] = {s["country"]: s for s in suppliers}

    if country:
        return _alternatives_for_country(country, region, suppliers, suppliers_by_country, limit)
    else:
        return _alternatives_for_region(region, suppliers, suppliers_by_country, limit)  # type: ignore[arg-type]


def _alternatives_for_country(
    country: str,
    region_hint: str | None,
    suppliers: list[dict],
    by_country: dict[str, dict],
    limit: int,
) -> dict:
    """Find alternative sourcing countries when a specific country is disrupted."""
    disrupted = by_country.get(country)

    if disrupted is None:
        # Country not in our supplier data — maybe they spelled it differently.
        # Try case-insensitive match.
        for key, val in by_country.items():
            if key.lower() == country.lower():
                disrupted = val
                country = key
                break

    if disrupted is None:
        raise HTTPException(
            status_code=404,
            detail=f"Country '{country}' not found in supplier database. "
            f"Available: {', '.join(sorted(by_country.keys()))}",
        )

    disrupted_region = disrupted["region"]
    disrupted_categories = set(disrupted.get("top_categories", []))
    disrupted_lat, disrupted_lng = disrupted["lat"], disrupted["lng"]

    # Build candidate list: all countries except the disrupted one
    candidates = [s for s in suppliers if s["country"] != country]

    # Score and rank each candidate
    scored = []
    for cand in candidates:
        cand_categories = set(cand.get("top_categories", []))
        overlap = sorted(disrupted_categories & cand_categories)
        overlap_pct = (len(overlap) / len(disrupted_categories) * 100) if disrupted_categories else 0.0

        distance = haversine_km(disrupted_lat, disrupted_lng, cand["lat"], cand["lng"])

        # Composite ranking: prioritize category overlap, then same region, then density
        same_region_bonus = 1.0 if cand["region"] == disrupted_region else 0.0
        adjacent_bonus = 0.5 if cand["region"] in ADJACENT_REGIONS.get(disrupted_region, [])[:2] else 0.0
        region_score = same_region_bonus + adjacent_bonus

        # Score: overlap_pct (0-100) + region affinity (0-150) + density log bonus
        density_score = math.log1p(cand["count"]) * 5  # ~0-35 for our data
        score = overlap_pct * 2 + region_score * 100 + density_score

        scored.append({
            "country": cand["country"],
            "region": cand["region"],
            "supplier_count": cand["count"],
            "distance_km": round(distance, 0),
            "category_overlap": overlap,
            "overlap_pct": round(overlap_pct, 1),
            "_score": score,
        })

    # Sort by composite score descending, break ties by distance ascending
    scored.sort(key=lambda x: (-x["_score"], x["distance_km"]))

    # Strip internal score field
    alternatives = [{k: v for k, v in s.items() if k != "_score"} for s in scored[:limit]]

    return {
        "disrupted": {
            "country": country,
            "region": disrupted_region,
            "supplier_count": disrupted["count"],
            "categories": sorted(disrupted_categories),
        },
        "alternatives": alternatives,
    }


def _alternatives_for_region(
    region: str,
    suppliers: list[dict],
    by_country: dict[str, dict],
    limit: int,
) -> dict:
    """Find alternative sourcing countries when an entire region is disrupted."""
    valid_regions = sorted({s["region"] for s in suppliers})
    region_upper = region.upper()

    if region_upper not in {r.upper() for r in valid_regions}:
        raise HTTPException(
            status_code=404,
            detail=f"Region '{region}' not found. Valid regions: {', '.join(valid_regions)}",
        )

    # Normalize to actual case
    region_key = next(r for r in valid_regions if r.upper() == region_upper)

    # Collect disrupted stats
    disrupted_suppliers = [s for s in suppliers if s["region"] == region_key]
    outside_suppliers = [s for s in suppliers if s["region"] != region_key]

    disrupted_count = sum(s["count"] for s in disrupted_suppliers)
    disrupted_categories = set()
    for s in disrupted_suppliers:
        disrupted_categories.update(s.get("top_categories", []))

    # Compute centroid of disrupted region for distance calc
    if disrupted_suppliers:
        centroid_lat = sum(s["lat"] for s in disrupted_suppliers) / len(disrupted_suppliers)
        centroid_lng = sum(s["lng"] for s in disrupted_suppliers) / len(disrupted_suppliers)
    else:
        centroid_lat, centroid_lng = 0.0, 0.0

    # Rank outside countries by supplier density with category overlap
    scored = []
    for cand in outside_suppliers:
        cand_categories = set(cand.get("top_categories", []))
        overlap = sorted(disrupted_categories & cand_categories)
        overlap_pct = (len(overlap) / len(disrupted_categories) * 100) if disrupted_categories else 0.0

        distance = haversine_km(centroid_lat, centroid_lng, cand["lat"], cand["lng"])

        # For region-level disruption, density matters most
        density_score = math.log1p(cand["count"]) * 10
        score = overlap_pct + density_score

        scored.append({
            "country": cand["country"],
            "region": cand["region"],
            "supplier_count": cand["count"],
            "distance_km": round(distance, 0),
            "category_overlap": overlap,
            "overlap_pct": round(overlap_pct, 1),
            "_score": score,
        })

    scored.sort(key=lambda x: (-x["_score"], x["distance_km"]))
    alternatives = [{k: v for k, v in s.items() if k != "_score"} for s in scored[:limit]]

    return {
        "disrupted": {
            "region": region_key,
            "supplier_count": disrupted_count,
            "categories": sorted(disrupted_categories),
        },
        "alternatives": alternatives,
    }
