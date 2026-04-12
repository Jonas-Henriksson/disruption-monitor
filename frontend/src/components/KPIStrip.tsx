import { useMemo, useEffect, useRef } from 'react';
import { SEV, FM, ROUTES, SUPPLY_GRAPH, SUPPLIERS } from '../data';
import { S, T, B, ACCENT, TYP, FS } from '../tokens';
import { Badge } from './ui';
import { computeImpactWithGraph } from '../utils/impact';
import { getSev, getTrend } from '../utils/scan';
import type { ScanItem, Severity } from '../types';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';
import type { Viewport } from '../hooks/useMediaQuery';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

const LS_KPI_KEY = 'sc-hub-last-kpi';

export interface KpiData {
  sevCounts: Record<Severity, number>;
  affectedMfgSites: number;
  affectedSuppliers: number;
  trend: string;
  total: number;
}

/** Compute KPI strip metrics from scan items */
export function useKpiData(items: ScanItem[] | null): KpiData | null {
  return useMemo(() => {
    if (!items?.length) return null;
    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 } as Record<Severity, number>;
    const affectedSites = new Set<string>();
    const affectedSupplierCountries = new Set<string>();

    items.forEach(d => {
      const sv = getSev(d);
      sevCounts[sv] = (sevCounts[sv] || 0) + 1;
      const imp = computeImpactWithGraph(d, ROUTES, SUPPLY_GRAPH);
      imp.factories.forEach(f => affectedSites.add(f));
      imp.suppliers.forEach(s => affectedSupplierCountries.add(s));
    });

    const affectedSupplierCount = SUPPLIERS
      .filter(s => affectedSupplierCountries.has(s.country))
      .reduce((sum, s) => sum + s.n, 0);

    const escalating = items.filter(d => getTrend(d) === 'Escalating').length;
    const deescalating = items.filter(d => getTrend(d) === 'De-escalating').length;
    const trend = escalating > deescalating ? 'up' : escalating < deescalating ? 'down' : 'stable';

    return {
      sevCounts,
      affectedMfgSites: affectedSites.size,
      affectedSuppliers: affectedSupplierCount,
      trend,
      total: items.length,
    };
  }, [items]);
}

/** Compute and persist severity count deltas since last visit */
function useKpiDeltas(kpi: KpiData | null): Record<Severity, number> | null {
  const savedRef = useRef(false);

  const deltas = useMemo(() => {
    if (!kpi) return null;
    try {
      const stored = localStorage.getItem(LS_KPI_KEY);
      if (!stored) return null;
      const prev = JSON.parse(stored) as Record<Severity, number>;
      const result = {} as Record<Severity, number>;
      for (const sev of ['Critical', 'High', 'Medium', 'Low'] as Severity[]) {
        result[sev] = (kpi.sevCounts[sev] || 0) - (prev[sev] || 0);
      }
      // Only show if at least one severity changed
      const hasChange = Object.values(result).some(v => v !== 0);
      return hasChange ? result : null;
    } catch {
      return null;
    }
  }, [kpi]);

  // Save current counts to localStorage on first render with data
  useEffect(() => {
    if (kpi && !savedRef.current) {
      savedRef.current = true;
      try {
        localStorage.setItem(LS_KPI_KEY, JSON.stringify(kpi.sevCounts));
      } catch { /* localStorage unavailable */ }
    }
  }, [kpi]);

  return deltas;
}

interface KPIStripProps {
  kpi: KpiData;
  mode: DisruptionState['mode'];
  fil: FilterState;
  viewport?: Viewport;
}

