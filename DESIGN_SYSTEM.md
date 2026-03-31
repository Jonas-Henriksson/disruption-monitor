# Design System — SC Hub Disruption Monitor

> **Owner:** Frontend Agent | **Last updated:** 2026-03-30
> **Reference anchor:** Professional Data Platform (DESIGN_EXCELLENCE_FRAMEWORK.md, Section 3)
> **Feel:** "A control center built by engineers who understand the domain. Dense, fast, trustworthy."
> **Benchmarks:** Bloomberg Terminal (density), Linear (elegance + muted palette), Grafana (dashboard composition)

---

## 1. Color Palette

### 1.1 Background Scale (Dark Theme)

All surfaces use this 7-step depth scale. Never invent new background values.

| Token | Hex | Usage |
|---|---|---|
| `bg-abyss` | `#060a12` | App background, deepest layer, SVG canvas fill |
| `bg-base` | `#080e1c` | Header, drawer, sections, cards, KPI strip |
| `bg-raised` | `#0a1220` | Controls, inputs, tab backgrounds, progress track |
| `bg-surface` | `#0b1525` | Tooltip backgrounds (use with `ee` or `f0` alpha) |
| `bg-overlay` | `#0d1525` | Nested sections, sub-panels |
| `bg-skeleton` | `#0d1830` | Skeleton loading gradient base |
| `bg-country` | `#111c2a` | Map country fill (non-conflict) |

**Alarm-state backgrounds** (used when Critical events are active):

| Token | Hex | Usage |
|---|---|---|
| `bg-alarm-card` | `#1a0808` | Re-emerged event card background (alarm tint on bg-raised) |
| `bg-alarm-strip` | `#0f0a0a` | KPI strip alarm state background (Critical events active) |

### 1.2 Border Scale

| Token | Hex | Usage |
|---|---|---|
| `border-primary` | `#14243e` | Default borders — cards, dividers, sections, tabs |
| `border-subtle` | `#162040` | Filter section dividers, very subtle separation |
| `border-active` | `#1e3a5c` | Popup/modal borders, interactive element borders |
| `border-muted` | `#1a2744` | Inactive button borders |

### 1.3 Text Scale

7 levels. Pick the closest match. Never create new text grays.

| Token | Hex | Usage | Example |
|---|---|---|---|
| `text-primary` | `#e2e8f0` | Headings, titles, important values | Popup title, drawer title |
| `text-body` | `#c8d6e5` | Body text, readable content | App-level body color |
| `text-secondary` | `#94a3b8` | Data values, supporting info | Country names, data fields |
| `text-tertiary` | `#64748b` | Helper text, metadata | Timestamps, tertiary labels |
| `text-muted` | `#4a6080` | Inactive controls, low-priority text | Inactive tabs, legend labels |
| `text-label` | `#2a3d5c` | Uppercase labels, dim annotations | Section labels, axis labels |
| `text-ghost` | `#1e3050` | Very dim text, near-invisible | Divider dots, expand hints |

### 1.4 Primary Accent (Blue)

| Token | Hex | Usage |
|---|---|---|
| `accent-primary` | `#2563eb` | Progress bars, active states, primary actions |
| `accent-secondary` | `#3b82f6` | Manufacturing markers, cluster borders, links |
| `accent-light` | `#60a5fa` | Light blue text, KPI counts, hover accents |

### 1.5 Severity Colors

These are semantic. Use ONLY for severity/risk indication.

| Level | Dot/Text | Background | Light Text |
|---|---|---|---|
| Critical | `#ef4444` | `#7f1d1d` | `#fca5a5` |
| High | `#f97316` | `#7c2d12` | `#fdba74` |
| Medium | `#eab308` | `#713f12` | `#fde047` |
| Low | `#22c55e` | `#14532d` | `#86efac` |

### 1.6 Status Colors

| Status | Color | Usage |
|---|---|---|
| Live/Success | `#22c55e` | Live indicator, supply chain lines, success states |
| Warning | `#f59e0b` | Offline indicator, trade mode accent |
| Error | `#ef4444` | Error states, critical alerts, affected sites |
| Info | `#3b82f6` | API indicator, informational badges |

