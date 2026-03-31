# Strategy Directive — 2026-03-29

**From:** Strategy Agent
**To:** Frontend, Backend, Test agents
**Grade:** B+ (upgraded from B). Live scanning changes everything.
**Target by end of session:** A-

---

## The Situation

Live Claude scanning is working. 12 real-time disruptions detected from web search, including Iran-US/Strait of Hormuz (Critical), global port congestion (Critical), auto supplier bankruptcies (High). This is the single most important milestone since decomposition. We have crossed the line from "demo with sample data" to "tool with live intelligence."

But we are not at A- yet. Here is why.

---

## Reassessment of the Three Wow Moments

### Wow #1: "The tool knew before I did."
**Status: 60% (was 30%).**
Live scanning means the tool IS detecting real disruptions before Steffen reads the news. That is the core unlock. What is missing: push notification to his phone. The Telegram bot token exists. This is shippable today. Without push, Steffen has to remember to open the tool. With push, the tool reaches out to HIM. That is the difference between "nice dashboard" and "indispensable."

### Wow #2: "I walked into the meeting and owned the room."
**Status: 85% (was 80%).**
The overlay panel has structured actions, owner teams, urgency badges, recovery timelines, confidence scores. With live data flowing, this is close. What is missing: the narrative quality of live data needs to be verified. Do the 12 live disruptions render cleanly in the panel? Are the SKF exposure descriptions specific enough ("affects Gothenburg manufacturing" not just "affects Europe")? Does the KPI strip correctly count 12 items instead of the 10 sample items? This is a polish and verification task, not a build task.

### Wow #3: "It told me what to do, not just what happened."
**Status: 70% (unchanged).**
Structured recommendations exist for disruptions mode but NOT for geopolitical and trade modes. When a live geopolitical scan returns 6-8 risks, the overlay panel will fall back to raw text display. That looks broken next to the polished disruptions view. Parity across all three scan modes is required.

---

## The Single Most Impactful Thing We Can Ship Today

**Telegram push notifications for Critical disruptions.**

Rationale: Live scanning is the engine. Push notifications are the delivery mechanism. Without push, we have a pull-based tool that competes with every other tab Steffen has open. With push, we have a system that interrupts his morning with "CRITICAL: Strait of Hormuz disruption detected -- 3 SKF sites affected -- tap for details." That is wow moment #1, fully delivered.

The token is available. The scheduler already runs every 15 minutes. The integration is: after each scan, filter for Critical severity, send a Telegram message. This is a 2-hour backend task, not a research project.

---

## Agent Directives

### BACKEND AGENT -- Priority Order

1. **Telegram push notifications (SHIP TODAY)**
   - After each scheduled scan completes, check for Critical and new High severity items
   - Send a formatted Telegram message: event title, severity, affected SKF sites, one-line recommended action, link to the tool
   - Use the bot token from .env (TELEGRAM_BOT_TOKEN)
   - Need a chat ID configured (Jonas: add TELEGRAM_CHAT_ID to .env -- this is the group or channel ID where alerts should go)
   - Add a /api/v1/notifications/test endpoint to send a test alert manually
   - Respect a cooldown: do not re-alert on the same event within 4 hours

2. **Geopolitical + trade structured recommendations**
   - The disruption scan prompt asks for `recommended_action` and `skf_exposure` -- good
   - The geopolitical prompt asks for `skf_relevance` and `watchpoint` but NOT structured recommendations with owner/urgency
   - The trade prompt asks for `recommended_action` and `skf_cost_impact` but the frontend expects a different shape
   - Normalize: all three scan modes should return a consistent recommendations structure that the frontend can render identically
   - Add to prompts: `impact_sites` (list of affected SKF site names), `impact_suppliers_count` (number), `recommended_actions` (array of {action, owner, urgency}), `recovery_estimate` (string)

3. **Scan result validation**
   - The prompt asks for 8-12 disruptions. Live scan returned 12. Good.
   - But what if Claude returns 15? Or 5? Or malformed JSON?
   - Add guardrails: log a warning if count is outside expected range, validate required fields exist on each item, drop items missing lat/lng

### FRONTEND AGENT -- Priority Order

1. **Verify live data rendering (CRITICAL PATH)**
   - The 10-second test must pass with 12 live items, not just 10 sample items
   - KPI strip counts must update correctly (severity breakdown may differ from sample data)
   - Confirm the data source indicator shows "LIVE" when backend returns source: "live"
   - Test: what happens if a live disruption has a severity the frontend does not expect? Defensive coding.

