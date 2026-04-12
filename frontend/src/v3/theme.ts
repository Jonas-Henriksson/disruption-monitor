/**
 * V3 Design Token System — SC Hub Disruption Monitor
 *
 * Consolidated dark theme tokens for the V3 mission-control UI.
 * Based on V2's theme.ts with refinements for the feed-centric layout.
 */

export const V3 = {
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
export function sevColor(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return V3.severity.critical;
  if (s === 'high') return V3.severity.high;
  if (s === 'medium') return V3.severity.medium;
  if (s === 'low') return V3.severity.low;
  return V3.text.muted;
}

/** Map a severity string to its background token */
export function sevBg(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return V3.severity.criticalBg;
  if (s === 'high') return V3.severity.highBg;
  if (s === 'medium') return V3.severity.mediumBg;
  if (s === 'low') return V3.severity.lowBg;
  return 'transparent';
}

/** Map a severity string to its border token */
export function sevBorder(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return V3.severity.criticalBorder;
  if (s === 'high') return V3.severity.highBorder;
  if (s === 'medium') return V3.severity.mediumBorder;
  if (s === 'low') return V3.severity.lowBorder;
  return V3.border.subtle;
}
