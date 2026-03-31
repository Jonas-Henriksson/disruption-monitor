import { FM } from '../../data';

interface SupplierTooltipProps {
  supplier: { country: string; n: number; rows: number; cats: string[] };
  tx: number;
  ty: number;
}

export function SupplierTooltip({ supplier, tx, ty }: SupplierTooltipProps) {
  return (
    <div style={{ position: 'absolute', left: tx, top: ty, pointerEvents: 'none', zIndex: 18, background: '#0b1525ee', border: '1px solid #a78bfa33', borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.6)', backdropFilter: 'blur(12px)', maxWidth: 240 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{supplier.country}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, fontFamily: FM, fontSize: 10 }}>
        <div><span style={{ color: '#a78bfa', fontWeight: 700 }}>{supplier.n.toLocaleString()}</span><span style={{ color: '#4a6080', marginLeft: 3 }}>suppliers</span></div>
        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>{supplier.rows.toLocaleString()}</span><span style={{ color: '#4a6080', marginLeft: 3 }}>relationships</span></div>
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
        {supplier.cats.map((c, i) => <span key={i} style={{ background: '#a78bfa22', color: '#a78bfa', padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 500, border: '1px solid #a78bfa22' }}>{c}</span>)}
      </div>
    </div>
  );
}
