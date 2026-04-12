import { useState } from 'react';
import { SEV, FM, TYPE_CFG, REGION_CFG, BU_CFG, SITES, SUPPLIERS, ROUTES, SUPPLY_GRAPH, ADDR } from '../../data';
import { TYP } from '../../tokens';
import type { Severity, SiteSuppliersResponse } from '../../types';

interface ExposureScore {
  score: number;
  level: string;
  threats: { event: string; severity: string; direct: boolean; route: boolean }[];
}

interface SitePopupProps {
  site: typeof SITES[number];
  exposureScore: ExposureScore | null | undefined;
  onClose: () => void;
  supExpand: Record<string, boolean>;
  setSupExpand: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  siteSuppliers?: SiteSuppliersResponse | null;
  siteSuppliersLoading?: boolean;
}

type SortKey = 'spend_pct' | 'supplier_count' | 'country';

export function SitePopup({ site, exposureScore, onClose, supExpand: _supExpand, setSupExpand: _setSupExpand, siteSuppliers, siteSuppliersLoading }: SitePopupProps) {
  void _supExpand; void _setSupExpand; // reserved for future inline expand
  const [sortKey, setSortKey] = useState<SortKey>('spend_pct');
  const [sortAsc, setSortAsc] = useState(false);

  const bc = site.bu && BU_CFG[site.bu];
  const c = TYPE_CFG[site.type] || TYPE_CFG.other;
  const ad = ADDR[site.name];
  const adCity = ad ? ad.split('|')[0] : '';
  const adAddr = ad ? ad.split('|')[1] : '';
  const graph = SUPPLY_GRAPH[site.name];
  const exp = exposureScore;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(key === 'country'); }
  };

  // Sort by_country data
  const sortedCountries = siteSuppliers ? [...siteSuppliers.by_country].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    if (sortKey === 'country') return dir * a.country.localeCompare(b.country);
    if (sortKey === 'supplier_count') return dir * (a.supplier_count - b.supplier_count);
    return dir * (a.spend_pct - b.spend_pct);
  }) : [];

  // Category breakdown from API data
  const categoryBreakdown = siteSuppliers ? (() => {
    const catMap: Record<string, number> = {};
    siteSuppliers.suppliers.forEach(s => {
      const cat = s.category_l1 || 'Other';
      catMap[cat] = (catMap[cat] || 0) + s.spend_pct;
    });
    return Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  })() : [];

  // Active disruption countries
  const disruptedCountries = siteSuppliers ? siteSuppliers.by_country.filter(c => c.has_active_disruption) : [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...TYP.headline }}>{site.name}{siteSuppliers?.site.site_id && siteSuppliers.site.site_id !== site.name ? <span style={{ color: '#4a6080', fontWeight: 400 }}> ({siteSuppliers.site.site_id})</span> : null}</div>
          <div style={{ ...TYP.bodySm, marginTop: 2 }}>{site.country} {'\u00b7'} {REGION_CFG[site.region]?.label}</div>
        </div>
        <button onClick={onClose} style={{ background: '#0d1525', border: '1px solid #1e3050', borderRadius: 6, color: '#4a6080', cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{'\u2715'}</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {bc && <span style={{ background: bc.color + '22', color: bc.color, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: `1px solid ${bc.color}33` }}>{bc.label}</span>}
        <span style={{ background: c.color + '22', color: c.color, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: `1px solid ${c.color}33` }}>{c.label}</span>
        {exp && <span style={{ background: (SEV[exp.level as Severity] || '#64748b') + '22', color: SEV[exp.level as Severity], padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FM, border: `1px solid ${SEV[exp.level as Severity]}33` }}>Exposure: {exp.level} ({exp.score})</span>}
      </div>
      <div style={{ marginTop: 10, fontFamily: FM, fontSize: 10, lineHeight: 1.7 }}>
        <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 60, flexShrink: 0 }}>Country</span><span style={{ color: '#94a3b8' }}>{site.country}</span></div>
        {adCity && <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 60, flexShrink: 0 }}>City</span><span style={{ color: '#94a3b8' }}>{adCity}</span></div>}
        {adAddr && <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 60, flexShrink: 0 }}>Address</span><span style={{ color: '#94a3b8', fontSize: 9 }}>{adAddr}</span></div>}
      </div>

      {/* Rich supplier data from API */}
      {siteSuppliers && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #14243e' }}>
        {/* Concentration score bar */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ ...TYP.label, color: '#22c55e', fontFamily: FM }}>Supply Concentration</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FM, color: siteSuppliers.summary.concentration_score > 70 ? '#f59e0b' : siteSuppliers.summary.concentration_score > 40 ? '#eab308' : '#22c55e' }}>{siteSuppliers.summary.concentration_score}</span>
          </div>
          <div style={{ height: 4, background: '#0d1525', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, siteSuppliers.summary.concentration_score)}%`,
              borderRadius: 2,
              background: siteSuppliers.summary.concentration_score > 70
                ? 'linear-gradient(90deg, #22c55e, #f59e0b)'
                : siteSuppliers.summary.concentration_score > 40
                  ? 'linear-gradient(90deg, #22c55e, #eab308)'
                  : '#22c55e',
              transition: 'width 0.6s ease-out',
            }} />
          </div>
        </div>

        {/* Summary line */}
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
          {siteSuppliers.summary.total_suppliers} suppliers {'\u00b7'} {siteSuppliers.summary.total_countries} countries
          {siteSuppliers.summary.active_disruptions_affecting > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}> {'\u00b7'} {siteSuppliers.summary.active_disruptions_affecting} disruption{siteSuppliers.summary.active_disruptions_affecting > 1 ? 's' : ''}</span>}
        </div>

        {/* Top countries by spend_pct — sortable table header */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {([['country', 'Country'], ['spend_pct', 'Spend %'], ['supplier_count', '#Sup']] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => handleSort(key)} style={{
              background: sortKey === key ? '#14243e' : 'transparent',
              border: 'none',
              color: sortKey === key ? '#60a5fa' : '#2a3d5c',
              fontSize: 7,
              fontFamily: FM,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 3,
              flex: key === 'country' ? 1 : undefined,
            }}>
              {label} {sortKey === key ? (sortAsc ? '\u25b2' : '\u25bc') : ''}
            </button>
          ))}
        </div>

        {/* Country rows — scrollable */}
        <div style={{ maxHeight: 140, overflow: 'auto', marginBottom: 6 }} className="sc-s">
          {sortedCountries.map((cEntry, ci) => {
            const supData = SUPPLIERS.find(x => x.country === cEntry.country);
            return <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #0d1525' }}>
              {cEntry.has_active_disruption
                ? <div style={{ width: 5, height: 5, borderRadius: 3, background: '#ef4444', flexShrink: 0, boxShadow: '0 0 4px #ef444488' }} />
                : <div style={{ width: 4, height: 4, borderRadius: 2, background: '#22c55e', flexShrink: 0 }} />
              }
              <span style={{ fontSize: 10, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cEntry.country}</span>
              <span style={{ fontFamily: FM, fontSize: 9, color: cEntry.spend_pct > 20 ? '#f59e0b' : '#64748b', fontWeight: cEntry.spend_pct > 20 ? 700 : 400, minWidth: 36, textAlign: 'right' }}>{cEntry.spend_pct.toFixed(1)}%</span>
              <span style={{ fontFamily: FM, fontSize: 8, color: '#2a3d5c', minWidth: 28, textAlign: 'right' }}>{cEntry.supplier_count}{supData ? `/${supData.n}` : ''}</span>
            </div>;
          })}
        </div>

        {/* Category breakdown */}
        {categoryBreakdown.length > 0 && <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 8, fontWeight: 600, color: '#2a3d5c', fontFamily: FM, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Categories</div>
          {categoryBreakdown.slice(0, 5).map(([cat, pct], ci) => (
            <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <span style={{ fontSize: 9, color: '#64748b', flex: 1 }}>{cat}</span>
              <span style={{ fontFamily: FM, fontSize: 8, color: '#4a6080' }}>{pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>}

        {/* Active risks */}
        {disruptedCountries.length > 0 && <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #14243e' }}>
          <div style={{ ...TYP.label, color: '#ef4444', fontFamily: FM, marginBottom: 4 }}>Active Supply Risks ({disruptedCountries.length})</div>
          {disruptedCountries.map((dc, di) => (
            <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #0d1525' }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: '#e2e8f0', flex: 1 }}>{dc.country}</span>
              <span style={{ fontFamily: FM, fontSize: 8, color: '#ef4444' }}>{dc.spend_pct.toFixed(1)}%</span>
              <span style={{ fontFamily: FM, fontSize: 7, color: '#2a3d5c' }}>{dc.supplier_count} sup</span>
            </div>
          ))}
        </div>}
      </div>}

      {/* Loading indicator for supplier data */}
      {siteSuppliersLoading && site.type === 'mfg' && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #14243e' }}>
        <div style={{ ...TYP.label, color: '#22c55e', fontFamily: FM, marginBottom: 6 }}>Inbound Supply Chain</div>
        <div className="sc-skel" style={{ height: 12, marginBottom: 6 }} />
        <div className="sc-skel" style={{ height: 8, width: '70%', marginBottom: 4 }} />
        <div className="sc-skel" style={{ height: 8, width: '50%' }} />
      </div>}

      {/* Fallback: SUPPLY_GRAPH view when API data unavailable and not loading */}
      {!siteSuppliers && !siteSuppliersLoading && graph && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #14243e' }}>
        <div style={{ ...TYP.label, color: '#22c55e', fontFamily: FM, marginBottom: 6 }}>Inbound Supply Chain</div>
        <div style={{ fontSize: 9, color: '#2a3d5c', marginBottom: 6 }}>Key inputs: {graph.inputs.join(', ')}</div>
        <div style={{ fontSize: 8, fontWeight: 600, color: '#2a3d5c', fontFamily: FM, marginBottom: 4 }}>Supplier Countries</div>
        {graph.sup.map((country, ci) => {
          const supData = SUPPLIERS.find(x => x.country === country);
          return <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #0d1525' }}>
            <div style={{ width: 4, height: 4, borderRadius: 2, background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>{country}</span>
            {supData && <span style={{ fontFamily: FM, fontSize: 8, color: '#2a3d5c' }}>{supData.n} sup</span>}
          </div>;
        })}
        {/* Outbound routes */}
        {(() => {
          const srvRoutes = ROUTES.map((r, i) => r.origin === site.name ? { ...r, idx: i } : null).filter(Boolean) as (typeof ROUTES[number] & { idx: number })[];
          if (!srvRoutes.length) return null;
          return <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: '#2a3d5c', fontFamily: FM, marginBottom: 4 }}>Outbound Routes</div>
            {srvRoutes.map((r, ri) => <div key={ri} style={{ fontSize: 9, color: '#64748b', padding: '2px 0' }}>
              <span style={{ color: r.type === 'sea' ? '#38bdf8' : '#c084fc' }}>{r.type === 'sea' ? 'SEA' : 'AIR'}</span> {r.label} <span style={{ color: '#2a3d5c' }}>({r.corridor})</span>
            </div>)}
          </div>;
        })()}
      </div>}

      {/* Exposure threats */}
      {exp && exp.threats.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #14243e' }}>
        <div style={{ ...TYP.label, color: SEV[exp.level as Severity], fontFamily: FM, marginBottom: 4 }}>Active Threats ({exp.threats.length})</div>
        {exp.threats.slice(0, 5).map((t, ti) => <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: '1px solid #0d1525' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: SEV[t.severity as Severity], flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#94a3b8', flex: 1 }}>{t.event}</span>
          <span style={{ fontSize: 7, color: '#2a3d5c', fontFamily: FM }}>{t.direct ? 'DIRECT' : t.route ? 'ROUTE' : 'SUPPLIER'}</span>
        </div>)}
      </div>}
      {!graph && !siteSuppliers && !siteSuppliersLoading && site.type === 'mfg' && <div style={{ marginTop: 10, fontSize: 9, color: '#2a3d5c', fontStyle: 'italic' }}>Supply chain data not yet mapped for this site</div>}
    </>
  );
}
