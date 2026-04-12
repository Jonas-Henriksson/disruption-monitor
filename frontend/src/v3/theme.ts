/**
 * V3 Design Token System — SC Hub Disruption Monitor
 *
 * Consolidated dark + light theme tokens for the V3 mission-control UI.
 * Based on V2's theme.ts with refinements for the feed-centric layout.
 */

export const V3_DARK = {
  bg: {
    base: '#0a0f1a',
    card: '#111827',
    cardHover: '#1a2234',
    sidebar: '#0d1320',
    topbar: '#0c1222',
    expanded: '#151e2e',
    overlay: 'rgba(0,0,0,0.55)',
    input: '#0f1729',
    badge: '#1e293b',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#cbd5e1',
    muted: '#64748b',
    accent: '#60a5fa',
    inverse: '#0f172a',
  },
  severity: {
    critical: '#ef4444',
    criticalBg: 'rgba(239,68,68,0.10)',
    criticalBorder: 'rgba(239,68,68,0.25)',
    high: '#f97316',
    highBg: 'rgba(249,115,22,0.10)',
    highBorder: 'rgba(249,115,22,0.25)',
    medium: '#eab308',
    mediumBg: 'rgba(234,179,8,0.08)',
    mediumBorder: 'rgba(234,179,8,0.20)',
    low: '#22c55e',
    lowBg: 'rgba(34,197,94,0.08)',
    lowBorder: 'rgba(34,197,94,0.20)',
  },
  accent: {
    blue: '#3b82f6',
    blueDim: 'rgba(59,130,246,0.15)',
    green: '#22c55e',
    red: '#ef4444',
    amber: '#f59e0b',
    purple: '#a78bfa',
    cyan: '#38bdf8',
  },
  border: {
    subtle: '#1e293b',
    default: '#334155',
    strong: '#475569',
    focus: '#3b82f6',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
} as const;

export const V3_LIGHT = {
  bg: {
    base: '#f8fafc',
    card: '#ffffff',
    cardHover: '#f1f5f9',
    sidebar: '#f1f5f9',
    topbar: '#ffffff',
    expanded: '#f8fafc',
    overlay: 'rgba(0,0,0,0.15)',
    input: '#f1f5f9',
    badge: '#e2e8f0',
  },
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#94a3b8',
    accent: '#2563eb',
    inverse: '#f8fafc',
  },
  severity: {
    critical: '#dc2626',
    criticalBg: 'rgba(220,38,38,0.08)',
    criticalBorder: 'rgba(220,38,38,0.20)',
    high: '#ea580c',
    highBg: 'rgba(234,88,12,0.08)',
    highBorder: 'rgba(234,88,12,0.20)',
    medium: '#ca8a04',
    mediumBg: 'rgba(202,138,4,0.06)',
    mediumBorder: 'rgba(202,138,4,0.15)',
    low: '#16a34a',
    lowBg: 'rgba(22,163,74,0.06)',
    lowBorder: 'rgba(22,163,74,0.15)',
  },
  accent: {
    blue: '#2563eb',
    blueDim: 'rgba(37,99,235,0.10)',
    green: '#16a34a',
    red: '#dc2626',
    amber: '#d97706',
    purple: '#7c3aed',
    cyan: '#0891b2',
  },
  border: {
    subtle: '#e2e8f0',
    default: '#cbd5e1',
    strong: '#94a3b8',
    focus: '#2563eb',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
} as const;

/** Theme type — identical structure for dark and light */
export type V3Theme = typeof V3_DARK;

/** Backwards-compatible alias — defaults to dark */
export const V3 = V3_DARK;

export const TYPE = {
  title: { fontSize: 14, fontWeight: 600 as const },
  meta: { fontSize: 12, fontWeight: 400 as const },
  impact: { fontSize: 13, fontWeight: 500 as const, fontFamily: 'JetBrains Mono, monospace' },
  sectionHeader: {
    fontSize: 11,
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  body: { fontSize: 12, fontWeight: 400 as const, lineHeight: 1.5 },
  hero: { fontSize: 24, fontWeight: 800 as const, fontFamily: 'JetBrains Mono, monospace' },
  heroSm: { fontSize: 18, fontWeight: 700 as const, fontFamily: 'JetBrains Mono, monospace' },
  mono: { fontSize: 12, fontWeight: 600 as const, fontFamily: 'JetBrains Mono, monospace' },
} as const;

export const V3_FONT = 'Inter, DM Sans, system-ui, sans-serif';
export const V3_FONT_MONO = 'JetBrains Mono, monospace';

/** Map a severity string to its color token */
export function sevColor(severity: string, theme: V3Theme = V3_DARK): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return theme.severity.critical;
  if (s === 'high') return theme.severity.high;
  if (s === 'medium') return theme.severity.medium;
  if (s === 'low') return theme.severity.low;
  return theme.text.muted;
}

/** Map a severity string to its background token */
export function sevBg(severity: string, theme: V3Theme = V3_DARK): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return theme.severity.criticalBg;
  if (s === 'high') return theme.severity.highBg;
  if (s === 'medium') return theme.severity.mediumBg;
  if (s === 'low') return theme.severity.lowBg;
  return 'transparent';
}

/** Map a severity string to its border token */
export function sevBorder(severity: string, theme: V3Theme = V3_DARK): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return theme.severity.criticalBorder;
  if (s === 'high') return theme.severity.highBorder;
  if (s === 'medium') return theme.severity.mediumBorder;
  if (s === 'low') return theme.severity.lowBorder;
  return theme.border.subtle;
}
