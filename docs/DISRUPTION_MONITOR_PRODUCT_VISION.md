# SC Hub Disruption Monitor — Product Vision & Developer Brief

**Version:** 1.0
**Date:** 2026-03-28
**Author:** Jonas Henriksson, Head of Strategic Planning & Supply Chain Intelligence, SKF Group
**Status:** Active — source of truth for all development

---

## 1. The One-Line Vision

**The tool that makes Steffen say at 8:02am: "We have exposure in Turkey — 3 manufacturing sites, 12 suppliers affected — here's our mitigation." Before anyone else in the room even knew there was an earthquake.**

---

## 2. Why This Exists

### 2.1 The Problem

SKF operates 245 sites across 69 countries, sourcing from 5,090 suppliers across 53 countries. Today, supply chain disruption awareness is fragmented:

- **News monitoring is manual.** Someone reads Reuters, someone else checks logistics feeds, someone hears from a supplier. Nobody has the full picture.
- **Impact assessment is slow.** When a disruption hits, it takes hours to days to map which SKF sites and suppliers are affected. The question "how exposed are we?" takes too long to answer.
- **There is no single view.** No executive can open one screen and know: "Are we okay today? If not, where and why?"
- **Reactive, not proactive.** We learn about disruptions after they impact us, not before.

### 2.2 The Opportunity

AI-powered real-time scanning of global news, matched against SKF's actual geographic footprint, can compress the disruption awareness cycle from days to minutes. This is not a dashboard — it is a **situational awareness system** for supply chain leadership.

### 2.3 Strategic Context

The Disruption Monitor is one of three platforms in the SC Hub intelligence ecosystem:

| Platform | Purpose | Focus |
|----------|---------|-------|
| **Disruption Monitor** | External risk awareness | "What's happening in the world that affects us?" |
| **GoldenEye** | Internal gap management | "Where are our MSP/availability gaps and root causes?" |
| **TARS** | Personal AI operating system | "Help me manage my work, meetings, and decisions" |

The Disruption Monitor is the **outward-facing eye** — it watches the world so SKF doesn't get surprised. GoldenEye is the **inward-facing diagnostic** — it watches our own network. Together, they form a complete supply chain intelligence picture. Future integration between the two is a strategic north star: a disruption detected by the Monitor should automatically surface affected channels and gap projections in GoldenEye.

---

## 3. Users & Use Cases

### 3.1 Primary Persona: Steffen (VP Supply Chain)

**The Monday Morning Scenario:**
Steffen opens the Disruption Monitor before the weekly SC leadership call. In 10 seconds he knows:
- Global risk level (green/amber/red)
- Number of active disruptions and their severity
- Which SKF manufacturing sites are affected
- Which suppliers are exposed

He clicks on the Turkey cluster. A panel slides up with a narrative: "Earthquake in Izmir (magnitude 6.2) — 2 SKF manufacturing sites within 50km, 8 suppliers affected, estimated production impact: X units/week, recommended actions: activate backup suppliers in Romania."

He walks into the meeting and owns the room. That's the product.

### 3.2 Secondary Persona: Ganesh (SC Leadership)

Opens the Monitor before board presentations. Needs the 30-day risk trend: "Our exposure has decreased 15% this quarter." Uses the tool to show the board that SKF has proactive supply chain risk management — a competitive advantage.

### 3.3 Tertiary Persona: SC Hub Analyst

Drills into individual suppliers, investigates historical disruptions, models what-if scenarios ("what if Suez closes again?"), and builds the institutional memory of how SKF responds to disruptions. Needs depth, not just summary.

### 3.4 The 10-Second Test

Every design decision must pass this test: **Can the user open this tool and within 10 seconds know "Are we okay today? If not, where and why?"** If the answer is no, the design fails.

---

## 4. Design Philosophy

### 4.1 The Three Metaphors

1. **Bloomberg Terminal for Supply Chain Risk.** Dense, real-time, information-rich, but not cluttered. Professional. The kind of tool that makes people lean in, not squint. Every pixel earns its place.

2. **A Living Map.** The map breathes — critical sites pulse, severity glows, transitions animate. The interface feels alive because the supply chain IS alive. Static = dead.

3. **From Diagnostic to Prescriptive.** Showing what's wrong is table stakes. The wow moment is when the tool tells you what to DO about it. "Earthquake in Izmir → activate backup suppliers in Romania, estimated 6-week recovery." That's the leap from dashboard to intelligence.

