# Design Excellence Framework

## For Professional Tools, Dashboards & Data-Rich Applications

This framework is for products where the user is trying to GET WORK DONE - not be entertained. The standard is not "creative" or "bold." The standard is: a senior product designer at Linear, Vercel, or Bloomberg would look at this and respect the craft.

This document is read by the Frontend agent before any UI work begins. It supplements (and in the case of professional tools, overrides) the default frontend-design skill.

---

# SECTION 1 - THE AI ANTI-PATTERN BLACKLIST

These are the tells that instantly identify output as AI-generated. They are banned.

## Layout Anti-Patterns

- **The "Welcome to Your Dashboard" hero** - No user of a professional tool needs a greeting banner consuming 200px of vertical space. Put data there instead.
- **Giant cards with excessive padding** - 32px+ padding on cards with one stat and a subtitle. Real dashboards pack information tight.
- **Everything centered** - Professional tools left-align almost everything.
- **Equal-width column grids for everything** - Use asymmetric layouts: narrow sidebar, wide main area, contextual panel.
- **Excessive whitespace masquerading as "clean design"** - If useful information could fill that space, the space is wasted.
- **Stacking cards vertically when a table would be better** - Homogeneous lists belong in tables.
- **Full-width layouts for narrow content** - Constrain it.

## Visual Anti-Patterns

- **Purple-to-blue gradients** - The single most common AI aesthetic. Banned.
- **Gradient backgrounds on functional elements** - Buttons, cards, headers. Use solid colors.
- **Border-radius > 12px on functional elements** - Professional tools use 4-8px.
- **Drop shadows everywhere** - One level of elevation is enough.
- **Glassmorphism / frosted glass on data interfaces** - Reduces contrast and readability.
- **Dark mode with neon accents** - Professional dark modes use muted colors with one restrained accent.
- **Decorative gradients, grain overlays, mesh backgrounds** - On professional tools, these are noise.

## Typography Anti-Patterns

- **One font size for everything** - Use 6-8 distinct sizes in a clear hierarchy.
- **Body text larger than 16px on data-dense screens** - 13-14px is standard for professional tools.
- **Decorative/display fonts on data** - Use system fonts, Inter, or monospace for data.
- **All-caps headings everywhere** - One level of all-caps is fine. Multiple levels feel like shouting.
- **Thin font weights (100-300) for important information** - Light weights are for large display text only.

## Component Anti-Patterns

- **Oversized buttons** - Professional tools use 32-36px height. Not 48px+.
- **Rounded pill buttons** - Use 4-6px radius.
- **Icon-only buttons without tooltips** - Every icon button needs a tooltip.
- **Colored badges for everything** - Color is for status and severity only.
- **Skeleton screens that don't match actual layout** - Must mirror real content dimensions.
- **Empty states that are just an icon and "No data"** - Explain what will appear and offer a CTA.

## Interaction Anti-Patterns

- **Hover effects on everything** - Only interactive elements respond to hover.
- **Animations longer than 200ms on functional transitions** - 150-200ms max.
- **Loading spinners instead of skeleton states** - Skeletons show structure; spinners don't.
- **Full-page loading states** - Load shell immediately, data progressively.
- **Alert/notification overload** - One toast at a time.

---

# SECTION 2 - DESIGN PRINCIPLES FOR PROFESSIONAL TOOLS

Distilled from Refactoring UI, Butterick's Practical Typography, and the design systems of Linear, Vercel, Stripe, Bloomberg, and Figma.

## 2.1 Information Density Is a Feature

Every pixel is valuable. Fill it with useful information, not padding. The #1 difference between AI output and professional tools.

- Reduce padding: 12-16px on cards, not 24-32px
- Use 13-14px body text on data screens
- Prefer tables over card grids for homogeneous data
- Show 20-50 rows default, not 5-10
- Use inline editing over modal forms
- Sidebar + main + panel > single-column

**Test:** If you can see 3x more information by reducing whitespace without hurting readability, you had too much.

## 2.2 Hierarchy Through Typography, Not Decoration

```
Page title:     20-24px, semibold (600)
Section title:  16-18px, semibold (600)
Card title:     14-15px, medium (500)
Body text:      13-14px, regular (400)
Secondary:      12-13px, regular (400), muted color
Caption/label:  11-12px, medium (500), uppercase, tracking 0.05em, muted
Monospace data: 13px, monospace, regular (400)
```

Max 2 fonts: one sans-serif, one monospace. Right-align numbers. Tabular figures. Line height: 1.4-1.5 body, 1.2-1.3 headings.

## 2.3 Color With Purpose

- **Neutral base (90%):** Grays for backgrounds, borders, secondary text.
- **Primary accent (5%):** One strong color for actions, active states, links. Sparingly.
- **Semantic (5%):** Green/amber/red/blue for status ONLY.

Never brand color on large surfaces. Borders: gray-200 to gray-300. One shadow level max: `0 1px 3px rgba(0,0,0,0.08)`.

## 2.4 Spacing System (base-4)

```
4px   - tight: icon to label, badge to text
8px   - compact: related elements in a group
12px  - default: cell padding, input padding
16px  - comfortable: between cards, within-card sections
24px  - section: between major content blocks
32px  - page section: top-level separation
48px  - page margin / major separation
```