### 1.7 Data Domain Colors

| Domain | Primary | Secondary | Usage |
|---|---|---|---|
| Suppliers | `#a78bfa` | `#7c3aed` | Supplier bubbles, categories, counts |
| Sea lanes | `#38bdf8` | `#1a5f8a` | Maritime routes, port markers |
| Air lanes | `#c084fc` | `#7c3aed` | Aviation routes, airport markers |
| Supply chain | `#22c55e` | — | Inbound supply lines, input countries |

### 1.8 Region Colors

| Region | Color |
|---|---|
| Europe | `#60a5fa` |
| Asia Pacific | `#f43f5e` |
| Americas | `#34d399` |
| Middle East & Africa | `#f97316` |
| Africa | `#fbbf24` |

### 1.9 Site Type Colors

| Type | Color | Shape |
|---|---|---|
| Manufacturing | `#3b82f6` | Triangle |
| Logistics | `#f59e0b` | Diamond |
| Admin/HQ | `#6366f1` | Square |
| Vehicle AM | `#0ea5e9` | Circle |
| Service | `#14b8a6` | Circle |
| Sales | `#64748b` | Circle |
| Other | `#475569` | Circle |

### 1.10 BU Division Colors

| Division | Color |
|---|---|
| Industrial | `#3b82f6` |
| SIS Seals | `#a78bfa` |
| SIS Lubrication | `#06b6d4` |
| SIS Aerospace | `#f97316` |
| SIS Magnetics | `#f43f5e` |

### 1.11 Color Composition Rules

- **Badge formula:** `background: {color}22`, `border: 1px solid {color}33`, `color: {color}`
- **Active state formula:** `background: {color}12`, `border: 1px solid {color}44`
- **Hover panel formula:** `background: {color}0d`, `border: 1px solid {color}22`
- **Glow formula (Critical only):** `box-shadow: 0 0 8px {color}88`
- **90% neutral, 5% accent, 5% semantic** — per Design Excellence Framework 2.3

### 1.12 Data Domain Tokens

Backend enumerations that map to visual treatments in the UI.

**Friction Levels** (from `config.ts` FRIC):

| Level | Hex |
|---|---|
| Free | `#22c55e` |
| Low | `#34d399` |
| Moderate | `#eab308` |
| High | `#f97316` |
| Prohibitive | `#ef4444` |

**Trend Indicators:**

| Trend | Hex | Arrow |
|---|---|---|
| Escalating | `#ef4444` | ↗ |
| De-escalating | `#22c55e` | ↘ |
| New | `#ef4444` | ⚡ |
| Stable | `#64748b` | → |

**Urgency Levels** (from DrawerPanel):

| Urgency | Hex |
|---|---|
| immediate | `#ef4444` |
| 24h | `#f59e0b` |
| 48h | `#f59e0b` |
| 1w | `#3b82f6` |
| 1m | `#22c55e` |
| 3m | `#8b5cf6` |
| ongoing | `#64748b` |
| contingent | `#94a3b8` |

**Confidence Thresholds:**

| Threshold | Hex | Meaning |
|---|---|---|
| >=90% | `#22c55e` | High confidence |
| >=70% | `#f59e0b` | Moderate confidence |
| <70% | `#ef4444` | Low confidence |

**Event Status:**

| Status | Treatment |
|---|---|
| active | Default rendering |
| watching | `#60a5fa` badge with 🔍 |
| archived | Filtered from view |

**Ticket Status** (from `config.ts` STATUS_CFG):

| Status | Hex | Icon |
|---|---|---|
| open | `#64748b` | ○ |
| assigned | `#3b82f6` | 👤 |
| in_progress | `#eab308` | ⏳ |
| blocked | `#ef4444` | ⛔ |
| done | `#22c55e` | ✓ |

**Priority Colors** (action items):

Sequence: `#ef4444`, `#f59e0b`, `#3b82f6`, `#22c55e`, `#8b5cf6`

---

## 2. Typography Scale

### 2.1 Font Families

