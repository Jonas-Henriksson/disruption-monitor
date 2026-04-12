/**
 * WeeklyBrief — Monday-morning executive summary tab
 *
 * Sections: headline, week-over-week delta, new events, escalated,
 * resolved, overdue tickets, top regions, copy button.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import { fetchWeeklySummary } from '../../services/api';
import { getEvent, getSev, getRegion } from '../../utils/scan';
import type { useDisruptionState } from '../../hooks/useDisruptionState';
import type { WeeklySummary, ScanItem, Severity } from '../../types';

interface WeeklyBriefProps {
  dis: ReturnType<typeof useDisruptionState>;
}

function sevColorKey(sev: Severity): 'critical' | 'high' | 'medium' | 'low' {
  return sev.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
}

const SEV_ORDER: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

export function WeeklyBrief({ dis }: WeeklyBriefProps) {
  const { theme } = useTheme();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hoveredCopy, setHoveredCopy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWeeklySummary(7).then(data => {
      if (!cancelled) {
        setSummary(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Build plain text for clipboard
  const briefText = useMemo(() => {
    if (!summary) return '';
    const lines: string[] = [
      `SC Hub Weekly Brief -- ${summary.period.from} to ${summary.period.to}`,
      '',
      summary.headline,
      '',
      'Severity Snapshot:',
      ...Object.entries(summary.severity_snapshot)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `  ${k}: ${v}`),
      '',
    ];
    if (summary.new_events.length > 0) {
      lines.push('New This Week:');
      summary.new_events.forEach(e => {
        lines.push(`  [${getSev(e)}] ${getEvent(e)}`);
      });
      lines.push('');
    }
    if (summary.escalated_events.length > 0) {
      lines.push('Escalated:');
      summary.escalated_events.forEach(e => {
        lines.push(`  ${getEvent(e)} (${getSev(e)})`);
      });
      lines.push('');
    }
    if (summary.resolved_events.length > 0) {
      lines.push('Resolved:');
      summary.resolved_events.forEach(e => {
        lines.push(`  ${getEvent(e)}`);
      });
      lines.push('');
    }
    if (summary.overdue_tickets.length > 0) {
      lines.push(`Overdue Tickets: ${summary.overdue_tickets.length}`);
      summary.overdue_tickets.forEach(t => {
        lines.push(`  ${t.event_title || t.event_id} ${t.owner ? `(${t.owner})` : ''} -- due ${t.due_date}`);
      });
      lines.push('');
    }
    if (summary.top_regions.length > 0) {
      lines.push('Top Regions:');
      summary.top_regions.forEach(r => {
        lines.push(`  ${r.region}: ${r.event_count} events`);
      });
      lines.push('');
    }
    const d = summary.week_over_week_delta;
    lines.push(`Week-over-Week: New ${d.new}, Resolved ${d.resolved}, Active Total ${d.active_total}`);
    return lines.join('\n');
  }, [summary]);

  const copyWeeklyBrief = useCallback(() => {
    if (!briefText) return;
    navigator.clipboard.writeText(briefText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [briefText]);

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ padding: V2_SP.xl, display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              height: 24,
              borderRadius: V2_BR.sm,
              background: theme.bg.tertiary,
              animation: 'v2pulse 1.5s ease-in-out infinite',
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (!summary) {
    return (
      <div style={{ padding: V2_SP['2xl'], textAlign: 'center' }}>
        <div style={{ ...V2_TYP.label, color: theme.text.muted, marginBottom: V2_SP.sm }}>
          No weekly data available
        </div>
        <div style={{ ...V2_TYP.caption, color: theme.text.muted }}>
          Backend may be unreachable
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.lg, padding: V2_SP.xl }}>
      {/* Header + Copy */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...V2_TYP.h2, color: theme.text.primary }}>Weekly Brief</span>
        <button
          aria-label={copied ? 'Weekly brief copied to clipboard' : 'Copy weekly brief to clipboard'}
          onClick={copyWeeklyBrief}
          onMouseEnter={() => setHoveredCopy(true)}
          onMouseLeave={() => setHoveredCopy(false)}
          style={{
            padding: `${V2_SP.xs}px ${V2_SP.md}px`,
            borderRadius: V2_BR.sm,
            border: `1px solid ${theme.border.subtle}`,
            background: hoveredCopy ? theme.bg.tertiary : theme.bg.secondary,
            color: copied ? theme.accent.green : theme.text.tertiary,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {copied ? 'Copied' : 'Copy Weekly Brief'}
        </button>
      </div>

      {/* Headline */}
      <div style={{ ...V2_TYP.h3, color: theme.text.primary, lineHeight: 1.5 }}>
        {summary.headline}
      </div>

      {/* Severity distribution bar */}
      <div>
        <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: V2_BR.sm, overflow: 'hidden', marginBottom: V2_SP.sm }}>
          {SEV_ORDER.map(sev => {
            const count = summary.severity_snapshot[sev] || 0;
            if (count === 0) return null;
            return (
              <div key={sev} style={{ flex: count, background: theme.severity[sevColorKey(sev)], borderRadius: V2_BR.sm }} />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 1, borderRadius: V2_BR.md, overflow: 'hidden', border: `1px solid ${theme.border.subtle}` }}>
          {SEV_ORDER.map(sev => {
            const count = summary.severity_snapshot[sev] || 0;
            const color = theme.severity[sevColorKey(sev)];
            const bgKey = `${sevColorKey(sev)}Bg` as keyof typeof theme.severity;
            return (
              <div key={sev} style={{
                flex: 1,
                background: count > 0 ? theme.severity[bgKey] : theme.bg.tertiary,
                padding: `${V2_SP.sm}px ${V2_SP.xs}px`,
                textAlign: 'center',
                borderRight: `1px solid ${theme.border.subtle}`,
              }}>
                <div style={{ fontFamily: V2_FONT_MONO, fontSize: 14, fontWeight: 700, color: count > 0 ? color : theme.text.muted, lineHeight: 1.2 }}>
                  {count}
                </div>
                <div style={{ fontSize: 8, color: count > 0 ? theme.text.tertiary : theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2, fontWeight: 600 }}>
                  {sev}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Week-over-week delta */}
      <div style={{
        display: 'flex',
        gap: V2_SP.sm,
        background: theme.bg.secondary,
        border: `1px solid ${theme.border.subtle}`,
        borderRadius: V2_BR.lg,
        padding: `${V2_SP.md}px ${V2_SP.lg}px`,
      }}>
        {([
          { label: 'New', val: summary.week_over_week_delta.new, color: theme.accent.blue },
          { label: 'Resolved', val: summary.week_over_week_delta.resolved, color: theme.accent.green },
          { label: 'Active', val: summary.week_over_week_delta.active_total, color: theme.accent.orange },
        ]).map(({ label, val, color }) => {
          const isPositive = typeof val === 'string' && val.startsWith('+') && val !== '+0';
          const isNegative = typeof val === 'string' && val.startsWith('-');
          const displayColor = isPositive ? color : isNegative ? theme.accent.green : theme.text.muted;
          return (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: V2_FONT_MONO, fontSize: 16, fontWeight: 700, color: displayColor }}>
                {val}
              </div>
              <div style={{ fontSize: 8, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>
                WoW {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* New This Week */}
      {summary.new_events.length > 0 && (
        <WeeklySection title="New This Week" borderColor={theme.accent.blue} theme={theme}>
          {summary.new_events.map((e, i) => (
            <EventRow key={i} event={e} theme={theme} />
          ))}
        </WeeklySection>
      )}

      {/* Escalated */}
      {summary.escalated_events.length > 0 && (
        <WeeklySection title="Escalated" borderColor={theme.severity.critical} theme={theme} tint={theme.severity.criticalBg}>
          {summary.escalated_events.map((e, i) => (
            <EventRow key={i} event={e} theme={theme} tint="red" />
          ))}
        </WeeklySection>
      )}

      {/* Resolved */}
      {summary.resolved_events.length > 0 && (
        <WeeklySection title="Resolved" borderColor={theme.accent.green} theme={theme} tint={theme.severity.lowBg}>
          {summary.resolved_events.map((e, i) => (
            <EventRow key={i} event={e} theme={theme} resolved />
          ))}
        </WeeklySection>
      )}

      {/* Overdue tickets */}
      {summary.overdue_tickets.length > 0 && (
        <div style={{
          background: `${theme.accent.amber}0a`,
          border: `1px solid ${theme.accent.amber}33`,
          borderRadius: V2_BR.lg,
          padding: `${V2_SP.md}px ${V2_SP.lg}px`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm, marginBottom: V2_SP.sm }}>
            <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden="true">!</span>
            <span style={{ ...V2_TYP.label, color: theme.accent.amber }}>
              {summary.overdue_tickets.length} Overdue Ticket{summary.overdue_tickets.length !== 1 ? 's' : ''}
            </span>
          </div>
          {summary.overdue_tickets.map((t, i) => (
            <div key={i} style={{ ...V2_TYP.bodySm, color: theme.text.secondary, lineHeight: 1.6, paddingLeft: V2_SP.xl }}>
              {t.event_title || t.event_id} {t.owner ? `(${t.owner})` : ''} \u2014 due {t.due_date}
            </div>
          ))}
        </div>
      )}

      {/* Top regions */}
      {summary.top_regions.length > 0 && (
        <div style={{
          background: theme.bg.secondary,
          border: `1px solid ${theme.border.subtle}`,
          borderRadius: V2_BR.lg,
          padding: `${V2_SP.md}px ${V2_SP.lg}px`,
        }}>
          <div style={{ ...V2_TYP.label, color: theme.text.muted, marginBottom: V2_SP.md }}>Top Regions</div>
          {summary.top_regions.slice(0, 5).map((r, i) => {
            const maxCount = summary.top_regions[0]?.event_count || 1;
            const pct = Math.round((r.event_count / maxCount) * 100);
            return (
              <div key={i} style={{ marginBottom: V2_SP.xs + 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ ...V2_TYP.bodySm, fontWeight: 600, color: theme.text.secondary }}>{r.region}</span>
                  <span style={{ fontFamily: V2_FONT_MONO, fontSize: 11, color: theme.text.tertiary, fontWeight: 600 }}>{r.event_count}</span>
                </div>
                <div style={{ height: 4, background: theme.bg.tertiary, borderRadius: V2_BR.sm, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: theme.accent.blue, borderRadius: V2_BR.sm, opacity: 0.6, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty week */}
      {summary.new_events.length === 0 && summary.escalated_events.length === 0 && summary.resolved_events.length === 0 && (
        <div style={{ textAlign: 'center', padding: V2_SP['2xl'], color: theme.text.muted }}>
          <div style={{ ...V2_TYP.bodySm, fontWeight: 600 }}>Quiet week \u2014 no new activity</div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function WeeklySection({
  title,
  borderColor,
  tint,
  theme,
  children,
}: {
  title: string;
  borderColor: string;
  tint?: string;
  theme: ReturnType<typeof useTheme>['theme'];
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: tint || theme.bg.secondary,
      border: `1px solid ${theme.border.subtle}`,
      borderRadius: V2_BR.lg,
      padding: `${V2_SP.md}px ${V2_SP.lg}px`,
    }}>
      <div style={{ ...V2_TYP.label, color: borderColor, marginBottom: V2_SP.sm }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
        {children}
      </div>
    </div>
  );
}

function EventRow({
  event,
  theme,
  resolved,
  tint,
}: {
  event: ScanItem;
  theme: ReturnType<typeof useTheme>['theme'];
  resolved?: boolean;
  tint?: string;
}) {
  const title = getEvent(event);
  const sev = getSev(event);
  const region = getRegion(event);
  const sevColor = theme.severity[sevColorKey(sev)];
  const bgTint = tint === 'red' ? theme.severity.criticalBg : resolved ? theme.severity.lowBg : 'transparent';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: V2_SP.sm,
      padding: `${V2_SP.sm}px ${V2_SP.sm}px`,
      borderRadius: V2_BR.sm,
      background: bgTint,
      borderLeft: `3px solid ${sevColor}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...V2_TYP.bodySm,
          fontWeight: 600,
          color: resolved ? theme.text.muted : theme.text.secondary,
          textDecoration: resolved ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: theme.text.muted, fontFamily: V2_FONT_MONO, marginTop: 2 }}>
          {region}
        </div>
      </div>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        fontFamily: V2_FONT_MONO,
        color: sevColor,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
        marginTop: 2,
      }}>
        {sev}
      </div>
    </div>
  );
}
