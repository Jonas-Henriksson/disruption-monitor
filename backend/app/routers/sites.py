"""Sites endpoint -- returns all SKF sites with stats."""

from fastapi import APIRouter

from ..data import load_sites

router = APIRouter(tags=["sites"])


@router.get("/sites")
async def get_sites():
    """Return all SKF sites with precomputed statistics."""
    sites = load_sites()

    # Compute stats
    type_counts: dict[str, int] = {}
    region_counts: dict[str, int] = {}
    country_set: set[str] = set()

    for site in sites:
        t = site["type"]
        r = site["region"]
        type_counts[t] = type_counts.get(t, 0) + 1
        region_counts[r] = region_counts.get(r, 0) + 1
        country_set.add(site["country"])

    return {
        "sites": sites,
        "stats": {
            "by_type": type_counts,
            "by_region": region_counts,
            "countries": len(country_set),
        },
        "total": len(sites),
    }
