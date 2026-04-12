import { useMemo, useEffect, useRef } from 'react';
import { SEV, FM, ROUTES, SUPPLY_GRAPH, SUPPLIERS } from '../data';
import { S, T, B, ACCENT } from '../tokens';
import { Badge } from './ui';
import { computeImpactWithGraph } from '../utils/impact';
import { getSev, getTrend } from '../utils/scan';
import type { ScanItem, Severity } from '../types';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';

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
}

export function KPIStrip({ kpi, mode, fil }: KPIStripProps) {
  const deltas = useKpiDeltas(kpi);

  const criticalCount = kpi.sevCounts.Critical || 0;
  const highCount = kpi.sevCounts.High || 0;
  const hasCritical = criticalCount > 0;
  const hasHigh = highCount > 0;

  // Visual hierarchy: Critical dominates, High prominent, Medium/Low supporting
  const sevStyle = (sev: Severity, count: number, active: boolean) => {
    const color = SEV[sev];
    if (sev === 'Critical' && count > 0) {
      return {
        fontSize: 24, fontWeight: 800 as const, color,
        textShadow: `0 0 12px ${color}66, 0 0 4px ${color}44`,
        letterSpacing: '-0.5px',
      };
    }
    if (sev === 'High' && count > 0) {
      return {
        fontSize: 16, fontWeight: 700 as const, color,
        textShadow: hasHigh ? `0 0 6px ${color}33` : 'none',
        letterSpacing: '0px',
      };
    }
    // Medium/Low — much smaller, supporting context
    return {
      fontSize: 11, fontWeight: 600 as const,
      color: active ? color : color + 'bb',
      textShadow: 'none',
      letterSpacing: '0px',
    };
  };

  const labelStyle = (sev: Severity, count: number, active: boolean) => {
    const color = SEV[sev];
    if (sev === 'Critical' && count > 0) {
      return { fontSize: 10, color: active ? color : color + 'cc', fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '1px' };
    }
    if (sev === 'High' && count > 0) {
      return { fontSize: 9, color: active ? color : '#6b7fa0', fontWeight: 600 as const, textTransform: 'none' as const, letterSpacing: '0px' };
    }
    return { fontSize: 8, color: active ? color : B.chokepoint, fontWeight: 500 as const, textTransform: 'none' as const, letterSpacing: '0px' };
  };

  const dotSize = (sev: Severity, count: number) => {
    if (sev === 'Critical' && count > 0) return 9;
    if (sev === 'High' && count > 0) return 7;
    return 5;
  };

  const btnPadding = (sev: Severity, count: number) => {
    if (sev === 'Critical' && count > 0) return '6px 14px';
    if (sev === 'High' && count > 0) return '5px 11px';
    return '3px 8px';
  };

  // Calm/muted state when no Critical events
  const stripBg = hasCritical ? S.critical : S[0];
  const stripBorder = hasCritical ? `2px solid ${ACCENT.red}55` : 'none';
  const muted = !hasCritical && !hasHigh;

  return (
    <div style={{ background: stripBg, borderTop: stripBorder, borderBottom: `1px solid ${B.subtle}`, padding: '5px 16px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, zIndex: 26 }}>
      {/* PRIMARY TIER: Severity counts — clickable filters, visual hierarchy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(sev => {
          const count = kpi.sevCounts[sev];
          if (!count) return null;
          const active = fil.sevFilter === sev;
          const color = SEV[sev];
          const isCritical = sev === 'Critical' && count > 0;
          const ss = sevStyle(sev, count, active);
          const ls = labelStyle(sev, count, active);
          const ds = dotSize(sev, count);
          const bp = btnPadding(sev, count);
          return <button key={sev} onClick={() => fil.setSevFilter(active ? null : sev)} style={{
            display: 'flex', alignItems: 'center', gap: isCritical ? 8 : 5, padding: bp,
            background: active ? color + '22' : (isCritical ? color + '0a' : 'transparent'),
            border: `1px solid ${active ? color + '55' : (isCritical ? color + '30' : B.subtle)}`,
            borderRadius: isCritical ? 8 : 6, cursor: 'pointer', transition: 'all .15s',
          }}>
            <div className={isCritical ? 'sc-live-dot' : undefined} style={{
              width: ds, height: ds, borderRadius: '50%', background: color,
              boxShadow: isCritical ? `0 0 10px ${color}99, 0 0 3px ${color}66` : (sev === 'High' && count > 0 ? `0 0 4px ${color}44` : 'none'),
            }} />
            <span style={{ fontFamily: FM, ...ss, position: 'relative' }}>
              {count}
              {deltas && deltas[sev] !== 0 && (() => {
                const d = deltas[sev];
                const isHighSev = sev === 'Critical' || sev === 'High';
                // For Critical/High: increase is bad (red), decrease is good (green)
                // For Medium/Low: changes are muted
                const badgeColor = isHighSev
                  ? (d > 0 ? '#ef4444' : '#22c55e')
                  : '#6b7fa0';
                return (
                  <span style={{
                    position: 'absolute',
                    top: -6,
                    right: -14,
                    fontSize: 8,
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

      <div style={{ width: 1, height: 22, background: B.subtle, opacity: 0.6 }} />

      {/* SECONDARY TIER: Affected assets — smaller, supporting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: FM, fontSize: 9, opacity: muted ? 0.6 : 0.85 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ color: ACCENT.red, fontWeight: 600, fontSize: 10 }}>{kpi.affectedMfgSites}</span>
          <span style={{ color: B.chokepoint, fontSize: 8 }}>MFG sites</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ color: ACCENT.purple, fontWeight: 600, fontSize: 10 }}>{kpi.affectedSuppliers.toLocaleString()}</span>
          <span style={{ color: B.chokepoint, fontSize: 8 }}>suppliers</span>
        </div>
      </div>

      <div style={{ width: 1, height: 16, background: B.subtle, opacity: 0.4 }} />

      {/* TERTIARY TIER: Risk trend — smallest, contextual */}
      {(() => {
        const trendColor = kpi.trend === 'up' ? ACCENT.red : kpi.trend === 'down' ? ACCENT.green : '#475569';
        const trendIcon = kpi.trend === 'up' ? '\u25B2' : kpi.trend === 'down' ? '\u25BC' : '\u25C6';
        const trendLabel = kpi.trend === 'up' ? 'Escalating' : kpi.trend === 'down' ? 'Improving' : 'Stable';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: muted ? 0.45 : 0.65 }}>
            <Badge label={`${trendIcon} ${trendLabel}`} color={trendColor} bg="transparent" border="transparent" size="sm" style={{ fontWeight: 500, letterSpacing: '0.5px', padding: 0, border: 'none' }} />
          </div>
        );
      })()}

      <div style={{ flex: 1 }} />

      {/* Total — far right, muted */}
      <div style={{ fontFamily: FM, fontSize: 8, color: T.dim, opacity: 0.7 }}>
        {kpi.total} {mode === 'trade' ? 'trade' : mode === 'geopolitical' ? 'risks' : 'events'}
      </div>
    </div>
  );
}
