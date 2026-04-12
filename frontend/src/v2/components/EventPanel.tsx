/**
 * EventPanel — The right panel containing the event list for the v2 UI.
 * Width controlled by parent Shell (400px).
 *
 * Full parity with v1 DrawerPanel: severity filters, group by, assignee filter,
 * show/hide archived, virtual scrolling for 50+ items, loading/error/empty states.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { ScanItem, Severity, EventRegistryEntry, Ticket } from '../../types';
import { SO, SITES, ROUTES, SUPPLY_GRAPH } from '../../data';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT, V2_FONT_MONO } from '../theme';
import { relTime, eventId } from '../../utils/format';
import { computeImpactWithGraph } from '../../utils/impact';
import { getSev, getEvent, getRegion, getTrend } from '../../utils/scan';
import { WhatChanged } from './WhatChanged';
import { EventDetail } from './EventDetail';
import type { useDisruptionState } from '../../hooks/useDisruptionState';
import type { useFilterState } from '../../hooks/useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

// Team members for assignee filter
const TEAM = [
  { id: 'SB', name: 'Steffen Brandt', initials: 'SB', color: '#3b82f6' },
  { id: 'ML', name: 'Maria Lindgren', initials: 'ML', color: '#22c55e' },
  { id: 'AK', name: 'Anders Karlsson', initials: 'AK', color: '#f59e0b' },
  { id: 'EN', name: 'Elena Novak', initials: 'EN', color: '#a78bfa' },
];

const EMPTY_REG: EventRegistryEntry = { status: 'active', firstSeen: '', lastSeen: '', scanCount: 0, lastSev: '' };

// ── Sparkline ──

function SeveritySparkline({ reg, sv, theme }: { reg: EventRegistryEntry; sv: Severity; theme: ReturnType<typeof useTheme>['theme'] }) {
  const co = theme.severity[sv.toLowerCase() as keyof typeof theme.severity] || theme.text.tertiary;
  const trend = reg._new ? 'new' : reg._reEmerged ? 'up' : reg._notDetected ? 'down' : 'stable';
  const scanCount = reg.scanCount || 1;
  const barCount = Math.min(5, Math.max(3, scanCount));
  const bars: number[] = [];
  const sevVal: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const currentVal = sevVal[sv] || 2;

  for (let i = 0; i < barCount; i++) {
    const progress = i / (barCount - 1);
    if (trend === 'up') bars.push(Math.max(1, currentVal - Math.round((1 - progress) * 1.5)));
    else if (trend === 'down') bars.push(Math.min(4, currentVal + Math.round((1 - progress) * 1.5)));
    else if (trend === 'new') bars.push(i === barCount - 1 ? currentVal : 0);
    else bars.push(currentVal + (i % 2 === 0 ? 0 : (Math.random() > 0.5 ? 0 : -1)));
  }

  const maxBar = Math.max(...bars, 1);
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : trend === 'new' ? '\u26A1' : '\u2192';
  const trendColor = trend === 'up' ? theme.accent.red : trend === 'down' ? theme.accent.green : trend === 'new' ? theme.accent.blue : theme.text.tertiary;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} title={`Trend: ${trend} (${scanCount} scan${scanCount !== 1 ? 's' : ''})`}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
        {bars.map((val, i) => {
          const h = Math.max(2, (val / maxBar) * 14);
          const opacity = i === bars.length - 1 ? 1 : 0.3 + (i / bars.length) * 0.5;
          return <div key={i} style={{ width: 3, height: h, borderRadius: 1.5, background: co, opacity, transition: 'height .2s' }} />;
        })}
      </div>
      <span style={{ fontSize: 10, color: trendColor, fontWeight: 600, lineHeight: 1 }}>{trendIcon}</span>
    </div>
  );
}

// ── Main Panel ──

export interface EventPanelProps {
  dis: DisruptionState;
  fil: FilterState;
  viewport: string;
}

export function EventPanel({ dis, fil, viewport }: EventPanelProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [wcDismissed, setWcDismissed] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);

  const handleScrollToCard = useCallback((idx: number) => {
    dis.setSel(idx);
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const card = container.querySelector(`[data-card-idx="${idx}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const el = card as HTMLElement;
        const orig = el.style.boxShadow;
        el.style.boxShadow = `0 0 20px ${theme.accent.blue}33`;
        setTimeout(() => { el.style.boxShadow = orig; }, 1200);
      }
    });
  }, [dis, theme]);

  // Region site count map
  const rsc = useMemo(() => {
    const m: Record<string, string> = { 'Europe': 'EU', 'Middle East': 'MEA', 'China': 'APAC', 'India': 'APAC', 'Americas': 'AM', 'Africa': 'AF' };
    const o: Record<string, number> = {};
    if (!dis.items) return o;
    const regions = new Set(dis.items.map(d => getRegion(d)));
    regions.forEach(r => {
      if (r === 'Global') { o[r] = SITES.length; }
      else { const k = m[r]; if (k) o[r] = SITES.filter(s => s.region === k).length; else o[r] = 0; }
    });
    return o;
  }, [dis.items]);

  // Grouped + filtered items
  const grouped = useMemo(() => {
    if (!dis.items) return {};
    const g: Record<string, (ScanItem & { _i: number })[]> = {};
    const active = dis.items.filter(d => {
      const eid = eventId(d as { event?: string; risk?: string; region?: string });
      const r = dis.registry[eid];
      if (r?.status === 'archived' && !fil.showArchived) return false;
      if (fil.sevFilter) { if (getSev(d) !== fil.sevFilter) return false; }
      if (fil.assignFilter) {
        const tk = dis.tickets[eid];
        if (fil.assignFilter === 'unassigned') return !tk || !tk.owner;
        return tk?.owner === fil.assignFilter;
      }
      return true;
    });
    if (fil.groupBy === 'severity') {
      const sevOrder = ['Critical', 'High', 'Medium', 'Low'];
      active.forEach(d => { const sv = getSev(d); if (!g[sv]) g[sv] = []; g[sv].push({ ...d, _i: dis.items!.indexOf(d) }); });
      const s: Record<string, typeof g[string]> = {};
      sevOrder.forEach(k => { if (g[k]) s[k] = g[k]; });
      Object.keys(g).forEach(k => { if (!s[k]) s[k] = g[k]; });
      return s;
    } else {
      active.forEach(d => { const r = getRegion(d); if (!g[r]) g[r] = []; g[r].push({ ...d, _i: dis.items!.indexOf(d) }); });
      const s: Record<string, typeof g[string]> = {};
      Object.entries(g).sort(([, a], [, b]) => {
        const minA = Math.min(...a.map(x => SO[getSev(x)] || 3));
        const minB = Math.min(...b.map(x => SO[getSev(x)] || 3));
        return minA - minB;
      }).forEach(([k, v]) => s[k] = v);
      return s;
    }
  }, [dis.items, fil.groupBy, dis.registry, dis.tickets, fil.assignFilter, fil.sevFilter, fil.showArchived]);

  const archivedCount = useMemo(() => {
    if (!dis.items) return 0;
    return dis.items.filter(d => {
      const eid = eventId(d as { event?: string; risk?: string; region?: string });
      return dis.registry[eid]?.status === 'archived';
    }).length;
  }, [dis.items, dis.registry]);

  const totalVisible = useMemo(() => Object.values(grouped).reduce((s, g) => s + g.length, 0), [grouped]);
  const hasActiveFilters = !!(fil.sevFilter || fil.assignFilter);
  const cc = dis.items ? dis.items.filter(d => getSev(d) === 'Critical').length : 0;

  // Virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const CARD_HEIGHT = 80;
  const BUFFER = 8;
  const VIEWPORT_CARDS = 18;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const flatItems = useMemo(() => {
    const flat: Array<{ type: 'header'; grp: string; count: number; color: string } | { type: 'card'; d: ScanItem & { _i: number }; grp: string }> = [];
    Object.entries(grouped).forEach(([grp, items]) => {
      const isSev = fil.groupBy === 'severity';
      const hdrColor = isSev
        ? (theme.severity[(grp.toLowerCase()) as keyof typeof theme.severity] || theme.text.tertiary) as string
        : theme.text.secondary;
      flat.push({ type: 'header', grp, count: items.length, color: hdrColor });
      items.forEach(d => flat.push({ type: 'card', d, grp }));
    });
    return flat;
  }, [grouped, fil.groupBy, theme]);

  const needsVirtualization = flatItems.length > 50;
  const visibleStart = needsVirtualization ? Math.max(0, Math.floor(scrollTop / CARD_HEIGHT) - BUFFER) : 0;
  const visibleEnd = needsVirtualization ? Math.min(flatItems.length, visibleStart + VIEWPORT_CARDS + BUFFER * 2) : flatItems.length;

  // Severity filter button
  const sevFilterBtn = (sev: Severity) => {
    const isActive = fil.sevFilter === sev;
    const color = theme.severity[sev.toLowerCase() as keyof typeof theme.severity] || theme.text.tertiary;
    const count = dis.items ? dis.items.filter(d => getSev(d) === sev).length : 0;
    if (count === 0) return null;
    return (
      <button
        key={sev}
        aria-label={`Filter by ${sev} severity`}
        aria-pressed={isActive}
        onClick={() => fil.setSevFilter(isActive ? null : sev)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: isActive ? color + '18' : 'transparent',
          color: isActive ? color : theme.text.muted,
          border: `1px solid ${isActive ? color + '44' : theme.border.subtle}`,
          borderRadius: V2_BR.full, padding: '3px 8px',
          fontSize: 10, fontWeight: 600, cursor: 'pointer',
          fontFamily: V2_FONT_MONO, transition: 'all 200ms ease',
        }}
        onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = color + '0d'; (e.currentTarget as HTMLElement).style.color = color as string; } }}
        onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.muted; } }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
        {sev}
        <span style={{ fontFamily: V2_FONT_MONO, fontSize: 9, opacity: 0.7 }}>{count}</span>
      </button>
    );
  };

  return (
    <div
      role="region"
      aria-label="Events panel"
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: theme.bg.primary, overflow: 'hidden',
        fontFamily: V2_FONT,
      }}
    >
      {/* ── Panel Header ── */}
      <div style={{
        padding: `${V2_SP.sm}px 12px ${V2_SP.xs}px`,
        borderBottom: `1px solid ${theme.border.subtle}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: V2_SP.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm }}>
            <h2 style={{ ...V2_TYP.h1, color: theme.text.primary, margin: 0 }}>Events</h2>
            {dis.items && (
              <span style={{
                ...V2_TYP.monoSm, color: theme.text.muted,
                background: theme.bg.tertiary, padding: '3px 8px',
                borderRadius: V2_BR.sm, border: `1px solid ${theme.border.subtle}`,
              }}>
                {dis.items.length}
              </span>
            )}
            {dis.loading && !dis.items && (
              <span style={{
                width: 14, height: 14,
                border: `2px solid ${theme.accent.blue}33`, borderTop: `2px solid ${theme.accent.blue}`,
                borderRadius: '50%', display: 'inline-block', animation: 'v2spin 1s linear infinite',
              }} />
            )}
          </div>
          {cc > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: theme.severity.criticalBg, border: `1px solid ${theme.severity.critical}33`,
              borderRadius: V2_BR.full, padding: `3px ${V2_SP.sm}px`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: theme.severity.critical, boxShadow: `0 0 6px ${theme.severity.critical}` }} />
              <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.severity.critical, fontWeight: 700 }}>{cc} CRITICAL</span>
            </div>
          )}
        </div>
        {dis.sTime && (
          <div style={{ ...V2_TYP.caption, color: theme.text.muted }}>
            Scanned {relTime(dis.sTime)} {'\u00B7'} {dis.sTime.toLocaleTimeString()} {'\u00B7'} {dis.sTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        )}
      </div>

      {/* ── Severity Filter Row + Filters Toggle ── */}
      {dis.items && (
        <div style={{
          display: 'flex', gap: 4, padding: `${V2_SP.xs}px 12px`,
          borderBottom: `1px solid ${theme.border.subtle}`, flexWrap: 'wrap',
          alignItems: 'center', flexShrink: 0,
        }}>
          {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(s => sevFilterBtn(s))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowSecondary(!showSecondary)}
            aria-label={showSecondary ? 'Hide secondary filters' : 'Show secondary filters'}
            aria-expanded={showSecondary}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: (showSecondary || fil.assignFilter || fil.groupBy !== 'severity' || fil.showArchived)
                ? theme.accent.blue + '12' : 'transparent',
              color: (showSecondary || fil.assignFilter || fil.groupBy !== 'severity' || fil.showArchived)
                ? theme.accent.blue : theme.text.muted,
              border: `1px solid ${(showSecondary || fil.assignFilter) ? theme.accent.blue + '33' : theme.border.subtle}`,
              borderRadius: V2_BR.full, padding: '3px 8px',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              fontFamily: V2_FONT_MONO, transition: 'all 200ms ease',
            }}
          >
            {'\u25BC'} Filters
            {(fil.assignFilter || fil.groupBy !== 'severity' || fil.showArchived) && (
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: theme.accent.blue, flexShrink: 0,
              }} />
            )}
          </button>
        </div>
      )}

      {/* ── Secondary Filters (collapsible) ── */}
      {dis.items && showSecondary && (
        <div style={{
          display: 'flex', gap: 4, padding: `${V2_SP.xs}px 12px`,
          borderBottom: `1px solid ${theme.border.subtle}`,
          flexWrap: 'wrap', alignItems: 'center', flexShrink: 0,
        }}>
          {/* Group by */}
          <span style={{ ...V2_TYP.label, color: theme.text.muted }}>Group</span>
          <div style={{ display: 'flex', background: theme.bg.secondary, borderRadius: V2_BR.md, border: `1px solid ${theme.border.subtle}`, overflow: 'hidden' }}>
            {(['severity', 'region'] as const).map(g => (
              <button
                key={g}
                onClick={() => fil.setGroupBy(g)}
                aria-label={`Group by ${g}`}
                aria-pressed={fil.groupBy === g}
                style={{
                  padding: `${V2_SP.xs}px ${V2_SP.sm}px`, fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: fil.groupBy === g ? theme.bg.elevated : 'transparent',
                  color: fil.groupBy === g ? theme.text.primary : theme.text.muted,
                  transition: 'all 150ms', textTransform: 'capitalize',
                }}
              >
                {g}
              </button>
            ))}
          </div>

          <span style={{ color: theme.border.subtle, fontSize: 12 }}>{'\u00B7'}</span>

          {/* Assignee filter */}
          <button
            onClick={() => fil.setAssignFilter(null)}
            aria-label="Show all events"
            style={{
              background: !fil.assignFilter ? theme.accent.blue + '18' : 'transparent',
              color: !fil.assignFilter ? theme.accent.blue : theme.text.muted,
              border: `1px solid ${!fil.assignFilter ? theme.accent.blue + '44' : theme.border.subtle}`,
              borderRadius: V2_BR.full, padding: '3px 8px',
              fontSize: 10, fontWeight: !fil.assignFilter ? 600 : 400, cursor: 'pointer',
            }}
          >
            All
          </button>
          <button
            onClick={() => fil.setAssignFilter('unassigned')}
            aria-label="Show unassigned events"
            style={{
              background: fil.assignFilter === 'unassigned' ? theme.accent.amber + '18' : 'transparent',
              color: fil.assignFilter === 'unassigned' ? theme.accent.amber : theme.text.muted,
              border: `1px solid ${fil.assignFilter === 'unassigned' ? theme.accent.amber + '44' : theme.border.subtle}`,
              borderRadius: V2_BR.full, padding: '3px 8px',
              fontSize: 10, fontWeight: fil.assignFilter === 'unassigned' ? 600 : 400, cursor: 'pointer',
            }}
          >
            Unassigned
          </button>
          {TEAM.map(t => (
            <button
              key={t.id}
              onClick={() => fil.setAssignFilter(fil.assignFilter === t.id ? null : t.id)}
              aria-label={`Filter by ${t.name}`}
              style={{
                background: fil.assignFilter === t.id ? t.color + '22' : 'transparent',
                color: fil.assignFilter === t.id ? t.color : theme.text.muted,
                border: `1px solid ${fil.assignFilter === t.id ? t.color + '44' : theme.border.subtle}`,
                borderRadius: V2_BR.full, padding: '3px 8px',
                fontSize: 10, cursor: 'pointer',
              }}
            >
              {t.initials}
            </button>
          ))}

          {/* Archived toggle */}
          {archivedCount > 0 && (
            <>
              <span style={{ color: theme.border.subtle, fontSize: 12 }}>{'\u00B7'}</span>
              <button
                onClick={() => fil.setShowArchived(!fil.showArchived)}
                aria-label={`${fil.showArchived ? 'Hide' : 'Show'} archived events`}
                aria-pressed={fil.showArchived}
                style={{
                  background: fil.showArchived ? theme.text.tertiary + '18' : 'transparent',
                  color: fil.showArchived ? theme.text.secondary : theme.text.muted,
                  border: `1px solid ${fil.showArchived ? theme.text.tertiary + '44' : theme.border.subtle}`,
                  borderRadius: V2_BR.full, padding: '3px 8px',
                  fontSize: 10, fontWeight: fil.showArchived ? 600 : 400, cursor: 'pointer',
                }}
              >
                Archived ({archivedCount})
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Error state ── */}
      {dis.error && (
        <div style={{
          margin: `${V2_SP.md}px ${V2_SP['2xl']}px`,
          background: theme.severity.criticalBg, border: `1px solid ${theme.severity.critical}33`,
          borderRadius: V2_BR.md, padding: V2_SP.md,
        }}>
          <strong style={{ ...V2_TYP.bodySm, color: theme.severity.critical }}>Error: </strong>
          <span style={{ ...V2_TYP.bodySm, color: theme.text.secondary }}>{dis.error}</span>
          <button
            onClick={() => dis.scan(dis.mode!)}
            aria-label="Retry scan"
            style={{
              display: 'block', marginTop: V2_SP.sm,
              padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
              border: `1px solid ${theme.severity.critical}44`, borderRadius: V2_BR.sm,
              background: theme.severity.criticalBg, color: theme.severity.critical,
              ...V2_TYP.monoSm, cursor: 'pointer',
            }}
          >
            Retry {dis.mode}
          </button>
        </div>
      )}

      {/* ── Offline indicator ── */}
      {dis.dataSource === 'fallback' && dis.items && (
        <div style={{
          margin: `0 ${V2_SP['2xl']}px ${V2_SP.xs}px`,
          padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
          background: theme.severity.mediumBg, border: `1px solid ${theme.severity.medium}22`,
          borderRadius: V2_BR.sm, display: 'flex', alignItems: 'center', gap: V2_SP.sm,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: theme.severity.medium, opacity: 0.7, flexShrink: 0 }} />
          <span style={{ ...V2_TYP.caption, color: theme.severity.medium }}>Offline -- showing cached data</span>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {dis.loading && !dis.items && (
        <div style={{ flex: 1, overflow: 'hidden', padding: `${V2_SP.md}px ${V2_SP['2xl']}px` }}>
          {[80, 65, 50, 40, 30].map((w, i) => (
            <div key={i} style={{
              marginBottom: V2_SP.sm, borderRadius: V2_BR.lg, border: `1px solid ${theme.border.subtle}`,
              padding: V2_SP.md, background: theme.bg.secondary, animation: 'v2pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 100}ms`,
            }}>
              <div style={{ display: 'flex', gap: V2_SP.sm, alignItems: 'center', marginBottom: V2_SP.sm }}>
                <div style={{ width: 16, height: 16, borderRadius: V2_BR.sm, background: theme.bg.tertiary, flexShrink: 0 }} />
                <div style={{ width: `${w}%`, height: 14, borderRadius: V2_BR.sm, background: theme.bg.tertiary }} />
              </div>
              <div style={{ display: 'flex', gap: V2_SP.xs }}>
                <div style={{ width: 56, height: 20, borderRadius: V2_BR.sm, background: theme.bg.tertiary }} />
                <div style={{ width: 72, height: 20, borderRadius: V2_BR.sm, background: theme.bg.tertiary }} />
                <div style={{ width: 48, height: 20, borderRadius: V2_BR.sm, background: theme.bg.tertiary }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {dis.items && totalVisible === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: `${V2_SP['4xl']}px ${V2_SP['2xl']}px`, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: V2_SP.md, opacity: 0.3 }}>{'\uD83D\uDD0D'}</div>
          <div style={{ ...V2_TYP.h3, color: theme.text.muted, marginBottom: V2_SP.xs }}>No events match your filters</div>
          <div style={{ ...V2_TYP.bodySm, color: theme.text.muted, marginBottom: V2_SP.xl }}>
            {hasActiveFilters ? 'Try adjusting severity or assignee filters'
              : archivedCount > 0 ? `${archivedCount} archived event${archivedCount > 1 ? 's' : ''} hidden`
              : 'No events detected in this scan'}
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => { fil.setSevFilter(null); fil.setAssignFilter(null); }}
              aria-label="Reset all filters"
              style={{
                background: theme.accent.blue + '18', color: theme.accent.blue,
                border: `1px solid ${theme.accent.blue}44`, borderRadius: V2_BR.full,
                padding: `${V2_SP.sm}px ${V2_SP.xl}px`, ...V2_TYP.bodySm, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* ── Event cards list ── */}
      {dis.items && totalVisible > 0 && (
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: `${V2_SP.sm}px 0` }}>
          {/* What Changed banner */}
          {!wcDismissed && (
            <div style={{ padding: `0 ${V2_SP['2xl']}px` }}>
              <WhatChanged
                items={dis.items}
                registry={dis.registry}
                sTime={dis.sTime}
                onSelect={handleScrollToCard}
                onDismiss={() => setWcDismissed(true)}
              />
            </div>
          )}

          {/* Virtualization spacer */}
          {needsVirtualization && visibleStart > 0 && <div style={{ height: visibleStart * CARD_HEIGHT }} />}

          {Object.entries(grouped).map(([grp, grpItems]) => {
            const isSev = fil.groupBy === 'severity';
            const hdrColor = isSev
              ? (theme.severity[(grp.toLowerCase()) as keyof typeof theme.severity] || theme.text.tertiary)
              : theme.text.secondary;

            return (
              <div key={grp} style={{ padding: `${V2_SP.sm}px ${V2_SP['2xl']}px 0` }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: V2_SP.sm,
                  marginBottom: V2_SP.sm, padding: `${V2_SP.xs}px 0`,
                }}>
                  <div style={{ width: 3, height: 18, borderRadius: 2, background: hdrColor as string }} />
                  <span style={{ ...V2_TYP.label, color: hdrColor as string }}>{grp}</span>
                  <span style={{ ...V2_TYP.monoSm, fontSize: 10, color: theme.text.muted }}>{grpItems.length}</span>
                  <div style={{ flex: 1, height: 1, background: theme.border.subtle }} />
                  {!isSev && <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.text.muted, background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: V2_BR.sm, padding: '2px 6px' }}>{rsc[grp] || 0} sites</span>}
                </div>

                {/* Cards */}
                {grpItems.map((d: ScanItem & { _i: number }, ci: number) => {
                  const idx = d._i;
                  const isExpanded = dis.sel === idx;
                  const sv = getSev(d);
                  const sevCo = theme.severity[sv.toLowerCase() as keyof typeof theme.severity] || theme.text.tertiary;
                  const trend = getTrend(d);
                  const ig = dis.mode === 'geopolitical';
                  const it = dis.mode === 'trade';
                  const ta = ig ? (('trend_arrow' in d ? d.trend_arrow : '') as string) : (trend === 'Escalating' ? '\u2197' : trend === 'De-escalating' ? '\u2198' : trend === 'New' ? '\u26A1' : '\u2192');
                  const tc = ta === '\u2197' || ta === '\u26A1' ? theme.accent.red : ta === '\u2198' ? theme.accent.green : theme.text.tertiary;
                  const eid = eventId(d as { event?: string; risk?: string; region?: string });
                  const reg = dis.registry[eid] || EMPTY_REG;
                  const isArchived = reg.status === 'archived';

                  return (
                    <div
                      key={idx}
                      data-card-idx={idx}
                      role="button"
                      aria-expanded={isExpanded}
                      aria-label={`${sv} severity: ${getEvent(d)} in ${getRegion(d)}${isExpanded ? ' (expanded)' : ''}`}
                      tabIndex={0}
                      onClick={() => dis.setSel(isExpanded ? null : idx)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dis.setSel(isExpanded ? null : idx); } }}
                      style={{
                        position: 'relative',
                        background: isExpanded ? theme.bg.elevated : theme.bg.secondary,
                        border: `1px solid ${isExpanded ? sevCo + '44' : theme.border.subtle}`,
                        borderRadius: V2_BR.lg,
                        padding: V2_SP.md,
                        cursor: 'pointer',
                        transition: 'all 200ms ease',
                        marginBottom: V2_SP.sm,
                        boxShadow: isExpanded ? `0 4px 24px ${sevCo}11` : 'none',
                        opacity: isArchived ? 0.5 : 1,
                        overflow: 'hidden',
                      }}
                      onMouseEnter={e => { if (!isExpanded) { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; (e.currentTarget as HTMLElement).style.borderColor = theme.border.default; } }}
                      onMouseLeave={e => { if (!isExpanded) { (e.currentTarget as HTMLElement).style.background = theme.bg.secondary; (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle; } }}
                    >
                      {/* Severity color bar (left edge, 3px wide) */}
                      <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                        background: sevCo as string, borderRadius: `${V2_BR.lg}px 0 0 ${V2_BR.lg}px`,
                      }} />

                      {/* Card collapsed content */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: V2_SP.sm, paddingLeft: V2_SP.sm }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Title (truncated to 1 line when collapsed) */}
                          <div style={{
                            ...V2_TYP.h3, color: theme.text.primary,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: isExpanded ? 'normal' : 'nowrap',
                            marginBottom: V2_SP.xs,
                          }}>
                            {getEvent(d)}
                          </div>
                          {/* Badges row */}
                          <div style={{ display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Severity or Region badge */}
                            {isSev ? (
                              <span style={{
                                background: theme.bg.tertiary, color: theme.text.muted,
                                padding: '3px 8px', borderRadius: V2_BR.sm,
                                ...V2_TYP.monoSm, border: `1px solid ${theme.border.subtle}`,
                              }}>
                                {getRegion(d)}
                              </span>
                            ) : (
                              <span style={{
                                background: `${sevCo}18`, color: sevCo as string,
                                padding: '3px 8px', borderRadius: V2_BR.sm,
                                ...V2_TYP.monoSm, fontWeight: 700, border: `1px solid ${sevCo}33`,
                              }}>
                                {sv}
                              </span>
                            )}
                            {/* Trend badge */}
                            <span style={{
                              background: (ta === '\u2197' || trend === 'Escalating') ? `${theme.accent.red}12` : theme.bg.tertiary,
                              color: tc as string, padding: '3px 8px', borderRadius: V2_BR.sm,
                              ...V2_TYP.monoSm, border: `1px solid ${tc}22`,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                              <span style={{ fontSize: 14, lineHeight: 1 }}>{ta}</span>{trend}
                            </span>
                            {/* Trade corridor */}
                            {it && 'corridor' in d && (
                              <span style={{ background: theme.bg.tertiary, color: theme.text.secondary, padding: '3px 8px', borderRadius: V2_BR.sm, ...V2_TYP.monoSm, border: `1px solid ${theme.border.subtle}` }}>
                                {(d as { corridor: string }).corridor}
                              </span>
                            )}
                            {/* Lifecycle badges */}
                            {reg._new && <span style={{ background: theme.accent.blue + '22', color: theme.accent.blue, padding: '3px 8px', borderRadius: V2_BR.sm, ...V2_TYP.monoSm, fontWeight: 700 }}>NEW</span>}
                            {reg._reEmerged && <span style={{ background: theme.accent.red + '22', color: theme.accent.red, padding: '3px 8px', borderRadius: V2_BR.sm, ...V2_TYP.monoSm, fontWeight: 700 }}>{'\u26A0'} Re-emerged</span>}
                            {reg.status === 'watching' && <span style={{ background: theme.accent.blue + '18', color: theme.accent.blue, padding: '3px 8px', borderRadius: V2_BR.sm, ...V2_TYP.monoSm }}>{'\uD83D\uDD0D'} Watching</span>}
                            {isArchived && <span style={{ background: theme.text.tertiary + '18', color: theme.text.tertiary, padding: '3px 8px', borderRadius: V2_BR.sm, ...V2_TYP.monoSm, border: `1px solid ${theme.text.tertiary}33` }}>Archived</span>}
                            {reg.scanCount > 1 && !reg._new && <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.text.muted }}>Scan #{reg.scanCount}</span>}
                          </div>
                        </div>

                        {/* Right side: sparkline + chevron */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.xs, flexShrink: 0, marginTop: 2 }}>
                          {!isExpanded && <SeveritySparkline reg={reg} sv={sv} theme={theme} />}
                          <span style={{
                            color: theme.text.muted, fontSize: 14,
                            transform: isExpanded ? 'rotate(180deg)' : '',
                            transition: 'transform 200ms ease',
                            display: 'inline-block', lineHeight: 1,
                          }}>
                            {'\u25BE'}
                          </span>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <EventDetail item={d} mode={dis.mode || 'disruptions'} dis={dis} fil={fil} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Virtualization end spacer */}
          {needsVirtualization && visibleEnd < flatItems.length && <div style={{ height: (flatItems.length - visibleEnd) * CARD_HEIGHT }} />}

          {/* Footer */}
          <div style={{
            padding: `${V2_SP.md}px ${V2_SP['2xl']}px ${V2_SP['2xl']}px`,
            ...V2_TYP.caption, color: theme.text.muted, fontStyle: 'italic',
            borderTop: `1px solid ${theme.border.subtle}`, margin: `${V2_SP.sm}px ${V2_SP['2xl']}px 0`,
          }}>
            Prototype -- assessments based on AI training knowledge, not live web data. Live scanning enabled on AWS deployment.
          </div>
        </div>
      )}

    </div>
  );
}
