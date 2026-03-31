# Developer Brief -- SC Hub Disruption Monitor

> **Owner:** Strategy Agent | **Last updated:** 2026-03-30 (R2 -- Strategy review)
> **Purpose:** Living specification and single source of truth. Product vision, user model, wow moments, feature inventory, layer roadmap, demo readiness, and priorities. Every agent reads this at session start.

---

## 1. Product Vision

**SC Hub Disruption Monitor** is a real-time supply chain risk intelligence platform for SKF's senior leadership. It is not a dashboard. It is a command center -- the tool that Steffen opens before the weekly SC leadership call to know in 10 seconds: "Are we okay today? If not, where and why?"

**The sentence that defines this product:**
> "Earthquake in Izmir (magnitude 6.2) -- 2 SKF manufacturing sites within 50km, 8 suppliers affected, estimated production impact: 12K units/week, recommended action: activate backup suppliers in Romania."

That sentence encodes the product thesis: DETECT the disruption, QUANTIFY the exposure in SKF-specific terms, RECOMMEND the action. Any feature that does not serve one of those three verbs does not ship.

**Benchmark references:** Bloomberg Terminal (information density), Linear (elegance + muted palette), Grafana (dashboard composition), Samsara (map + data + alerts).

**Users (in priority order):**
1. **Steffen (VP Supply Chain):** Opens this before Monday calls. Needs to say "we have exposure in Turkey" with specifics. His workflow: glance at KPI strip (10s) -> scan map for red (10s) -> open drawer for detail on one critical event (60s) -> copy executive briefing into email or deck. Total time budget: 90 seconds.
2. **Ganesh (Board-level):** Sees this quarterly. Needs the narrative, not the data. Cares about trend direction and whether the team has a handle on it.
3. **Analyst team:** Drills into supplier detail, runs scenarios, assigns actions. Longer sessions, more interactive.

**Success criteria:** Steffen uses it unprompted before his Monday call for 3 consecutive weeks.

---

## 2. Three Wow Moments

These define whether the product succeeds. Every feature ships in service of one of these.

### Wow #1: "The tool knew before I did."
**Status: 70% (revised down from 92%)**
- DONE: Live Claude scanning with web_search detects real disruptions
- DONE: 15/30/60-minute scheduled scanning across 3 modes
- DONE: Telegram push notifications for Critical/High severity events
- DONE: Staleness indicator (LIVE/STALE/OFFLINE) with time-based thresholds
- NOT PROVEN: The tool has never surfaced a disruption to Steffen before he heard about it elsewhere. Until that happens, this wow moment is theoretical. The technology works; the product moment has not occurred.
- BLOCKING: Demo to actual user (scheduling problem), continuous scanning (cost approval E2), deployment to always-on infrastructure (E4).

### Wow #2: "I walked into the meeting and owned the room."
**Status: 75% (revised down from 90%)**
- DONE: Structured overlay panel with severity scores, impact chains, recommended actions, recovery timelines, confidence scores
- DONE: Executive brief section auto-generates situational summary
- DONE: Narrative endpoint produces Claude-generated executive briefings
- DONE: All 3 scan modes have consistent recommendation structure
- WEAK: The executive brief in the drawer is a text summary, not a pre-formatted talking point list. Steffen cannot glance at it and read a bullet to the room -- he has to parse a paragraph. The "own the room" moment requires structured talking points, not prose.
- WEAK: No export/share workflow. Steffen cannot email a briefing to Ganesh without manually copying text.
- MISSING: Historical trend context ("this is the third week of escalation in the Red Sea corridor") requires accumulated scan data.

### Wow #3: "It told me what to do, not just what happened."
**Status: 60% (revised down from 88%)**
- DONE: Structured actions with owner/urgency/priority across all modes
- DONE: Algorithmic severity scoring (0-100) with dual AI + algorithm display
- DONE: Impact chain visualization: disruption region -> corridors -> factories -> suppliers
- NOT DONE: No supplier alternatives suggested ("activate backup suppliers in Romania")
- NOT DONE: No automated playbooks
- NOT DONE: No "I did this" confirmation loop -- actions are display-only, not workflow
- The defining sentence of this product ends with "recommended action: activate backup suppliers in Romania." We display actions but we do not name the specific backup. Until we can say "Timken Romania, NSK Poland, NTN Czech Republic" as alternatives, this wow moment is incomplete.

---

## 3. Current Feature Inventory

### Backend (FastAPI + Python 3.14) -- 15 capabilities
1. SQLite persistence (5 tables, WAL mode)
2. Auto-seed (26 sample events with computed severity)
3. Scheduled background scanning (15m/30m/60m)
4. Live Claude scanning (web_search tool)
5. Structured recommendations (all 3 modes)
6. Site matching (haversine distance, blast radius)
7. Severity scoring engine (algorithmic 0-100)
8. Event deduplication (Jaccard + region + distance)
9. Narrative generation (Claude executive briefings)
10. Telegram push notifications (Critical/High)
11. Timeline endpoint (30-day daily risk breakdown)
12. Scan dedup lock (asyncio.Lock per mode)
13. Scan result validation (required fields, lat/lng ranges)
14. Async-safe Claude calls (asyncio.to_thread)
15. 217 pytest tests passing