| Token | Value | Usage |
|---|---|---|
| `font-sans` | `'DM Sans', -apple-system, sans-serif` | All UI text, headings, labels |
| `font-mono` | `'JetBrains Mono', monospace` | Data values, timestamps, badges, KPIs, axis labels |

Loaded via Google Fonts: `DM Sans:wght@400;500;600;700` + `JetBrains Mono:wght@400;500;600;700`

### 2.2 Type Scale

| Token | Size | Weight | Font | Usage |
|---|---|---|---|---|
| `type-title` | 15px | 700 | sans | App title ("SC Hub") |
| `type-drawer-title` | 14px | 700 | sans | Drawer/panel headings |
| `type-popup-title` | 13px | 700 | sans | Click popup titles |
| `type-body` | 13-14px | 400 | sans | Body text, readable content |
| `type-data` | 12px | 700 | mono | KPI values, severity counts |
| `type-data-alarm` | 14px | 700 | mono | KPI alarm state values (Critical count, trend arrow) — intentional emphasis |
| `type-tooltip-title` | 11-12px | 700 | sans | Tooltip headings |
| `type-control` | 10px | 600 | mono | Buttons, filters, controls |
| `type-badge` | 9px | 600-700 | mono | Badges, severity labels, timestamps |
| `type-caption` | 8-9px | 500-700 | mono | Uppercase section labels, category badges |
| `type-micro` | 7-8px | 400-600 | mono | Axis labels, chart annotations, very small text |

### 2.3 Label Pattern (uppercase)

```
fontSize: 8-9px
fontWeight: 700
textTransform: uppercase
letterSpacing: 1.5-2.5px
fontFamily: font-mono
color: text-label (#2a3d5c)
```

Used for: section headers in filters ("TYPE", "REGION", "DIVISION"), supply chain labels, timeline labels.

### 2.4 App Subtitle Pattern

```
fontSize: 9px
fontWeight: 600
textTransform: uppercase
letterSpacing: 2.5px
fontFamily: font-mono
color: #2a3d5c (text-label)
```

Used exclusively for "DISRUPTION MONITOR" subtitle in header.

### 2.5 Typography Rules

- **Left-align everything** — no centered text except map legend and empty states
- **Right-align numbers** — KPIs, counts, table numeric columns
- **Tabular figures** for all numeric data
- **Line height:** 1.2-1.3 for headings, 1.4-1.7 for body/data rows
- **Max 2 fonts** (DM Sans + JetBrains Mono) — never add a third

---

## 3. Spacing System

### 3.1 Base-4 Scale

| Token | Value | Usage |
|---|---|---|
| `space-1` | 1px | Margin between dot and text, hairline dividers |
| `space-2` | 2px | Badge internal padding (vertical), tight element gaps |
| `space-3` | 3px | Small badge padding, compact gaps |
| `space-4` | 4px | Icon-to-label gap, tight badge padding, small gaps |
| `space-5` | 5px | Button vertical padding, small element gaps |
| `space-6` | 6px | Common gap (badges, badge groups, status indicators) |
| `space-8` | 8px | Card padding, tooltip padding, comfortable gaps |
| `space-10` | 10px | Button horizontal padding, section margins, moderate gaps |
| `space-12` | 12px | KPI strip padding (vertical), section bottom padding |
| `space-14` | 14px | Popup/drawer padding (vertical) |
| `space-16` | 16px | Section horizontal padding, KPI strip horizontal padding |
| `space-18` | 18px | Drawer horizontal padding |
| `space-24` | 24px | Major section separation (not commonly used yet) |
| `space-32` | 32px | Page-level separation (reserved) |

### 3.2 Component-Specific Spacing

| Component | Padding | Gap |
|---|---|---|
| Header bar | `0 16px`, height: 48px | 6px between elements |
| KPI strip | `6px 16px` | 12px between groups, 4-5px within |
| Filter bar | `8px 16px` | 10px between filter groups |
| Buttons (small) | `3px 8px` | — |
| Buttons (default) | `5px 10px` | — |
| Badges | `1-2px 6-8px` | 4px between badges |
| Tooltips | `8-10px 12-14px` | 4-6px vertical between rows |
| Click popups | `14px 16px` | 8-10px between sections |
| Drawer header | `14px 18px 12px` | 8px between title elements |
| Drawer width | 460px | — |

