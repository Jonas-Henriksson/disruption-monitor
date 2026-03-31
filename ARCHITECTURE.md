# Architecture Decisions — SC Hub Disruption Monitor

> **Owner:** Backend Agent | **Last updated:** 2026-03-30

## ADR-001: SQLite with WAL Mode for Persistence

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Need persistent storage for events, scan history, and audit trails. Options: PostgreSQL, SQLite, or in-memory only. The tool runs on a single machine, possibly deployed to a small VM. No multi-writer concurrency requirements.
**Proposal:** SQLite with WAL (Write-Ahead Logging) mode for concurrent read access during scans.
**Devil's Advocate Case:** SQLite limits future horizontal scaling. PostgreSQL would allow multiple backend instances and has richer query capabilities.
**Decision:** SQLite. Zero-config, no external dependencies, single-file backup, WAL handles concurrent reads during background scan writes. The tool is single-instance by design.
**Consequences:** Cannot run multiple backend instances. Acceptable for a team tool serving <10 concurrent users. Migration to PostgreSQL is straightforward if needed — all queries are standard SQL.

## ADR-002: FastAPI Lifespan Pattern for Startup/Shutdown

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Need to seed the database and start the background scanner on app startup, and clean up on shutdown.
**Proposal:** Use FastAPI's `lifespan` context manager pattern instead of deprecated `on_event("startup")` / `on_event("shutdown")`.
**Devil's Advocate Case:** The deprecated pattern still works and is simpler to understand.
**Decision:** Use `lifespan` — it's the officially recommended approach and handles resource cleanup correctly via the async context manager pattern.
**Consequences:** Slightly more complex setup, but future-proof and correctly handles async resource cleanup.

## ADR-003: asyncio.to_thread for Claude API Calls

**Date:** 2026-03-29
**Status:** Accepted
**Context:** The Anthropic SDK's synchronous `client.messages.create()` blocks the event loop, preventing concurrent request handling during scans.
**Proposal:** Wrap all Claude API calls in `asyncio.to_thread()` to run them in a thread pool.
**Devil's Advocate Case:** Should use `AsyncAnthropic` client directly for true async without thread overhead.
**Decision:** `asyncio.to_thread()` as immediate fix. AsyncAnthropic migration is on the backlog (see ADR-003a below).
**Consequences:** Thread pool overhead is negligible for scan frequency (every 15-60 minutes). Works correctly today. AsyncAnthropic migration will reduce overhead when implemented.

## ADR-003a: AsyncAnthropic Migration (Planned)

**Date:** 2026-03-29
**Status:** Planned
**Context:** ADR-003 uses thread offloading as a pragmatic fix. The proper solution is the native async client.
**Decision:** Migrate to `AsyncAnthropic` in a future session. Not urgent — current approach works correctly.

## ADR-004: Algorithmic Severity Scoring (0-100)

**Date:** 2026-03-29
**Status:** Accepted
**Context:** AI-assigned severity labels (Critical/High/Medium/Low) are inconsistent across scans and not reproducible. Need a deterministic, auditable severity score.
**Proposal:** Compute `severity_score` via weighted addition: `0.30 * magnitude + 0.25 * proximity + 0.25 * criticality + 0.20 * supply_chain_factor` where each component is normalized to 0-1, then the result is scaled to 0-100:
- Magnitude (30%): blended 60% category-based + 40% AI-severity hint, with trend adjustment (escalating +15%, de-escalating -15%)
- Proximity (25%): square-root decay from nearest SKF site (any type) within 3000km blast radius
- Criticality (25%): site type weight (mfg=1.0, va=0.8, service/log=0.7, sales=0.3, admin=0.1) multiplied by BU weight (ind/aero=1.0, seal=0.8, lube=0.7, mag=0.6)
- Supply chain impact (20%): logarithmic scaling by affected site count + manufacturing site bonus
**Devil's Advocate Case:** A formula can never capture the nuance of geopolitical judgment. AI severity labels incorporate context the algorithm misses.
**Decision:** Both. Store AI-assigned severity AND computed score. Display as "AI: Critical | Algorithm: 82/100". This gives users two perspectives and builds trust through transparency.
**Consequences:** Dual-severity display adds UI complexity but dramatically increases credibility. Users can see when AI and algorithm disagree, which is itself valuable signal.

