# Corridor Risk Strip — Design Spec

**Date:** 2026-04-17
**Status:** Approved

## Problem

The Trade scan surfaces individual tariff/policy events, but there's no way to see corridor-level trajectory at a glance. A VP checking Trade mode sees a list of events but can't quickly answer "are US-China tariffs getting worse?" without reading through multiple events and mentally aggregating.

A separate tariff matrix page was considered and rejected by CxO review: nobody opens reference pages unprompted, and no public API provides real-time bilateral tariff rates (WTO/WITS lag 1-2 years, MacMap has no API). Exact tariff percentages are unreliable without manual customs law expertise. What IS reliable: trajectory tracking ("escalating", "stable", "de-escalating") derived from the events our scanner already produces.

## Solution

A **Corridor Risk Strip** — a compact horizontal row of corridor pills shown in Trade mode only, between the Executive Hero panel and the FeedList. Each pill represents a trade corridor (e.g., US-CN, EU-US) with its friction level and trend direction. Clicking a pill filters the feed and opens a corridor detail panel in the sidebar.

No separate page. No manually curated tariff rates. Everything derived from existing trade scan data.

## Placement

```
TopBar
[Scan Progress Bar]
[Executive Hero Panel]
[Corridor Risk Strip]        <- NEW (Trade mode only, ~40px)
[FeedList (65%) | Sidebar (35%)]
```

Only visible when `mode === 'trade'`. Hidden in Disruptions mode.

## Corridor Risk Strip (~40px tall)

Horizontal scrollable row of corridor pills, sorted by friction severity (worst first):

```
[US-CN ^ High] [EU-CN ^ High] [EU-US - Moderate] [JP-CN v Low] [EU-IN - Low] ...
```

Each pill shows:
- Corridor code (e.g., "US-CN")
- Trend arrow: up = escalating, dash = stable, down = de-escalating
- Friction level as background color (same color scale as severity)
- Small event count badge if > 1 event

### Click behavior

Clicking a corridor pill:
1. Filters FeedList to only show trade events matching that corridor
2. Replaces RiskSummary in sidebar with a CorridorDetail panel

Clicking again (or clicking "Clear filter") deselects and restores normal view.

## Corridor Detail Panel (sidebar, replaces RiskSummary when active)

Shows when a corridor is selected:

```
[< Back]  US-CN  United States - China
[===========================] Friction: HIGH

^ Escalating — tariffs increased 3x in last 90 days

"US-China trade tensions driving 30-45% combined tariff
rates on industrial goods, with export controls tightening
on critical materials."
(from top trade event description)

Affected SKF Sites (8):
  Dalian MFG, Shanghai Sales, ...

Related Events (4):
  [Crit] US-China Trade Policy Escalation
  [High] China Export Controls on Germanium
  [High] US Anti-Dumping Review on Bearings
  [Med]  RCEP Implementation Delays

[Clear filter]
```