---

## 4. Component Patterns

### 4.1 Badges

```
Small badge (severity, type):
  padding: 1-2px 6-8px
  borderRadius: 3-4px
  fontSize: 8-9px
  fontWeight: 600-700
  fontFamily: font-mono
  background: {color}22
  color: {color}
  border: 1px solid {color}33

Count badge (tabs):
  padding: 1px 5px
  borderRadius: 8px
  fontSize: 8px
  fontWeight: 700
  minWidth: 16px
  textAlign: center
```

**States:** Default (as above), Active (opacity 1.0), Disabled (not used — badges are always visible or absent).

### 4.2 Buttons

```
Default:
  padding: 5px 10px
  border: 1px solid #14243e (border-primary)
  borderRadius: 6px
  fontSize: 10px
  fontWeight: 600
  fontFamily: font-mono
  background: #0a1220 (bg-raised)
  color: #64748b (text-tertiary)
  cursor: pointer

Compact:
  padding: 3px 8px
  borderRadius: 4px
  fontSize: 10px

Active/Toggle-on:
  background: {color}18
  border: 1px solid {color}44
  color: {color}

Close button:
  background: #0d1525
  border: 1px solid #1e3050
  borderRadius: 6px
  padding: 4px 8px
  fontSize: 10px
  fontFamily: font-mono

Icon-only close:
  background: none
  border: none
  color: #4a6080
  fontSize: 14px
  padding: 0
```

**States:** Default, Hover (implicit via cursor:pointer), Active (toggle formula), Disabled (cursor:wait during loading), Loading (spinner replaces content).

### 4.3 Tooltips (Hover)

```
position: absolute
pointerEvents: none
zIndex: 18
background: #0b1525ee
border: 1px solid {contextColor}44  (or #1e3050 for neutral)
borderRadius: 8px
padding: 8-10px 12-14px
boxShadow: 0 8px 32px rgba(0,0,0,.6)
backdropFilter: blur(12px)
maxWidth: 220-260px

Title: 11-12px, 700, text-primary
Subtitle: 10px, text-muted
CTA hint: 9px, text-muted, "Click to inspect →"
```

### 4.4 Click Popups (Persistent)

```
position: absolute
zIndex: 22
background: #080e1cf0
border: 1px solid #1e3a5c (border-active)
borderRadius: 10px
padding: 14px 16px
boxShadow: 0 12px 40px rgba(0,0,0,.7)
backdropFilter: blur(16px)
width: 280-300px
maxHeight: 440px
overflow: auto (with custom scrollbar .sc-s)

Title: 13px, 700, text-primary
Subtitle: 10px, text-tertiary
Section divider: 1px solid #14243e, marginTop 10px, paddingTop 10px
Data rows: font-mono, 10px, lineHeight 1.7
  Label: text-label, width 60-70px, flexShrink 0
  Value: text-secondary
```

### 4.5 Right Drawer

```
position: absolute, top 0, right 0
width: 460px
height: 100%
background: #080e1cf8
borderLeft: 1px solid #14243e
boxShadow: -20px 0 60px rgba(0,0,0,.5)
backdropFilter: blur(20px)
zIndex: 20
flexDirection: column

Header: padding 14px 18px 12px, borderBottom 1px solid #14243e
  Title: 14px, 700, text-primary
  Count badge: font-mono, 10px, 600, bg #0d1525, border #1e3050
  Close: bg #0d1525, border #1e3050, radius 6px

Enter: .sc-din (280ms cubic-bezier(.16,1,.3,1))
Exit: .sc-dout (200ms cubic-bezier(.7,0,.84,0))
```

### 4.6 Header Bar

```
height: 48px
background: linear-gradient(90deg, #080e1c, #0d1830)
borderBottom: 1px solid #14243e
padding: 0 16px
display: flex, alignItems: center, justifyContent: space-between
zIndex: 30

Left: status dot (7px, #22c55e) + title + subtitle
Center: mode tabs
Right: data source indicator + controls
```