## ADR-005: Event Deduplication via Jaccard Similarity

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Recurring scans (every 15 min) produce duplicate events. "Strait of Hormuz disruption" appears multiple times with slightly different wording.
**Proposal:** Title-based Jaccard similarity > 0.4 threshold (default) + region match + haversine distance < 500km = duplicate. When geographic coordinates are unavailable, a stricter 0.6 fallback threshold is required for title+region match alone. Keep higher severity, merge affected sites, preserve both timestamps.
**Devil's Advocate Case:** Jaccard on titles is crude. Two events in the same region could be genuinely distinct. Should use embedding-based semantic similarity.
**Decision:** Jaccard + region + distance. Simple, fast, no API calls needed. False positive rate is acceptable because duplicates are tagged, not deleted — users can override.
**Consequences:** May occasionally tag genuinely distinct events as duplicates. The "Possible duplicate of" banner in the UI is non-destructive — users can dismiss it.

## ADR-006: Telegram Push Notifications

**Date:** 2026-03-29
**Status:** Accepted
**Context:** The tool's value is "knew before I did." Push notifications are essential for proactive alerting.
**Proposal:** Telegram Bot API for Critical and High severity events. Includes cooldown period and deduplication to prevent alert fatigue.
**Devil's Advocate Case:** Slack would reach more enterprise users. Email is more universal. Telegram is uncommon in corporate environments.
**Decision:** Telegram. Jonas's team already uses it. Zero infrastructure cost. Instant delivery with rich formatting (bold, links, markdown). Cooldown + severity threshold prevents fatigue.
**Consequences:** Tied to Telegram ecosystem. If org moves to Slack/Teams, need a notification abstraction layer. For now, Telegram serves the actual user.

## ADR-007: Inline Styles Over CSS Framework

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Frontend uses React with inline styles (`style={{...}}`) throughout App.tsx rather than Tailwind, CSS Modules, or styled-components.
**Proposal:** Continue with inline styles for the monolithic App.tsx approach.
**Devil's Advocate Case:** Inline styles create massive component files, prevent pseudo-selectors, and make theming harder. Tailwind or CSS Modules would improve maintainability.
**Decision:** Inline styles for now. The codebase is a single-developer tool with one primary view. Extracting to a CSS system is a refactor that doesn't serve the user yet. Animations use injected CSS classes (`.sc-*`) where inline styles can't work.
**Consequences:** App.tsx is 1517 lines. Component extraction (MapCanvas, Drawer, etc.) will need to establish a CSS pattern. When that happens, consider migrating to CSS Modules or a token-based system (see DESIGN_SYSTEM.md Appendix B).

## ADR-008: D3.js for Map Rendering (Not Mapbox/Leaflet)

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Need a world map with custom markers, routes, clustering, and SVG overlays. Options: Leaflet, Mapbox GL, D3 with topojson.
**Proposal:** D3.js with Natural Earth projection and topojson for countries.
**Devil's Advocate Case:** Mapbox/Leaflet provide tile-based maps with built-in pan/zoom, satellite imagery, and established ecosystems. D3 requires building everything from scratch.
**Decision:** D3. Full control over rendering, no API key dependency, no tile loading latency, custom projections, SVG-based markers integrate seamlessly with React. The map is a canvas for data visualization, not a navigation tool.
**Consequences:** No satellite/terrain view. No street-level zoom. But the tool doesn't need those — it needs a data-dense world view with custom overlays, which D3 excels at.

