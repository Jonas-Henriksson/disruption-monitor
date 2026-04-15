# Evolution Intelligence — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Situation evolution tracking, archive resurrection, Teams channel notifications, evolution UI

## Overview

Long-running disruption events (e.g. Ukraine conflict, Red Sea shipping disruption) evolve through phases over months or years. Today the system treats each scan as stateless — it has no memory of how a situation has changed. This feature adds:

1. **Evolution analysis** — AI-powered periodic summaries that track how events evolve over time
2. **Hierarchical compression** — daily → weekly → monthly summary chains to bound storage and context
3. **Archive resurrection** — archived events auto-resurface when severity increases
4. **Teams channel notifications** — replacing Telegram with Microsoft Teams for org-wide alerts
5. **Evolution UI** — hybrid compact card + dedicated tab showing the full event arc

## 1. Data Model

### New table: `evolution_summaries`

| Column | Type | Purpose |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| event_id | TEXT FK → events | Parent event |
| period_type | TEXT | `daily`, `weekly`, `monthly` |
| period_start | TEXT | ISO date — start of period |
| period_end | TEXT | ISO date — end of period |
| severity_values | TEXT | JSON array of scores in period, e.g. `[71, 73, 72, 73]` |
| phase_label | TEXT | AI-detected phase, e.g. "Structural Trade Shift" |
| phase_number | INTEGER | Sequential phase counter (1, 2, 3...) |
| key_developments | TEXT | JSON array of `[{date, description}]` milestones |
| exposure_delta | TEXT | Plain text delta, e.g. "2 new MFG sites in range since Jan" |
| forward_outlook | TEXT | AI 1-2 sentence projection |
| narrative | TEXT | Full prose evolution paragraph |
| generated_by | TEXT | `claude` or `fallback` |
| created_at | TEXT | ISO timestamp |

**Indices:** `idx_evolution_event` on `(event_id, period_type, period_start)`

### Additions to `events` table

| Column | Type | Purpose |
|---|---|---|
| archived_severity | INTEGER | Severity score at time of archival (nullable) |
| resurfaced_at | TEXT | Timestamp of last resurrection (nullable) |

### Compression rules

- **Daily summaries**: retained 30 days, then compressed into weekly
- **Weekly summaries**: retained 6 months, then compressed into monthly
- **Monthly summaries**: retained indefinitely (until event cleanup)
- **Archived events**: summaries frozen at archival, deleted with 90-day cleanup
- Compression is deterministic (no AI): severity min/max/avg, concatenated milestones, latest phase label

## 2. Evolution Analyzer Service

**File:** `backend/app/services/evolution.py`

### Core function: `generate_evolution_summary(event_id, period_type)`

**Input assembly (hierarchical — Opus never sees raw history):**
- For **daily**: last 7 raw snapshots from `event_snapshots`
- For **weekly**: last 7 daily summaries from `evolution_summaries`
- For **monthly**: last 4 weekly summaries
- Plus: the chain of all previous phase labels + milestone dates (compact metadata, not full narratives)

**Prompt produces:**
1. `phase_label` — name the current phase or confirm unchanged
2. `key_developments` — significant changes in this period (severity jumps, new sites/suppliers, category shifts). Empty array if nothing changed
3. `exposure_delta` — how SKF exposure changed (new sites, lost suppliers, route changes)
4. `forward_outlook` — 1-2 sentences: what happens if nothing changes
5. `narrative` — 3-5 sentence plain-text evolution assessment

**Model:** `settings.analysis_model` (Opus) — deeper reasoning over temporal context.

### Scheduling cadence

| Severity | Frequency | Rationale |
|---|---|---|
| Critical | Every 6 hours | Fast-moving, decisions depend on trajectory |
| High | Daily | Important but not minute-by-minute |
| Medium | Weekly | Slow-moving, context-building |
| Low | Weekly (or on severity change) | Minimal attention needed |
| Archived | Never (unless resurrected) | Saves cost |
| Watching | Same as severity, but daily minimum | User flagged for attention |

Implemented as a new periodic task in `scheduler.py`: `run_evolution_analysis()`.

### Compression jobs

