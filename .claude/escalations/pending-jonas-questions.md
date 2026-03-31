# Pending Escalations — Questions for Jonas

> These questions have persisted across 2+ sessions without resolution. They are not blocking current work but affect strategic direction.

## E1: Demo Timeline for Steffen

**Question:** When does Steffen need to see this tool?
**Why it matters:** Determines whether we optimize for demo polish or feature depth. If next week → stop adding features, polish what exists. If next quarter → time for Layer 3 (scenario modeling).
**Provisional decision:** Continuing to build while keeping demo-ready. The tool IS ready for a walkthrough today.
**First raised:** 2026-03-29

## E2: Scanning Cost Approval

**Question:** Is $10-15/day Claude API scanning cost acceptable? Monthly budget cap?
**Why it matters:** The scheduled scanner (15m/30m/60m cadence) consumes Claude API credits. Without explicit approval, we're incurring cost without sign-off. If scanning has been running, there may already be an accumulated bill.
**Provisional decision:** Scanner is configured but not running continuously. Manual scans only until approved.
**First raised:** 2026-03-29

## E3: Telegram Bot Ownership

**Question:** Is the current shared Telegram bot acceptable, or should we create a dedicated one for the Disruption Monitor?
**Why it matters:** A shared bot may send alerts that confuse recipients if it's used for other projects too.
**Provisional decision:** Using shared bot for now. Works but not production-grade.
**First raised:** 2026-03-29

## E4: AWS SCP Blocker

**Question:** Any update from the cloud team on the SCP (Service Control Policy) that blocks AWS deployment?
**Why it matters:** Determines deployment strategy. If AWS is available, deploy there (supports persistent background scanning). If not, Vercel is ready but has limitations for scheduled background tasks.
**Provisional decision:** If no update by next session, commit to Vercel deployment as Plan A.
**First raised:** 2026-03-29

## E5: Supplier-Site Mapping Granularity

**Question:** Do we have access to actual supplier-to-site mappings (which supplier serves which factory)?
**Why it matters:** The tool has 5,090 suppliers across 53 countries, but mapping is country-level ("Turkey has 147 suppliers"). Wow moment #3 ("told me what to do") requires site-level mapping to recommend specific backup suppliers.
**Provisional decision:** Using country-level aggregation. Recommendations stay at region level until site-level data is available.
**First raised:** 2026-03-30
