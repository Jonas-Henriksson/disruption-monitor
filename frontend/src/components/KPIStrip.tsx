import { useMemo } from 'react';
import { SEV, FM, ROUTES, SUPPLY_GRAPH, SUPPLIERS } from '../data';
import { computeImpactWithGraph } from '../utils/impact';
import { getSev, getTrend } from '../utils/scan';
import type { ScanItem, Severity } from '../types';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

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

interface KPIStripProps {
  kpi: KpiData;
  mode: DisruptionState['mode'];
  fil: FilterState;
}

export function KPIStrip({ kpi, mode, fil }: KPIStripProps) {
  const criticalCount = kpi.sevCounts.Critical || 0;
  return (
    <div style={{ background: criticalCount > 0 ? '#0f0a0a' : '#080e1c', borderTop: criticalCount > 0 ? '2px solid #ef444444' : 'none', borderBottom: '1px solid #14243e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 26 }}>
      {/* Severity counts — clickable filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(sev => {
          const count = kpi.sevCounts[sev];
          if (!count) return null;
          const active = fil.sevFilter === sev;
          const color = SEV[sev];
          const isCritical = sev === 'Critical' && count > 0;
          return <button key={sev} onClick={() => fil.setSevFilter(active ? null : sev)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
            background: active ? color + '22' : 'transparent',
            border: `1px solid ${active ? color + '55' : '#14243e'}`,
            borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
          }}>
            <div className={isCritical ? 'sc-live-dot' : undefined} style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: sev === 'Critical' ? `0 0 8px ${color}88` : 'none' }} />
            <span style={{ fontFamily: FM, fontSize: isCritical ? 14 : 12, fontWeight: 700, color }}>{count}</span>
            <span style={{ fontSize: 9, color: active ? color : '#4a6080', fontWeight: 500 }}>{sev}</span>
          </button>;
        })}
        {fil.sevFilter && <button onClick={() => fil.setSevFilter(null)} style={{ padding: '3px 8px', border: '1px solid #14243e', borderRadius: 4, background: 'transparent', color: '#4a6080', fontSize: 9, cursor: 'pointer', fontFamily: FM }}>Clear</button>}
      </div>

      <div style={{ width: 1, height: 20, background: '#14243e' }} />

      {/* Affected assets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: FM, fontSize: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>{kpi.affectedMfgSites}</span>
          <span style={{ color: '#4a6080' }}>MFG sites affected</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>{kpi.affectedSuppliers.toLocaleString()}</span>
          <span style={{ color: '#4a6080' }}>suppliers exposed</span>
        </div>
      </div>

      <div style={{ width: 1, height: 20, background: '#14243e' }} />

      {/* Trend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FM, fontSize: 10 }}>
        <span style={{ color: '#4a6080' }}>Risk trend</span>
        <span style={{ color: kpi.trend === 'up' ? '#ef4444' : kpi.trend === 'down' ? '#22c55e' : '#64748b', fontWeight: 700, fontSize: 14 }}>
          {kpi.trend === 'up' ? '\u25B2' : kpi.trend === 'down' ? '\u25BC' : '\u25C6'}
        </span>
        <span style={{ color: kpi.trend === 'up' ? '#ef4444' : kpi.trend === 'down' ? '#22c55e' : '#64748b', fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }}>
          {kpi.trend === 'up' ? 'Escalating' : kpi.trend === 'down' ? 'Improving' : 'Stable'}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Total */}
      <div style={{ fontFamily: FM, fontSize: 9, color: '#2a3d5c' }}>
        {kpi.total} active {mode === 'trade' ? 'trade events' : mode === 'geopolitical' ? 'risks' : 'disruptions'}
      </div>
    </div>
  );
}
