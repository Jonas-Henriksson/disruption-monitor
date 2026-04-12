import { useState, useMemo, useRef, useCallback } from 'react';
import type { ScanItem, Severity, FrictionLevel } from '../types';
import {
  SEV, SBG, SO, CAT, RMC, FRIC, FM,
  STATUS_CFG, TEAM, TEAM_MAP,
  SITES, ROUTES, SUPPLY_GRAPH,
} from '../data';
import { TYP } from '../tokens';
import { relTime, eventId } from '../utils/format';
import { computeImpactWithGraph } from '../utils/impact';
import { getSev, getEvent, getRegion, getTrend } from '../utils/scan';
import { WhatChangedBanner } from './WhatChangedBanner';
import { ExpandedCard } from './ExpandedCard';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';
import type { Viewport } from '../hooks/useMediaQuery';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

interface DrawerPanelProps {
  dis: DisruptionState;
  fil: FilterState;
  open: boolean;
  onToggle: () => void;
  viewport?: Viewport;
  /** When true, panel renders without its own outer wrapper (embedded in bottom sheet) */
  embedded?: boolean;
}

export function DrawerPanel({ dis, fil, open, onToggle, viewport = 'desktop', embedded = false }: DrawerPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScrollToCard = useCallback((idx: number) => {
    dis.setSel(idx);
    // Find the card element and scroll to it
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const card = container.querySelector(`[data-card-idx="${idx}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight flash
        const el = card as HTMLElement;
        const orig = el.style.boxShadow;
        el.style.boxShadow = '0 0 16px #2563eb44';
        setTimeout(() => { el.style.boxShadow = orig; }, 1200);
      }
    });
  }, [dis]);

  // Computed values
  const cc = dis.items ? dis.items.filter(d => getSev(d) === 'Critical').length : 0;

  const rsc = useMemo(() => {
    const m: Record<string, string> = { 'Europe': 'EU', 'Middle East': 'MEA', 'China': 'APAC', 'India': 'APAC', 'Americas': 'AM', 'Africa': 'AF' };
    const o: Record<string, number> = {};
    if (!dis.items) return o;
    const regions = new Set(dis.items.map(d => getRegion(d)));
    regions.forEach(r => {
      if (r === 'Global') {
        o[r] = SITES.length;
      } else {
        const k = m[r];
        if (k) {
          o[r] = SITES.filter(s => s.region === k).length;
        } else {
          console.warn(`[SC Hub] Unmapped region "${r}" in site count — defaulting to 0`);
          o[r] = 0;
        }
      }
    });
    return o;
  }, [dis.items]);

  const impact = useMemo(() => {
    if (dis.sel === null || !dis.items?.[dis.sel]) return null;
    return computeImpactWithGraph(dis.items[dis.sel], ROUTES, SUPPLY_GRAPH);
  }, [dis.sel, dis.items]);

  const grouped = useMemo(() => {
    if (!dis.items) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: Record<string, any[]> = {};
    const active = dis.items.filter(d => {
      const eid = eventId(d as { event?: string; risk?: string; region?: string });
      const r = dis.registry[eid];
      if (r?.status === 'archived') return false;
      if (fil.sevFilter) {
        const sv = getSev(d);
        if (sv !== fil.sevFilter) return false;
      }
      if (fil.assignFilter) {
        const tk = dis.tickets[eid];
        if (fil.assignFilter === 'unassigned') return !tk || !tk.owner;
        return tk?.owner === fil.assignFilter;
      }
      return true;
    });
    if (fil.groupBy === 'severity') {
      const sevOrder = ['Critical', 'High', 'Medium', 'Low'];
      active.forEach(d => {
        const sv = getSev(d);
        if (!g[sv]) g[sv] = [];
        g[sv].push({ ...d, _i: dis.items!.indexOf(d) });
      });
      const s: Record<string, typeof g[string]> = {};
      sevOrder.forEach(k => { if (g[k]) s[k] = g[k]; });
      Object.keys(g).forEach(k => { if (!s[k]) s[k] = g[k]; });
      return s;
    } else {
      active.forEach(d => {
        const r = getRegion(d);
        if (!g[r]) g[r] = [];
        g[r].push({ ...d, _i: dis.items!.indexOf(d) });
      });
      const s: Record<string, typeof g[string]> = {};
      Object.entries(g)
        .sort(([, a], [, b]) => {
          const minA = Math.min(...a.map(x => SO[((x.severity || x.risk_level || 'Medium') as Severity)] || 3));
          const minB = Math.min(...b.map(x => SO[((x.severity || x.risk_level || 'Medium') as Severity)] || 3));
          return minA - minB;
        })
        .forEach(([k, v]) => s[k] = v);
      return s;
    }
  }, [dis.items, fil.groupBy, dis.registry, dis.tickets, fil.assignFilter, fil.sevFilter]);

  const isMobileEmbed = embedded && viewport === 'mobile';

  // In embedded (mobile bottom sheet) mode, render content directly without the outer shell
  if (isMobileEmbed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
        {/* Drawer header */}
        <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #14243e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              {dis.mode === 'disruptions' ? 'Active Disruptions' : dis.mode === 'trade' ? 'Trade & Tariff Brief' : 'Geopolitical Brief'}
              {dis.items && <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 600, color: '#4a6080', background: '#0d1525', border: '1px solid #1e3050', borderRadius: 4, padding: '2px 6px' }}>{dis.items.length}</span>}
            </div>
            {dis.sTime && <div style={{ fontSize: 9, color: '#2a3d5c', fontFamily: FM, marginTop: 4 }}>Scanned {relTime(dis.sTime)}</div>}
          </div>
        </div>

        {/* Group by toggle */}
        {dis.items && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid #14243e' }}>
          <span style={{ ...TYP.label, color: '#2a3d5c', fontFamily: FM }}>Group by</span>
          <div style={{ display: 'flex', background: '#0a1220', borderRadius: 6, border: '1px solid #14243e', overflow: 'hidden' }}>
            <button onClick={() => fil.setGroupBy('severity')} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, fontFamily: FM, border: 'none', cursor: 'pointer', background: fil.groupBy === 'severity' ? '#1e3050' : 'transparent', color: fil.groupBy === 'severity' ? '#e2e8f0' : '#4a6080', transition: 'all .15s', minHeight: 44 }}>Severity</button>
            <button onClick={() => fil.setGroupBy('region')} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, fontFamily: FM, border: 'none', cursor: 'pointer', background: fil.groupBy === 'region' ? '#1e3050' : 'transparent', color: fil.groupBy === 'region' ? '#e2e8f0' : '#4a6080', transition: 'all .15s', minHeight: 44 }}>Region</button>
          </div>
        </div>}

        {/* Grouped items list */}
        {dis.items && <div ref={scrollRef} className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '4px 0', WebkitOverflowScrolling: 'touch' }}>
          <WhatChangedBanner items={dis.items} registry={dis.registry} sTime={dis.sTime} onScrollTo={handleScrollToCard} />
          {Object.entries(grouped).map(([grp, ri_items], ri) => {
            const isSev = fil.groupBy === 'severity';
            const hdrColor = isSev ? (SEV[grp as Severity] || '#64748b') : (RMC[grp] || '#64748b');
            return <div key={grp} style={{ padding: '8px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 0 4px' }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: hdrColor }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: hdrColor, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FM }}>{grp}</span>
                <span style={{ fontFamily: FM, fontSize: 9, color: '#2a3d5c' }}>{ri_items.length}</span>
                <div style={{ flex: 1, height: 1, background: '#14243e' }} />
              </div>
              {ri_items.map((d: ScanItem & { _i: number }, ci: number) => {
                const idx = d._i;
                const is = dis.sel === idx;
                const sv = getSev(d);
                const co = SEV[sv] || '#6b7280';
                const trend = getTrend(d);
                const ta = dis.mode === 'geopolitical' ? (('trend_arrow' in d ? d.trend_arrow : '') as string) : (trend === 'Escalating' ? '\u2197' : trend === 'De-escalating' ? '\u2198' : trend === 'New' ? '\u26A1' : '\u2192');
                const tc = ta === '\u2197' || ta === '\u26A1' ? '#ef4444' : ta === '\u2198' ? '#22c55e' : '#64748b';
                const eid = eventId(d as { event?: string; risk?: string; region?: string });
                const reg = dis.registry[eid] || {};

                return <div key={idx} data-card-idx={idx} className="sc-ce" onClick={() => dis.setSel(is ? null : idx)}
                  style={{ background: is ? '#0d1830' : '#0a1220', border: `1px solid ${is ? co + '44' : '#14243e'}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'all .18s', marginBottom: 6, animationDelay: `${ri * 60 + ci * 40}ms`, minHeight: 44 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <span style={{ fontSize: 12 }}>{CAT[('category' in d ? d.category : '') as string] || '\u26A0\uFE0F'}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.3 }}>{getEvent(d)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {isSev ? <span style={{ background: '#4a608022', color: '#4a6080', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500, fontFamily: FM, border: '1px solid #4a608033' }}>{getRegion(d)}</span>
                          : <span style={{ background: SBG[sv] || '#333', color: co, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FM, border: `1px solid ${co}33` }}>{sv}</span>}
                        <span style={{ background: '#0d1525', color: tc, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, fontFamily: FM, border: `1px solid ${tc}22`, display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 13, lineHeight: 1 }}>{ta}</span>{trend}</span>
                      </div>
                    </div>
                    <span style={{ color: '#2a3d5c', fontSize: 12, transform: is ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>{'\u25BE'}</span>
                  </div>
                  {is && <ExpandedCard d={d} dis={dis} impact={computeImpactWithGraph(d, ROUTES, SUPPLY_GRAPH)} eid={eid} sv={sv as Severity} co={co} reg={reg} copiedId={copiedId} setCopiedId={setCopiedId} />}
                </div>;
              })}
            </div>;
          })}
        </div>}
      </div>
    );
  }

  return (
    <div
      className="sc-right-panel"
      style={{
        width: open ? (viewport === 'tablet' ? 380 : 420) : 32,
        minWidth: open ? (viewport === 'tablet' ? 380 : 420) : 32,
        height: '100%',
        background: '#080e1c',
        borderLeft: '1px solid #14243e',
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 280ms cubic-bezier(.16,1,.3,1), min-width 280ms cubic-bezier(.16,1,.3,1)',
      }}
    >
      {/* Collapse/expand toggle */}
      <div
        onClick={onToggle}
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          width: 32,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 20,
          height: 48,
          borderRadius: '6px 0 0 6px',
          background: '#0a1220',
          border: '1px solid #14243e',
          borderRight: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#4a6080',
          fontSize: 10,
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#c8d6e5'; (e.currentTarget as HTMLElement).style.background = '#0d1525'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4a6080'; (e.currentTarget as HTMLElement).style.background = '#0a1220'; }}
        >
          <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms ease', display: 'inline-block', lineHeight: 1 }}>{'\u25B6'}</span>
        </div>
      </div>

      {/* Collapsed label */}
      {!open && (
        <div style={{
          position: 'absolute',
          top: '50%',
          right: 6,
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center center',
          whiteSpace: 'nowrap',
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: '#2a3d5c',
          fontFamily: FM,
          pointerEvents: 'none',
        }}>
          {dis.mode === 'disruptions' ? 'Disruptions' : dis.mode === 'trade' ? 'Trade Brief' : 'Geopolitical'}
          {dis.items ? ` (${dis.items.length})` : ''}
        </div>
      )}

      {/* Panel content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transition: 'opacity 200ms ease',
        pointerEvents: open ? 'auto' : 'none',
        minWidth: viewport === 'tablet' ? 348 : 388,
      }}>
      {/* Drawer header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid #14243e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div style={{ ...TYP.h2, display: 'flex', alignItems: 'center', gap: 8 }}>
            {dis.mode === 'disruptions' ? 'Active Disruptions' : dis.mode === 'trade' ? 'Trade & Tariff Brief' : 'Geopolitical Brief'}
            {dis.items && <span style={{ fontFamily: FM, ...TYP.monoSm, color: '#4a6080', background: '#0d1525', border: '1px solid #1e3050', borderRadius: 4, padding: '2px 6px' }}>{dis.items.length}</span>}
            {dis.loading && !dis.items && <span className="sc-spin" style={{ width: 12, height: 12, border: '2px solid #2563eb33', borderTop: '2px solid #2563eb', borderRadius: '50%', display: 'inline-block' }} />}
          </div>
          {dis.sTime && <div style={{ ...TYP.caption, fontFamily: FM, marginTop: 4 }}>Scanned {relTime(dis.sTime)} {'\u00b7'} {dis.sTime.toLocaleTimeString()} {'\u00b7'} {dis.sTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
          {cc > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: '#7f1d1d44', border: '1px solid #ef444433', borderRadius: 4, padding: '2px 8px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
            <span style={{ fontSize: 9, color: '#fca5a5', fontWeight: 600, fontFamily: FM }}>{cc} CRITICAL</span>
          </div>}
        </div>
      </div>

      {dis.error && <div style={{ margin: '12px 16px', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 8, padding: 12, fontSize: 11 }}>
        <strong style={{ color: '#ef4444' }}>Error: </strong><span style={{ color: '#fca5a5' }}>{dis.error}</span>
        <button onClick={() => dis.scan(dis.mode!)} style={{ display: 'block', marginTop: 8, padding: '5px 10px', border: '1px solid #ef444444', borderRadius: 6, background: '#ef444418', color: '#fca5a5', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FM }}>Retry {dis.mode}</button>
      </div>}

      {/* Group by toggle */}
      {dis.items && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid #14243e' }}>
        <span style={{ ...TYP.label, color: '#2a3d5c', fontFamily: FM }}>Group by</span>
        <div style={{ display: 'flex', background: '#0a1220', borderRadius: 6, border: '1px solid #14243e', overflow: 'hidden' }}>
          <button onClick={() => fil.setGroupBy('severity')} style={{ padding: '3px 8px', fontSize: 9, fontWeight: 600, fontFamily: FM, border: 'none', cursor: 'pointer', background: fil.groupBy === 'severity' ? '#1e3050' : 'transparent', color: fil.groupBy === 'severity' ? '#e2e8f0' : '#4a6080', transition: 'all .15s' }}>Severity</button>
          <button onClick={() => fil.setGroupBy('region')} style={{ padding: '3px 8px', fontSize: 9, fontWeight: 600, fontFamily: FM, border: 'none', cursor: 'pointer', background: fil.groupBy === 'region' ? '#1e3050' : 'transparent', color: fil.groupBy === 'region' ? '#e2e8f0' : '#4a6080', transition: 'all .15s' }}>Region</button>
        </div>
      </div>}

      {/* Assignee filter */}
      {dis.items && <div style={{ padding: '6px 16px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #14243e' }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>FILTER</span>
        <button onClick={() => fil.setAssignFilter(null)} style={{ background: !fil.assignFilter ? '#1e3a5c' : 'transparent', color: !fil.assignFilter ? '#60a5fa' : '#2a3d5c', border: `1px solid ${!fil.assignFilter ? '#2563eb44' : '#14243e'}`, borderRadius: 4, padding: '3px 8px', fontSize: 9, cursor: 'pointer', fontWeight: !fil.assignFilter ? 600 : 400 }}>All</button>
        <button onClick={() => fil.setAssignFilter('jh')} style={{ background: fil.assignFilter === 'jh' ? '#1e3a5c' : 'transparent', color: fil.assignFilter === 'jh' ? '#60a5fa' : '#2a3d5c', border: `1px solid ${fil.assignFilter === 'jh' ? '#2563eb44' : '#14243e'}`, borderRadius: 4, padding: '3px 8px', fontSize: 9, cursor: 'pointer', fontWeight: fil.assignFilter === 'jh' ? 600 : 400 }}>My items</button>
        <button onClick={() => fil.setAssignFilter('unassigned')} style={{ background: fil.assignFilter === 'unassigned' ? '#1e3a5c' : 'transparent', color: fil.assignFilter === 'unassigned' ? '#eab308' : '#2a3d5c', border: `1px solid ${fil.assignFilter === 'unassigned' ? '#eab30844' : '#14243e'}`, borderRadius: 4, padding: '3px 8px', fontSize: 9, cursor: 'pointer', fontWeight: fil.assignFilter === 'unassigned' ? 600 : 400 }}>Unassigned</button>
        {TEAM.filter(t => t.id !== 'jh').slice(0, 4).map(t => <button key={t.id} onClick={() => fil.setAssignFilter(fil.assignFilter === t.id ? null : t.id)} style={{ background: fil.assignFilter === t.id ? t.color + '22' : 'transparent', color: fil.assignFilter === t.id ? t.color : '#2a3d5c', border: `1px solid ${fil.assignFilter === t.id ? t.color + '44' : '#14243e'}`, borderRadius: 4, padding: '3px 8px', fontSize: 9, cursor: 'pointer' }}>{t.initials}</button>)}
      </div>}

      {/* Loading skeleton cards */}
      {dis.loading && !dis.items && <div style={{ flex: 1, overflow: 'hidden', padding: '12px 18px' }}>
        {[80, 65, 50, 40, 30].map((w, i) => (
          <div key={i} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid #14243e', padding: '12px 14px', background: '#0a1220', animationDelay: `${i * 100}ms` }} className="sc-ce">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div className="sc-skel" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
              <div className="sc-skel" style={{ width: `${w}%`, height: 12 }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div className="sc-skel" style={{ width: 50, height: 16, borderRadius: 4 }} />
              <div className="sc-skel" style={{ width: 65, height: 16, borderRadius: 4 }} />
              <div className="sc-skel" style={{ width: 45, height: 16, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>}

      {/* Grouped items list */}
      {dis.items && <div ref={scrollRef} className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <WhatChangedBanner
          items={dis.items}
          registry={dis.registry}
          sTime={dis.sTime}
          onScrollTo={handleScrollToCard}
        />
        {Object.entries(grouped).map(([grp, ri_items], ri) => {
          const isSev = fil.groupBy === 'severity';
          const hdrColor = isSev ? (SEV[grp as Severity] || '#64748b') : (RMC[grp] || '#64748b');
          return <div key={grp} style={{ padding: '8px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 0 4px' }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: hdrColor }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: hdrColor, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FM }}>{grp}</span>
              <span style={{ fontFamily: FM, fontSize: 9, color: '#2a3d5c' }}>{ri_items.length}</span>
              <div style={{ flex: 1, height: 1, background: '#14243e' }} />
              {!isSev && <span style={{ fontFamily: FM, fontSize: 8, color: '#1e3050', background: '#0a1220', border: '1px solid #14243e', borderRadius: 3, padding: '1px 5px' }}>{rsc[grp] || 0} sites</span>}
            </div>

            {ri_items.map((d: ScanItem & { _i: number }, ci: number) => {
              const idx = d._i;
              const is = dis.sel === idx;
              const sv = getSev(d);
              const co = SEV[sv] || '#6b7280';
              const ig = dis.mode === 'geopolitical';
              const it = dis.mode === 'trade';
              const trend = getTrend(d);
              const ta = ig ? (('trend_arrow' in d ? d.trend_arrow : '') as string) : (trend === 'Escalating' ? '\u2197' : trend === 'De-escalating' ? '\u2198' : trend === 'New' ? '\u26A1' : '\u2192');
              const tc = ta === '\u2197' || ta === '\u26A1' ? '#ef4444' : ta === '\u2198' ? '#22c55e' : '#64748b';
              const ie = ta === '\u2197' || trend === 'Escalating';
              const fCol = it && 'friction_level' in d ? FRIC[(d as { friction_level: FrictionLevel }).friction_level] || '#64748b' : null;
              const eid = eventId(d as { event?: string; risk?: string; region?: string });
              const reg = dis.registry[eid] || {};
              const tk = dis.tickets[eid] || {};
              const cardOwner = tk.owner ? TEAM_MAP[tk.owner] : null;
              const tSt = tk.ticketStatus || 'open';
              const tSc = STATUS_CFG[tSt as keyof typeof STATUS_CFG];

              return <div key={idx} data-card-idx={idx} className="sc-ce" onClick={() => dis.setSel(is ? null : idx)}
                style={{ background: reg._reEmerged ? '#1a0808' : is ? '#0d1830' : '#0a1220', border: `1px solid ${reg._reEmerged ? '#ef444444' : is ? co + '44' : '#14243e'}`, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'all .18s', marginBottom: 6, animationDelay: `${ri * 60 + ci * 40}ms`, boxShadow: is ? `0 0 20px ${co}11` : '' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <span style={{ fontSize: TYP.h4.fontSize }}>{CAT[('category' in d ? d.category : '') as string] || '\u26A0\uFE0F'}</span>
                      <span style={{ ...TYP.h4 }}>{getEvent(d)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {isSev ? <span style={{ background: '#4a608022', color: '#4a6080', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500, fontFamily: FM, border: '1px solid #4a608033' }}>{getRegion(d)}</span>
                        : <span style={{ background: SBG[sv] || '#333', color: co, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FM, border: `1px solid ${co}33` }}>{sv}</span>}
                      <span className={ie ? 'sc-sh' : ''} style={{ background: ie ? '#7f1d1d44' : '#0d1525', color: tc, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, fontFamily: FM, border: `1px solid ${tc}22`, display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 13, lineHeight: 1 }}>{ta}</span>{trend}</span>
                      {it && 'corridor' in d && <span style={{ background: '#94a3b822', color: '#94a3b8', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, fontFamily: FM, border: '1px solid #94a3b833' }}>{(d as { corridor: string }).corridor}</span>}
                      {fCol && <span style={{ background: fCol + '22', color: fCol, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: FM, border: `1px solid ${fCol}33` }}>{('friction_level' in d ? d.friction_level : '') as string}</span>}
                      {reg._new && <span style={{ background: '#2563eb33', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 700, fontFamily: FM }}>NEW</span>}
                      {reg._reEmerged && <span style={{ background: '#ef444433', color: '#fca5a5', padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 700, fontFamily: FM }}>{'\u26A0'} Re-emerged (was {reg._reEmergedFrom})</span>}
                      {reg.status === 'watching' && <span style={{ background: '#2563eb22', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, fontFamily: FM }}>{'\ud83d\udd0d'} Watching</span>}
                      {reg.scanCount > 1 && !reg._new && <span style={{ fontFamily: FM, fontSize: 8, color: '#2a3d5c' }}>Scan #{reg.scanCount}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {tk.is_overdue && <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: FM, letterSpacing: 0.5, border: '1px solid #ef444466', lineHeight: '14px' }}>OVERDUE</span>}
                    {tk.due_date && !tk.is_overdue && tSt !== 'done' && <span style={{ fontSize: 7, color: '#4a6080', fontFamily: FM }} title={'Due: ' + new Date(tk.due_date).toLocaleString()}>{'\u23F0'}</span>}
                    {cardOwner && <div style={{ width: 18, height: 18, borderRadius: 9, background: cardOwner.color + '33', border: `1px solid ${cardOwner.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: cardOwner.color }} title={cardOwner.name}>{cardOwner.initials}</div>}
                    {tSt !== 'open' && <span style={{ fontSize: 9, color: tSc.color }} title={tSc.label}>{tSc.icon}</span>}
                    <span style={{ color: '#2a3d5c', fontSize: 12, transform: is ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>{'\u25BE'}</span>
                  </div>
                </div>

                {/* Expanded card content */}
                {is && <ExpandedCard d={d} dis={dis} impact={impact} eid={eid} sv={sv} co={co} reg={reg} copiedId={copiedId} setCopiedId={setCopiedId} />}
              </div>;
            })}
          </div>;
        })}

        <div style={{ padding: '12px 16px 20px', fontSize: 8, color: '#14243e', fontStyle: 'italic', borderTop: '1px solid #0d1525', margin: '8px 16px 0' }}>
          Prototype — assessments based on AI training knowledge, not live web data. Live scanning enabled on AWS deployment.
        </div>
      </div>}
      </div>
    </div>
  );
}
