/**
 * KPIBar — compact horizontal metric cards below the hero strip
 *
 * Shows: total active events, affected MFG sites, affected suppliers,
 * and a mode-specific metric. When Critical > 0, the bar gets a subtle
 * red-tinted background.
 */

import { useMemo, useState } from 'react';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';

interface KPIBarProps {
  kpi: {
    sevCounts: { Critical: number; High: number; Medium: number; Low: number };
    affectedMfgSites: number;
    affectedSuppliers: number;
    trend: string;
  };
  mode: string;
}

interface MetricDef {
  icon: string;
  value: number | string;
  label: string;
  color: string;
}

export function KPIBar({ kpi, mode }: KPIBarProps) {
  const { theme } = useTheme();

  const total = kpi.sevCounts.Critical + kpi.sevCounts.High + kpi.sevCounts.Medium + kpi.sevCounts.Low;
  const hasCritical = kpi.sevCounts.Critical > 0;

  const modeMetric = useMemo((): MetricDef => {
    if (mode === 'trade') {
      return {
        icon: '\u{1F6A2}',
        label: 'Trade barriers',
        value: kpi.sevCounts.Critical + kpi.sevCounts.High,
        color: theme.accent.amber,
      };
    }
    if (mode === 'geopolitical') {
      return {
        icon: '\u{1F310}',
        label: 'Risk regions',
        value: kpi.sevCounts.Critical + kpi.sevCounts.High,
        color: theme.accent.purple,
      };
    }
    // disruptions
    const escalating = kpi.trend === 'up' || kpi.trend === 'escalating';
    return {
      icon: '\u26A1',
      label: 'Trend',
      value: escalating ? 'Escalating' : kpi.trend === 'down' || kpi.trend === 'improving' ? 'Improving' : 'Stable',
      color: escalating ? theme.severity.critical : theme.severity.low,
    };
  }, [mode, kpi, theme]);

  const metrics: MetricDef[] = [
    {
      icon: '\u{1F4CA}',
      value: total,
      label: 'Active events',
      color: hasCritical ? theme.severity.critical : theme.accent.blue,
    },
    {
      icon: '\u{1F3ED}',
      value: kpi.affectedMfgSites,
      label: 'MFG sites affected',
      color: theme.accent.red,
    },
    {
      icon: '\u{1F4E6}',
      value: typeof kpi.affectedSuppliers === 'number' ? kpi.affectedSuppliers.toLocaleString() : kpi.affectedSuppliers,
      label: 'Suppliers at risk',
      color: theme.accent.purple,
    },
    modeMetric,
  ];

  return (
    <div
      role="region"
      aria-label="Key performance indicators"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: V2_SP.sm,
        padding: `${V2_SP.md}px ${V2_SP.xl}px`,
        background: hasCritical ? theme.severity.criticalBg : theme.bg.secondary,
        borderBottom: `1px solid ${theme.border.subtle}`,
        flexShrink: 0,
        transition: 'background 0.3s ease',
      }}
    >
      {metrics.map((m, i) => (
        <KPIMetricCard key={i} metric={m} />
      ))}
    </div>
  );
}

function KPIMetricCard({ metric }: { metric: MetricDef }) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: V2_SP.md,
        padding: `${V2_SP.md}px ${V2_SP.lg}px`,
        background: hovered ? theme.bg.tertiary : theme.bg.secondary,
        border: `1px solid ${theme.border.subtle}`,
        borderRadius: V2_BR.md,
        transition: 'background 0.15s ease',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }} aria-hidden="true">
        {metric.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: metric.color,
            fontFamily: V2_FONT_MONO,
          }}
        >
          {metric.value}
        </div>
        <div
          style={{
            ...V2_TYP.caption,
            color: theme.text.tertiary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 3,
          }}
        >
          {metric.label}
        </div>
      </div>
    </div>
  );
}
