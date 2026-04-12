"""Supplier-factory relationship endpoints.

Exposes supplier data per site with spend shown ONLY as percentages.
No raw spend figures are ever returned in any response.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..data import load_sites
from ..db.database import (
    get_event,
    get_exposed_factories,
    get_site_suppliers,
    get_site_suppliers_by_country,
    get_supplier_concentration,
    get_supplier_country_spend_shares,
    get_supplier_relationship_stats,
    get_suppliers_by_country,
    get_events,
    resolve_site_code,
)

router = APIRouter(tags=["supplier-sites"])


def _find_site(site_id: str) -> dict | None:
    """Find a site by name or operational unit code (case-insensitive)."""
    sites = load_sites()
    # Exact name match
    for s in sites:
        if s["name"].lower() == site_id.lower():
            return s
    # Partial name match
    for s in sites:
        if site_id.lower() in s["name"].lower():
            return s
    return None


def _resolve_site_id_for_db(site_id: str) -> str:
    """Resolve a site_id to the operational unit code used in supplier_relationships.

    The supplier_relationships table uses operational unit codes (e.g., '130M')
    while the sites data uses display names (e.g., 'Gothenburg'). This function
    checks if the given ID already exists as an operational unit code in the DB,
    and returns it directly if so. Otherwise returns the input as-is.
    """
    return site_id  # DB uses operational unit codes — pass through


@router.get("/sites/{site_id}/suppliers")
async def site_suppliers(site_id: str):
    """All suppliers for a factory. Spend shown as percentages only.

    Returns site info, summary stats, individual suppliers with spend_pct,
    by_country aggregation, and active risk flags.
    """
    # Decode URL-encoded site_id (e.g. "Gothenburg%20MFG" -> "Gothenburg MFG")
    from urllib.parse import unquote
    site_id_decoded = unquote(site_id)

    # Resolve display name to operational unit code (e.g. "Gothenburg" -> "109G")
    db_site_id = resolve_site_code(site_id_decoded) or site_id_decoded

    suppliers = get_site_suppliers(db_site_id)
    by_country = get_site_suppliers_by_country(db_site_id)

    # Find site metadata for the response
    site = _find_site(site_id_decoded)

    if not suppliers:
        site_meta = {
            "site_id": db_site_id,
            "country": site["iso"] if site else "",
            "business_unit": site.get("business_unit") if site else None,
        }
        return {
            "site": site_meta,
            "summary": {
                "total_suppliers": 0,
                "total_countries": 0,
                "concentration_score": 0,
                "top_country": None,
                "top_country_spend_pct": 0,
                "active_disruptions_affecting": 0,
            },
            "suppliers": [],
            "by_country": [],
        }

    # Count unique suppliers and countries
    unique_suppliers = len({s["supplier_name"] for s in suppliers})
    unique_countries = len({s["country"] for s in suppliers})

    # Concentration score (HHI-based) for this site
    country_shares = [c["spend_pct"] for c in by_country]
    hhi = sum(s ** 2 for s in country_shares)
    concentration_score = round(min(hhi / 100, 100.0), 1)

    # Top country
    top_country_entry = by_country[0] if by_country else None

    # Check active disruptions that affect supplier countries
    active_events = get_events(status="active")
    affected_countries = {c["country"] for c in by_country}
    disruptions_affecting = 0
    for evt in active_events:
        evt_region = evt.get("region", "")
        for country in affected_countries:
            if country.lower() in evt_region.lower() or evt_region.lower() in country.lower():
                disruptions_affecting += 1
                break

    # Annotate by_country with active disruption flags
    for entry in by_country:
        has_disruption = False
        for evt in active_events:
            evt_region = evt.get("region", "")
            if entry["country"].lower() in evt_region.lower() or evt_region.lower() in entry["country"].lower():
                has_disruption = True
                break
        entry["has_active_disruption"] = has_disruption

    return {
        "site": {
            "site_id": db_site_id,
            "country": site["iso"] if site else "",
            "business_unit": site.get("business_unit") if site else None,
        },
        "summary": {
            "total_suppliers": unique_suppliers,
            "total_countries": unique_countries,
            "concentration_score": concentration_score,
            "top_country": top_country_entry["country"] if top_country_entry else None,
            "top_country_spend_pct": top_country_entry["spend_pct"] if top_country_entry else 0,
            "active_disruptions_affecting": disruptions_affecting,
        },
        "suppliers": [
            {
                "supplier_name": s["supplier_name"],
                "country": s["country"],
                "category_l1": s["category_l1"],
                "category_l2": s["category_l2"],
                "spend_pct": s["spend_pct"],
            }
            for s in suppliers
        ],
        "by_country": by_country,
    }


@router.get("/suppliers/exposed")
async def exposed_suppliers(
    event_id: str = Query(..., description="Event ID to check supplier exposure for"),
):
    """Which factories are exposed through supplier relationships to a disruption's region?

    Given an event, finds all factories that source from the event's region/country
    and returns their exposure as spend percentages.
    """
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")

    region = event.get("region", "")
    if not region:
        return {"event_id": event_id, "region": "", "exposed_factories": []}

    exposed = get_exposed_factories(region)

    # Also try querying by country names within the region string
    # (region might be "Turkey" or "Middle East" etc.)
    if not exposed:
        # Try direct country match via suppliers_by_country
        supplier_links = get_suppliers_by_country(region)
        # Group by site
        from collections import defaultdict
        site_groups: dict[str, list] = defaultdict(list)
        for link in supplier_links:
            site_groups[link["site_id"]].append(link)

        exposed = [
            {
                "site_id": site_id,
                "supplier_country": region,
                "supplier_count": len(links),
                "exposed_spend_pct": round(sum(l["spend_pct"] for l in links), 2),
                "event_id": event_id,
                "event_title": event.get("event", event.get("risk", "Unknown")),
                "severity": event.get("severity", event.get("risk_level", "Medium")),
            }
            for site_id, links in site_groups.items()
        ]
        exposed.sort(key=lambda x: -x["exposed_spend_pct"])

    return {
        "event_id": event_id,
        "region": region,
        "exposed_factories": exposed,
    }


@router.get("/suppliers/spend-by-country")
async def supplier_spend_by_country():
    """Spend share per supplier country as percentage of total global spend.

    Used by the frontend to modulate supplier bubble color intensity.
    """
    shares = get_supplier_country_spend_shares()
    return {"countries": shares}


@router.get("/suppliers/concentration")
async def supplier_concentration():
    """Concentration risk score per site (HHI-based).

    Returns all sites with supplier data, ranked by concentration risk.
    Higher score = more concentrated = higher risk.
    """
    concentration = get_supplier_concentration()
    return {
        "sites": concentration,
        "total_sites": len(concentration),
    }


@router.get("/suppliers/relationships/stats")
async def supplier_relationship_stats():
    """Summary stats about loaded supplier relationship data."""
    return get_supplier_relationship_stats()
