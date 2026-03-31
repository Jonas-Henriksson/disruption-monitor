import { FRIC, FM } from '../../data';
import { getEvent } from '../../utils/scan';
import type { ScanItem, FrictionLevel } from '../../types';

interface RoutePopupProps {
  route: { label: string; type: string; corridor: string; origin: string; pts?: number[][] };
  frictionLevel: FrictionLevel | undefined;
  tradeEvent: ScanItem | null;
  onClose: () => void;
}

const FRICTION_DESC: Record<string, string> = {
  'Free': 'No trade barriers or delays',
  'Low': 'Minor documentation requirements',
  'Moderate': 'Tariffs or inspections causing delays',
  'High': 'Significant tariffs, quotas, or sanctions impacting cost and lead time',
  'Prohibitive': 'Blocked or near-blocked route due to sanctions or conflict',
};

export function RoutePopup({ route, frictionLevel, tradeEvent, onClose }: RoutePopupProps) {
  const fLvl = frictionLevel;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{route.label}</div>
        <button onClick={onClose} style={{ background: '#0d1525', border: '1px solid #1e3050', borderRadius: 6, color: '#4a6080', cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{'\u2715'}</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ background: route.type === 'sea' ? '#1a5f8a33' : '#7c3aed33', color: route.type === 'sea' ? '#38bdf8' : '#a78bfa', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600 }}>{route.type === 'sea' ? '\u{1F6A2} Sea Lane' : '\u2708\uFE0F Air Lane'}</span>
        <span style={{ background: '#1e3a5c44', color: '#94a3b8', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500 }}>{route.corridor}</span>
        {fLvl && <span style={{ background: FRIC[fLvl] + '22', color: FRIC[fLvl], padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600 }}>{fLvl} friction</span>}
      </div>
      {fLvl && <div style={{ marginTop: 8, padding: '6px 8px', background: FRIC[fLvl] + '0d', border: `1px solid ${FRIC[fLvl]}22`, borderRadius: 6, fontSize: 9, color: FRIC[fLvl], fontFamily: FM, lineHeight: 1.4 }}>
        {FRICTION_DESC[fLvl]}
      </div>}
      <div style={{ marginTop: 10, fontFamily: FM, fontSize: 10, lineHeight: 1.7 }}>
        <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 70, flexShrink: 0 }}>Origin</span><span style={{ color: '#94a3b8' }}>{route.origin}</span></div>
        <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 70, flexShrink: 0 }}>Type</span><span style={{ color: '#94a3b8' }}>{route.type === 'sea' ? 'Maritime' : 'Aviation'}</span></div>
        {route.pts && <div style={{ display: 'flex' }}><span style={{ color: '#2a3d5c', width: 70, flexShrink: 0 }}>Via</span><span style={{ color: '#94a3b8' }}>{route.pts.length > 15 ? 'Suez Canal' : route.pts.length > 10 ? 'Gibraltar' : 'Atlantic'}</span></div>}
      </div>
      {tradeEvent && fLvl && <div style={{ marginTop: 10, padding: '8px', background: '#0d152588', borderRadius: 6, borderLeft: `2px solid ${FRIC[fLvl] || '#64748b'}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Active Trade Event</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0' }}>{getEvent(tradeEvent)}</div>
        {'description' in tradeEvent && <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>{((tradeEvent as { description: string }).description || '').slice(0, 150)}{((tradeEvent as { description: string }).description || '').length > 150 ? '...' : ''}</div>}
      </div>}
    </>
  );
}
