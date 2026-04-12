/**
 * Design Tokens — SC Hub Disruption Monitor
 *
 * Centralized source of truth for all visual constants: surfaces, text,
 * borders, spacing, typography, and radii. Every inline hex, pixel size,
 * and spacing value used across the UI should trace back to one of these
 * tokens.
 *
 * Naming conventions:
 *   S  = Surface (background fills)
 *   T  = Text (foreground colors)
 *   B  = Border
 *   SP = Spacing (4 px base grid)
 *   FS = Font Size
 *   BR = Border Radius
 */

// ── Surface (backgrounds) ───────────────────────────────────────────
export const S = {
  /** #060a12 — deepest background: map fill, base page */
  base: '#060a12',
  /** #080e1c — panel backgrounds (left, right, header, filter bar) */
  0: '#080e1c',
  /** #0a1220 — card backgrounds, input fields, toggle groups, legend */
  1: '#0a1220',
  /** #0d1525 — nested elements, inner cards, progress track, badges */
  2: '#0d1525',
  /** #0d1830 — active/selected card, skeleton shimmer mid-tone */
  3: '#0d1830',
  /** #0f0a0a — critical-tinted panel background (KPI strip) */
  critical: '#0f0a0a',
  /** #0b1525 — tooltip/popup background (with transparency via ee suffix) */
  tooltip: '#0b1525',
  /** #111c2a — country fill (non-conflict) on the map */
  mapCountry: '#111c2a',
  /** #1a1520 — conflict-zone country fill on the map */
  mapConflict: '#1a1520',
  /** #0c1322 — radial gradient center on map */
  mapGradient: '#0c1322',
  /** #1e2d44 — chokepoint diamond fill */
  chokepoint: '#1e2d44',
  /** #1e3a5c — active toggle / watch button background */
  active: '#1e3a5c',
  /** #1e3050 — secondary toggle / active group background */
  activeAlt: '#1e3050',
  /** #14243e — cluster outer ring, header gradient blend */
  cluster: '#14243e',
  /** #1e3a5c — cluster inner fill */
  clusterInner: '#1e3a5c',
} as const;

// ── Text ────────────────────────────────────────────────────────────
export const T = {
  /** #e2e8f0 — primary: titles, headings, card event names */
  primary: '#e2e8f0',
  /** #c8d6e5 — body text, descriptions, bullet content */
  body: '#c8d6e5',
  /** #c4b5fd — accented body (supplier L1 labels) */
  accent: '#c4b5fd',
  /** #94a3b8 — secondary labels, site detail values, country names */
  secondary: '#94a3b8',
  /** #8b9ec7 — M365 button text, lighter secondary */
  secondaryLight: '#8b9ec7',
  /** #64748b — tertiary: status labels, source badges, bar chart labels */
  tertiary: '#64748b',
  /** #4a6080 — muted: legend labels, filter counts, metadata */
  muted: '#4a6080',
  /** #2a3d5c — ghost: section headers (TYPE, REGION, GROUP BY), timestamps */
  ghost: '#2a3d5c',
  /** #2a4060 — map country labels */
  mapLabel: '#2a4060',
  /** #1e3050 — dim: dot separators, collapsed labels, muted badges */
  dim: '#1e3050',
  /** #14243e — near-invisible: disclaimer text, faintest labels */
  invisible: '#14243e',
} as const;

// ── Borders ─────────────────────────────────────────────────────────
export const B = {
  /** #14243e — most common border: cards, filter bar, panels, legend */
  subtle: '#14243e',
  /** #1e3050 — standard border: close buttons, popup outlines */
  default: '#1e3050',
  /** #1e3a5c — popup / click-panel border */
  popup: '#1e3a5c',
  /** #162040 — map graticule, divider lines in filter bar */
  faint: '#162040',
  /** #1a2744 — header mode buttons, notification bell border */
  headerBtn: '#1a2744',
  /** #2563eb44 — active/focus border (with alpha) */
  active: '#2563eb44',
  /** #1a2d45 — country stroke (non-conflict) on the map */
  mapCountry: '#1a2d45',
  /** #2a1525 — conflict-zone country stroke on the map */
  mapConflict: '#2a1525',
  /** #3a506c — chokepoint stroke */
  chokepoint: '#3a506c',
} as const;

