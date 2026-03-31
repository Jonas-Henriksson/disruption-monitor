import { FM, SUP_CATS, L1_FULL } from '../../data';

interface SupplierPopupProps {
  supplier: { country: string; n: number; rows: number };
  supExpand: Record<string, boolean>;
  setSupExpand: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onClose: () => void;
}

export function SupplierPopup({ supplier, supExpand, setSupExpand, onClose }: SupplierPopupProps) {
  const cats = SUP_CATS[supplier.country] || [];
  const maxN = cats.length ? cats[0][1] : 1;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{supplier.country}</div>
          <div style={{ fontFamily: FM, fontSize: 10, color: '#a78bfa', marginTop: 2 }}>{supplier.n.toLocaleString()} suppliers {'\u00b7'} {supplier.rows.toLocaleString()} supply entries</div>
        </div>
        <button onClick={onClose} style={{ background: '#0d1525', border: '1px solid #1e3050', borderRadius: 6, color: '#4a6080', cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{'\u2715'}</button>
      </div>
      <div style={{ marginTop: 10 }}>
        {cats.map(([l1, n, subs]: [string, number, [string, number][]], ci: number) => {
          const l1Full = L1_FULL[l1] || l1;
          const isExp = supExpand[l1];
          return <div key={l1} style={{ marginBottom: 2 }}>
            <div onClick={(e) => { e.stopPropagation(); setSupExpand(p => ({ ...p, [l1]: !p[l1] })); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', cursor: 'pointer', borderBottom: '1px solid #14243e' }}>
              <span style={{ color: '#2a3d5c', fontSize: 9, transform: isExp ? 'rotate(90deg)' : '', transition: 'transform .15s', flexShrink: 0 }}>{'\u25B6'}</span>
              <span style={{ fontSize: 10, color: '#c4b5fd', fontWeight: 600, width: 120, flexShrink: 0 }}>{l1Full}</span>
              <div style={{ flex: 1, height: 5, background: '#0d1525', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(n / maxN) * 100}%`, height: '100%', background: '#a78bfa', borderRadius: 2, opacity: Math.max(.35, 1 - ci * .15) }} />
              </div>
              <span style={{ fontFamily: FM, fontSize: 9, color: '#64748b', width: 32, textAlign: 'right', flexShrink: 0 }}>{n}</span>
            </div>
            {isExp && subs.length > 0 && <div style={{ paddingLeft: 16, borderLeft: '1px solid #a78bfa22', marginLeft: 4 }}>
              {subs.map(([l2name, l2n]: [string, number]) => {
                const l2Max = subs[0][1];
                return <div key={l2name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 120, flexShrink: 0 }}>{l2name}</span>
                  <div style={{ flex: 1, height: 3, background: '#0d1525', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${(l2n / l2Max) * 100}%`, height: '100%', background: '#7c3aed', borderRadius: 2, opacity: .6 }} />
                  </div>
                  <span style={{ fontFamily: FM, fontSize: 8, color: '#4a6080', width: 28, textAlign: 'right', flexShrink: 0 }}>{l2n}</span>
                </div>;
              })}
            </div>}
          </div>;
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: '#2a3d5c', fontStyle: 'italic' }}>Click a category to expand subcategories. Data from supplier master.</div>
    </>
  );
}
