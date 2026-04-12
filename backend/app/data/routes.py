"""Logistics route data — Python equivalent of frontend/src/data/logistics.ts.

Contains sea routes, air routes, chokepoints, and ports used by the
severity engine for routing-dependency scoring.
"""

from __future__ import annotations


# ── Chokepoints ──────────────────────────────────────────────────
# Each entry: (name, lat, lng)

CHOKEPOINTS: list[dict] = [
    {"name": "Suez Canal", "lat": 30.46, "lng": 32.34},
    {"name": "Str. of Malacca", "lat": 2.5, "lng": 101.2},
    {"name": "Rotterdam", "lat": 51.92, "lng": 4.48},
    {"name": "Taiwan Strait", "lat": 24.5, "lng": 119.5},
    {"name": "Str. of Hormuz", "lat": 26.57, "lng": 56.25},
    {"name": "Panama Canal", "lat": 9.08, "lng": -79.68},
    {"name": "Cape of Good Hope", "lat": -34.36, "lng": 18.49},
]


PORTS: list[dict] = [
    {"name": "Hamburg", "lat": 53.54, "lng": 9.97},
    {"name": "Gothenburg", "lat": 57.73, "lng": 11.94},
    {"name": "Antwerp", "lat": 51.26, "lng": 4.40},
    {"name": "Genoa", "lat": 44.41, "lng": 8.93},
    {"name": "Savannah", "lat": 32.08, "lng": -81.09},
    {"name": "Shanghai", "lat": 31.23, "lng": 121.47},
    {"name": "Ningbo", "lat": 29.87, "lng": 121.54},
    {"name": "Tanjung Pelepas", "lat": 1.36, "lng": 103.55},
    {"name": "Jebel Ali", "lat": 24.98, "lng": 55.03},
    {"name": "Nhava Sheva", "lat": 18.95, "lng": 72.95},
    {"name": "Itapoa", "lat": -26.12, "lng": -48.62},
]


AIRPORTS: list[dict] = [
    {"name": "Frankfurt (FRA)", "lat": 50.03, "lng": 8.57},
    {"name": "Atlanta (ATL)", "lat": 33.64, "lng": -84.43},
    {"name": "Mumbai (BOM)", "lat": 19.09, "lng": 72.87},
    {"name": "Gothenburg (GOT)", "lat": 57.73, "lng": 11.94},
    {"name": "Milan (MXP)", "lat": 45.63, "lng": 8.72},
    {"name": "Brussels (BRU)", "lat": 50.90, "lng": 4.48},
    {"name": "Shanghai (PVG)", "lat": 31.23, "lng": 121.47},
    {"name": "Dalian (DLC)", "lat": 38.97, "lng": 121.60},
]


# ── Sea Routes ──────────────────────────────────────────────────
# Each route: list of [lat, lng] waypoints, label, corridor code, origin factory