// ── Spacing (4 px base grid) ────────────────────────────────────────
export const SP = {
  /** 2px — micro gap */
  xxs: 2,
  /** 4px — tight inner padding, small gaps */
  xs: 4,
  /** 6px — badge/pill padding, compact gaps */
  sm: 6,
  /** 8px — standard gap, card inner padding */
  md: 8,
  /** 10px — section content padding, card padding */
  lg: 10,
  /** 12px — panel content padding, card margin */
  xl: 12,
  /** 14px — popup / panel header padding */
  xxl: 14,
  /** 16px — panel outer padding, section padding */
  '3xl': 16,
  /** 18px — drawer header side padding */
  '4xl': 18,
  /** 24px — large section spacing */
  '5xl': 24,
  /** 32px — collapsed panel width, outer spacing */
  '6xl': 32,
} as const;

// ── Font sizes ──────────────────────────────────────────────────────
export const FS = {
  /** 7px — micro labels (SIS sub-filter counts, urgency pills) */
  xxs: 7,
  /** 8px — section headers (TYPE, REGION), badge text, metadata */
  xs: 8,
  /** 9px — small body: timestamps, filter buttons, tag text */
  sm: 9,
  /** 10px — standard body: card badges, toggle labels, popup detail */
  md: 10,
  /** 11px — expanded card body text, descriptions */
  lg: 11,
  /** 12px — card titles, section content, legend labels */
  xl: 12,
  /** 13px — headline text (talking points), popup site name */
  '2xl': 13,
  /** 14px — panel header titles, KPI numbers, mode button icons */
  '3xl': 14,
  /** 15px — app title ("SC Hub"), empty-state label */
  '4xl': 15,
  /** 16px — large title text */
  '5xl': 16,
  /** 22px — hero number (not currently used, reserved) */
  hero: 22,
  /** 48px — empty-state emoji */
  jumbo: 48,
} as const;

// ── Border radius ───────────────────────────────────────────────────
export const BR = {
  /** 2px — progress bars, severity distribution segments */
  xs: 2,
  /** 3px — small pills, sub-filter buttons, inline badges */
  sm: 3,
  /** 4px — standard pills, badges, tag chips, toggles */
  md: 4,
  /** 6px — cards, dropdowns, header buttons, content sections */
  lg: 6,
  /** 8px — panels, talking-point boxes, legend box */
  xl: 8,
  /** 9px — avatar circles, numbered priority badges */
  circle: 9,
  /** 10px — popup panels, click-overlay cards */
  '2xl': 10,
  /** 12px — large rounded containers */
  '3xl': 12,
} as const;

// ── Accent / Semantic colors (referenced across severity, status, etc.) ──
export const ACCENT = {
  /** Primary brand blue */
  blue: '#2563eb',
  /** Light blue (active highlights, links) */
  blueLight: '#60a5fa',
  /** Blue for factories / industrial */
  blueFactory: '#3b82f6',
  /** Success / green for positive actions, live dots */
  green: '#22c55e',
  /** Teal for expanded-state green */
  teal: '#34d399',
  /** Error / critical red */
  red: '#ef4444',
  /** Light red for error text on dark bg */
  redLight: '#fca5a5',
  /** Orange for high-severity / warnings */
  orange: '#f97316',
  /** Amber/yellow for medium severity */
  amber: '#eab308',
  /** Gold for secondary amber */
  gold: '#fbbf24',
  /** Purple for suppliers / SIS */
  purple: '#a78bfa',
  /** Deep purple for sub-category bars */
  purpleDeep: '#7c3aed',
  /** Indigo for admin sites */
  indigo: '#6366f1',
  /** Cyan for sea lanes, lubrication */
  cyan: '#38bdf8',
  /** Rose for APAC / China region */
  rose: '#f43f5e',
} as const;

// Re-export runtime constants from config so consumers have ONE import source
export { SEV, SBG, FM, F } from './data/config';
