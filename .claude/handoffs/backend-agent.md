# Backend Agent Handoff

## Completed
- FastAPI app with CORS, 14 endpoints
- Claude API scanner with web_search tool (3 modes)
- **Full scanner pipeline**: parse → validate → score severity → tag duplicates → match sites → persist → alert
- **SQLite persistence** — 5 tables, WAL mode, auto-seed with scored data
- **Scheduled background scanning** — asyncio 15m/30m/60m
- **Live scanning verified** — 12 real disruptions
- **Severity scoring engine** — `severity.py`: compute_severity_score() returns 0-100 + label + components, wired into scanner
- **Event deduplication** — `dedup.py`: Jaccard similarity + region + 500km radius, wired into scanner
- **Structured recs for ALL modes** — impact/actions/confidence/sources
- **Live scanner site matching** — haversine blast radius
- **Narrative generation** — POST /events/{id}/narrative
- **Telegram push** — Critical/High alerts, integrated with scheduler + manual scans
- **Timeline endpoint** — GET /events/timeline?days=30
- **Scan validation** — required fields, lat/lng, severity normalization
- **Scan dedup lock** — asyncio.Lock per mode
- **Async fixes** — asyncio.to_thread everywhere
- **254 pytest tests** — all passing

## In Progress / Next
1. **AsyncAnthropic migration** — replace to_thread with native async client
2. **Expand test coverage** — narrative endpoint, more edge cases
3. **Rate limiting** — protect scan endpoints from abuse
4. **Historical data accumulation** — timeline endpoint works but needs real scans to accumulate data

## Architecture Notes
- Python 3.14, FastAPI, uvicorn, anthropic SDK, httpx
- SQLite with WAL mode (disruption_monitor.db)
- Scanner pipeline: Claude → parse → validate → score → dedup → match → persist → alert
- Model: claude-sonnet-4-20250514
- Config: TARS_ prefix, falls back to unprefixed