- `compress_daily_to_weekly()` — runs weekly (e.g. Sunday 02:00 UTC). Aggregates 7 dailies into 1 weekly.
- `compress_weekly_to_monthly()` — runs on 1st of month. Aggregates ~4 weeklies into 1 monthly.
- Both are deterministic: severity array = concatenated values, milestones = merged + deduped, phase = latest.

## 3. Archive Resurrection

### Trigger

In `upsert_event()` (database.py), when updating an existing event:

```
if event.status == 'archived':
    new_score = computed severity from incoming payload
    if new_score > event.archived_severity:
        status → 'active'
        resurfaced_at → now
        return flag: resurfaced=True
    else:
        update payload silently, stay archived
```

### On resurrection

1. Event moves to `active`, reappears in feed
2. `RESURFACED` badge shown on FeedCard (amber, shows score delta: "↑ RESURFACED +18")
3. Teams channel notification fires (resurface alert type)
4. Evolution analyzer runs an immediate out-of-cycle daily summary
5. Badge visible for 48 hours after `resurfaced_at`

### What does NOT trigger resurrection

- Same or lower severity re-detection → stays archived, payload updates silently
- Event past 90-day cleanup → scanner creates it fresh as a new event

### Archival changes

When user clicks "Archive" in Act tab:
- Store current severity score in `archived_severity` column
- Set `status = 'archived'`
- Freeze evolution summaries (no new analysis scheduled)

## 4. Teams Channel Notifications

### Phase 1: Incoming Webhook (immediate)

**File:** `backend/app/services/teams_channel.py`

Mirrors the Telegram pattern in `telegram.py`:

| Function | Purpose |
|---|---|
| `send_teams_channel_message(card, webhook_url)` | POST adaptive card JSON to webhook URL |
| `_format_channel_alert(item, mode, alert_type)` | Format message per alert type |
| `_should_alert(item)` | Severity threshold filter |
| `send_scan_channel_alerts(items, mode)` | Batch alerting after scan (dedup + filter + send) |

**Alert types:**

| Type | Trigger | Card Accent | Content |
|---|---|---|---|
| `scan_alert` | New Critical/High from scan | Red/Orange | Title, severity, region, description, link |
| `resurface` | Archived event resurrected | Amber | Title, old → new score, reason |
| `phase_transition` | Evolution detects new phase | Blue | Title, phase change, one-liner |
| `daily_digest` | Scheduled 07:00 UTC | Neutral | Count table, top 3 events, dashboard link |

**Configuration:**

```env
TEAMS_WEBHOOK_URL=https://skf.webhook.office.com/webhookb2/...
TEAMS_MIN_SEVERITY=High
TEAMS_DIGEST_ENABLED=true
```

**Deduplication:** Same pattern as Telegram — in-memory set backed by SQLite `alerted_events` table.

**Integration points:**
- `scans.py` → calls Teams after scan (alongside existing Telegram if configured)
- `evolution.py` → calls Teams on phase transitions
- `database.py` → resurrection triggers Teams resurface alert
- Health endpoint reports Teams webhook status

### Phase 2: Application permissions (future, pending admin consent)

Upgrade from Incoming Webhook to `ChannelMessage.Send` application permission for:
- Richer adaptive cards with actions (acknowledge, assign, open in SC Hub)
- Multi-channel routing (different channels for different severity tiers or BUs)
- Posts as "SC Hub" identity instead of generic webhook bot

**Required permission:** `ChannelMessage.Send` (Application) + `Channel.ReadBasic.All` (Application). Admin consent required. Request sent 2026-04-15.

## 5. Frontend — Evolution UI

### Hybrid layout (compact in Summary + full Evolution tab)

#### Summary tab — compact evolution card

- **Position:** below Score Breakdown, above Tracking section
- **Renders only if** evolution summaries exist for this event
- **Contents:**
  - Phase badge (numbered): `PHASE 3` in severity-colored pill
  - Phase label: "Structural Trade Shift"
  - Mini severity sparkline (reuse existing pattern, narrower)
  - "View timeline →" link that switches to Evolution tab
- **Hover tooltip on phase badge:** explains what phases mean and how they're detected

#### New Evolution tab (4th tab: Summary | Exposure | Evolution | Act)

**Phase banner:**
- Current phase number + label + "since {date}"
- Hover tooltip: "Phases are AI-detected transitions in the nature of a disruption — e.g. from logistics impact to structural trade realignment."

