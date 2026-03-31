import { SEV, SBG, CAT, FM } from '../../data';
import { getSev, getEvent, getTrend } from '../../utils/scan';
import type { ScanItem, ScanMode } from '../../types';

interface DisruptionTooltipProps {
  item: ScanItem;
  mode: ScanMode | null;
  tx: number;
  ty: number;
}

export function DisruptionTooltip({ item, mode, tx, ty }: DisruptionTooltipProps) {
  const sv = getSev(item);
  const co = SEV[sv] || '#eab308';

  return (
    <div style={{ position: 'absolute', left: tx, top: ty, pointerEvents: 'none', zIndex: 18, background: '#0b1525ee', border: `1px solid ${co}44`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.6)', backdropFilter: 'blur(12px)', maxWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {mode !== 'geopolitical' && <span style={{ fontSize: 12 }}>{CAT[('category' in item ? item.category : '') as string] || '\u26A0\uFE0F'}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>{getEvent(item)}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <span style={{ background: SBG[sv] || '#333', color: co, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FM }}>{sv}</span>
        <span style={{ color: '#4a6080', fontSize: 9 }}>{getTrend(item) || ('trend_arrow' in item ? item.trend_arrow as string : '')}</span>
      </div>
      <div style={{ color: '#4a6080', fontSize: 9, marginTop: 4 }}>Click to inspect {'\u2192'}</div>
    </div>
  );
}
