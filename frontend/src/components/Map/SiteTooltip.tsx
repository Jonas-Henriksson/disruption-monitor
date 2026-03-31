import { TYPE_CFG, REGION_CFG, BU_CFG } from '../../data';

interface SiteTooltipProps {
  site: { name: string; country: string; type: string; region: string; bu?: string; lat: number; lng: number };
  tx: number;
  ty: number;
}

export function SiteTooltip({ site, tx, ty }: SiteTooltipProps) {
  const c = TYPE_CFG[site.type] || TYPE_CFG.other;
  const bc = site.bu ? BU_CFG[site.bu] : undefined;
  const tagColor = bc ? bc.color : c.color;
  const tagLabel = bc ? bc.label : c.label;

  return (
    <div style={{ position: 'absolute', left: tx, top: ty, pointerEvents: 'none', zIndex: 18, background: '#0b1525ee', border: '1px solid #1e3050', borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.6)', backdropFilter: 'blur(12px)', maxWidth: 220 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{site.name}</div>
      <div style={{ fontSize: 10, color: '#4a6080', marginTop: 1 }}>{site.country}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
        <span style={{ background: tagColor + '22', color: tagColor, padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, border: `1px solid ${tagColor}33` }}>{tagLabel}</span>
        <span style={{ background: (REGION_CFG[site.region]?.color || '#666') + '22', color: REGION_CFG[site.region]?.color, padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600 }}>{REGION_CFG[site.region]?.label}</span>
      </div>
    </div>
  );
}