2. **Live data narrative polish**
   - When a live disruption card is expanded, does the SKF exposure text render well?
   - Live data descriptions are longer and more detailed than sample data. Does the panel layout handle this without overflow or truncation?
   - Confidence and sources section: live data may not have the same source structure as sample data. Verify graceful fallback.

3. **Last-scanned timestamp**
   - Show "Last scanned: 3 minutes ago" in the header or KPI strip
   - This is critical for trust. If the user sees "Last scanned: 2 hours ago" they know something is wrong. If they see "3 minutes ago" they trust the data.
   - Show the scan source: "Live scan via Claude API" vs "Sample data (no API key)"

4. **Notification badge concept (if time permits)**
   - When new Critical disruptions are detected since last user visit, show a red badge on the app title or a toast notification
   - This is the in-app version of the Telegram alert

### TEST AGENT -- Priority Order

1. **Live scan integration test**
   - Hit /api/v1/scans/disruptions with a real API key
   - Verify: response has source: "live", items is a non-empty array, each item has required fields (event, severity, lat, lng)
   - Verify: items have valid severity values (Critical, High, Medium, Low -- not "critical" lowercase)
   - Verify: lat/lng are within valid ranges (-90 to 90, -180 to 180)

2. **KPI strip count test**
   - Render the frontend with mock data of varying lengths (5, 10, 12, 15 items)
   - Verify KPI strip correctly counts severity breakdown for each

3. **Telegram notification test**
   - Mock test: verify the notification formatter produces the expected message format
   - Integration test: send a real test message to the configured chat ID

4. **Regression: sample data fallback**
   - Remove API key, verify the system falls back gracefully to sample data
   - Verify the data source indicator shows "SAMPLE" or "OFFLINE"

---

## Open Decisions

### Scanning cadence
15 minutes for disruptions is correct. This balances API cost (~$0.10-0.20 per scan) against freshness. At 15-minute intervals, daily cost is approximately $10-15. Acceptable for a tool targeting VP-level users.

### Telegram vs Teams
Ship Telegram first. It is simpler (HTTP POST to an API), Jonas already has the bot token, and it works on mobile. Teams integration requires webhook configuration and corporate IT involvement. We can add Teams later as a second channel.

### The 10-second test with live data
The test specification says "within 10 seconds know: Are we okay today? If not, where and why?" With 12 live items instead of 10 sample items, the test should still pass IF:
- The KPI strip renders immediately (no loading spinner for counts)
- The map shows severity-coded markers for all 12 events
- The severity breakdown is accurate

If live data takes >3 seconds to fetch from the backend, the frontend should show cached/last-known data immediately while fetching fresh data in the background. Never show an empty state on first load.

### Should we prioritize polish over new features?
YES. Emphatically yes. The worst outcome is shipping Telegram notifications that point to a tool where live data renders badly. Priority order is:
1. Live data renders perfectly (Frontend)
2. All three scan modes have consistent recommendation structure (Backend)
3. Telegram notifications (Backend)
4. Everything else

---

## Demo Readiness Assessment

| Aspect | Grade | Notes |
|--------|-------|-------|
| First impression (10s test) | A- | Live data with real disruptions. Needs verification with 12 items |
| Map visualization | B+ | Markers work, pulsing works. Clustering still missing at global zoom |
| Overlay panel (disruptions) | A- | Structured actions, recovery timelines, confidence. Strong |
| Overlay panel (geo/trade) | C+ | Falls back to raw text. Needs parity with disruptions |
| Push notifications | F | Not shipped yet. This is the gap |
| Data freshness | A | 15-minute auto-scan with live Claude API |
| Persistence | A- | SQLite with upsert, lifecycle management, scan history |
| Professional feel | B+ | Dark theme, glassmorphic panels, SKF branding. Minor polish needed |
| **Overall** | **B+** | Live scanning moved the needle significantly |

**To reach A-:** Ship Telegram notifications + verify live data renders cleanly + normalize geo/trade recommendations.

**To reach A:** Add historical timeline (30-day trend) + in-app notification system + scenario modeling stub. That is next session.

---

## A Note on Ambition

We are building the tool that makes SKF's supply chain leadership say "I cannot start my Monday without this." Not "nice dashboard." Not "interesting prototype." The tool that Steffen texts Ganesh about at 7:45am saying "check the Monitor before the call."

Live scanning was the unlock. Now the question is not "does it work?" but "does it feel indispensable?" Push notifications are the answer. When Steffen's phone buzzes at 6am with "CRITICAL: Strait of Hormuz disruption -- 3 manufacturing sites affected -- recommended action: activate alternative routing via Cape of Good Hope" -- that is the moment the tool becomes irreplaceable.

Ship it today.

---

*Strategy Agent, 2026-03-29*
