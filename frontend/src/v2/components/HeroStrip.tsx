/**
 * HeroStrip — single-line narrative risk summary bar
 *
 * Sits between header and main content (~48px). Left: one-sentence
 * auto-generated risk summary. Right: clickable severity pills + trend badge.
 */

import { useMemo } from 'react';
import { useTheme, V2_TYP, V2_SP, V2_BR } from '../theme';
import type { useFilterState } from '../../hooks/useFilterState';
import type { Severity } from '../../types';
import { Pill } from './ui';

interface HeroStripProps {
  kpi: {
    sevCounts: { Critical: number; High: number; Medium: number; Low: number };
    affectedMfgSites: number;
    affectedSuppliers: number;
    trend: 'escalating' | 'improving' | 'stable';
  };
  mode: string;
  fil: ReturnType<typeof useFilterState>;
}

const SEV_ORDER: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

function sevColorKey(sev: Severity): 'critical' | 'high' | 'medium' | 'low' {
  return sev.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
}

/** Generate the most important one-sentence summary from the data */
function buildHeroSentence(
  kpi: HeroStripProps['kpi'],
  mode: string,
): { text: string; tint: 'red' | 'orange' | 'green' } {
  const { sevCounts, affectedMfgSites } = kpi;
  const modeLabel = mode === 'trade' ? 'trade events' : mode === 'geopolitical' ? 'geopolitical risks' : 'disruptions';

  if (sevCounts.Critical > 0) {
    const sitePart = affectedMfgSites > 0 ? ` affecting ${affectedMfgSites} manufacturing site${affectedMfgSites !== 1 ? 's' : ''}` : '';
    return {
      text: `${sevCounts.Critical} critical ${modeLabel}${sitePart}`,
      tint: 'red',
    };
  }

  if (sevCounts.High > 0) {
    return {
      text: `${sevCounts.High} high-severity ${modeLabel} requiring attention`,
      tint: 'orange',
    };
  }

  if (sevCounts.Medium > 0) {
    return {
      text: `${sevCounts.Medium} medium-severity ${modeLabel} being monitored`,
      tint: 'orange',
    };
  }

  return {
    text: `All clear \u2014 no active high-severity ${modeLabel}`,
    tint: 'green',
  };
}

export function HeroStrip({ kpi, mode, fil }: HeroStripProps) {
  const { theme } = useTheme();

  const hero = useMemo(() => buildHeroSentence(kpi, mode), [kpi, mode]);

  const tintColor = hero.tint === 'red'
    ? theme.severity.critical
    : hero.tint === 'orange'
      ? theme.severity.high
      : theme.severity.low;

  const tintBg = hero.tint === 'red'
    ? theme.severity.criticalBg
    : hero.tint === 'orange'
      ? theme.severity.highBg
      : theme.severity.lowBg;

  const trendIcon = kpi.trend === 'escalating' ? '\u2191' : kpi.trend === 'improving' ? '\u2193' : '\u2192';
  const trendLabel = kpi.trend === 'escalating' ? 'Escalating' : kpi.trend === 'improving' ? 'Improving' : 'Stable';
  const trendColor = kpi.trend === 'escalating'
    ? theme.severity.critical
    : kpi.trend === 'improving'
      ? theme.severity.low
      : theme.text.tertiary;

  const total = kpi.sevCounts.Critical + kpi.sevCounts.High + kpi.sevCounts.Medium + kpi.sevCounts.Low;

  return (
    <div
      role="region"
      aria-label="Risk summary"
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${V2_SP.xl}px`,
        background: tintBg,
        borderBottom: `1px solid ${theme.border.subtle}`,
        gap: V2_SP.lg,
        flexShrink: 0,
      }}
    >
      {/* Left: Hero sentence */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: V2_SP.sm,
        }}
      >
        {/* Dot indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: V2_BR.full,
            background: tintColor,
            boxShadow: `0 0 8px ${tintColor}66`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            ...V2_TYP.body,
            color: theme.text.primary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {hero.text}
        </span>
      </div>

      {/* Right: Severity pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: V2_SP.xs,
          flexShrink: 0,
        }}
      >
        {SEV_ORDER.map(sev => {
          const count = kpi.sevCounts[sev];
          if (count === 0 && total > 0) return null;
          if (total === 0 && sev !== 'Low') return null;
          const color = theme.severity[sevColorKey(sev)];
          const isActive = fil.sevFilter === sev;

          return (
            <Pill
              key={sev}
              size="sm"
              color={color}
              active={isActive}
              onClick={() => fil.setSevFilter(isActive ? null : sev)}
              count={count}
              ariaLabel={`Filter by ${sev}: ${count} event${count !== 1 ? 's' : ''}${isActive ? ' (active filter)' : ''}`}
              ariaPressed={isActive}
            >
              {sev}
            </Pill>
          );
        })}

        {/* Clear filter button */}
        {fil.sevFilter && (
          <Pill
            size="sm"
            onClick={() => fil.setSevFilter(null)}
            ariaLabel="Clear severity filter"
          >
            Clear
          </Pill>
        )}

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 20,
            background: theme.border.subtle,
            margin: `0 ${V2_SP.xs}px`,
          }}
        />

        {/* Trend badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: V2_SP.xs,
            padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
            borderRadius: V2_BR.full,
            transition: 'background 0.15s ease',
          }}
        >
          <span style={{ fontSize: 12, color: trendColor, lineHeight: 1 }}>{trendIcon}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: trendColor,
              letterSpacing: '0.02em',
            }}
          >
            {trendLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