### 4.7 KPI Strip

```
background: #080e1c
borderBottom: 1px solid #14243e
padding: 6px 16px
display: flex, alignItems: center, gap: 12px
zIndex: 26

Severity pills: clickable filter badges with dot indicators
Metrics: font-mono, 10px, colored values + muted labels
Dividers: 1px wide × 20px tall, #14243e
```

### 4.8 Mode Tabs

```
Container: display flex, height 34px, borderRadius 6px, overflow hidden, border 1px solid #14243e, bg #0a1220

Tab:
  padding: 0 14px
  fontSize: 10px
  fontWeight: 600
  fontFamily: font-mono
  borderRight: 1px solid #14243e

  Inactive: bg transparent, color #4a6080
  Active: bg {modeColor}12, color {modeColor}
  Active accent bar: absolute bottom, height 2px, bg {modeColor}

Mode colors: disruptions=#ef4444, geopolitical=#3b82f6, trade=#f59e0b
```

### 4.9 Skeleton Loading

```
.sc-skel class:
  background: linear-gradient(90deg, #0d1830 25%, #14243e 50%, #0d1830 75%)
  background-size: 200% 100%
  animation: sc-skel 1.5s ease infinite
  borderRadius: 6px
```

Use to match actual content dimensions. Never use spinners for content loading (spinners only for inline actions like rescan button).

### 4.10 Progress Bar

```
Track: height 2px, bg #0a1220
Fill: bg #2563eb, transition width 0.3s ease-out
Shimmer overlay: linear-gradient(90deg, transparent 60%, #60a5fa, transparent)
  animation: sc-scan-slide 2s ease-in-out infinite alternate
```

### 4.11 Status Indicator (Live/API/Offline)

```
Dot: 7px circle, colored by status
  Live: #22c55e + glow (0 0 8px #22c55e88) + .sc-live-dot pulse
  API: #3b82f6 + subtle glow
  Offline: #f59e0b

Badge container:
  bg: status-dependent muted background
  border: 1px solid status-dependent with alpha
  borderRadius: 6px
  padding: 4px 12px
  fontFamily: font-mono
  fontSize: 9-10px
  Live: .sc-live-badge pulse animation
```

### 4.12 Empty States

```
position: absolute, centered (50%/50% translate)
pointerEvents: none
Icon: 48px emoji, opacity .3
Title: 15px, 600, text-ghost (#1e3050)
Subtitle: 11px, font-mono, text color #14243e
Include data counts ("245 sites · 69 countries")
```

### 4.13 Error States

```
background: rgba(220,38,38,.08)
border: 1px solid rgba(220,38,38,.2)
borderRadius: 8px
padding: 12px
fontSize: 11px

Label: "Error:", #ef4444, bold
Message: #fca5a5
Retry button: bg #ef444418, border #ef444444, color #fca5a5
```

### 4.14 Custom Scrollbar

```
.sc-s::-webkit-scrollbar { width: 4px }
.sc-s::-webkit-scrollbar-track { background: transparent }
.sc-s::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px }
```

---

## 5. Layout Grid

### 5.1 Page Structure

```
┌─────────────────────────────────────────────────┐
│ HEADER BAR (48px, z:30)                         │
├─────────────────────────────────────────────────┤
│ PROGRESS BAR (2px, z:29) — shown during scan    │
├─────────────────────────────────────────────────┤
│ KPI STRIP (variable, z:26) — when data loaded   │
├─────────────────────────────────────────────────┤
│ TIMELINE STRIP (40-200px, z:25) — collapsible   │
├─────────────────────────────────────────────────┤
│ FILTER BAR (variable, z:25) — when toggled      │
├─────────────────────────┬───────────────────────┤
│                         │ RIGHT DRAWER (460px)  │
│      MAP CANVAS         │  z:20                 │
│      (flex: 1)          │                       │
│                         │                       │
│ ┌──────┐                │                       │
│ │LEGEND│                │                       │
│ └──────┘                │                       │
└─────────────────────────┴───────────────────────┘
```

### 5.2 Z-Index Scale