Content:
- Corridor name + human-readable label
- Friction gauge (visual bar, colored)
- Trend + trajectory sentence (AI-generated, pulled from top event's description)
- Affected SKF sites (derived from SUPPLY_GRAPH by matching corridor regions)
- List of trade events in this corridor (clickable, scrolls feed to that event)
- Clear filter button

## Data Model

### Corridor-to-country mapping

Hardcoded in `corridors.py` (~15 entries):

```python
CORRIDOR_MAP = {
    "EU-CN": {"label": "Europe - China", "from_regions": ["Europe"], "to_regions": ["China"]},
    "US-CN": {"label": "United States - China", "from_regions": ["Americas"], "to_regions": ["China"]},
    "EU-US": {"label": "Europe - United States", "from_regions": ["Europe"], "to_regions": ["Americas"]},
    "JP-CN": {"label": "Japan - China", "from_regions": ["APAC"], "to_regions": ["China"]},
    "EU-IN": {"label": "Europe - India", "from_regions": ["Europe"], "to_regions": ["India"]},
    "US-MX": {"label": "United States - Mexico", "from_regions": ["Americas"], "to_regions": ["Americas"]},
    "EU-RU": {"label": "Europe - Russia", "from_regions": ["Europe"], "to_regions": ["Europe", "MEA"]},
    "GLOBAL": {"label": "Global", "from_regions": [], "to_regions": []},
}
```

Additional corridors auto-discovered from trade events with unknown codes get a generic label.

### API endpoint

`GET /api/v1/events/corridor-summary`

```json
{
  "corridors": [
    {
      "corridor": "US-CN",
      "label": "United States - China",
      "friction_level": "High",
      "trend": "Escalating",
      "event_count": 4,
      "top_event": "US-China Trade Policy Escalation",
      "top_event_id": "us-china-trade-policy|china",
      "max_severity": "Critical",
      "skf_sites_affected": 8,
      "skf_suppliers_affected": 142,
      "trajectory_text": "Tariffs increased 3x in last 90 days with export controls tightening on critical materials.",
      "last_updated": "2026-04-17T12:00:00Z"
    }
  ],
  "generated_at": "2026-04-17T12:00:00Z"
}
```

### Aggregation logic

For each unique `corridor` value across active trade events:
- `friction_level` = worst (highest) friction across events in that corridor
- `trend` = derived from event severity trajectories: if any event is "Escalating", corridor is Escalating. If all "Stable" or "De-escalating", use majority.
- `max_severity` = worst severity across events
- `event_count` = number of active trade events with this corridor
- `top_event` = highest severity event title (for trajectory text)
- `skf_sites_affected` = count of SKF sites in regions matching this corridor (via SUPPLY_GRAPH)
- `skf_suppliers_affected` = count of suppliers in countries within corridor regions

## Data Sources

All data already exists:

| Content | Source |
|---------|--------|
| Corridor codes | `corridor` field on trade events (scanner output) |
| Friction levels | `friction_level` field on trade events |
| Trends | `trend` field on trade events |
| Site counts | SUPPLY_GRAPH matching by region |
| Supplier counts | Supplier data matching by country/region |
| Trajectory text | `description` from top-severity event |

No new scanner prompts. No external APIs. No manual data entry.

## Component Structure

### Backend

```
backend/app/services/
  corridors.py               <- NEW (~80 lines)
    CORRIDOR_MAP             (corridor code -> label + regions)
    build_corridor_summary() (aggregate trade events -> corridor list)

backend/app/routers/events.py
    GET /events/corridor-summary  <- NEW endpoint

backend/tests/test_corridors.py  <- NEW tests
```

### Frontend

```
frontend/src/v3/components/
  CorridorStrip.tsx          <- NEW (~120 lines)
  CorridorDetail.tsx         <- NEW (~150 lines)

frontend/src/v3/V3App.tsx    <- MODIFY (add strip + state)
frontend/src/services/api.ts <- MODIFY (add fetchCorridorSummary)
frontend/src/types/index.ts  <- MODIFY (add CorridorSummary type)
```

## State Management

In V3App.tsx:
- `selectedCorridor: string | null` — which corridor is selected
- When set: FeedList filters events to matching corridor, sidebar shows CorridorDetail
- When cleared (or mode switches from trade): revert to normal RiskSummary sidebar
- Corridor selection resets when mode changes

## What We're NOT Building

- No separate tariff matrix page
- No exact tariff rate percentages (unreliable without validated customs data)
- No HS-code-level tariff lookups
- No external API integrations (WTO, WITS, MacMap)
- No manually curated tariff dataset
- No corridor data for non-SKF trade routes
- No historical tariff rate tracking (trajectory is enough)

## Testing

- Unit test: `build_corridor_summary()` with mock trade events
- Unit test: corridor aggregation logic (worst friction, trend derivation)
- Unit test: `GET /events/corridor-summary` returns correct structure
- Frontend: strip renders in Trade mode only, click filters feed, detail panel shows
- Integration: corridor data updates after trade scan completes
