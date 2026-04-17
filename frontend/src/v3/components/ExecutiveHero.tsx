/**
 * ExecutiveHero — Collapsible executive summary panel above the feed.
 *
 * Replaces DeltaBanner. Answers "should I worry?" in 10 seconds.
 * Auto-expands on first visit of the day, collapses after user dismisses.
 */

import { useState, useEffect } from 'react';
import { TYPE, V3_FONT_MONO, sevColor } from '../theme';
import { useV3Theme, type V3Theme } from '../ThemeContext';
import type { ExecutiveSummary, ScanItem } from '../../types';
import { fetchExecutiveSummary } from '../../services/api';
import { eventId } from '../../utils/format';
import { getSev } from '../../utils/scan';

const SS_KEY = 'sc-hub-exec-hero-collapsed';

interface ExecutiveHeroProps {
  items: ScanItem[] | null;
  onSelectEvent: (id: string) => void;
}

function useAutoExpand(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return sessionStorage.getItem(SS_KEY) === '1'; } catch { return false; }
  });
  const toggle = (v: boolean) => {
    setCollapsed(v);
    try { sessionStorage.setItem(SS_KEY, v ? '1' : '0'); } catch {}
  };
  return [collapsed, toggle];
}

const RISK_COLORS: Record<string, string> = {
  STABLE: '#22c55e',
  ELEVATED: '#f59e0b',
  HIGH: '#ef4444',
};