## ADR-009: Scanner Pipeline Architecture

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Need a reliable pipeline from raw Claude API responses to persisted, scored, deduplicated events with site matching and alerting.
**Proposal:** Linear pipeline: `Claude API (web_search) → parse JSON → validate items → compute severity → tag duplicates → match affected sites → persist to SQLite → send Telegram alerts → return to frontend`
**Devil's Advocate Case:** A pipeline with this many stages is fragile. Any stage failure drops the entire scan. Should use a message queue or event-driven architecture.
**Decision:** Linear pipeline with two failure modes: (1) JSON parsing is all-or-nothing — if the response cannot be parsed into a valid JSON array, the entire scan returns empty; (2) after successful parse, item-level validation drops individual malformed items without failing the batch. Validation warnings are logged but don't block persistence. This is simpler than an event bus and appropriate for the scan frequency (every 15-60 min).
**Consequences:** No retry logic for individual pipeline stages. The parser tries multiple bracket positions as a fallback strategy, but ultimately returns an empty list if no valid JSON array is found. Good enough for the scan cadence.

## ADR-010: Scan Dedup Lock (asyncio.Lock per Mode)

**Date:** 2026-03-29
**Status:** Accepted
**Context:** Background scheduler and manual rescan button can trigger concurrent scans of the same mode.
**Proposal:** One `asyncio.Lock` per scan mode (disruptions, geopolitical, trade). Concurrent requests for the same mode wait instead of spawning parallel scans.
**Decision:** Accepted. Prevents duplicate API costs and race conditions on SQLite writes.
**Consequences:** A manual scan during a scheduled scan will block briefly. Acceptable — scans take 10-30 seconds.

## ADR-011: Design System as Living Document

**Date:** 2026-03-30
**Status:** Accepted
**Context:** The frontend was built iteratively with inline styles. Visual consistency emerged organically but wasn't documented. New UI work risks introducing inconsistent patterns.
**Proposal:** Codify all existing visual patterns into `DESIGN_SYSTEM.md` with named tokens, component specs, and an anti-pattern checklist. Every new UI element must reference this document.
**Devil's Advocate Case:** A design system doc without enforcement tooling is aspirational. Token values in a markdown file can drift from actual code. Should use CSS custom properties or a design token system like Style Dictionary.
**Decision:** Document first, tooling later. The token export reference in Appendix B provides a migration path to CSS custom properties or a TypeScript token file. The immediate value is shared vocabulary and consistency checks during review.
**Consequences:** Requires discipline to keep doc and code in sync. Frontend agent owns both. The consistency checklist (Section 10) is the enforcement mechanism during code review.

## ADR-012: Shared Haversine Utility (`utils/geo.py`)

**Date:** 2026-03-30
**Status:** Accepted
**Context:** The `_haversine_km` function was copy-pasted identically in `scanner.py`, `severity.py`, and `dedup.py`. Three copies of the same math, three places to introduce bugs.
**Proposal:** Extract into `backend/app/utils/geo.py` as `haversine_km()`. Each service module re-exports as `_haversine_km = haversine_km` for backward compatibility with existing tests and internal callers.
**Devil's Advocate Case:** Three copies is fine for a small project — the function is 6 lines and will never change. Adding a `utils/` package is over-engineering.
**Decision:** Extract. The function is used in distance-sensitive logic (dedup radius, severity scoring, site matching). A bug in one copy but not others would produce subtly wrong results that are hard to trace. Single source of truth eliminates that risk class entirely.
**Consequences:** New `backend/app/utils/` package. Minimal import change. Tests continue to import `_haversine_km` from `severity.py` via the re-export alias.

## ADR-013: Graceful Fallback Pattern