**Severity trajectory chart:**
- SVG, full width of the card
- X-axis = time, Y-axis = 0-100 score
- Data: severity values from evolution summaries (dailies recent, weeklies/monthlies further back)
- Phase transition markers: vertical dashed lines with phase labels
- Dots at transition points
- Hover tooltip on chart: "Severity score over time. Vertical markers indicate phase transitions detected by the evolution analyzer."

**Key milestones list:**
- Chronological: date (monospace) + one-line description
- Sourced from `key_developments` across all summaries, merged chronologically
- Hover tooltip on "Key Milestones" header: "Significant changes detected by the evolution analyzer — severity jumps, new sites affected, category shifts, or supply chain exposure changes."

**Exposure drift callout:**
- Only shown if `exposure_delta` is non-empty in latest summary
- Styled like the existing SKF Exposure box (subtle red border)
- Hover tooltip: "How SKF's exposure to this event has changed over time — new sites entering the risk zone, suppliers affected, or route dependencies shifting."

**AI evolution narrative:**
- Latest summary's `narrative` field
- Same styling as Risk Assessment block (muted text, 11px, line-height 1.6)
- Section header: "EVOLUTION ASSESSMENT"

**Forward outlook:**
- Separated visually, slightly emphasized (subtle blue border)
- Latest summary's `forward_outlook`
- Section header: "OUTLOOK"
- Hover tooltip: "AI projection of where this event is heading if the current trajectory continues without intervention."

#### Resurfaced badge (FeedCard)

- Amber badge, same size/style as existing `DUP` badge
- Text: "↑ RESURFACED +{delta}" showing score increase
- Visible for 48 hours after `resurfaced_at`, then auto-hides
- Hover tooltip (CardTip): "This event was previously archived but has resurfaced because its severity increased beyond the level at which it was dismissed."

#### Hover tooltips — all new elements

Every new UI element gets a tooltip using existing patterns:
- Phase badge → `InfoBadge` with glossary entry for phases
- Trajectory chart → `HoverTip` wrapper
- Milestones header → section tooltip
- Exposure drift → `HoverTip` wrapper
- Forward outlook → `HoverTip` wrapper
- Resurfaced badge → `CardTip` in FeedCard

### New API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/events/{id}/evolution` | All summaries for an event (frontend assembles timeline) |
| GET | `/events/{id}/evolution/latest` | Most recent summary only (for compact card) |

## 6. Cost Estimate

| Component | Monthly volume | Model | Est. cost |
|---|---|---|---|
| Critical evolution (6h) | ~20 events × 120/mo = 2,400 | Opus | ~$30 |
| High evolution (daily) | ~40 events × 30/mo = 1,200 | Opus | ~$15 |
| Medium/Low (weekly) | ~80 events × 4/mo = 320 | Opus | ~$4 |
| Phase transition alerts | ~10-20/mo | N/A (template) | $0 |
| Teams webhook calls | ~200/mo | N/A | $0 |
| **Total incremental** | | | **~$50/mo** |

Combined with existing scanning (~$30/mo Sonnet) and on-demand analysis (~$10/mo Opus), total platform Bedrock cost: **~$90/mo**.

## 7. Files to Create/Modify

**New files:**
- `backend/app/services/evolution.py` — evolution analyzer + compression
- `backend/app/services/teams_channel.py` — Teams webhook notifications
- `backend/tests/test_evolution.py` — evolution analyzer tests
- `backend/tests/test_teams_channel.py` — Teams notification tests

**Modified files:**
- `backend/app/db/database.py` — new table, columns, queries
- `backend/app/services/scheduler.py` — evolution + compression periodic tasks
- `backend/app/routers/events.py` — evolution endpoints + resurrection flag
- `backend/app/routers/scans.py` — Teams alerts alongside Telegram
- `backend/app/routers/health.py` — Teams status in health check
- `backend/app/config.py` — Teams webhook config vars
- `frontend/src/services/api.ts` — fetchEvolution, fetchEvolutionLatest
- `frontend/src/v3/components/ExpandedCard.tsx` — compact evolution card in Summary, new Evolution tab
- `frontend/src/v3/components/FeedCard.tsx` — RESURFACED badge
- `frontend/src/v3/components/expandedcard_types.ts` — evolution types
