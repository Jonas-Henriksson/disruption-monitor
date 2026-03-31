import { SEV, FM, TYPE_CFG, REGION_CFG, BU_CFG, SITES, SUPPLIERS, ROUTES, SUPPLY_GRAPH, ADDR } from '../../data';
import type { Severity } from '../../types';

interface ExposureScore {
  score: number;
  level: string;
  threats: { event: string; severity: string; direct: boolean; route: boolean }[];
}

interface SitePopupProps {
  site: typeof SITES[number];
  exposureScore: ExposureScore | null | undefined;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supExpand: Record<string, boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupExpand: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function SitePopup({ site, exposureScore, onClose, supExpand: _supExpand, setSupExpand: _setSupExpand }: SitePopupProps) {
  void _supExpand; void _setSupExpand; // reserved for future inline expand
  const bc = site.bu && BU_CFG[site.bu];
  const c = TYPE_CFG[site.type] || TYPE_CFG.other;
  const ad = ADDR[site.name];
  const adCity = ad ? ad.split('|')[0] : '';
  const adAddr = ad ? ad.split('|')[1] : '';
  const graph = SUPPLY_GRAPH[site.name];
  const exp = exposureScore;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{site.name}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{site.country} {'\u00b7'} {REGION_CFG[site.region]?.label}</div>
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
      {/* Supply chain view */}
      {graph && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #14243e' }}>
        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#22c55e', fontFamily: FM, marginBottom: 6 }}>Inbound Supply Chain</div>
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
              <span style={{ color: r.type === 'sea' ? '#38bdf8' : '#c084fc' }}>{r.type === 'sea' ? '\u{1F6A2}' : '\u2708\uFE0F'}</span> {r.label} <span style={{ color: '#2a3d5c' }}>({r.corridor})</span>
            </div>)}
          </div>;
        })()}
      </div>}
      {/* Exposure threats */}
      {exp && exp.threats.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #14243e' }}>
        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: SEV[exp.level as Severity], fontFamily: FM, marginBottom: 4 }}>Active Threats ({exp.threats.length})</div>
        {exp.threats.slice(0, 5).map((t, ti) => <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: '1px solid #0d1525' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: SEV[t.severity as Severity], flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#94a3b8', flex: 1 }}>{t.event}</span>
          <span style={{ fontSize: 7, color: '#2a3d5c', fontFamily: FM }}>{t.direct ? 'DIRECT' : t.route ? 'ROUTE' : 'SUPPLIER'}</span>
        </div>)}
      </div>}
      {!graph && site.type === 'mfg' && <div style={{ marginTop: 10, fontSize: 9, color: '#2a3d5c', fontStyle: 'italic' }}>Supply chain data not yet mapped for this site</div>}
    </>
  );
}