| Layer | z-index | Usage |
|---|---|---|
| Error overlay | 50 | Full-screen error boundary fallback |
| Header | 30 | Always on top |
| Progress bar | 29 | Below header |
| KPI strip | 26 | Below progress |
| Timeline/Filters | 25 | Below KPI |
| Click popups | 22 | Above drawer |
| Drawer | 20 | Overlay on map |
| Tooltips | 18 | Above map content |
| Map content | default | Base layer |

### 5.3 Responsive Behavior

Currently single-breakpoint: full desktop (1200px+). Map canvas fills remaining space via `flex: 1`. Drawer overlays map at 460px fixed width. Popup positions are viewport-bounded with max-width constraints.

---

## 6. Iconography

### 6.1 Approach

**Emoji-based** for domain categories and modes. No icon library dependency.

| Context | Examples |
|---|---|
| Mode icons | Disruptions: `🔴`, Geopolitical: `🌍`, Trade: `💰` |
| Categories | `🌊` Natural Disaster, `🚢` Logistics, `💻` Cyber, `⚠️` Other |
| Trade types | `💰` Tariffs, `🚫` Anti-Dumping, `🔒` Export Controls |
| Transport | `🚢` Sea, `✈️` Air |
| Actions | `🔔` Alerts, `⚙️` Settings |

### 6.2 Map Markers

Sites use geometric SVG shapes (triangle, diamond, square, circle) — NOT emoji. Size scales inversely with zoom (`r * inv` where `inv = 1/zoomK`).

| Shape | Type | Base radius |
|---|---|---|
| Triangle | Manufacturing | Larger (mr) |
| Diamond | Logistics | Larger (mr) |
| Square | Admin/HQ | Smaller (sr) |
| Circle | Sales/Service/VA/Other | Smaller (sr) |

### 6.3 Status Dots

- 6-7px circles with severity/status color fill
- Critical: add `box-shadow: 0 0 6-8px {color}` glow
- Live indicator: add `.sc-live-dot` pulse animation

---

## 7. Motion & Transitions

### 7.1 Duration Scale

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `motion-instant` | 150ms | ease | Functional transitions: hover, filter toggle |
| `motion-fast` | 200ms | cubic-bezier(.7,0,.84,0) | Drawer exit, tab switch |
| `motion-normal` | 280-300ms | cubic-bezier(.16,1,.3,1) | Drawer enter, card fade-up, filter bar appear |
| `motion-slow` | 400ms | ease | Narrative expand |
| `motion-ambient` | 0.8-3.5s | ease-in-out / linear | Pulse dots, live badge, scan shimmer |

### 7.2 Animation Inventory

| Class | Animation | Duration | Usage |
|---|---|---|---|
| `.sc-din` | slideX(100%→0) + fade | 280ms | Drawer enter |
| `.sc-dout` | slideX(0→100%) + fade | 200ms | Drawer exit |
| `.sc-ce` | translateY(8px→0) + fade | 300ms | Card/element fade-up |
| `.sc-sh` | gradient shimmer | 2s | Generic loading shimmer |
| `.sc-skel` | gradient shimmer | 1.5s | Skeleton loading |
| `.sc-spin` | rotate(0→360deg) | 0.8s | Inline spinner (rescan, loading) |
| `.sc-live-dot` | scale(1→1.4→1) + opacity | 2s | Live status dot pulse |
| `.sc-live-badge` | box-shadow pulse | 2.5s | Live status badge glow |
| `.sc-bar` | scaleX(0→1) | 45s | Progress bar fill |
| `.sc-narr-in` | opacity + max-height expand | 400ms | Narrative section reveal |
| `.sc-tl-open` | max-height 40→200px | 300ms | Timeline expand |
| `.sc-tl-close` | max-height 200→40px | 300ms | Timeline collapse |
| `spc/sph/spm/spl` | radius + opacity pulse | 1.5-3.5s | Severity marker rings |

### 7.3 Motion Rules

