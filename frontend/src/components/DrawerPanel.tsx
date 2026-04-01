import { useState, useEffect, useMemo, useRef } from 'react';
import type { ScanItem, Severity, FrictionLevel, ImpactResult, SupplierAlternativesResponse } from '../types';
import { fetchSupplierAlternatives, assignTicket, updateTicketStatus } from '../services/api';
import {
  SEV, SBG, SO, CAT, RMC, FRIC, FM, F,
  STATUS_CFG, TEAM, TEAM_MAP,
  SITES, SUPPLIERS, ROUTES, SUPPLY_GRAPH,
} from '../data';
import { relTime, eventId } from '../utils/format';
import { computeImpactWithGraph } from '../utils/impact';
import { getSev, getEvent, getRegion, getTrend } from '../utils/scan';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

interface DrawerPanelProps {
  dis: DisruptionState;
  fil: FilterState;
}

export function DrawerPanel({ dis, fil }: DrawerPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Computed values
  const cc = dis.items ? dis.items.filter(d => getSev(d) === 'Critical').length : 0;

  const rsc = useMemo(() => {
    const m: Record<string, string> = { 'Europe': 'EU', 'Middle East': 'MEA', 'China': 'APAC', 'India': 'APAC', 'Americas': 'AM', 'Africa': 'AF' };
    const o: Record<string, number> = {};
    if (!dis.items) return o;
    const regions = new Set(dis.items.map(d => getRegion(d)));
    regions.forEach(r => {
      if (r === 'Global') {
        // "Global" explicitly means all regions
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

  const execBrief = useMemo(() => {
    if (!dis.items?.length) return null;
    const sevCounts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const regions: Record<string, number> = {};
    const actions: string[] = [];
    const escalating: string[] = [];
    dis.items.forEach(d => {
      const sv = ('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : undefined)) as string | undefined;
      if (sv) sevCounts[sv] = (sevCounts[sv] || 0) + 1;
      const r = getRegion(d);
      regions[r] = (regions[r] || 0) + 1;
      const act = ('recommended_action' in d ? d.recommended_action : ('watchpoint' in d ? d.watchpoint : '')) as string;
      if (act) actions.push(act);
      if (getTrend(d) === 'Escalating') escalating.push(getEvent(d));
    });
    const topRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
    const totalSites = topRegion ? rsc[topRegion[0]] || 0 : 0;
    return { sevCounts, regions, topRegion, totalSites, escalating, actions: actions.slice(0, 3), total: dis.items.length };
  }, [dis.items, rsc]);

  if (!dis.dOpen || (!dis.items && !dis.error && !dis.loading)) return null;

  return (
    <div className={dis.dClosing ? 'sc-dout' : 'sc-din'} style={{ position: 'absolute', top: 0, right: 0, width: 460, height: '100%', background: '#080e1cf8', borderLeft: '1px solid #14243e', boxShadow: '-20px 0 60px rgba(0,0,0,.5)', backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
      {/* Drawer header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid #14243e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            {dis.mode === 'disruptions' ? 'Active Disruptions' : dis.mode === 'trade' ? 'Trade & Tariff Brief' : 'Geopolitical Brief'}
            {dis.items && <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 600, color: '#4a6080', background: '#0d1525', border: '1px solid #1e3050', borderRadius: 4, padding: '2px 6px' }}>{dis.items.length}</span>}
            {dis.loading && !dis.items && <span className="sc-spin" style={{ width: 12, height: 12, border: '2px solid #2563eb33', borderTop: '2px solid #2563eb', borderRadius: '50%', display: 'inline-block' }} />}
          </div>
          {dis.sTime && <div style={{ fontSize: 9, color: '#2a3d5c', fontFamily: FM, marginTop: 4 }}>Scanned {relTime(dis.sTime)} · {dis.sTime.toLocaleTimeString()} · {dis.sTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
          {cc > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: '#7f1d1d44', border: '1px solid #ef444433', borderRadius: 4, padding: '2px 8px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
            <span style={{ fontSize: 9, color: '#fca5a5', fontWeight: 600, fontFamily: FM }}>{cc} CRITICAL</span>
          </div>}
        </div>
        <button onClick={dis.closeD} style={{ background: '#0d1525', border: '1px solid #1e3050', borderRadius: 6, color: '#4a6080', padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontFamily: FM, fontWeight: 600 }}>{'\u2715'} ESC</button>
      </div>

      {dis.error && <div style={{ margin: '12px 16px', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 8, padding: 12, fontSize: 11 }}>
        <strong style={{ color: '#ef4444' }}>Error: </strong><span style={{ color: '#fca5a5' }}>{dis.error}</span>
        <button onClick={() => dis.scan(dis.mode!)} style={{ display: 'block', marginTop: 8, padding: '5px 10px', border: '1px solid #ef444444', borderRadius: 6, background: '#ef444418', color: '#fca5a5', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FM }}>Retry {dis.mode}</button>
      </div>}

      {/* Executive brief — structured talking points */}
      {execBrief && (() => {
        const modeLabel = dis.mode === 'trade' ? 'trade policy events' : dis.mode === 'geopolitical' ? 'geopolitical risks' : 'disruptions';
        const worstSev = execBrief.sevCounts.Critical > 0 ? 'Critical' : execBrief.sevCounts.High > 0 ? 'High' : execBrief.sevCounts.Medium > 0 ? 'Medium' : 'Low';
        const worstColor = SEV[worstSev as Severity];
        const headlineLine = `${execBrief.total} active ${modeLabel}, ${execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical + ' critical' : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High + ' high severity' : 'none critical'}`;
        const exposureLine = execBrief.topRegion ? `Highest exposure: ${execBrief.topRegion[0]} \u2014 ${execBrief.topRegion[1]} events, ${execBrief.totalSites} sites at risk` : '';
        const escalatingLine = execBrief.escalating.length > 0 ? `${execBrief.escalating.length} escalating: ${execBrief.escalating.join(', ')}` : '';
        const actionLine = execBrief.actions.length > 0 ? `Priority action: ${execBrief.actions[0]}` : '';
        const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const fullBriefText = [
          `SC Hub Disruption Monitor \u2014 ${dateStr}`,
          `\u2022 ${headlineLine}`,
          exposureLine ? `\u2022 ${exposureLine}` : '',
          escalatingLine ? `\u2022 ${escalatingLine}` : '',
          actionLine ? `\u2022 ${actionLine}` : '',
        ].filter(Boolean).join('\n');

        const copyLine = (text: string) => {
          navigator.clipboard.writeText(text);
          setCopiedId('brief-' + text.slice(0, 20));
          setTimeout(() => setCopiedId(null), 1500);
        };

        const bullets: { text: string; borderColor: string; label: string }[] = [
          { text: headlineLine, borderColor: worstColor, label: 'HEADLINE' },
        ];
        if (exposureLine) bullets.push({ text: exposureLine, borderColor: '#3b82f6', label: 'EXPOSURE' });
        if (escalatingLine) bullets.push({ text: escalatingLine, borderColor: '#ef4444', label: 'ESCALATING' });
        if (actionLine) bullets.push({ text: actionLine, borderColor: '#22c55e', label: 'ACTION' });

        return (
          <div style={{ margin: '12px 16px', background: '#060a12', border: '1px solid #14243e', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FM }}>Talking Points</span>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(fullBriefText); setCopiedId('brief-all'); setTimeout(() => setCopiedId(null), 1500); }}
                style={{ background: '#0a1220', border: '1px solid #14243e', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, fontFamily: FM, color: copiedId === 'brief-all' ? '#22c55e' : '#64748b', cursor: 'pointer', transition: 'color .15s' }}
              >
                {copiedId === 'brief-all' ? 'Copied' : 'Copy Brief'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 2, marginBottom: 12, height: 4, borderRadius: 2, overflow: 'hidden' }}>
              {execBrief.sevCounts.Critical > 0 && <div style={{ flex: execBrief.sevCounts.Critical, background: SEV.Critical, borderRadius: 2 }} />}
              {execBrief.sevCounts.High > 0 && <div style={{ flex: execBrief.sevCounts.High, background: SEV.High, borderRadius: 2 }} />}
              {execBrief.sevCounts.Medium > 0 && <div style={{ flex: execBrief.sevCounts.Medium, background: SEV.Medium, borderRadius: 2 }} />}
              {execBrief.sevCounts.Low > 0 && <div style={{ flex: execBrief.sevCounts.Low, background: SEV.Low, borderRadius: 2 }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bullets.map((b, i) => {
                const isCopied = copiedId === 'brief-' + b.text.slice(0, 20);
                return (
                  <div
                    key={i}
                    onClick={() => copyLine(b.text)}
                    title="Click to copy"
                    style={{ borderLeft: `3px solid ${b.borderColor}`, paddingLeft: 10, paddingTop: 4, paddingBottom: 4, cursor: 'pointer', borderRadius: 2, transition: 'background .15s', background: isCopied ? `${b.borderColor}0d` : 'transparent' }}
                  >
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: `${b.borderColor}88`, fontFamily: FM, marginBottom: 2 }}>{b.label}</div>
                    <div style={{ fontSize: i === 0 ? 13 : 11, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? worstColor : '#c8d6e5', lineHeight: 1.5 }}>
                      {i === 0
                        ? <><span style={{ fontFamily: FM, fontWeight: 700 }}>{execBrief.total}</span>{' active ' + modeLabel + ', '}<span style={{ fontFamily: FM, fontWeight: 700, color: worstColor }}>{execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High : 0}</span>{execBrief.sevCounts.Critical > 0 ? ' critical' : execBrief.sevCounts.High > 0 ? ' high severity' : ' — none critical'}</>
                        : b.text}
                    </div>
                    {isCopied && <div style={{ fontSize: 8, color: '#22c55e', fontFamily: FM, marginTop: 2 }}>Copied</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Group by toggle */}
      {dis.items && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid #14243e' }}>
        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Group by</span>
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
      {dis.items && <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
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
                      <span style={{ fontSize: 12 }}>{CAT[('category' in d ? d.category : '') as string] || '\u26A0\uFE0F'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.3 }}>{getEvent(d)}</span>
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
  );
}

// Expanded card content — extracted to reduce nesting depth
function ExpandedCard({ d, dis, impact, eid, sv, co, reg, copiedId, setCopiedId }: {
  d: ScanItem & { _i: number };
  dis: DisruptionState;
  impact: ImpactResult | null;
  eid: string;
  sv: Severity;
  co: string;
  reg: Record<string, unknown>;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
}) {
  const ig = dis.mode === 'geopolitical';
  const it = dis.mode === 'trade';
  const priorityColors = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6'];
  const urgencyColors: Record<string, string> = { immediate: '#ef4444', '24h': '#f59e0b', '48h': '#f59e0b', '1w': '#3b82f6', '1m': '#22c55e', '3m': '#8b5cf6', ongoing: '#64748b', contingent: '#94a3b8' };
  const backendId = (d as unknown as Record<string, unknown>).id as string | undefined;
  const recId = backendId || eid;
  const rec = dis.recs[recId];

  // Supplier alternatives — cached per country
  const country = ('region' in d ? d.region : 'Global') as string;
  const [altCache, setAltCache] = useState<Record<string, SupplierAlternativesResponse>>({});
  const [altLoading, setAltLoading] = useState(false);
  const altFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!country || country === 'Global' || altCache[country] || altFetchedRef.current === country) return;
    altFetchedRef.current = country;
    setAltLoading(true);
    fetchSupplierAlternatives(country).then(res => {
      if (res) setAltCache(prev => ({ ...prev, [country]: res }));
      setAltLoading(false);
    });
  }, [country, altCache]);

  const altData = altCache[country] || null;

  return (
    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
      {/* Duplicate warning banner */}
      {('possible_duplicate_of' in d) && (d as unknown as Record<string, unknown>).possible_duplicate_of && <div style={{
        background: '#78350f18', border: '1px solid #92400e44', borderRadius: 6,
        padding: '5px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 10, opacity: .7 }}>{'\u26A0'}</span>
        <span style={{ fontSize: 10, color: '#d97706', fontFamily: FM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>Possible duplicate of: <span style={{ fontWeight: 600, color: '#fbbf24' }}>{String((d as unknown as Record<string, unknown>).possible_duplicate_of)}</span></span>
      </div>}

      {/* Computed severity score badge */}
      {('computed_severity' in d) && (d as unknown as Record<string, unknown>).computed_severity && (() => {
        const cs = (d as unknown as Record<string, unknown>).computed_severity as { score: number; label: string; components: Record<string, number> };
        const scoreColor = cs.score >= 75 ? '#ef4444' : cs.score >= 50 ? '#f97316' : cs.score >= 25 ? '#eab308' : '#22c55e';
        return <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          background: '#060a12', borderRadius: 6, padding: '6px 10px', border: '1px solid #14243e',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM, whiteSpace: 'nowrap' }}>AI: {sv}</span>
            <span style={{ color: '#1e3050', fontSize: 10 }}>{'\u007C'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: scoreColor, fontFamily: FM, whiteSpace: 'nowrap' }}>Algorithm: {Math.round(cs.score)}/100</span>
          </div>
          <div style={{ width: 80, height: 6, background: '#0d1525', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${Math.min(100, cs.score)}%`, height: '100%', background: scoreColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>;
      })()}

      {/* Impact Summary Strip */}
      {(() => {
        const hasBackendImpact = rec?.impact;
        const mfgCount = hasBackendImpact ? rec.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length : (impact ? impact.factories.length : 0);
        const supCount = hasBackendImpact ? rec.impact.affected_suppliers.count : (impact ? SUPPLIERS.filter(s => impact.suppliers.includes(s.country)).reduce((sum, s) => sum + s.n, 0) : 0);
        const estUnits = hasBackendImpact ? `${Math.round(rec.impact.estimated_units_per_week / 1000)}K` : (mfgCount > 0 ? `${Math.round(mfgCount * 4.2)}K` : '0');
        if (!impact && !hasBackendImpact) return null;
        const metrics = [
          { label: 'MFG Sites', value: mfgCount, icon: '\ud83c\udfed' },
          { label: 'Suppliers', value: supCount, icon: '\ud83d\udce6' },
          { label: 'units/wk est.', value: estUnits, icon: '\u26a0\ufe0f' },
          ...(hasBackendImpact ? [
            { label: 'Recovery (w/ mitigation)', value: `${rec.impact.recovery_weeks_with_mitigation}w`, icon: '\u2705' },
            { label: 'Recovery (w/o)', value: `${rec.impact.recovery_weeks_without}w`, icon: '\u26d4' },
          ] : []),
        ];
        return <div style={{ display: 'flex', gap: 1, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: `1px solid ${co}22` }}>
          {metrics.map((m, mi) => (
            <div key={mi} style={{
              flex: 1, background: `${co}0d`,
              padding: '8px 6px', textAlign: 'center',
              borderRight: mi < metrics.length - 1 ? `1px solid ${co}22` : 'none',
            }}>
              <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color: co, lineHeight: 1.2 }}>
                {m.icon} {m.value}
              </div>
              <div style={{ fontFamily: F, fontSize: 8, color: '#4a6080', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2, fontWeight: 600 }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>;
      })()}

      {!ig && 'description' in d && <p style={{ color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.5 }}>{d.description as string}</p>}
      {ig && 'this_week' in d && <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}><span style={{ fontSize: 10 }}>{'\ud83d\udcc5'}</span><span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>This Week</span></div>
        <div style={{ color: '#c8d6e5', fontSize: 11 }}>{(d as { this_week: string }).this_week}</div>
      </div>}

      {/* SKF Exposure / Relevance */}
      {(() => {
        const aiSrc = it ? ('skf_cost_impact' in d ? d.skf_cost_impact : '') as string : ig ? ('skf_relevance' in d ? d.skf_relevance : '') as string : ('skf_exposure' in d ? d.skf_exposure : '') as string;
        const label = it ? 'SKF Cost Impact' : ig ? 'SKF Relevance' : 'SKF Exposure';
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 10 }}>{it ? '\ud83d\udcb0' : '\ud83c\udfed'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>{label}</span>
            <span style={{ fontSize: 8, color: '#2a3d5c', fontStyle: 'italic', marginLeft: 'auto' }}>AI-generated</span>
          </div>
          <div style={{ color: '#c8d6e5', fontSize: 11, lineHeight: 1.5 }}>{aiSrc}</div>
        </div>;
      })()}

      {/* Recommended Actions / Watchpoint */}
      {(() => {
        const label = ig ? 'Watchpoint' : 'Recommended Actions';
        if (rec?.actions?.length) {
          return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <span style={{ fontSize: 10 }}>{'\u26A1'}</span>
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>{label}</span>
              <span style={{ fontSize: 7, color: '#22c55e', marginLeft: 'auto', fontFamily: FM }}>Backend</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rec.actions.map((act: { priority: number; action: string; owner: string; urgency: string }, si: number) => (
                <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <div style={{
                    minWidth: 18, height: 18, borderRadius: 9,
                    background: (priorityColors[si] || '#64748b') + '22',
                    border: `1px solid ${priorityColors[si] || '#64748b'}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, fontFamily: FM,
                    color: priorityColors[si] || '#64748b', flexShrink: 0, marginTop: 1,
                  }}>
                    {act.priority}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#c8d6e5', fontSize: 11, lineHeight: 1.5 }}>{act.action}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 8, fontFamily: FM, color: '#4a6080', background: '#0d1525', padding: '1px 5px', borderRadius: 3 }}>{act.owner}</span>
                      <span style={{ fontSize: 8, fontFamily: FM, color: urgencyColors[act.urgency] || '#64748b', background: (urgencyColors[act.urgency] || '#64748b') + '22', padding: '1px 5px', borderRadius: 3, border: `1px solid ${urgencyColors[act.urgency] || '#64748b'}22` }}>{act.urgency}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>;
        }
        const rawSrc = ig ? ('watchpoint' in d ? d.watchpoint : '') as string : ('recommended_action' in d ? d.recommended_action : '') as string;
        const steps = rawSrc
          ? rawSrc.split(/;\s*|(?<=\.)\s+(?=[A-Z])|\d+\.\s*/)
              .map(s => s.trim().replace(/\.$/, ''))
              .filter(s => s.length > 5)
          : [];
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 10 }}>{'\u26A1'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>{label}</span>
          </div>
          {steps.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {steps.map((step, si) => (
                <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <div style={{
                    minWidth: 18, height: 18, borderRadius: 9,
                    background: (priorityColors[si] || '#64748b') + '22',
                    border: `1px solid ${priorityColors[si] || '#64748b'}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, fontFamily: FM,
                    color: priorityColors[si] || '#64748b', flexShrink: 0, marginTop: 1,
                  }}>
                    {si + 1}
                  </div>
                  <div style={{ color: '#c8d6e5', fontSize: 11, lineHeight: 1.5 }}>{step}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#c8d6e5', fontSize: 11, lineHeight: 1.5 }}>{rawSrc}</div>
          )}
        </div>;
      })()}

      {/* Impact Chain Visualization */}
      {(() => {
        if (!impact || (!impact.corridors.length && !impact.factories.length && !impact.suppliers.length)) return null;
        const region = ('region' in d ? d.region : 'Global') as string;
        const chainSteps = [
          { label: 'Disruption Region', items: [region], color: '#ef4444', icon: '\ud83c\udf0d' },
          { label: 'Affected Corridors', items: impact.corridors, color: '#f59e0b', icon: '\ud83d\udea2' },
          { label: 'Exposed Factories', items: impact.factories, color: '#3b82f6', icon: '\ud83c\udfed' },
          { label: 'Upstream Suppliers', items: impact.suppliers.slice(0, 6), color: '#8b5cf6', icon: '\ud83d\udce6' },
        ].filter(s => s.items.length > 0);
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <span style={{ fontSize: 10 }}>{'\ud83d\udd17'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Impact Chain</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {chainSteps.map((step, si) => (
              <div key={si}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 10,
                      background: step.color + '22', border: `1.5px solid ${step.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, lineHeight: 1,
                    }}>
                      {step.icon}
                    </div>
                    {si < chainSteps.length - 1 && <div style={{ width: 1.5, height: 16, background: step.color, opacity: 0.4, marginTop: 2, marginBottom: 2 }} />}
                  </div>
                  <div style={{ flex: 1, paddingTop: 1 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: step.color, fontFamily: FM, marginBottom: 2 }}>
                      {step.label}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: si < chainSteps.length - 1 ? 4 : 0 }}>
                      {step.items.map((item, ii) => (
                        <span key={ii} style={{
                          background: step.color + '22', color: step.color,
                          padding: '1px 6px', borderRadius: 3, fontSize: 9,
                          fontFamily: FM, fontWeight: 500, border: `1px solid ${step.color}22`,
                        }}>
                          {item}
                        </span>
                      ))}
                      {step.label === 'Upstream Suppliers' && impact.suppliers.length > 6 && (
                        <span style={{ color: '#4a6080', fontSize: 9, fontFamily: FM, padding: '1px 4px' }}>
                          +{impact.suppliers.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>;
      })()}

      {/* Supplier Alternatives (Backup Regions) */}
      {(altLoading || altData) && <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: altData ? 8 : 0 }}>
          <span style={{ fontSize: 10 }}>{'\u26A1'}</span>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Backup Regions</span>
          {altData && <span style={{ fontSize: 8, fontFamily: FM, color: '#1e3050', marginLeft: 'auto' }}>{altData.alternatives.length} options</span>}
        </div>
        {altLoading && !altData && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {[0, 1, 2].map(i => <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />)}
        </div>}
        {altData && <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {altData.alternatives.slice(0, 5).map((alt, ai) => {
            const overlapColor = alt.overlap_pct >= 70 ? '#22c55e' : alt.overlap_pct >= 40 ? '#f59e0b' : '#ef4444';
            return <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#c8d6e5', minWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.country}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: FM, fontSize: 10, color: '#94a3b8' }}>{alt.supplier_count} suppliers</span>
                  <span style={{ fontFamily: FM, fontSize: 9, color: overlapColor, fontWeight: 600 }}>{Math.round(alt.overlap_pct)}%</span>
                </div>
                <div style={{ height: 3, background: '#0d1525', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, alt.overlap_pct)}%`, height: '100%', background: overlapColor, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            </div>;
          })}
        </div>}
        {altData && <div style={{ fontSize: 9, color: '#1e3050', fontStyle: 'italic', marginTop: 6 }}>
          Regional alternatives based on supplier density and category overlap
        </div>}
      </div>}

      {/* Confidence & Sources */}
      {(() => {
        if (!rec || (!rec.confidence && !rec.sources?.length)) return null;
        const confPct = Math.round((rec.confidence || 0) * 100);
        const confColor = confPct >= 90 ? '#22c55e' : confPct >= 70 ? '#f59e0b' : '#ef4444';
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 10 }}>{'\ud83c\udfaf'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Confidence & Sources</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: rec.sources?.length ? 6 : 0 }}>
            <div style={{ flex: 1, height: 4, background: '#0d1525', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${confPct}%`, height: '100%', background: confColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: FM, fontWeight: 700, color: confColor }}>{confPct}%</span>
          </div>
          {rec.sources?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {rec.sources.map((src: string, si: number) => (
              <span key={si} style={{ fontSize: 8, fontFamily: FM, color: '#64748b', background: '#0d1525', padding: '2px 6px', borderRadius: 3, border: '1px solid #14243e' }}>{src}</span>
            ))}
          </div>}
        </div>;
      })()}

      {/* Narrative Briefing */}
      {(() => {
        const narrative = dis.narratives[recId];
        const isLoading = dis.narrativeLoading === recId;
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: '1px solid #14243e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: narrative ? 8 : 0 }}>
            <span style={{ fontSize: 10 }}>{'\ud83d\udcdd'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Executive Briefing</span>
            <div style={{ flex: 1 }} />
            {!narrative && !isLoading && backendId && <button
              onClick={(e) => { e.stopPropagation(); dis.loadNarrative(recId); }}
              style={{
                background: '#1e3a5c', color: '#60a5fa', border: '1px solid #2563eb44',
                borderRadius: 4, padding: '3px 8px', fontSize: 9, fontWeight: 600,
                cursor: 'pointer', fontFamily: FM, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {'\u2728'} Generate Briefing
            </button>}
            {narrative && <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(narrative.narrative).then(() => {
                  setCopiedId(recId);
                  setTimeout(() => { if (copiedId === recId) setCopiedId(null); }, 1500);
                }).catch(() => { /* clipboard access denied or unavailable */ });
              }}
              style={{
                background: copiedId === recId ? '#16533022' : '#1e3a5c', color: copiedId === recId ? '#22c55e' : '#60a5fa',
                border: `1px solid ${copiedId === recId ? '#22c55e44' : '#2563eb44'}`,
                borderRadius: 4, padding: '3px 8px', fontSize: 9, fontWeight: 600,
                cursor: 'pointer', fontFamily: FM,
              }}
            >
              {copiedId === recId ? 'Copied!' : 'Copy'}
            </button>}
            {isLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#4a6080', fontFamily: FM }}>
              <span className="sc-spin" style={{ width: 10, height: 10, border: '2px solid #2563eb33', borderTop: '2px solid #2563eb', borderRadius: '50%', display: 'inline-block' }} />
              Generating...
            </div>}
          </div>
          {narrative && <div className="sc-narr-in" style={{ fontSize: 11, lineHeight: 1.6 }}>
            {narrative.narrative.split(/\n/).map((line, li) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              const headerMatch = trimmed.match(/^(SITUATION|EXPOSURE|RECOMMENDED ACTIONS|OUTLOOK|IMPACT|RISK|TIMELINE|RECOVERY|ACTIONS?):?\s*$/i);
              if (headerMatch) {
                const hc: Record<string, string> = { SITUATION: '#ef4444', EXPOSURE: '#f59e0b', 'RECOMMENDED ACTIONS': '#22c55e', ACTIONS: '#22c55e', OUTLOOK: '#3b82f6', IMPACT: '#f59e0b', RISK: '#ef4444', TIMELINE: '#3b82f6', RECOVERY: '#22c55e' };
                return <div key={li} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: hc[headerMatch[1].toUpperCase()] || '#94a3b8', fontFamily: FM, marginTop: li > 0 ? 10 : 0, marginBottom: 4 }}>{headerMatch[1]}</div>;
              }
              if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                const text = trimmed.replace(/^[•\-*]\s*/, '');
                const parts = text.split(/(\*\*[^*]+\*\*)/g);
                return <div key={li} style={{ display: 'flex', gap: 6, marginBottom: 3, color: '#c8d6e5' }}>
                  <span style={{ color: '#2a3d5c', flexShrink: 0, fontSize: 8, marginTop: 2 }}>{'•'}</span>
                  <span>{parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}</span>
                </div>;
              }
              const parts = trimmed.replace(/^\*\*|\*\*$/g, '').split(/(\*\*[^*]+\*\*)/g);
              return <div key={li} style={{ color: '#c8d6e5', marginBottom: 2 }}>
                {parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}
              </div>;
            })}
            <div style={{ marginTop: 6, fontSize: 8, color: '#1e3050', fontFamily: FM, fontStyle: 'italic' }}>
              Generated {narrative.generated_at ? new Date(narrative.generated_at).toLocaleString() : 'just now'}
            </div>
          </div>}
          {!narrative && !isLoading && <div style={{ fontSize: 9, color: '#1e3050', fontStyle: 'italic', marginTop: 4 }}>
            {backendId ? 'AI-generated executive summary for stakeholder briefings' : 'Connect to backend to enable AI briefing generation'}
          </div>}
        </div>;
      })()}

      {/* Event lifecycle buttons */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #14243e', flexWrap: 'wrap', position: 'relative' }}>
        {reg.status !== 'watching' && <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'watching' } })); dis.syncStatus((backendId || eid), 'watching'); }} style={{ background: '#1e3b5c', color: '#60a5fa', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{'\ud83d\udd0d'} Watch</button>}
        {reg.status === 'watching' && <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'active' } })); dis.syncStatus((backendId || eid), 'active'); }} style={{ background: '#0d1525', color: '#94a3b8', border: '1px solid #1a2744', borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer' }}>Stop watching</button>}
        <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'archived', archivedSev: sv, archivedAt: new Date().toISOString() } })); dis.syncStatus((backendId || eid), 'archived'); }} style={{ background: '#0d1525', color: '#64748b', border: '1px solid #1e3050', borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer' }}>Archive</button>
        <button onClick={(e) => { e.stopPropagation(); dis.setShowAssign(dis.showAssign === eid ? null : eid); }} style={{
          background: dis.showAssign === eid ? '#1e3a5c' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color + '22' : '#0d1525'),
          color: dis.showAssign === eid ? '#60a5fa' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color : '#94a3b8'),
          border: `1px solid ${dis.showAssign === eid ? '#2563eb44' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color + '44' : '#1e3050')}`,
          borderRadius: 4, padding: '5px 10px', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: FM,
        }}>
          {dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.initials || 'Assign' : 'Assign'}
        </button>
        <button onClick={(e) => {
          e.stopPropagation();
          const title = getEvent(d);
          const region = getRegion(d);
          const trend = getTrend(d);
          const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          const cs = ('computed_severity' in d) ? (d as unknown as Record<string, unknown>).computed_severity as { score: number } | undefined : undefined;
          const recData = dis.recs[backendId || eid];
          const hasBackendImpact = recData?.impact;
          const mfgCount = hasBackendImpact ? recData.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length : (impact ? impact.factories.length : 0);
          const supCount = hasBackendImpact ? recData.impact.affected_suppliers.count : (impact ? SUPPLIERS.filter(s => impact.suppliers.includes(s.country)).reduce((sum, s) => sum + s.n, 0) : 0);
          const estUnits = hasBackendImpact ? `${Math.round(recData.impact.estimated_units_per_week / 1000)}K` : (mfgCount > 0 ? `${Math.round(mfgCount * 4.2)}K` : '0');

          const lines: string[] = [
            'SC Hub Disruption Monitor \u2014 Event Report',
            `Date: ${dateStr}`,
            '',
            `EVENT: ${title}`,
            `SEVERITY: ${sv}${cs ? ` | Algorithm: ${Math.round(cs.score)}/100` : ''}`,
            `REGION: ${region}`,
          ];
          if (trend) lines.push(`TREND: ${trend}`);

          if (mfgCount > 0 || supCount > 0) {
            lines.push('', 'IMPACT:');
            if (mfgCount > 0) lines.push(`\u2022 ${mfgCount} manufacturing sites affected`);
            if (supCount > 0) lines.push(`\u2022 ${supCount} suppliers exposed`);
            lines.push(`\u2022 ${estUnits} units/week estimated impact`);
          }

          if (recData?.actions?.length) {
            lines.push('', 'RECOMMENDED ACTIONS:');
            recData.actions.forEach((act: { priority: number; action: string; owner: string; urgency: string }, ai: number) => {
              lines.push(`${ai + 1}. ${act.action} \u2014 Owner: ${act.owner}, Urgency: ${act.urgency}`);
            });
          }

          if (recData?.confidence) {
            lines.push('', `CONFIDENCE: ${Math.round(recData.confidence * 100)}%`);
          }
          if (recData?.sources?.length) {
            lines.push(`SOURCES: ${recData.sources.join(', ')}`);
          }

          lines.push('', '---', 'Generated by SC Hub Disruption Monitor');

          navigator.clipboard.writeText(lines.join('\n')).then(() => {
            setCopiedId('copy-event-' + eid);
            setTimeout(() => setCopiedId(null), 1500);
          }).catch(() => {});
        }} style={{
          background: '#0d1525', color: copiedId === 'copy-event-' + eid ? '#22c55e' : '#94a3b8',
          border: `1px solid ${copiedId === 'copy-event-' + eid ? '#22c55e44' : '#1e3050'}`,
          borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer', fontWeight: 600,
          fontFamily: FM, transition: 'color .15s, border-color .15s',
        }}>
          {copiedId === 'copy-event-' + eid ? 'Copied!' : 'Copy Event'}
        </button>
      </div>

      {/* Assignment dropdown — inline below lifecycle buttons */}
      {dis.showAssign === eid && <div onClick={(e) => e.stopPropagation()} style={{
        background: '#0d1525', border: '1px solid #14243e', borderRadius: 6,
        padding: 8, marginTop: 6, transition: 'opacity 150ms, transform 150ms',
      }}>
        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM, marginBottom: 6 }}>Assign to</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TEAM.map(t => {
            const isSelected = dis.tickets[eid]?.owner === t.id;
            return <button key={t.id} onClick={(e) => {
              e.stopPropagation();
              const bId = backendId || eid;
              assignTicket(bId, t.id);
              dis.setTickets((prev: Record<string, Record<string, unknown>>) => ({ ...prev, [eid]: { ...prev[eid], owner: t.id, ticketStatus: prev[eid]?.ticketStatus || 'assigned' } }));
              dis.setShowAssign(null);
            }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
              background: isSelected ? t.color + '18' : 'transparent',
              border: isSelected ? `1px solid ${t.color}33` : '1px solid transparent',
              borderRadius: 4, cursor: 'pointer', transition: 'background 150ms',
              textAlign: 'left', width: '100%',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                background: t.color + '33', border: `1px solid ${t.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 700, color: t.color, flexShrink: 0,
              }}>{t.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>{t.name}</div>
                <div style={{ fontSize: 8, color: '#4a6080', lineHeight: 1.2 }}>{t.role}</div>
              </div>
              {isSelected && <span style={{ fontSize: 10, color: t.color }}>{'✓'}</span>}
            </button>;
          })}
          {dis.tickets[eid]?.owner && <button onClick={(e) => {
            e.stopPropagation();
            const bId = backendId || eid;
            assignTicket(bId, '');
            dis.setTickets((prev: Record<string, Record<string, unknown>>) => {
              const updated = { ...prev };
              if (updated[eid]) {
                updated[eid] = { ...updated[eid], owner: null, ticketStatus: 'open' };
              }
              return updated;
            });
            dis.setShowAssign(null);
          }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
            background: 'transparent', border: '1px solid #ef444422',
            borderRadius: 4, cursor: 'pointer', marginTop: 4, width: '100%', textAlign: 'left',
          }}>
            <span style={{ fontSize: 10, color: '#ef4444' }}>{'✕'}</span>
            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>Unassign</span>
          </button>}
        </div>
      </div>}

      {/* Status selector — only visible when ticket exists */}
      {dis.tickets[eid]?.owner && <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM, marginRight: 2 }}>Status</span>
        {(Object.keys(STATUS_CFG) as Array<keyof typeof STATUS_CFG>).map(st => {
          const cfg = STATUS_CFG[st];
          const isCurrent = (dis.tickets[eid]?.ticketStatus || 'open') === st;
          return <button key={st} onClick={(e) => {
            e.stopPropagation();
            const bId = backendId || eid;
            updateTicketStatus(bId, st);
            dis.setTickets((prev: Record<string, Record<string, unknown>>) => ({ ...prev, [eid]: { ...prev[eid], ticketStatus: st } }));
          }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: isCurrent ? cfg.color + '22' : 'transparent',
            color: isCurrent ? cfg.color : '#2a3d5c',
            border: `1px solid ${isCurrent ? cfg.color + '44' : '#14243e'}`,
            borderRadius: 4, padding: '2px 6px', fontSize: 8, fontWeight: isCurrent ? 700 : 500,
            cursor: 'pointer', fontFamily: FM, transition: 'all 150ms',
          }}>
            <span style={{ fontSize: 9, lineHeight: 1 }}>{cfg.icon}</span>
            {cfg.label}
          </button>;
        })}
      </div>}
    </div>
  );
}
