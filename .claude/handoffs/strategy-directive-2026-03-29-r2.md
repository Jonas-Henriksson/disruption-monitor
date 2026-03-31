# Strategy Directive — 2026-03-29 R2

**From:** Strategy Agent
**To:** Frontend, Backend, Test agents
**Grade: A- (upgraded from B+).** Every critical gap from the first directive is closed.
**Target by end of session:** A

---

## What Changed Since R1

The first directive identified three things that had to ship to reach A-:

1. **Telegram push notifications** -- SHIPPED. 4 alerts sent successfully. Integrated with scheduler and manual scans. Cooldown and dedup in place.
2. **Structured recommendations for geo/trade modes** -- SHIPPED. All 3 scan modes now return impact/actions/confidence/sources in consistent format.
3. **Scan result validation guardrails** -- SHIPPED. Malformed items are dropped, required fields enforced.

Additionally shipped: scan dedup lock, async fixes, loading skeletons, requirements.txt cleanup.

Every "ship today" item from R1 is done. That is exceptional execution.

---

## Updated Wow Moment Assessment

### Wow #1: "The tool knew before I did."
**Status: 90% (was 60%).**
Live scanning detects real disruptions. Telegram pushes Critical/High alerts to Jonas's phone. The tool now reaches out to the user. The remaining 10%: Steffen hasn't seen it yet. That is a demo scheduling problem, not a technical problem.

### Wow #2: "I walked into the meeting and owned the room."
**Status: 88% (was 85%).**
Structured overlay panel works across all 3 modes with consistent format. Live data flowing. Minor gap: narrative display from the `/events/{id}/narrative` endpoint is not yet surfaced in the frontend panel. That is a polish item.

### Wow #3: "It told me what to do, not just what happened."
**Status: 85% (was 70%).**
Structured actions with owner/urgency/priority now work for disruptions, geopolitical, AND trade modes. Major jump. Remaining gap: severity scoring is still AI-assigned (no algorithmic validation), and there are no supplier alternatives suggested.

---

## Updated Demo Readiness Assessment

| Aspect | Grade | Was | Notes |
|--------|-------|-----|-------|
| First impression (10s test) | A- | A- | Live data, KPI strip, severity filters. Solid |
| Map visualization | B+ | B+ | Markers + pulsing work. Clustering still missing at global zoom |
| Overlay panel (disruptions) | A | A- | Structured actions, recovery timelines, confidence. Strong |
| Overlay panel (geo/trade) | A- | C+ | **Huge jump.** Now has same structure as disruptions |
| Push notifications | A | F | **Shipped.** 4 alerts sent, integrated with scheduler |
| Data freshness | A | A | 15-minute auto-scan with live Claude API |
| Persistence | A- | A- | SQLite with upsert, lifecycle management, scan history |
| Professional feel | B+ | B+ | Dark theme, glassmorphic panels, SKF branding |
| Test coverage | B | -- | 93 pytest tests. No frontend tests yet |
| **Overall** | **A-** | **B+** | Push + structured recs closed the two biggest gaps |

---

## What Moves the Needle to A

The gap between A- and A is not about missing features. It is about polish, resilience, and test coverage. Three things:

1. **Frontend test coverage.** Zero frontend tests is the single biggest risk for a demo. One broken utility function and the whole map fails silently. Basic vitest coverage of utils/ and hooks/ catches regressions before they embarrass us.

2. **Map clustering at global zoom.** When Steffen first opens the tool, he sees 245 sites rendered as individual dots at world scale. It looks cluttered. Clustering at zoom < 3x turns that into clean region bubbles. This is a visual polish item that directly affects the 10-second test.

3. **Error boundaries.** If the backend is down or a scan returns unexpected data, what does the user see? Right now: probably a blank panel or a JS error. Error boundaries turn that into "Connection lost -- showing last known data" which is professional.

---

## Agent Directives — Round 2

**CONSTRAINT: No live Claude API calls this round.** Focus on local improvements, polish, and testing.

### BACKEND AGENT

Priority order:

1. **Severity scoring engine**
   - Replace raw AI-assigned severity with algorithmic validation
   - Formula: `magnitude x proximity x site_criticality`
   - Proximity: haversine distance from nearest SKF manufacturing site
   - Site criticality: revenue weight or BU classification (manufacturing > warehouse > office)
   - Output: a numeric score (0-100) that maps to Critical/High/Medium/Low thresholds
   - This does NOT require Claude API calls -- it is pure computation on existing event data
   - Store computed score alongside AI-assigned severity for comparison