- **Functional transitions** (hover, state change): 150-200ms max
- **Layout transitions** (drawer, panels): 200-300ms
- **Ambient loops** (pulse, glow): 1.5-3.5s, ease-in-out
- **Never animate** decoratively — every animation communicates state
- **Severity maps to urgency:** Critical pulses fastest (1.5s), Low slowest (3.5s)
- **Use CSS animations, not JS** — all via `.sc-*` classes in GLOBAL_CSS

---

## 8. Data Visualization

### 8.1 Map

```
Projection: d3.geoNaturalEarth1(), fitSize with 40px total margin
Background: radial gradient #0c1322 → #060a12
Graticule: stroke #0a1220, width 0.3
Country fill: #111c2a (normal), #1a1520 (conflict zone)
Country stroke: #1a2d45 (normal), #2a1525 (conflict)
Conflict overlay: fill #ef4444 opacity 0.08, stroke opacity 0.15
Country labels: DM Sans, 600, #2a4060, opacity 0.45, scale with zoom
```

### 8.2 Risk Timeline Chart

```
Container: collapsible strip, 40px collapsed → 200px expanded
Background: #080e1c
Grid: horizontal dashed lines, stroke #14243e, width 0.5
Axis labels: 7px, font-mono, #1e3050
Data points: colored circles (severity thresholds: >=3.5 red, >=2.5 orange, >=1.5 yellow, else green)
Area fill: gradient #ef4444 → #f59e0b → #22c55e (transparent)
Line: stroke #f59e0b, width 1.5, opacity 0.8
Today marker: #3b82f6 dashed line
```

### 8.3 Progress Bars (inline)

```
Track: height 3-5px, bg #0d1525, borderRadius 2px
Fill: bg {color}, borderRadius 2px, opacity decreasing by rank
```

Used in supplier category breakdowns.

### 8.4 Chart Color Sequence

For multi-series charts, use in order:
1. `#3b82f6` (blue)
2. `#ef4444` (red)
3. `#f59e0b` (amber)
4. `#22c55e` (green)
5. `#a78bfa` (purple)
6. `#06b6d4` (cyan)

Max 6 colors per chart. Beyond 6, use opacity variations of the first 3.

### 8.5 Disruption Markers

```
Core dot: r = max(2, 4.5 * inv), fill: severity color, stroke: black/white, filter: glow
Pulse rings: animated radius + opacity, speed by severity
Selected: white dashed ring at 2.2x radius
Hover: implicit via cursor:pointer + tooltip
```

---

## 9. Anti-Patterns — Things We Never Do

Derived from DESIGN_EXCELLENCE_FRAMEWORK.md Section 1, applied to this project:

### Layout
- [ ] No "Welcome to your Dashboard" banners — data fills every pixel
- [ ] No giant cards with 32px+ padding — our cards use 8-16px
- [ ] No centering body text — left-align everything except legends
- [ ] No equal-width column grids — we use map + drawer asymmetric layout
- [ ] No excessive whitespace — Bloomberg density is the standard
- [ ] No stacking cards where tables belong — homogeneous lists get tables

### Visual
- [ ] **No purple-to-blue gradients** — our only gradient is the header (dark navy to slightly lighter navy) and the radial map background
- [ ] **No gradient backgrounds on buttons or cards** — solid colors only
- [ ] **No border-radius > 12px on functional elements** — our max is 10px (popups). Buttons: 4-6px
- [ ] **No drop shadows everywhere** — shadows only on tooltips, popups, drawer (elevated floating elements)
- [ ] **No glassmorphism** — we use `backdropFilter: blur()` ONLY on floating overlays where the map shows through, never on cards or static elements
- [ ] **No neon accents** — our accent palette is muted blues and desaturated semantic colors
- [ ] **No decorative gradients, grain, or mesh** — every visual element is functional

### Typography
- [ ] **No single font size** — we use 8 distinct sizes (7-15px)
- [ ] **No body text > 16px** — our body is 13-14px
- [ ] **No decorative fonts** — DM Sans + JetBrains Mono only
- [ ] **No all-caps overuse** — uppercase only for section labels at 8-9px
- [ ] **No thin font weights for data** — minimum 400, important data at 600-700

