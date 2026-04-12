import { createContext, useContext } from 'react';

// Theme tokens - both light and dark
export const themes = {
  dark: {
    name: 'dark' as const,
    bg: {
      primary: '#0b1121',
      secondary: '#111a2e',
      tertiary: '#162036',
      elevated: '#1a2740',
      overlay: 'rgba(0,0,0,0.5)',
      map: '#080e1a',
      mapGradientCenter: '#0d1525',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#cbd5e1',
      tertiary: '#94a3b8',
      muted: '#7d8da0',
      inverse: '#0f172a',
    },
    border: {
      subtle: '#1e293b',
      default: '#334155',
      strong: '#475569',
      focus: '#3b82f6',
    },
    accent: {
      blue: '#3b82f6',
      red: '#ef4444',
      amber: '#f59e0b',
      green: '#22c55e',
      purple: '#a78bfa',
      cyan: '#38bdf8',
      orange: '#f97316',
    },
    severity: {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e',
      criticalBg: 'rgba(239,68,68,0.08)',
      highBg: 'rgba(249,115,22,0.08)',
      mediumBg: 'rgba(234,179,8,0.06)',
      lowBg: 'rgba(34,197,94,0.06)',
    },
  },
  light: {
    name: 'light' as const,
    bg: {
      primary: '#f8fafc',
      secondary: '#ffffff',
      tertiary: '#f1f5f9',
      elevated: '#e2e8f0',
      overlay: 'rgba(0,0,0,0.2)',
      map: '#e8eef6',
      mapGradientCenter: '#dce4f0',
    },
    text: {
      primary: '#0f172a',
      secondary: '#334155',
      tertiary: '#64748b',
      muted: '#94a3b8',
      inverse: '#f1f5f9',
    },
    border: {
      subtle: '#e2e8f0',
      default: '#cbd5e1',
      strong: '#94a3b8',
      focus: '#2563eb',
    },
    accent: {
      blue: '#2563eb',
      red: '#dc2626',
      amber: '#d97706',
      green: '#16a34a',
      purple: '#7c3aed',
      cyan: '#0ea5e9',
      orange: '#ea580c',
    },
    severity: {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
      criticalBg: 'rgba(220,38,38,0.06)',
      highBg: 'rgba(234,88,12,0.06)',
      mediumBg: 'rgba(202,138,4,0.05)',
      lowBg: 'rgba(22,163,74,0.05)',
    },
  },
} as const;

export type ThemeName = 'dark' | 'light';
export type Theme = typeof themes.dark;

// V2 typography - much more generous than v1
export const V2_TYP = {
  pageTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h1: { fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  h2: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
  h3: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  body: { fontSize: 13, fontWeight: 400, lineHeight: 1.6 },
  bodySm: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 11, fontWeight: 400, lineHeight: 1.4 },
  label: { fontSize: 10, fontWeight: 600, lineHeight: 1.2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  mono: { fontSize: 13, fontWeight: 600, lineHeight: 1.3, fontFamily: 'JetBrains Mono, monospace' },
  monoSm: { fontSize: 11, fontWeight: 600, lineHeight: 1.2, fontFamily: 'JetBrains Mono, monospace' },
  hero: { fontSize: 28, fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' },
  heroSm: { fontSize: 20, fontWeight: 700, lineHeight: 1.1, fontFamily: 'JetBrains Mono, monospace' },
} as const;

// V2 spacing - 25% more generous than v1
export const V2_SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const V2_BR = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Font family constants
export const V2_FONT = 'Inter, DM Sans, system-ui, sans-serif';
export const V2_FONT_MONO = 'JetBrains Mono, monospace';

// Theme context
export const ThemeContext = createContext<{
  theme: Theme;
  themeName: ThemeName;
  toggleTheme: () => void;
}>({
  theme: themes.dark,
  themeName: 'dark',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
