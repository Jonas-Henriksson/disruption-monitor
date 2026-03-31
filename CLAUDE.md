# SC Hub Disruption Monitor — Development Guide

## Project Overview
Real-time supply chain risk intelligence platform for SKF. React/D3 world map with AI-powered disruption scanning via Anthropic Claude API. Telegram push notifications for critical alerts.

## Architecture

```
disruption-monitor/
├── frontend/              React 19 + TypeScript + D3.js + Vite
│   ├── src/App.tsx        Main component (~1150 lines)
│   ├── src/hooks/         useMapState, useDisruptionState, useFilterState
│   ├── src/services/api.ts  Backend API client with fallback
│   ├── src/data/          Sites (245), suppliers (5090), routes, config
│   ├── src/utils/         impact, geo, format
│   ├── src/styles.ts      CSS animations (skeleton, pulse, spin)
│   └── src/types/         TypeScript interfaces
├── backend/               FastAPI + Python 3.14
│   ├── app/main.py        App entry with lifespan (seed + scheduler)
│   ├── app/config.py      pydantic-settings, env prefix: TARS_
│   ├── app/db/database.py SQLite persistence (WAL mode, 5 tables)
│   ├── app/services/
│   │   ├── scanner.py     Claude API scanner + validation + severity + dedup + site matching
│   │   ├── scheduler.py   asyncio background scanning + Telegram integration
│   │   ├── severity.py    Algorithmic severity scoring (0-100, 4 components)
│   │   ├── dedup.py       Event deduplication (Jaccard + region + distance)
│   │   └── telegram.py    Push notifications via Bot API (Critical/High alerts)
│   ├── app/routers/       health, events, scans, sites, suppliers
│   ├── app/models/schemas.py  Pydantic models (30+ schemas)
│   ├── app/data/          JSON seed data (all modes have structured recs)
│   └── app/seed/          Auto-seed DB on first startup
├── backend/tests/         254 pytest tests (DB, scanner, API, severity, dedup, timeline, telegram)
├── docs/                  Product vision
└── start.bat / startup.ps1  One-command launch
```

## Key Decisions
- **SQLite with WAL** for persistence — lightweight, zero-config, events survive restarts
- **Lifespan pattern** for FastAPI startup/shutdown (not deprecated on_event)
- **Graceful fallback** everywhere: no API key → sample data, backend down → local SAMPLE
- **asyncio.to_thread()** for all Claude API calls — prevents blocking the event loop
- **Scan dedup locks** — asyncio.Lock per mode prevents concurrent scans
- **BU_MAP** in both frontend (sites.ts) and backend (data/__init__.py) — keep in sync
- **Event IDs** use pipe delimiter: `event-slug|region`
- **Telegram alerts** only fire for "live" source scans (not sample data)
- **Config** reads both TARS_-prefixed and unprefixed env vars (shared .env with TARS project)

## Running Locally

```bash
# Backend (port 3101)
uvicorn backend.app.main:app --reload --port 3101

# Frontend (port 3100)
cd frontend && npm run dev

# Or use one-command launch:
./start.bat
```

## Environment Variables
```
# Claude API (required for live scanning)
ANTHROPIC_API_KEY=sk-ant-...        # or TARS_ANTHROPIC_API_KEY

# Telegram (required for push notifications)
TELEGRAM_BOT_TOKEN=...              # from @BotFather
TELEGRAM_ALLOWED_USER_IDS=...       # comma-separated chat IDs

# Optional overrides
TARS_CLAUDE_MODEL=claude-sonnet-4-20250514
TARS_DB_PATH=disruption_monitor.db
TARS_SCAN_INTERVAL_MINUTES_DISRUPTIONS=15
TARS_SCAN_INTERVAL_MINUTES_GEOPOLITICAL=30
TARS_SCAN_INTERVAL_MINUTES_TRADE=60
TARS_TELEGRAM_MIN_SEVERITY=High     # Critical, High, Medium, Low
```

## API Endpoints (all under /api/v1)
- `GET /health` — health + DB stats + scheduler + Telegram status
- `POST /telegram/test` — send test Telegram message
- `GET /scans/latest/{mode}` — latest results from DB
- `POST /scans` — trigger scan, persist, send Telegram alerts
- `GET /scans/history` — scan audit trail
- `GET /events` — list with ?mode= and ?status= filters
- `GET /events/{id}` — event detail
- `GET /events/{id}/recommendations` — structured impact/actions/confidence/sources
- `PATCH /events/{id}/status` — lifecycle (active/watching/archived)
- `POST /events/{id}/alert` — send Telegram alert for specific event
- `POST /events/{id}/narrative` — Claude-generated executive briefing
- `POST /events/{id}/alert` — send Telegram alert for specific event
- `GET /events/timeline?days=30` — daily risk breakdown for Layer 2 chart
- `GET /sites` — 245 SKF sites with stats
- `GET /suppliers` — supplier data by country

## Scanner Pipeline
```
Claude API (web_search) → parse JSON → validate items → compute severity (0-100)
→ tag duplicates (Jaccard) → match affected sites (haversine) → persist to SQLite
→ send Telegram alerts (Critical/High) → return to frontend
```

## Testing
```bash
# Run all non-API tests (254 tests, no Claude API calls)
python -m pytest backend/tests/ -q --ignore=backend/tests/test_api.py

# Run API tests (may trigger live scans if API key set)
python -m pytest backend/tests/test_api.py -q

# Frontend type check + build
cd frontend && npx tsc --noEmit && npx vite build
```

## Database Schema (SQLite)
- `events` — canonical event registry with payload JSON, lifecycle status
- `event_snapshots` — immutable history per scan
- `scan_records` — audit log of every scan run
- `tickets` — user action items linked to events
- `event_edits` — audit trail for user overrides

## Data Integrity
- 245 sites across 69 countries (20 mfg, 7 aerospace, 5 logistics, 93 sales, 12 admin)
- 5,090 suppliers across 53 countries
- 71 SUPPLY_GRAPH entries covering all BU_MAP sites
- BU_MAP: 32 industrial, 14 seals, 12 lube, 10 aerospace, 3 magnetics = 71 total