### Frontend (React 19 + TypeScript + D3.js) -- 14 features
1. D3 world map with Natural Earth projection
2. Backend API integration with graceful fallback
3. Data source indicator (pulsing LIVE/API/OFFLINE)
4. Tab-style scan mode selector (3 modes)
5. Affected sites highlighting (red ring/glow)
6. Site clustering at global zoom (grid-based)
7. Risk timeline strip (collapsible, backend-connected)
8. Right drawer panel (460px, grouped events)
9. Executive brief section
10. Computed severity badge (AI + Algorithm dual display)
11. Impact chain visualization
12. Skeleton loading states
13. Error boundary (catches render crashes)
14. Narrative display ("Generate Briefing" button)
- App.tsx: 700 lines (decomposed from 1517)
- Components: DrawerPanel (605), HeaderBar (119), KPIStrip (119), TimelineStrip (130), SiteShape, ErrorBoundary
- 51 vitest tests passing
- Build: 444KB / 135KB gzip

---

## 4. Layer Roadmap

### Layer 1: Real-Time Map (SHIPPED)
The world map with severity-coded disruption markers, site markers (245), supplier bubbles (5090), maritime/air routes, clustering, and interactive popups. This is the "are we okay today" view.

### Layer 2: Risk Timeline (SHIPPED -- needs data accumulation)
Collapsible 30-day risk timeline strip. Backend endpoint exists, frontend renders both placeholder and real data. Needs 7+ days of scheduled scanning to build meaningful historical data. This is the "is it getting better or worse" view.

### Layer 3: Scenario Modeling (NOT STARTED)
"What if Suez closes?" simulation. Requires: chokepoint dependency graph, supplier concentration risk model, production impact calculator. This is the "what should we prepare for" view. Target: next milestone.

### Layer 4: Automated Alerts + Playbooks (PARTIAL)
Telegram push for Critical/High is shipped. Missing: automated mitigation playbooks ("activate backup suppliers in Romania"), in-app notification center, escalation workflows, Teams/Slack integration. This is the "the tool acts on my behalf" view.

---

## 5. Demo Readiness

| Aspect | Grade | Notes |
|--------|-------|-------|
| First impression (10s test) | A- | Live data, KPI strip, severity filters, clustering |
| Map visualization | A- | Markers, pulsing, clustering, routes, chokepoints |
| Overlay panel (all modes) | A- | Structured actions, impact chain, narrative |
| Push notifications | A | Telegram integrated with scheduler |
| Data freshness | B+ | 15-minute auto-scan exists but never run continuously |
| Persistence | A- | SQLite WAL, lifecycle management, audit trail |
| Professional feel | B+ | Consistent dark theme, but design system is documented not enforced |
| Code health | B+ | App.tsx at 700 lines, 6 extracted components |
| Test coverage | B+ | 217 backend + 90 frontend tests |
| Steffen workflow fit | B | KPI strip good; drawer is analytical but not formatted for his 90s workflow |
| **Overall** | **B+** | |

### To reach A-:
1. Run scheduled scanning for 7+ days to build historical timeline data
2. Reformat executive brief as structured talking points (not prose paragraph)
3. Add copy-to-clipboard on executive brief section (not just narrative)
4. Build size exceeds 300KB budget (445KB) -- audit bundle

### To reach A:
1. Demo to actual user (Steffen) and incorporate feedback
2. Scenario modeling stub (even a static "Suez closure" example)
3. Supplier alternatives in recommendations (even if mocked from existing data)
4. Export/share workflow for briefings

### To reach A+:
1. Layer 3 scenario modeling (interactive)
2. Real supplier-to-site mappings for backup recommendations
3. GoldenEye integration (disruption -> MSP channel impact)
4. AWS deployment (blocked by SCP)

---

## 6. Architecture Summary

```
Scanner Pipeline:
  Claude API (web_search) -> parse JSON -> validate -> compute severity (0-100)
  -> tag duplicates (Jaccard) -> match affected sites (haversine) -> persist SQLite
  -> send Telegram alerts (Critical/High) -> return to frontend

Data flow:
  Backend (port 3101) -> Frontend (port 3100)
  Fallback chain: Live scan -> Backend cache -> Local sample data

Persistence:
  SQLite WAL mode, 5 tables: events, event_snapshots, scan_records, tickets, event_edits
```

---

## 7. Environment & Running

```bash
# Backend
uvicorn backend.app.main:app --reload --port 3101

# Frontend
cd frontend && npm run dev

# One-command launch
./start.bat

# Tests
python -m pytest backend/tests/ -q --ignore=backend/tests/test_api.py
cd frontend && npx vitest run
```

Required env vars: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`

---

## 8. Open Questions for Jonas

1. **Demo timeline:** When does Steffen need to see this?
2. **Scanning cadence:** 15-minute disruption scans at ~$10-15/day -- acceptable?
3. **Telegram:** Current shared bot token OK, or dedicated one for this tool?
4. **AWS SCP blocker:** Any update from cloud team? Vercel fallback ready.
5. **Supplier data enrichment:** Do we have access to actual supplier-site mappings (not just country-level)?
6. **GoldenEye integration:** Timeline and API surface for cross-tool linking?

---

*This document is the canonical onboarding brief. All agents read this at session start.*