### Components
- [ ] **No oversized buttons** — our buttons are 28-34px height range
- [ ] **No pill buttons** — max 6px radius
- [ ] **No icon-only buttons without context** — close buttons have "ESC" label or are universally understood (×)
- [ ] **No colored badges for non-status** — color = severity or status ONLY
- [ ] **No skeleton/actual mismatch** — skeletons must mirror real content dimensions
- [ ] **No empty states with just an icon** — include counts, explanation, and CTA

### Interaction
- [ ] **No hover on non-interactive elements** — only buttons, links, markers respond
- [ ] **No animations > 200ms for functional transitions** — drawer enter (280ms) is the exception, all others <=200ms
- [ ] **No loading spinners for content** — skeletons for content, spinners only for inline actions
- [ ] **No full-page loading** — shell renders immediately, data loads progressively
- [ ] **No notification overload** — one status indicator, one error state, one scan progress

---

## 10. Design Consistency Checklist

Before shipping any new UI, verify:

1. **Colors** — Every color used appears in Sections 1.1-1.10. No new hex values.
2. **Type** — Font size matches Section 2.2 scale. Font family is `font-sans` or `font-mono`.
3. **Spacing** — All padding/margin/gap values from Section 3.1 scale (or component-specific in 3.2).
4. **Borders** — Use `border-primary` (#14243e) for 90% of borders. Use Section 1.2 for the rest.
5. **Radius** — 4px (badges/compact), 6px (buttons/controls), 8px (cards/panels), 10px (popups). Never > 12px.
6. **Shadows** — Only on floating elements (tooltips, popups, drawer). One level: the values in Section 4.
7. **Z-index** — Use Section 5.2 scale. Never invent new z-index values.
8. **Animation** — Use existing `.sc-*` classes. New animations need justification and addition to Section 7.
9. **Anti-patterns** — Run Section 9 checklist. Zero violations.
10. **5-foot test** — Squint at the screen. Can you still see hierarchy?

---

## Appendix A: Known Inconsistencies (Backlog)

These are minor inconsistencies identified during the audit. Not blocking, but should be resolved when touching these areas:

1. **Button padding** varies: `3px 8px`, `4px 10px`, `5px 10px`. Should standardize to two sizes: compact (`3px 8px`) and default (`5px 10px`).
2. **Badge border-radius** varies: 3px, 4px, 8px. Should standardize to 4px for all inline badges, 8px only for count badges.
3. **Tooltip background alpha** varies: `#0b1525ee` vs `#080e1cf0`. Should standardize to `#0b1525ee` for hover tooltips, `#080e1cf0` for persistent popups.
4. **Text color proliferation** — `#2d4260` vs `#2a3d5c` are visually indistinguishable. Consolidate to `#2a3d5c` (text-label).
5. **Popup border-radius** — tooltips use 8px, click popups use 10px. Consider standardizing to 8px for both.

## Appendix B: Token Export Reference

For future CSS-in-JS or CSS custom properties migration:

```typescript
export const DS = {
  // Backgrounds
  bgAbyss: '#060a12',
  bgBase: '#080e1c',
  bgRaised: '#0a1220',
  bgSurface: '#0b1525',
  bgOverlay: '#0d1525',
  bgSkeleton: '#0d1830',

  // Borders
  borderPrimary: '#14243e',
  borderSubtle: '#162040',
  borderActive: '#1e3a5c',

  // Text
  textPrimary: '#e2e8f0',
  textBody: '#c8d6e5',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textMuted: '#4a6080',
  textLabel: '#2a3d5c',
  textGhost: '#1e3050',

  // Accent
  accentPrimary: '#2563eb',
  accentSecondary: '#3b82f6',
  accentLight: '#60a5fa',

  // Severity
  sevCritical: '#ef4444',
  sevHigh: '#f97316',
  sevMedium: '#eab308',
  sevLow: '#22c55e',
  sevCriticalBg: '#7f1d1d',
  sevHighBg: '#7c2d12',
  sevMediumBg: '#713f12',
  sevLowBg: '#14532d',

  // Fonts
  fontSans: "'DM Sans',-apple-system,sans-serif",
  fontMono: "'JetBrains Mono',monospace",
} as const;
```