export function KPIStrip({ kpi, mode, fil, viewport = 'desktop' }: KPIStripProps) {
  const deltas = useKpiDeltas(kpi);

  const criticalCount = kpi.sevCounts.Critical || 0;
  const highCount = kpi.sevCounts.High || 0;
  const hasCritical = criticalCount > 0;
  const hasHigh = highCount > 0;

  // Smart KPI: hero sizing when Critical > 0, emphasized when High > 0, calm otherwise
  const allCalm = !hasCritical && !hasHigh;

  const sevStyle = (sev: Severity, count: number, active: boolean) => {
    const color = SEV[sev];
    const isHero = sev === 'Critical' && hasCritical;
    const isEmph = sev === 'High' && !hasCritical && hasHigh;
    if (isHero) {
      return {
        fontSize: FS.hero * 1.15, fontWeight: TYP.hero.fontWeight, color,
        textShadow: `0 0 18px ${color}88, 0 0 6px ${color}55`,
        letterSpacing: '-0.5px',
      };
    }
    if (sev === 'Critical' && count > 0) {
      return {
        fontSize: 24, fontWeight: 800 as const, color,
        textShadow: `0 0 12px ${color}66, 0 0 4px ${color}44`,
        letterSpacing: '-0.5px',
      };
    }
    if (isEmph) {
      return {
        fontSize: 18, fontWeight: 700 as const, color,
        textShadow: `0 0 8px ${color}44`,
        letterSpacing: '-0.3px',
      };
    }
    if (sev === 'High' && count > 0) {
      return {
        fontSize: 16, fontWeight: 700 as const, color,
        textShadow: hasCritical ? 'none' : `0 0 6px ${color}33`,
        letterSpacing: '0px',
      };
    }
    // Medium/Low — muted when a higher severity is dominant
    const mute = hasCritical || hasHigh;
    return {
      fontSize: 11, fontWeight: 600 as const,
      color: active ? color : color + (mute ? '88' : 'bb'),
      textShadow: 'none',
      letterSpacing: '0px',
    };
  };

  const labelStyle = (sev: Severity, count: number, active: boolean) => {
    const color = SEV[sev];
    const isHero = sev === 'Critical' && hasCritical;
    const isEmph = sev === 'High' && !hasCritical && hasHigh;
    if (isHero) {
      return { fontSize: 11, color: active ? color : color + 'dd', fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '1.5px' };
    }
    if (sev === 'Critical' && count > 0) {
      return { fontSize: 10, color: active ? color : color + 'cc', fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '1px' };
    }
    if (isEmph) {
      return { fontSize: 10, color: active ? color : color + 'cc', fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };
    }
    if (sev === 'High' && count > 0) {
      return { fontSize: 9, color: active ? color : '#6b7fa0', fontWeight: 600 as const, textTransform: 'none' as const, letterSpacing: '0px' };
    }
    const mute = hasCritical || hasHigh;
    return { fontSize: 8, color: active ? color : (mute ? color + '77' : B.chokepoint), fontWeight: 500 as const, textTransform: 'none' as const, letterSpacing: '0px' };
  };

  const dotSize = (sev: Severity, count: number) => {
    if (sev === 'Critical' && hasCritical) return 11;
    if (sev === 'Critical' && count > 0) return 9;
    if (sev === 'High' && !hasCritical && hasHigh) return 9;
    if (sev === 'High' && count > 0) return 7;
    return 5;
  };

  const btnPadding = (sev: Severity, count: number) => {
    if (sev === 'Critical' && hasCritical) return '8px 18px';
    if (sev === 'Critical' && count > 0) return '6px 14px';
    if (sev === 'High' && !hasCritical && hasHigh) return '6px 14px';
    if (sev === 'High' && count > 0) return '5px 11px';
    return '3px 8px';
  };

  // Calm/muted state when no Critical events
  const stripBg = hasCritical ? S.critical : S[0];
  const stripBorder = hasCritical ? `2px solid ${ACCENT.red}55` : 'none';
  const muted = !hasCritical && !hasHigh;

  const isMobile = viewport === 'mobile';
  const isTablet = viewport === 'tablet';

  return (
    <div role="region" aria-label="Key risk indicators" style={{
      background: stripBg,
      borderTop: stripBorder,
      borderBottom: `1px solid ${B.subtle}`,
      padding: isMobile ? '6px 10px' : '5px 16px',
      display: isMobile ? 'grid' : 'flex',
      ...(isMobile ? {
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
      } : isTablet ? {
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto' as const,
        WebkitOverflowScrolling: 'touch' as const,
      } : {
        alignItems: 'center',
        gap: 14,
      }),
      flexShrink: 0,
      zIndex: 26,
    }}>
      {/* PRIMARY TIER: Severity counts — smart visual hierarchy */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        ...(isMobile ? { gridColumn: '1 / -1', overflowX: 'auto' as const, WebkitOverflowScrolling: 'touch' as const, paddingBottom: 2 } : {}),
      }}>
        {/* All Clear state — green accent when no Critical or High */}
        {allCalm && <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isMobile ? '8px 12px' : '5px 12px',
          background: `${ACCENT.green}0a`,
          border: `1px solid ${ACCENT.green}22`,
          borderRadius: 8, flexShrink: 0,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT.green, boxShadow: `0 0 6px ${ACCENT.green}66` }} />
          <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: ACCENT.green, letterSpacing: '-0.3px' }}>All Clear</span>
          <span style={{ fontFamily: FM, fontSize: 9, color: `${ACCENT.green}88`, fontWeight: 500 }}>No critical or high severity events</span>
        </div>}
        {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(sev => {
          const count = kpi.sevCounts[sev];
          if (!count) return null;
          const active = fil.sevFilter === sev;
          const color = SEV[sev];
          const isCritHero = sev === 'Critical' && hasCritical;
          const isHighEmph = sev === 'High' && !hasCritical && hasHigh;
          const ss = sevStyle(sev, count, active);
          const ls = labelStyle(sev, count, active);
          const ds = dotSize(sev, count);
          const bp = btnPadding(sev, count);
          return <button key={sev} aria-label={`${count} ${sev} severity event${count !== 1 ? 's' : ''}${active ? ' (active filter)' : ''}`} aria-pressed={active} onClick={() => fil.setSevFilter(active ? null : sev)} style={{
            display: 'flex', alignItems: 'center', gap: isCritHero ? 10 : (isHighEmph ? 8 : 5),
            padding: isMobile ? '8px 12px' : bp,
            minHeight: isMobile ? 44 : undefined,
            background: active ? color + '22' : (isCritHero ? color + '12' : (isHighEmph ? color + '08' : 'transparent')),
            border: `1px solid ${active ? color + '55' : (isCritHero ? color + '40' : (isHighEmph ? color + '30' : B.subtle))}`,
            borderRadius: isCritHero ? 10 : (isHighEmph ? 8 : 6), cursor: 'pointer', transition: 'all .15s',
            flexShrink: 0,
            boxShadow: isCritHero ? `0 0 20px ${color}22, 0 0 8px ${color}11` : 'none',
          }}>
            <div aria-hidden="true" className={isCritHero ? 'sc-live-dot' : undefined} style={{
              width: ds, height: ds, borderRadius: '50%', background: color,
              boxShadow: isCritHero ? `0 0 14px ${color}aa, 0 0 4px ${color}77` : (isHighEmph ? `0 0 6px ${color}55` : (sev === 'High' && count > 0 ? `0 0 4px ${color}44` : 'none')),
            }} />
            <span style={{ fontFamily: FM, ...ss, position: 'relative' }}>
              {count}
              {deltas && deltas[sev] !== 0 && (() => {
                const d = deltas[sev];
                const isHighSev = sev === 'Critical' || sev === 'High';
                const badgeColor = isHighSev
                  ? (d > 0 ? '#ef4444' : '#22c55e')
                  : '#6b7fa0';
                return (
                  <span style={{
                    position: 'absolute',
                    top: isCritHero ? -8 : -6,
                    right: isCritHero ? -16 : -14,
                    fontSize: isCritHero ? 9 : 8,
                    fontWeight: 700,
                    color: badgeColor,
                    fontFamily: FM,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}>
                    {d > 0 ? `+${d}` : `${d}`}
                  </span>
                );
              })()}
            </span>
            <span style={{ ...ls }}>{sev}</span>
          </button>;
        })}
        {fil.sevFilter && <button onClick={() => fil.setSevFilter(null)} style={{ padding: '3px 8px', border: `1px solid ${B.subtle}`, borderRadius: 4, background: 'transparent', color: T.muted, fontSize: 9, cursor: 'pointer', fontFamily: FM }}>Clear</button>}
      </div>

      {!isMobile && <div style={{ width: 1, height: 22, background: B.subtle, opacity: 0.6 }} />}

      {/* SECONDARY TIER: Affected assets — smaller, supporting (hidden on mobile) */}
      <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 10, fontFamily: FM, fontSize: 9, opacity: muted ? 0.6 : 0.85 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ color: ACCENT.red, fontWeight: 600, fontSize: 10 }}>{kpi.affectedMfgSites}</span>
          <span style={{ color: B.chokepoint, fontSize: 8 }}>MFG sites</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ color: ACCENT.purple, fontWeight: 600, fontSize: 10 }}>{kpi.affectedSuppliers.toLocaleString()}</span>
          <span style={{ color: B.chokepoint, fontSize: 8 }}>suppliers</span>
        </div>
      </div>

      {!isMobile && <div style={{ width: 1, height: 16, background: B.subtle, opacity: 0.4 }} />}

      {/* TERTIARY TIER: Risk trend — smallest, contextual (hidden on mobile) */}
      {(() => {
        const trendColor = kpi.trend === 'up' ? ACCENT.red : kpi.trend === 'down' ? ACCENT.green : '#475569';
        const trendIcon = kpi.trend === 'up' ? '\u25B2' : kpi.trend === 'down' ? '\u25BC' : '\u25C6';
        const trendLabel = kpi.trend === 'up' ? 'Escalating' : kpi.trend === 'down' ? 'Improving' : 'Stable';
        return (
          <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 3, opacity: muted ? 0.45 : 0.65 }}>
            <Badge label={`${trendIcon} ${trendLabel}`} color={trendColor} bg="transparent" border="transparent" size="sm" style={{ fontWeight: 500, letterSpacing: '0.5px', padding: 0, border: 'none' }} />
          </div>
        );
      })()}

      {!isMobile && <div style={{ flex: 1 }} />}

      {/* Total — far right, muted (hidden on mobile) */}
      <div style={{ display: isMobile ? 'none' : 'block', fontFamily: FM, fontSize: 8, color: T.dim, opacity: 0.7 }}>
        {kpi.total} {mode === 'trade' ? 'trade' : mode === 'geopolitical' ? 'risks' : 'events'}
      </div>
    </div>
  );
}