**Date:** 2026-03-30
**Status:** Accepted
**Context:** The application must be useful even without external dependencies. No API key should produce a broken experience — it should produce a degraded but functional one.
**Proposal:** Three-tier fallback: (1) Live scan via Claude API with web_search when `ANTHROPIC_API_KEY` is set; (2) If a live scan fails (network error, rate limit, malformed response), fall back to sample data with `fallback: true` and `error` field in the response; (3) If the backend is down entirely, the frontend loads local `SAMPLE` data from its own `data/` directory.
**Devil's Advocate Case:** Silently falling back to stale sample data is dangerous — users may believe they're seeing live intelligence when they're seeing canned data. The `source: "sample"` field is easy to miss.
**Decision:** Accept the risk. The frontend displays a prominent "SAMPLE" indicator when not receiving live data. The health endpoint reports `claude_api: "not_configured"` so the status is discoverable. The alternative — showing nothing — is worse for a tool that needs to demonstrate value before an API key is provisioned.
**Consequences:** Every scan response includes a `source` field (`"live"` or `"sample"`). Frontend must always check and display this. Sample data must be kept realistic enough to demonstrate the tool's value.

## ADR-014: BU_MAP Dual Maintenance

**Date:** 2026-03-30
**Status:** Accepted
**Context:** The mapping from SKF site names to business units (`BU_MAP`) exists in two places: `backend/app/data/__init__.py` (Python dict, 71 entries) and `frontend/src/data/sites.ts` (TypeScript object). Both must agree for severity scoring (backend) and UI display (frontend) to be consistent.
**Proposal:** Maintain both copies manually. Any site added or reassigned must be updated in both files.
**Devil's Advocate Case:** Manual sync will inevitably drift. Should generate one from the other, or store in a shared JSON file imported by both. A shared `bu_map.json` in `data/` would be the single source of truth.
**Decision:** Manual sync for now. The map changes rarely (SKF reorganizations are infrequent). The 71-entry size is small enough that a diff catches drift. The backend test suite validates site counts and BU coverage. Future improvement: generate the frontend map from the backend's JSON seed data at build time.
**Consequences:** Risk of silent drift. Mitigation: add a CI check that compares the two maps. Until then, any session modifying sites must update both files and note this in the handoff.

## ADR-015: Event ID Format and Stability

**Date:** 2026-03-30
**Status:** Accepted
**Context:** Events need stable identifiers for deduplication, persistence, and frontend state management (ticket linking, status overrides, drawer routing). IDs must be deterministic from event content so the same event scanned twice gets the same ID.
**Proposal:** Pipe-delimited slug format: `{title-slug}|{region-slug}`. Title is lowercased, truncated to 40 chars, spaces replaced with hyphens. Region is lowercased with spaces replaced. Example: `red-sea-shipping-disruption|middle-east`. Geopolitical mode uses only the risk title slug (no region suffix) because geopolitical risks are inherently cross-regional.
**Devil's Advocate Case:** Slugs derived from AI-generated titles are fragile. Claude might title the same event "Red Sea Shipping Crisis" in one scan and "Houthi Attacks on Red Sea Shipping" in the next — producing different IDs for the same event. Should use a hash of coordinates + category instead.
**Decision:** Accept slug-based IDs. The deduplication system (ADR-005) catches title variations via Jaccard similarity, so even if IDs differ, the events are tagged as duplicates. The slug format is human-readable in logs and database queries, which aids debugging. A coordinate-based hash would be opaque.
**Consequences:** ID collisions are possible for genuinely different events with similar titles in the same region. The dedup system handles this gracefully — it suggests merges rather than auto-merging. If collision rate becomes a problem, append a short hash suffix.

## ADR-016: TARS_ Config Prefix Convention