SEA_ROUTES: list[dict] = [
    {
        "pts": [[53.54, 9.97], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [36.0, -5.3], [36.5, -2.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [11.0, 51.0], [5.5, 77.0], [3.0, 80.0], [2.0, 90.0], [5.8, 94.0], [5.0, 97.5], [3.5, 100.5], [2.0, 102.5], [1.3, 103.8], [5.0, 108.0], [10.0, 112.0], [20.0, 117.0], [28.0, 122.0], [31.23, 121.47]],
        "label": "Hamburg->Shanghai", "corridor": "EU-CN", "origin": "Schweinfurt",
    },
    {
        "pts": [[53.54, 9.97], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [34.0, -12.0], [30.0, -20.0], [32.08, -81.09]],
        "label": "Hamburg->Savannah", "corridor": "EU-US", "origin": "Schweinfurt",
    },
    {
        "pts": [[57.73, 11.94], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [34.0, -12.0], [30.0, -20.0], [32.08, -81.09]],
        "label": "Gothenburg->Savannah", "corridor": "EU-US", "origin": "Gothenburg",
    },
    {
        "pts": [[29.87, 121.54], [20.0, 117.0], [10.0, 112.0], [5.0, 108.0], [1.3, 103.8], [2.0, 102.5], [3.5, 100.5], [5.0, 97.5], [5.8, 94.0], [2.0, 90.0], [3.0, 80.0], [5.5, 77.0], [11.0, 51.0], [12.6, 43.3], [14.0, 42.5], [29.9, 32.6], [31.3, 32.3], [33.0, 28.0], [36.0, 14.0], [37.5, 0.5], [36.5, -2.0], [36.0, -5.3], [36.2, -6.0], [36.8, -8.5], [40.0, -9.8], [34.0, -12.0], [30.0, -20.0], [32.08, -81.09]],
        "label": "Ningbo->Savannah", "corridor": "CN-US", "origin": "Xinchang",
    },
    {
        "pts": [[57.73, 11.94], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [36.0, -5.3], [36.5, -2.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [11.0, 51.0], [5.5, 77.0], [3.0, 80.0], [2.0, 90.0], [5.8, 94.0], [5.0, 97.5], [3.5, 100.5], [2.0, 102.5], [1.3, 103.8], [5.0, 108.0], [10.0, 112.0], [20.0, 117.0], [28.0, 122.0], [31.23, 121.47]],
        "label": "Gothenburg->Shanghai", "corridor": "EU-CN", "origin": "Gothenburg",
    },
    {
        "pts": [[44.41, 8.93], [43.0, 6.0], [40.0, 3.0], [37.5, 0.5], [36.5, -2.0], [36.0, -5.3], [36.2, -6.0], [36.8, -8.5], [40.0, -9.8], [34.0, -12.0], [30.0, -20.0], [32.08, -81.09]],
        "label": "Genoa->Savannah", "corridor": "EU-US", "origin": "Airasca",
    },
    {
        "pts": [[44.41, 8.93], [43.0, 6.0], [40.0, 3.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [11.0, 51.0], [5.5, 77.0], [3.0, 80.0], [2.0, 90.0], [5.8, 94.0], [5.0, 97.5], [3.5, 100.5], [2.0, 102.5], [1.3, 103.8], [5.0, 108.0], [10.0, 112.0], [20.0, 117.0], [28.0, 122.0], [31.23, 121.47]],
        "label": "Genoa->Shanghai", "corridor": "EU-CN", "origin": "Airasca",
    },
    {
        "pts": [[31.23, 121.47], [28.0, 122.0], [20.0, 117.0], [10.0, 112.0], [5.0, 108.0], [1.3, 103.8], [1.36, 103.55]],
        "label": "Shanghai->Tanjung Pelepas", "corridor": "CN-ASEAN", "origin": "Shanghai",
    },
    {
        "pts": [[51.26, 4.40], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [34.0, -12.0], [28.0, -17.0], [15.0, -25.0], [0.0, -20.0], [-15.0, -30.0], [-26.12, -48.62]],
        "label": "Antwerp->Itapoa", "corridor": "EU-BR", "origin": "Tongeren",
    },
    {
        "pts": [[57.73, 11.94], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [36.0, -5.3], [36.5, -2.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [11.0, 51.0], [5.5, 77.0], [3.0, 80.0], [2.0, 90.0], [5.8, 94.0], [5.0, 97.5], [3.5, 100.5], [2.0, 102.5], [1.3, 103.8], [1.36, 103.55]],
        "label": "Gothenburg->Tanjung Pelepas", "corridor": "EU-ASEAN", "origin": "Gothenburg",
    },
    {
        "pts": [[51.26, 4.40], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [36.0, -5.3], [36.5, -2.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [12.5, 45.0], [13.5, 48.5], [15.0, 52.0], [22.0, 60.0], [25.3, 57.0], [26.2, 56.4], [24.98, 55.03]],
        "label": "Antwerp->Jebel Ali", "corridor": "EU-ME", "origin": "Tongeren",
    },
    {
        "pts": [[57.73, 11.94], [56.0, 4.0], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [36.2, -6.0], [36.0, -5.3], [36.5, -2.0], [37.5, 0.5], [36.0, 14.0], [33.0, 28.0], [31.3, 32.3], [29.9, 32.6], [14.0, 42.5], [12.6, 43.3], [11.5, 47.0], [12.0, 52.0], [15.0, 62.0], [18.95, 72.95]],
        "label": "Gothenburg->Nhava Sheva", "corridor": "EU-IN", "origin": "Gothenburg",
    },
    {
        "pts": [[51.26, 4.40], [51.5, 1.5], [49.5, -5.0], [47.0, -6.5], [44.0, -9.5], [40.0, -9.8], [36.8, -8.5], [34.0, -12.0], [30.0, -20.0], [32.08, -81.09]],
        "label": "Antwerp->Savannah", "corridor": "EU-US", "origin": "Tongeren",
    },
    {
        "pts": [[31.23, 121.47], [28.0, 122.0], [20.0, 117.0], [10.0, 112.0], [5.0, 108.0], [1.3, 103.8], [2.0, 102.5], [3.5, 100.5], [5.0, 97.5], [5.8, 94.0], [2.0, 90.0], [3.0, 80.0], [5.5, 77.0], [11.0, 51.0], [12.6, 43.3], [14.0, 42.5], [29.9, 32.6], [31.3, 32.3], [33.0, 28.0], [36.0, 14.0], [37.5, 0.5], [36.5, -2.0], [36.0, -5.3], [36.2, -6.0], [36.8, -8.5], [40.0, -9.8], [44.0, -9.5], [47.0, -6.5], [49.5, -5.0], [51.5, 1.5], [51.26, 4.40]],
        "label": "Shanghai->Antwerp", "corridor": "CN-EU", "origin": "Shanghai",
    },
]


# ── Air Routes ──────────────────────────────────────────────────
# Each route: from [lat, lng], to [lat, lng], label, corridor, origin factory

AIR_ROUTES: list[dict] = [
    {"from": [50.03, 8.57], "to": [33.64, -84.43], "label": "Frankfurt->Atlanta", "corridor": "EU-US", "origin": "Schweinfurt"},
    {"from": [50.03, 8.57], "to": [19.09, 72.87], "label": "Frankfurt->Mumbai", "corridor": "EU-IN", "origin": "Schweinfurt"},
    {"from": [57.73, 11.94], "to": [19.09, 72.87], "label": "Gothenburg->Mumbai", "corridor": "EU-IN", "origin": "Gothenburg"},
    {"from": [45.63, 8.72], "to": [31.23, 121.47], "label": "Milan->Shanghai", "corridor": "EU-CN", "origin": "Airasca"},
    {"from": [50.90, 4.48], "to": [31.23, 121.47], "label": "Brussels->Shanghai", "corridor": "EU-CN", "origin": "Tongeren"},
    {"from": [31.23, 121.47], "to": [19.09, 72.87], "label": "Shanghai->Mumbai", "corridor": "CN-IN", "origin": "Xinchang"},
    {"from": [38.97, 121.60], "to": [19.09, 72.87], "label": "Dalian->Mumbai", "corridor": "CN-IN", "origin": "Dalian"},
    {"from": [50.03, 8.57], "to": [31.23, 121.47], "label": "Frankfurt->Shanghai", "corridor": "EU-CN", "origin": "Schweinfurt"},
    {"from": [57.73, 11.94], "to": [31.23, 121.47], "label": "Gothenburg->Shanghai", "corridor": "EU-CN", "origin": "Gothenburg"},
    {"from": [45.63, 8.72], "to": [19.09, 72.87], "label": "Milan->Mumbai", "corridor": "EU-IN", "origin": "Airasca"},
]


# ── Pre-computed: which origins use which routes ─────────────────
# Maps factory/origin name -> list of route indices (combined sea + air)

def _build_origin_route_index() -> dict[str, list[int]]:
    """Build a lookup: origin -> list of (route_type, route_index)."""
    index: dict[str, list[tuple[str, int]]] = {}
    for i, route in enumerate(SEA_ROUTES):
        origin = route["origin"]
        index.setdefault(origin, []).append(("sea", i))
    for i, route in enumerate(AIR_ROUTES):
        origin = route["origin"]
        index.setdefault(origin, []).append(("air", i))
    return index


ORIGIN_ROUTE_INDEX = _build_origin_route_index()


# ── Chokepoint proximity threshold (km) ──────────────────────────
# A disruption within this distance of a chokepoint is considered
# to affect all routes passing through that chokepoint.
CHOKEPOINT_PROXIMITY_KM = 500.0

# Route waypoint proximity threshold (km) — disruption near a waypoint
# means the route segment is affected
ROUTE_WAYPOINT_PROXIMITY_KM = 300.0