All values from this scale. No arbitrary numbers.

## 2.5 Tables Are Power Tools

- Header: 11-12px, uppercase, tracking 0.05em, sticky, muted color
- Row height: 36-40px
- Cell padding: 8-12px vertical, 12-16px horizontal
- Font: 13-14px body, 12px secondary
- Numbers: right-aligned, tabular figures
- Status: small dot (8px) or compact badge, not full-width pills
- Hover: gray-50 background
- No zebra striping - use hover and row borders
- Frozen first column on horizontal scroll
- Inline actions visible on hover

## 2.6 Forms

- Labels above inputs. Input height: 32-36px
- Placeholder text is not a label
- Group related fields with subtle dividers
- Inline validation on blur
- Submit bottom-right, cancel bottom-left

## 2.7 Navigation

- Sidebar: 48-64px collapsed, 220-260px expanded
- Active: bg fill + bold text OR left border accent. Not both.
- Command palette (Cmd+K) for power users
- Underline tabs for content areas, pill tabs for filters

## 2.8 Every Component Has 5+ States

Default, Hover, Active, Disabled (opacity 0.4), Loading (skeleton), Error (red border + msg), Empty (explain + CTA), Selected (subtle bg + check), Focused (ring for a11y).

---

# SECTION 3 - DESIGN REFERENCE ANCHORS

## Professional Data Platform (GoldenEye, Disruption Monitor)

| Reference | Learn From |
|---|---|
| **Bloomberg Terminal** | Information density perfected. Color is functional. No wasted space. |
| **Linear** | Dense project management that feels elegant. Keyboard-first, muted palette. |
| **Grafana** | Dashboard composition. Multiple panels, coherent grid, good dark mode. |

**Feel:** "A control center built by engineers who understand the domain. Dense, fast, trustworthy."

## Intelligence / Knowledge OS (TARS v2)

| Reference | Learn From |
|---|---|
| **Raycast** | Command-driven, instant, minimal chrome, maximum content. |
| **Notion** | Structured data that feels approachable. Excellent inline editing. |
| **Arc Browser** | Rethinking familiar interfaces. Spatial organization, contextual panels. |

**Feel:** "This knows me. It surfaces what matters without me asking."

## Farm / Operational Tool (Aegir)

| Reference | Learn From |
|---|---|
| **Stripe Dashboard** | Best-in-class financial data. Clean tables, smart color for status. |
| **Vercel Dashboard** | Operational status presentation. Timeline views, excellent empty states. |
| **Samsara** | Domain-specific ops tool. Map + data, real-time status, alert management. |

**Feel:** "Built by people who understand my work. Every screen anticipates what I need."

## Content / Media Platform (SMA Platform)

| Reference | Learn From |
|---|---|
| **YouTube Studio** | Content analytics: thumbnails + metrics, timeline charts. |
| **Buffer** | Clean content calendar, multi-platform scheduling. |
| **Chartmogul** | SaaS metrics beautifully presented. Excellent charts, cohort analysis. |

**Feel:** "All channels, all content, all metrics in one glance. Then drill into anything."

---

# SECTION 4 - COMPONENT-LEVEL SPECS

## Stat Cards / KPI Tiles

```
Height: 80-100px | Padding: 16px | Label: 11-12px uppercase muted
Value: 24-32px semibold | Trend: 12-13px inline green/red with arrow
Background: white or gray-50 NEVER colored | Border: 1px gray-200
Layout: 4-6 across on desktop
```

## Data Tables

```
Header: 11-12px uppercase sticky muted | Rows: 36-40px | Cell: 8px/12px padding
Body: 13-14px | Numbers: right-aligned monospace | Status: 8px dot or compact badge
Hover: gray-50 | Border: 1px gray-100 bottom | Pagination: bottom-right compact
```

## Charts

```
Title: 14-16px left | Axes: 12px gray-400 | Grid: horizontal dashed gray-100
Colors: max 6 | Tooltip: 12px instant white+shadow | Height: 200-300px
Legend: below or right, 12px, clickable | Empty: dashed border + suggestion
```

## Modals

```
Width: 480-640px | Padding: 24px | Title: 18px semibold left
Close: X + ESC + click-outside | Actions: bottom-right
Overlay: black 40-50% no blur | Animation: 150ms fade+scale(0.95->1)
No nested modals ever.
```

## Sidebars

```
Collapsed: 48-56px | Expanded: 220-260px | Icons: 20px stroke-style
Active: bg fill (primary 10% opacity) + medium weight
Hover: gray-100 | Nested: 12-16px indent, 12-13px
```

## Command Palette

```
Trigger: Cmd/Ctrl+K | Width: 560-640px | Max-height: 400px
Input: 16-18px autofocused | Results: grouped by type, 36px rows
Keyboard: arrows + enter + esc | Debounce: 150ms max
```

---

# SECTION 5 - SELF-REVIEW

1. **5-foot test:** Squint. Hierarchy still visible?
2. **Bloomberg test:** Could this show 2x more data? If yes, it should.
3. **"Who built this?" test:** Would a Linear designer respect this or see AI output?
4. **Consistency test:** Two pages side by side - same spacing, type, color, components?
5. **Anti-pattern scan:** Every element checked against Section 1.