### 4.2 Core Design Principles

| Principle | What It Means |
|-----------|---------------|
| **10-second insight** | Global risk status visible without clicking anything |
| **Progressive disclosure** | Executive gets the summary; analyst can drill to atoms |
| **Every screen answers "so what?"** | Not just what's wrong — what to do about it |
| **Signal over noise** | If false positive rate exceeds 5%, people stop trusting it and stop opening it. Precision > recall. |
| **The map is Layer 1, not the whole product** | The map anchors the experience, but the value lives in panels, narratives, timelines, and recommendations below it |
| **Humanize the data** | Factory names, not codes. "Dalian LSB" not "759I". Countries, not coordinates. People, not rows. |
| **Professional density** | This is a tool for senior leaders. No toy colors, no gratuitous animation. Navy, white, severity reds/ambers, SKF gold (#FFC423) as accent. |

### 4.3 Visual Identity

| Element | Value |
|---------|-------|
| Primary dark | Navy #003057 |
| SKF accent | Gold #FFC423 |
| Severity — Critical | Red (pulsing glow) |
| Severity — High | Orange/amber |
| Severity — Medium | Yellow |
| Severity — Low | Blue/teal |
| Severity — Clear | Green (no active alerts) |
| Background | Dark navy base with frosted-glass panels |
| Typography | System fonts, clean hierarchy |
| Panel style | Frosted-glass (glassmorphic), slides up from bottom |

---

## 5. Product Layers

The Disruption Monitor is conceptualized in four progressive layers. Each layer is independently valuable, but each subsequent layer multiplies the value of the previous ones.

### Layer 1: The Map — Situational Awareness

**What:** A D3.js world map showing all 245 SKF sites and 5,090 suppliers, with severity-coded markers that pulse when affected by active disruptions. AI-powered news scanning matches global events to geographic proximity of SKF assets.

**Core Features:**
- World map (Natural Earth projection) with country boundaries
- SKF site markers — color-coded by classification (manufacturing, aerospace, logistics, sales, admin), size-coded by significance, pulsing when affected
- Supplier bubble layer — 5,090 suppliers as a secondary layer, togglable, showing concentration risk
- Disruption zones — shaded regions around active disruptions showing blast radius
- Severity-coded overlays — red glow for critical, amber for high, etc.
- Zoom scaling — markers and labels adapt to zoom level, declutter at global view, show detail at regional view
- KPI strip — top bar showing global risk score, number of active disruptions by severity, total sites affected, total suppliers affected

**The Test:** Open the map. In 10 seconds, you know: we have 2 critical disruptions (Turkey earthquake, Panama Canal drought), affecting 5 manufacturing sites and 23 suppliers. Green everywhere else. Done.

### Layer 2: The Risk Timeline — Trend & History

**What:** How has our exposure changed over 30, 60, 90 days? Are we getting safer or more exposed? Historical disruption log with impact assessment.

**Core Features:**
- Timeline view showing disruption events over time
- Exposure trend line (composite risk score over time)
- Historical disruption cards — what happened, which sites were affected, what was the response, what was the recovery time
- "This time last year" comparison — seasonal risk patterns (monsoon season, hurricane season, etc.)
- Institutional memory — when we faced a similar disruption before, how did we respond?

### Layer 3: Scenario Modeling — What If

**What:** "What if the Suez Canal closes again? What if there's a major earthquake in the Kanto region?" Model hypothetical disruptions against real SKF footprint data.

**Core Features:**
- Select a disruption type (earthquake, flood, port closure, geopolitical, pandemic)
- Select a location or chokepoint (Suez, Panama, Malacca, Bosporus, Taiwan Strait)
- The system calculates: which SKF sites are within the blast radius, which suppliers are affected, which product lines are at risk, estimated revenue impact
- Side-by-side comparison: "Current state vs. if Suez closes"
- Export scenario as briefing document

### Layer 4: Automated Alerts & Integration

**What:** Push notifications when a critical risk is detected near a key SKF asset. Integration with GoldenEye for downstream impact analysis.

**Core Features:**
- Configurable alert thresholds by site importance (manufacturing sites = critical, sales offices = low)
- Push notifications via Telegram, email, or Teams
- Auto-generated disruption narrative: "Earthquake in Izmir (magnitude 6.2) — 2 SKF manufacturing sites within 50km, 8 suppliers affected, estimated production impact: X units/week, recommended actions: activate backup suppliers in Romania."
- GoldenEye integration — when a disruption affects a manufacturing site, auto-surface the affected MSP channels and gap projections
- Chokepoint monitoring — continuous watch on Suez, Panama, Malacca, Bosporus, Taiwan Strait, major port congestion

---

## 6. Data Foundation

### 6.1 SKF Sites (245 total)

Parsed from `SKF_Locations_Validated.xlsx`. Every site is classified and geocoded.

| Classification | Count | Significance |
|---------------|-------|--------------|
| Manufacturing | 20 | **Critical** — production impact, highest alert priority |
| Aerospace | 7 | **Critical** — regulated industry, high-value |
| Logistics | 5 | **High** — distribution bottleneck risk |
| Sales | 93 | **Medium** — commercial impact, lower operational risk |
| Admin | 12 | **Low** — primarily personnel safety |
| Other/Unclassified | ~101 | Varies |

**Total countries:** 69

**Data quality requirements:**
- Every site must have validated coordinates (latitude/longitude verified against known address)
- Every site must have a classification
- Coordinates must be accurate to within 0.1 degrees — off by 0.5 degrees puts a site in the wrong country
- Manufacturing and aerospace sites must have production capacity metadata (to estimate disruption impact)

### 6.2 Suppliers (5,090 total)

| Metric | Value |
|--------|-------|
| Total suppliers | 5,090 |
| Countries | 53 |
| With geocoded locations | TBD (validation needed) |

**Supplier data enrichment roadmap:**
- Phase 1: Geocode all suppliers to country + city level
- Phase 2: Map suppliers to SKF sites they serve (supply chain linkage)
- Phase 3: Identify single-source suppliers (concentration risk)
- Phase 4: Tier 2/3 supplier visibility (sub-supplier risk)

### 6.3 Disruption Data Sources

The AI scanning engine uses Anthropic's Claude API with web search to continuously scan for:

| Disruption Type | Sources | Examples |
|----------------|---------|----------|
| Natural disasters | USGS, GDACS, weather services | Earthquakes, floods, typhoons, volcanic eruptions |
| Geopolitical | News agencies, government advisories | Sanctions, trade restrictions, conflict zones, political instability |
| Logistics | Port authorities, shipping trackers | Port closures, canal blockages, shipping delays, congestion |
| Supplier-specific | Industry news, regulatory filings | Bankruptcies, factory fires, quality recalls, labor strikes |
| Pandemic/health | WHO, CDC, local health agencies | Disease outbreaks, lockdowns, quarantine zones |
| Climate/environment | Environmental agencies | Drought (Panama Canal water levels), extreme heat, wildfires |

### 6.4 Chokepoint Watch List

Permanent monitoring on global logistics chokepoints:

| Chokepoint | Why It Matters |
|-----------|----------------|
| Suez Canal | 12% of global trade, key Europe-Asia route |
| Panama Canal | Americas trade, drought-sensitive |
| Strait of Malacca | 25% of global shipping, key Asia route |
| Bosporus/Dardanelles | Black Sea access, energy transit |
| Taiwan Strait | Semiconductor supply chain, geopolitical risk |
| Strait of Hormuz | Energy supply, broader economic impact |
| Major ports | Rotterdam, Shanghai, Singapore, LA/Long Beach — congestion monitoring |

---

## 7. Architecture & Tech Stack

### 7.1 Current State

The project exists as a single 183KB JavaScript source file (`sc-disruption-map`) containing the full working prototype. This monolith needs to be decomposed into a proper project structure as the first development task.

### 7.2 Target Architecture

```
disruption-monitor/
├── .claude/                    # Agent definitions
│   └── commands/
│       └── team.md
├── frontend/                   # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/            # D3.js world map
│   │   │   ├── OverlayPanel/   # Frosted-glass disruption panel
│   │   │   ├── KPIStrip/       # Top-bar risk summary
│   │   │   ├── Timeline/       # Risk timeline (Layer 2)
│   │   │   └── ScenarioModel/  # What-if simulator (Layer 3)
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   └── public/
├── backend/                    # API + AI scanning engine
│   ├── src/
│   │   ├── scanning/           # AI-powered disruption detection
│   │   ├── matching/           # Geo-matching to SKF assets
│   │   ├── severity/           # Severity scoring engine
│   │   ├── data/               # Site + supplier data pipeline
│   │   └── api/                # REST endpoints for frontend
│   └── data/
│       ├── sites.json          # 245 SKF sites (derived from Excel)
│       └── suppliers.json      # 5,090 suppliers
├── docs/                       # This document + operational docs
├── infra/                      # AWS CDK (Python) — deployment
│   ├── cdk.json
│   └── stacks/
└── sc-disruption-map           # Original monolith (reference only)
```

### 7.3 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend framework** | React 18+ with TypeScript (strict) | Component-based, type-safe, team familiarity |
| **Map rendering** | D3.js (Natural Earth projection) | Full control over map projection, markers, zoom, animation. Performance-critical with 245 + 5,090 data points. |
| **State management** | React hooks + context (start simple) | Avoid over-engineering; upgrade to Zustand if complexity warrants |
| **AI scanning engine** | Anthropic Claude API with web search tool | Real-time disruption detection using Claude's reasoning + web search for current events |
| **Backend API** | Node.js / Express or Fastify | Lightweight API layer serving pre-processed risk data to frontend |
| **Data storage** | JSON files → PostgreSQL (as data grows) | Start with static JSON for sites/suppliers, graduate to DB when historical data accumulates |
| **Deployment — primary** | AWS CDK (Python), eu-west-1 | SKF's cloud platform. Account: 317683112105, role: devops_extended. Currently blocked by corporate SCP on IAM role creation during CDK bootstrap — email sent to cloud team. |
| **Deployment — fallback** | Vercel | Fallback package prepared if AWS unblocking takes too long. Quick-deploy for demos. |
| **Styling** | CSS-in-JS or Tailwind | Dark theme with frosted-glass panels, severity color system |

### 7.4 AWS Deployment Details

- **Account:** 317683112105
- **Region:** eu-west-1
- **Role:** devops_extended
- **Blocker:** Corporate SCP preventing IAM role creation during `cdk bootstrap`
- **Resolution path:** Email sent to cloud team. Once unblocked:
  ```bash
  cd infra
  .venv\Scripts\Activate.ps1
  cdk bootstrap --profile skf
  cdk deploy --profile skf
  ```
- **Fallback:** Vercel deployment package prepared

---

## 8. AI Scanning Engine — Design Specification

### 8.1 Scanning Architecture

The scanning engine is the heart of the product. It uses Claude's web search capability to continuously monitor global news for supply chain-relevant disruptions, then matches detected events to SKF's geographic footprint.

**Scanning cycle:**
1. **Scan** — Claude API with web search queries for disruption categories (natural disaster, geopolitical, logistics, supplier)
2. **Parse** — Extract structured data: event type, location, severity, affected area (blast radius)
3. **Match** — Cross-reference disruption location against SKF site coordinates and supplier locations
4. **Score** — Assign severity based on: disruption magnitude × proximity to SKF assets × asset criticality
5. **Narrate** — Generate human-readable disruption narrative for the overlay panel
6. **Deduplicate** — Merge multiple news sources reporting the same event
7. **Persist** — Store disruption record for historical analysis

### 8.2 Severity Scoring Model

```
Severity = f(Event Magnitude, Proximity, Asset Criticality, Supply Chain Impact)

Where:
- Event Magnitude: Scale of the disruption (earthquake magnitude, flood severity, etc.)
- Proximity: Distance from disruption epicenter to nearest SKF asset (km)
- Asset Criticality: Manufacturing (1.0) > Aerospace (1.0) > Logistics (0.7) > Sales (0.3) > Admin (0.1)
- Supply Chain Impact: Number of affected suppliers × supplier importance
```

| Severity | Criteria | Visual |
|----------|----------|--------|
| **CRITICAL** | Manufacturing/aerospace site within blast radius, or >20 suppliers affected, or chokepoint closure | Pulsing red glow, immediate alert |
| **HIGH** | Manufacturing site within 200km, or 10-20 suppliers affected, or major port disruption | Solid amber marker |
| **MEDIUM** | Any SKF site within 100km, or 5-10 suppliers affected | Yellow marker |
| **LOW** | Sales/admin site affected, or <5 suppliers, or early-stage monitoring | Blue/teal marker |

### 8.3 Geo-Disambiguation

Critical challenge: "Georgia" — the country or the US state? "Turkey" — the country or the bird? The AI scanning engine must handle geographic disambiguation correctly.

**Rules:**
- Always resolve to the most supply-chain-relevant interpretation
- Use surrounding context (earthquake in Georgia = country; factory fire in Georgia = check context)
- When ambiguous, flag for human review rather than guess
- Test adversarially with known ambiguous place names

### 8.4 Signal Quality

**The 95% accuracy threshold:** If the tool generates too many false positives, people stop trusting it. If it misses real disruptions, people stop relying on it. The target is:
- **Precision > 95%** — when the tool says there's a disruption, there really is one
- **Recall > 85%** — the tool catches most real disruptions (some delay acceptable for low-severity events)
- **False positive handling** — when a false positive is detected, the system learns and adjusts

---

## 9. Frontend Specification

### 9.1 Map Component

**Projection:** Natural Earth (aesthetically pleasing for global view, familiar to executives)

**Markers — SKF Sites:**
- Size: proportional to site significance (manufacturing = large, sales = small)
- Color: follows severity system when affected; neutral navy (#003057) when clear
- Shape: circle for standard, diamond for single-source risk
- Animation: pulsing glow for critical severity, subtle breathing for high severity
- Label: site name appears on hover and at sufficient zoom level
- Clustering: at global zoom, sites in proximity cluster with count badge

**Markers — Suppliers:**
- Togglable layer (off by default to reduce visual noise)
- Smaller, semi-transparent bubbles
- Color: severity-coded when affected; neutral gray when clear
- Clustering: aggressive clustering at global zoom (5,090 points require performance optimization)

**Disruption Zones:**
- Semi-transparent shaded circles around disruption epicenters
- Radius proportional to disruption blast radius
- Color follows severity system
- Click to open disruption detail in overlay panel

**Zoom Behavior:**
- Global view (default): only manufacturing/aerospace sites labeled, aggressive clustering, KPI strip visible
- Regional view: all site types labeled, clusters expand, supplier layer becomes useful
- Local view: individual supplier bubbles visible, full detail labels

### 9.2 KPI Strip (Top Bar)

Always visible, regardless of zoom level or panel state. Glass-morphic style on dark background.

```
┌──────────────────────────────────────────────────────────────────────┐
│  DISRUPTION MONITOR   ● 2 CRITICAL  ● 3 HIGH  ● 7 MEDIUM  ● 12 LOW │
│  5 MFG SITES AFFECTED  │  23 SUPPLIERS EXPOSED  │  RISK TREND: ▲    │
└──────────────────────────────────────────────────────────────────────┘
```

Each element is clickable — "2 CRITICAL" filters the map to show only critical disruptions.

### 9.3 Overlay Panel (Bottom)

Slides up from the bottom when a disruption zone or affected site is clicked. Frosted-glass styling. Occupies 35-40% of viewport in summary mode, expandable to 70% for detail.

**Summary Mode (default — executive view):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● EARTHQUAKE — IZMIR, TURKEY                          CRITICAL      │
│   Magnitude 6.2 · Detected 2h ago · Last updated 15m ago            │
│──────────────────────────────────────────────────────────────────────│
│                                                                      │
│  AFFECTED SKF ASSETS          │  NARRATIVE                           │
│  ● 2 Manufacturing sites      │  6.2 magnitude earthquake struck     │
│  ● 1 Logistics hub            │  45km SE of Izmir. Two SKF bearing   │
│  ● 8 Suppliers                │  manufacturing plants within blast   │
│  Est. impact: 12K units/week  │  radius. Supplier cluster in Manisa  │
│                               │  province (8 suppliers) likely        │
│  RECOMMENDED ACTIONS          │  affected. Local infrastructure       │
│  1. Contact site managers     │  damage reported.                     │
│  2. Activate Romania backup   │                                       │
│  3. Notify affected BAs       │                                       │
│                               │                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Detail Mode (analyst — drag up to expand):**
- List of all affected sites with distance from epicenter
- List of all affected suppliers with criticality rating
- Historical precedent: "Last earthquake in this region: 2020, impact lasted 3 weeks"
- News sources feeding this disruption assessment
- Timeline of event updates
- Export as briefing PDF

### 9.4 Regional Grouping

The overlay panel can also be accessed in a grouped view — "Show all disruptions in EMEA" — which lists all active disruptions in a region, sorted by severity. This is the view Steffen uses to scan by region rather than by individual event.

---

## 10. Performance Requirements

| Metric | Target | Rationale |
|--------|--------|-----------|
| Map initial render | < 2 seconds | First impression matters; executives won't wait |
| Map interaction (pan/zoom) | 60fps | Must feel fluid; laggy maps feel broken |
| Marker rendering (245 sites) | < 500ms | Sites are the primary data layer |
| Supplier layer toggle | < 1 second | 5,090 points require efficient rendering |
| AI scan cycle | Every 15 minutes | Balance between freshness and API cost |
| Overlay panel animation | < 300ms | Smooth slide-up, no jank |
| Full page load (cold) | < 5 seconds | Including data fetch and initial AI scan results |

### 10.1 Performance Optimization Strategy

- **Virtual rendering** for supplier layer — only render suppliers in the current viewport
- **Pre-computed clusters** — server-side clustering at multiple zoom levels
- **Canvas rendering** for large marker sets — SVG for < 500 elements, Canvas for > 500
- **Incremental data loading** — sites first (critical path), suppliers lazy-loaded
- **AI scan caching** — cache scan results, only refresh on schedule or manual trigger

---

## 11. What Makes This Indispensable vs. A Nice Demo

The difference between a tool people use every day and a tool they demo once then forget:

| Demo | Indispensable |
|------|--------------|
| Shows dots on a map | Shows which dots matter RIGHT NOW |
| Pretty visualization | Actionable intelligence with recommendations |
| Works with sample data | Works with real, validated, current data |
| Flags everything | Flags the right things (precision > recall) |
| Shows what happened | Shows what to DO about it |
| Manual refresh | Continuous monitoring with alerts |
| Standalone tool | Integrated with GoldenEye, Teams, email |
| One view for everyone | Executive summary + analyst deep-dive |

### 11.1 The Three "Wow Moments"

These are the moments where a user says "this just saved me hours." Every development decision should be evaluated against whether it brings us closer to these moments:

1. **"The tool knew before I did."** A disruption happens. Before anyone emails, before anyone checks the news, the Disruption Monitor has already identified the event, matched it to affected SKF assets, and pushed a notification to Steffen's phone with a pre-written briefing narrative.

2. **"I walked into the meeting and owned the room."** Steffen opens the Monitor 5 minutes before the SC leadership call. He sees the global risk state, clicks into the one critical item, reads the narrative, and walks in with a complete situation report. Nobody else had this information.

3. **"It told me what to do, not just what happened."** The overlay panel doesn't just say "earthquake in Turkey, 2 sites affected." It says "activate backup suppliers in Romania (3 capable, 2 have available capacity), contact Dalian for TRB reallocation, estimated recovery: 6 weeks with mitigation, 14 weeks without." That's the leap from diagnostic to prescriptive.

---

## 12. Development Phases

### Phase 1: Foundation (Current → Layer 1 Complete)

**Goal:** Decompose the 183KB monolith into a proper project structure and verify feature parity.

- [ ] Read and fully understand `sc-disruption-map` (the existing monolith)
- [ ] Scaffold proper project structure (frontend/, backend/, docs/, infra/)
- [ ] Decompose monolith into modular React components
- [ ] Verify refactored version runs identically to original
- [ ] Validate all 245 site coordinates and classifications
- [ ] Validate supplier data layer
- [ ] Implement proper zoom scaling behavior
- [ ] Polish overlay panel (grouped by region/severity)
- [ ] Implement KPI strip
- [ ] Performance optimization for full dataset

### Phase 2: Intelligence (Layer 1 → Layer 2)

**Goal:** Make the AI scanning engine production-grade and add historical depth.

- [ ] Harden AI scanning pipeline — error handling, rate limiting, retry logic
- [ ] Implement severity scoring model
- [ ] Build disruption deduplication logic
- [ ] Add geo-disambiguation handling
- [ ] Implement disruption narrative generation
- [ ] Build historical disruption log
- [ ] Add 30/60/90-day risk trend visualization
- [ ] Implement recommended actions engine
- [ ] False positive rate tracking and signal quality dashboard

### Phase 3: Scenario & Alerts (Layer 3 + Layer 4)

**Goal:** Transform from monitoring tool to strategic planning tool.

- [ ] Chokepoint monitoring (Suez, Panama, Malacca, Bosporus, Taiwan Strait)
- [ ] What-if scenario modeling interface
- [ ] Supplier concentration risk scoring
- [ ] Automated alert system (Telegram, email, Teams)
- [ ] Auto-generated disruption narratives
- [ ] Export as briefing PDF

### Phase 4: Integration & Scale

**Goal:** Embed into the SKF ecosystem.

- [ ] GoldenEye integration — disruption → affected MSP channels
- [ ] AWS deployment (once SCP blocker resolved)
- [ ] Microsoft SSO (Entra ID) for SKF-wide access
- [ ] Role-based views (executive vs. analyst)
- [ ] Mobile/tablet responsive view for iPad briefings
- [ ] Automated mitigation playbooks

---

## 13. Key Design Decisions & Open Questions

### 13.1 Resolved

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Map library | D3.js | Full control over projection, markers, animation. Performance-critical. |
| AI provider | Anthropic Claude with web search | Best reasoning quality for disruption assessment, web search for real-time data |
| Projection | Natural Earth | Aesthetically pleasing, familiar to executives, minimal distortion at mid-latitudes |
| Primary deployment | AWS (eu-west-1) | SKF's cloud platform, CDK for IaC |
| Panel style | Frosted-glass, bottom slide-up | Professional, non-intrusive, progressive disclosure |

### 13.2 Open Questions

| Question | Options | Decision Owner |
|----------|---------|----------------|
| How frequently should AI scan? | Every 5/15/30/60 min | Jonas — balance cost vs. freshness |
| Should the map use SVG or Canvas for markers? | SVG for < 500 elements, Canvas above | Frontend agent — performance testing |
| How to handle stale data when AI API is down? | Show stale data with warning banner vs. fallback to last-known-good | Backend agent |
| What is the right blast radius for different disruption types? | Static vs. dynamic based on disruption magnitude | Strategy agent |
| When should we move from JSON to PostgreSQL? | When historical data exceeds ~10MB or we need complex queries | Backend agent |

---

## 14. Relationship to AI Use Case Repository

The Disruption Monitor maps to **UC-012: Supply Disruption Response** in the SC Hub AI Use Case Repository. It is part of the "Wednesday — Disruption That Resolved Itself" scenario in the E2E Agent Scenarios.

**Wave mapping:**
- **Wave 1 (now):** Standalone disruption scanning and visualization (this product)
- **Wave 2:** Integration with GoldenEye for downstream impact analysis
- **Wave 3:** Multi-agent orchestration — disruption detected → impact assessed → mitigation proposed → planner notified → resolution tracked

---

## 15. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Daily active users (leadership) | Steffen + Ganesh open it daily | Usage analytics |
| Disruption detection time | < 30 min from event to alert | Timestamp comparison vs. news wire |
| False positive rate | < 5% | Manual review of flagged disruptions |
| Time to situation report | < 5 min (from opening tool to having a briefing) | User feedback |
| Coverage | > 90% of significant disruptions caught | Post-hoc analysis vs. actual events |
| Executive Net Promoter | "I can't work without this" | Qualitative feedback |

---

## 16. Non-Goals (Explicitly Out of Scope for Now)

- **Real-time GPS tracking** of shipments — that's a logistics tool, not a risk tool
- **Financial risk modeling** — we assess operational impact, not financial hedging
- **Supplier performance scoring** — that's GoldenEye's domain (supplier OTIF)
- **Weather forecasting** — we react to weather events, we don't predict weather
- **Competitive intelligence** — this is supply chain risk, not market intelligence

---

## 17. Appendix: Site Classification Reference

The following classifications were manually validated and corrected during the initial build:

| Classification | Definition | Alert Priority |
|---------------|-----------|----------------|
| Manufacturing | Bearing production facilities | CRITICAL — production impact |
| Aerospace | Aviation/space bearing production | CRITICAL — regulated, high-value |
| Logistics | Distribution centers, warehouses | HIGH — distribution bottleneck |
| Sales | Commercial offices, customer-facing | MEDIUM — business continuity |
| Admin | Corporate offices, shared services | LOW — personnel safety |
| R&D | Research and development centers | MEDIUM — IP and capability |

---

*This document is the source of truth for the SC Hub Disruption Monitor. All development work — whether by human or AI agent — should reference this document for product direction, design philosophy, and technical decisions. If a feature is not in this document, it should be discussed and added here before implementation.*