**Date:** 2026-03-30
**Status:** Accepted
**Context:** The disruption monitor shares a `.env` file with the TARS project (Jonas's personal AI operating system). Both projects need `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN`, among others.
**Proposal:** Use `TARS_` prefix for pydantic-settings (`env_prefix="TARS_"`), but also read unprefixed variants via explicit `os.environ.get()` fallbacks in `config.py`. This means `TARS_ANTHROPIC_API_KEY` and `ANTHROPIC_API_KEY` both work, with the prefixed version taking priority.
**Devil's Advocate Case:** Dual-reading env vars is confusing. A developer might set `ANTHROPIC_API_KEY` and wonder why `TARS_ANTHROPIC_API_KEY` overrides it. Should pick one convention and stick with it.
**Decision:** Accept dual-reading. The shared `.env` file is a practical reality of the development setup. The `TARS_` prefix prevents collisions when both projects run simultaneously. The fallback to unprefixed vars means a clean deploy (without the TARS project) works without renaming env vars.
**Consequences:** `config.py` has slightly unusual initialization with `os.environ.get()` defaults in field definitions. This is well-commented. Any new env var must follow the same pattern: prefixed primary, unprefixed fallback.

## ADR-017: Supplier Alternatives Endpoint — Regional Proxies Without Site Mappings

**Date:** 2026-03-30
**Status:** Accepted
**Context:** Strategy assessed "Wow #3" (told me what to do) at 60%. The blocker: recommendations say "Diversify supplier base in affected region" — generic playbook items, not operational instructions. We have 5,090 suppliers across 53 countries with category data, but we do NOT have supplier-to-site mappings (which supplier serves which factory). The question: can we generate useful, actionable alternatives from what we have?

**Proposal:** New endpoint `GET /api/v1/suppliers/alternatives?country={}&region={}` that, given a disrupted country or region, returns ranked alternative sourcing countries. Ranking uses a composite score: category overlap (do they supply what the disrupted area supplies?), region affinity (same or adjacent region preferred for logistics), and supplier density (log-scaled count as a proxy for market depth). Haversine distance from the disrupted centroid is included for context. Response carries a prominent disclaimer: "Regional alternatives based on supplier density and category overlap. These are NOT confirmed site-level mappings — verify with procurement before acting."

**Devil's Advocate Case:** This is dangerous. Showing "Germany has 312 suppliers with 85% category overlap" to a VP of Procurement could be interpreted as "switch to Germany." But we have no idea whether those 312 German suppliers actually make the specific bearing series that the disrupted Turkish supplier provides. Category overlap at the L1 level ("Components") is too coarse — a Turkish supplier making cylindrical roller bearings and a German supplier making ball bearings both count as "Components." The overlap percentage gives false precision. A 40% overlap could mean the alternative covers zero of the actually-needed parts.

Furthermore, showing distance in km implies logistics feasibility, but a supplier 900km away in Romania is not "closer" in any meaningful supply chain sense if there's no existing logistics contract, quality certification, or tooling compatibility. We're conflating geographic proximity with supply chain readiness.

The honest answer is: without supplier-to-site mappings and part-level category data, any "alternative" is a guess dressed up as analysis.

**Decision:** Accept with strong guardrails. The endpoint is useful as a starting point for procurement teams — "here's where to start looking" — not as a decision tool. The guardrails:
1. **Mandatory disclaimer** in every response, hardcoded at the schema level, explicitly stating these are NOT confirmed mappings.
2. **"overlap_pct" uses L1 categories only** — we don't hide the coarseness, we name it. Frontend should display category names, not just the percentage.
3. **No "recommended" label** — alternatives are "ranked" not "recommended." Language matters.
4. **Limit defaults to 10** — don't overwhelm with 50 options that all look plausible.
5. **Distance is contextual, not prescriptive** — included for geographic awareness, not as a logistics metric.

The path to real value is P4: enriching the supplier data with site-level mappings and L2/L3 categories. This endpoint is the stub that makes that investment legible.

**Consequences:** The endpoint works today with existing data and provides genuine value as a research accelerator. But it must never be presented as "the system recommends these suppliers." The frontend must render the disclaimer prominently and the category overlap visually (showing actual category names, not just a percentage). If we later add supplier-to-site mappings (P4), the same endpoint signature can return dramatically better results without breaking the API contract.