2. **Event deduplication**
   - Content-based merging: if two events have similar titles (Levenshtein distance < 0.3) and locations within 200km, merge them
   - Keep the higher severity, merge affected sites lists, preserve both source timestamps
   - This prevents the scan results from showing "Strait of Hormuz disruption" three times after three scan cycles

3. **Historical timeline data endpoint**
   - `GET /api/v1/timeline?days=30` returns daily severity counts from event_snapshots
   - Shape: `[{date: "2026-03-28", critical: 2, high: 5, medium: 8, low: 3}]`
   - This feeds the Layer 2 historical timeline view on the frontend
   - Pure SQLite query, no API calls needed

### FRONTEND AGENT

Priority order:

1. **Extract MapCanvas component**
   - Pull the ~400 lines of SVG rendering out of App.tsx into `components/Map/MapCanvas.tsx`
   - This is the single highest-leverage refactor for code health
   - App.tsx at 1150 lines is a maintenance risk. Getting it under 800 lines makes everything else easier
   - No behavior changes, pure extraction

2. **Clustering at global zoom**
   - When zoom < 3x, group nearby sites into cluster bubbles showing count
   - Simple approach: grid-based clustering (divide map into cells, count sites per cell)
   - Show cluster count badge, expand on zoom in
   - This directly improves the 10-second first impression

3. **Error boundaries**
   - Wrap the map, overlay panel, and KPI strip in React error boundaries
   - Show fallback UI ("Something went wrong -- showing cached data") instead of white screen
   - Add a connection status indicator: green = backend connected, yellow = stale data, red = offline

4. **Narrative display (if time permits)**
   - Surface the `/events/{id}/narrative` response in the overlay panel
   - "Executive Briefing" section below the structured actions
   - This does NOT call the narrative endpoint (no Claude API calls) -- just renders the response if available from a previous call

### TEST AGENT

Priority order:

1. **Frontend vitest suite (HIGHEST PRIORITY)**
   - Set up vitest + @testing-library/react in frontend/
   - Write tests for utility functions first (lowest effort, highest coverage):
     - `computeImpact` -- does it return correct impact for given severity + distance?
     - `eventId` / `relTime` / `formatNumber` -- pure functions, easy to test
     - `geo` utils -- haversine, point-in-bounds
   - Then test hooks:
     - `useFilterState` -- filter by severity, by mode, reset
     - `useDisruptionState` -- event selection, status updates
   - Target: 15+ frontend tests passing

2. **E2E smoke test**
   - Use Playwright or similar to verify the full stack:
     - App loads without JS errors
     - KPI strip renders with correct counts
     - Clicking an event opens the overlay panel
     - Mode tabs switch between disruptions/geopolitical/trade
   - Even 3-4 E2E tests are more valuable than zero

3. **Backend regression tests for new features**
   - Test severity scoring engine: known inputs produce expected scores
   - Test dedup logic: two similar events merge correctly
   - Test timeline endpoint: returns correct shape with mock snapshot data

---

## What NOT To Do This Round

- **Do not trigger live Claude scans.** Work with existing data in SQLite and sample JSON.
- **Do not start scenario modeling (Layer 3).** That is next session territory.
- **Do not optimize supplier rendering yet.** Clustering solves the visual problem; virtual rendering is premature optimization.
- **Do not refactor the backend router structure.** It works. Ship tests instead.

---

## The Path to A

| Item | Agent | Impact | Effort |
|------|-------|--------|--------|
| Frontend vitest suite (15+ tests) | Test | High | Medium |
| MapCanvas extraction | Frontend | Medium | Medium |
| Clustering at global zoom | Frontend | High | Medium |
| Severity scoring engine | Backend | Medium | Medium |
| Event deduplication | Backend | Medium | Low |
| Error boundaries | Frontend | Medium | Low |
| Historical timeline endpoint | Backend | Medium | Low |
| E2E smoke tests | Test | High | Medium |

If we ship the top 4 items, we are at A. The remaining items push us toward A+.

---

## Summary

The team went from B+ to A- in one round by shipping exactly what mattered: push notifications and structured recommendations parity. That discipline is rare. Now the game changes: the tool works. The question is whether it is resilient (tests), polished (clustering, error boundaries), and maintainable (MapCanvas extraction). These are the things that determine whether the demo goes smoothly or whether one unexpected edge case derails it.

No heroics. No new features. Polish, test, harden.

---

*Strategy Agent, 2026-03-29 R2*