export function ExecutiveHero({ items, onSelectEvent }: ExecutiveHeroProps) {
  const { theme: V3 } = useV3Theme();
  const [collapsed, setCollapsed] = useAutoExpand();
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchExecutiveSummary();
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [items]); // refetch when items change (after scan)

  if (loading && !data) return null; // don't flash empty panel
  if (!data) return null;

  const riskColor = RISK_COLORS[data.risk_level] || V3.text.muted;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          padding: `6px ${V3.spacing.lg}px`,
          background: V3.bg.card,
          borderBottom: `1px solid ${V3.border.subtle}`,
          display: 'flex',
          alignItems: 'center',
          gap: V3.spacing.sm,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ color: riskColor, fontSize: 11, fontWeight: 700, fontFamily: V3_FONT_MONO }}>
          {'\u25B8'} RISK: {data.risk_level}
        </span>
        <span style={{ ...TYPE.mono, fontSize: 10, color: V3.text.muted }}>
          {data.severity_counts.Critical || 0} Critical, {data.severity_counts.High || 0} High, {data.severity_counts.Medium || 0} Medium
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: V3.text.accent }}>Expand summary</span>
      </div>
    );
  }

  return (
    <div style={{
      background: V3.bg.card,
      borderBottom: `1px solid ${V3.border.subtle}`,
      padding: `${V3.spacing.md}px ${V3.spacing.lg}px`,
      flexShrink: 0,
    }}>
      {/* Row 1: Risk Posture Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: V3.spacing.md,
        marginBottom: V3.spacing.sm,
      }}>
        <span style={{
          fontFamily: V3_FONT_MONO,
          fontSize: 11,
          fontWeight: 700,
          color: riskColor,
          background: riskColor + '18',
          padding: '2px 8px',
          borderRadius: V3.radius.sm,
          border: `1px solid ${riskColor}33`,
        }}>
          {data.risk_level}
        </span>

        {/* Severity counts inline */}
        {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
          const count = data.severity_counts[sev] || 0;
          if (count === 0) return null;
          const c = sevColor(sev);
          return (
            <span key={sev} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: V3.text.secondary }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
              <span style={{ fontFamily: V3_FONT_MONO, fontWeight: 600 }}>{count}</span>
              <span style={{ fontSize: 10, color: V3.text.muted }}>{sev}</span>
            </span>
          );
        })}

        {/* Period */}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: V3.text.muted, fontFamily: V3_FONT_MONO }}>
          {data.period?.from && data.period?.to
            ? `${new Date(data.period.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(data.period.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            : '7-day window'}
        </span>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: V3.text.muted,
            cursor: 'pointer',
            fontSize: 14,
            padding: 2,
            lineHeight: 1,
          }}
          title="Collapse summary"
        >{'\u25BE'}</button>
      </div>

      {/* AI One-liner */}
      {data.one_liner && (
        <div style={{
          fontSize: 12,
          color: V3.text.secondary,
          lineHeight: 1.4,
          marginBottom: V3.spacing.md,
          fontStyle: 'italic',
          paddingLeft: V3.spacing.sm,
          borderLeft: `2px solid ${riskColor}44`,
        }}>
          {data.one_liner}
        </div>
      )}

      {/* Row 2: Three-Column Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: V3.spacing.md,
      }}>
        <EventColumn
          title="Actively Bleeding"
          events={data.actively_bleeding}
          emptyText="No critical events"
          V3={V3}
          onSelect={onSelectEvent}
        />
        <EventColumn
          title="Escalating"
          events={data.escalating}
          emptyText="No escalations"
          V3={V3}
          onSelect={onSelectEvent}
        />
        <EventColumn
          title="Recently Resolved"
          events={data.recently_resolved}
          emptyText="No recent resolutions"
          V3={V3}
          onSelect={onSelectEvent}
        />
      </div>

      {/* Row 3: BU Impact Strip */}
      {data.bu_exposure.length > 0 && (
        <div style={{
          display: 'flex',
          gap: V3.spacing.md,
          marginTop: V3.spacing.md,
          paddingTop: V3.spacing.sm,
          borderTop: `1px solid ${V3.border.subtle}`,
          flexWrap: 'wrap',
        }}>
          {data.bu_exposure.filter(bu => bu.active_disruption_count > 0).map(bu => {
            const buColor = bu.max_severity === 'Critical' ? V3.severity.critical
              : bu.max_severity === 'High' ? V3.severity.high
              : V3.text.muted;
            return (
              <span key={bu.bu} style={{
                fontSize: 10,
                color: V3.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: buColor, display: 'inline-block' }} />
                <span style={{ fontWeight: 600 }}>{bu.bu}:</span>
                {bu.active_disruption_count} events
                {bu.max_severity === 'Critical' || bu.max_severity === 'High'
                  ? <span style={{ color: buColor, fontWeight: 600 }}> ({bu.max_severity})</span>
                  : null}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventColumn({ title, events, emptyText, V3, onSelect }: {
  title: string;
  events: ScanItem[];
  emptyText: string;
  V3: V3Theme;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div style={{
        ...TYPE.sectionHeader,
        fontSize: 9,
        color: V3.text.muted,
        marginBottom: V3.spacing.xs,
      }}>
        {title}
      </div>
      {events.length === 0 ? (
        <div style={{ fontSize: 10, color: V3.text.muted, fontStyle: 'italic' }}>{emptyText}</div>
      ) : (
        events.map((evt, i) => {
          const eid = (evt as any).id || eventId(evt as { event?: string; risk?: string; region?: string });
          const evtTitle = ('event' in evt ? (evt as any).event : ('risk' in evt ? (evt as any).risk : '?')) as string;
          const sev = getSev(evt);
          const region = ('region' in evt ? (evt as any).region : '') as string;
          const sites = Array.isArray((evt as any).affected_sites) ? (evt as any).affected_sites.length : 0;

          return (
            <div
              key={eid + i}
              onClick={() => onSelect(eid)}
              style={{
                padding: `3px ${V3.spacing.xs}px`,
                borderRadius: V3.radius.sm,
                cursor: 'pointer',
                marginBottom: 2,
                transition: 'background 100ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                fontSize: 11,
                color: V3.text.primary,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: sevColor(sev),
                  marginRight: 4,
                  verticalAlign: 'middle',
                }} />
                {evtTitle}
              </div>
              <div style={{ fontSize: 9, color: V3.text.muted, paddingLeft: 10 }}>
                {region}{sites > 0 ? ` \u00B7 ${sites} sites` : ''}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
