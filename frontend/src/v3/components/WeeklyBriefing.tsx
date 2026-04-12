/**
 * WeeklyBriefing — Modal panel showing a weekly risk summary.
 */

import { useEffect, useState, useCallback } from 'react';
import { TYPE, V3_FONT, V3_FONT_MONO, sevColor } from '../theme';
import { useV3Theme } from '../ThemeContext';
import { fetchWeeklySummary } from '../../services/api';
import type { WeeklySummary, Severity } from '../../types';
import { getEvent, getSev } from '../../utils/scan';

export interface WeeklyBriefingProps {
  open: boolean;
  onClose: () => void;
}

export function WeeklyBriefing({ open, onClose }: WeeklyBriefingProps) {
  const { theme: V3, mode: themeMode } = useV3Theme();
  const [data, setData] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchWeeklySummary(7).then(res => {
      setData(res);
      setLoading(false);
    });
  }, [open]);

  const handleCopy = useCallback(() => {
    if (!data) return;
    const lines: string[] = [
      `Weekly Risk Briefing -- ${data.period.from} to ${data.period.to}`,
      '',
      data.headline,
      '',
      'Severity Snapshot:',
      ...Object.entries(data.severity_snapshot).map(([k, v]) => `  ${k}: ${v}`),
      '',
      `Week over Week: ${data.week_over_week_delta.new} new, ${data.week_over_week_delta.resolved} resolved, ${data.week_over_week_delta.active_total} active`,
    ];
    if (data.new_events.length > 0) {
      lines.push('', 'New Events:');
      data.new_events.forEach(e => lines.push(`  - [${getSev(e)}] ${getEvent(e)}`));
    }
    if (data.resolved_events.length > 0) {
      lines.push('', 'Resolved Events:');
      data.resolved_events.forEach(e => lines.push(`  - ${getEvent(e)}`));
    }
    if (data.overdue_tickets.length > 0) {
      lines.push('', 'Overdue Action Items:');
      data.overdue_tickets.forEach(t => lines.push(`  - ${t.event_title || t.event_id} (${t.owner || 'unassigned'})`));
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  if (!open) return null;

  const today = new Date();
  const weekStr = `Week of ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: V3.bg.overlay,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: V3_FONT,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 520,
        maxHeight: '80vh',
        overflow: 'auto',
        background: V3.bg.sidebar,
        border: `1px solid ${V3.border.default}`,
        borderRadius: V3.radius.xl,
        boxShadow: themeMode === 'dark' ? '0 16px 48px rgba(0,0,0,0.5)' : '0 16px 48px rgba(0,0,0,0.15)',
        padding: V3.spacing['3xl'],
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: V3.spacing.xl,
        }}>
          <div>
            <div style={{ ...TYPE.title, fontSize: 16, color: V3.text.primary }}>
              Weekly Risk Briefing
            </div>
            <div style={{ ...TYPE.meta, color: V3.text.muted, marginTop: 2 }}>
              {weekStr}
            </div>
          </div>
          <div style={{ display: 'flex', gap: V3.spacing.sm }}>
            <button
              onClick={handleCopy}
              style={{
                padding: `4px ${V3.spacing.md}px`,
                border: `1px solid ${V3.border.subtle}`,
                borderRadius: V3.radius.sm,
                background: copied ? V3.accent.green + '18' : 'transparent',
                color: copied ? V3.accent.green : V3.text.muted,
                fontSize: 11,
                fontFamily: V3_FONT,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: `1px solid ${V3.border.subtle}`,
                borderRadius: V3.radius.sm,
                color: V3.text.muted,
                cursor: 'pointer',
                fontSize: 14,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {'\u2715'}
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: V3.spacing['3xl'], color: V3.text.muted }}>
            <div style={{
              display: 'inline-block',
              width: 24,
              height: 24,
              border: `2px solid ${V3.border.subtle}`,
              borderTopColor: V3.accent.blue,
              borderRadius: '50%',
              animation: 'sc-spin 0.8s linear infinite',
            }} />
            <div style={{ marginTop: V3.spacing.sm, ...TYPE.body }}>
              Loading weekly summary...
            </div>
          </div>
        )}

        {!loading && !data && (
          <div style={{ textAlign: 'center', padding: V3.spacing['3xl'], color: V3.text.muted, ...TYPE.body }}>
            Unable to load weekly summary. The backend may be unavailable.
          </div>
        )}

        {!loading && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: V3.spacing.xl }}>
            {/* Headline */}
            <div style={{
              ...TYPE.body,
              color: V3.text.secondary,
              padding: V3.spacing.md,
              background: V3.bg.card,
              borderRadius: V3.radius.md,
              borderLeft: `3px solid ${V3.accent.blue}`,
            }}>
              {data.headline}
            </div>

            {/* WoW deltas */}
            <div>
              <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
                WEEK OVER WEEK
              </div>
              <div style={{ display: 'flex', gap: V3.spacing.md }}>
                <div style={{ flex: 1, textAlign: 'center', padding: V3.spacing.sm, background: V3.bg.card, borderRadius: V3.radius.sm }}>
                  <div style={{ ...TYPE.mono, fontFamily: V3_FONT_MONO, color: V3.text.accent }}>{data.week_over_week_delta.new}</div>
                  <div style={{ ...TYPE.meta, color: V3.text.muted, marginTop: 2 }}>New</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: V3.spacing.sm, background: V3.bg.card, borderRadius: V3.radius.sm }}>
                  <div style={{ ...TYPE.mono, fontFamily: V3_FONT_MONO, color: V3.accent.green }}>{data.week_over_week_delta.resolved}</div>
                  <div style={{ ...TYPE.meta, color: V3.text.muted, marginTop: 2 }}>Resolved</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: V3.spacing.sm, background: V3.bg.card, borderRadius: V3.radius.sm }}>
                  <div style={{ ...TYPE.mono, fontFamily: V3_FONT_MONO, color: V3.text.primary }}>{data.week_over_week_delta.active_total}</div>
                  <div style={{ ...TYPE.meta, color: V3.text.muted, marginTop: 2 }}>Active</div>
                </div>
              </div>
            </div>

            {/* Severity snapshot */}
            <div>
              <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
                SEVERITY SNAPSHOT
              </div>
              <div style={{ display: 'flex', gap: V3.spacing.sm }}>
                {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(s => (
                  <div key={s} style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: V3.spacing.sm,
                    borderRadius: V3.radius.sm,
                    background: V3.bg.card,
                    border: `1px solid ${sevColor(s, V3)}22`,
                  }}>
                    <div style={{ ...TYPE.heroSm, color: sevColor(s, V3) }}>
                      {data.severity_snapshot[s] || 0}
                    </div>
                    <div style={{ fontSize: 9, color: sevColor(s, V3), fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>
                      {s}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* New events */}
            {data.new_events.length > 0 && (
              <div>
                <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
                  NEW EVENTS ({data.new_events.length})
                </div>
                {data.new_events.slice(0, 5).map((e, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: V3.spacing.sm,
                    padding: `${V3.spacing.xs}px 0`,
                    borderBottom: i < data.new_events.length - 1 ? `1px solid ${V3.border.subtle}` : 'none',
                  }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: sevColor(getSev(e), V3),
                      flexShrink: 0,
                    }} />
                    <span style={{ ...TYPE.body, color: V3.text.secondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getEvent(e)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Resolved events */}
            {data.resolved_events.length > 0 && (
              <div>
                <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
                  RESOLVED ({data.resolved_events.length})
                </div>
                {data.resolved_events.slice(0, 5).map((e, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: V3.spacing.sm,
                    padding: `${V3.spacing.xs}px 0`,
                  }}>
                    <span style={{ color: V3.accent.green, fontSize: 11 }}>{'\u2713'}</span>
                    <span style={{ ...TYPE.body, color: V3.text.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getEvent(e)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Overdue tickets */}
            {data.overdue_tickets.length > 0 && (
              <div>
                <div style={{ ...TYPE.sectionHeader, color: V3.severity.critical, marginBottom: V3.spacing.sm }}>
                  OVERDUE ACTION ITEMS ({data.overdue_tickets.length})
                </div>
                {data.overdue_tickets.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: V3.spacing.sm,
                    padding: `${V3.spacing.xs}px 0`,
                    borderBottom: i < data.overdue_tickets.length - 1 ? `1px solid ${V3.border.subtle}` : 'none',
                  }}>
                    <span style={{ color: V3.severity.critical, fontSize: 10 }}>{'\u26A0'}</span>
                    <span style={{ ...TYPE.body, color: V3.text.secondary, flex: 1 }}>
                      {t.event_title || t.event_id}
                    </span>
                    <span style={{ ...TYPE.meta, color: V3.text.muted }}>
                      {t.owner || 'unassigned'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Top regions */}
            {data.top_regions.length > 0 && (
              <div>
                <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
                  TOP REGIONS
                </div>
                {data.top_regions.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: `${V3.spacing.xs}px 0`,
                  }}>
                    <span style={{ ...TYPE.body, color: V3.text.secondary }}>{r.region}</span>
                    <span style={{ ...TYPE.mono, fontFamily: V3_FONT_MONO, color: V3.text.muted, fontSize: 11 }}>{r.event_count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
