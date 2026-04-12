import { useState, useMemo, useCallback } from 'react';
import type { WeeklySummary, ScanItem } from '../types';
import { SEV, FM, F } from '../data';
import { S, T, B, ACCENT, TYP } from '../tokens';
import { getRegion, getEvent, getSev } from '../utils/scan';

interface WeeklyBriefTabProps {
  weeklySummary: WeeklySummary | null;
  weeklyLoading: boolean;
  /** Embedded mode renders a simpler variant for mobile bottom sheet */
  embedded?: boolean;
}

export function WeeklyBriefTab({ weeklySummary, weeklyLoading, embedded = false }: WeeklyBriefTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  // Build weekly brief plain text for copy
  const weeklyBriefText = useMemo(() => {
    if (!weeklySummary) return '';
    const lines: string[] = [
      `SC Hub Weekly Brief -- ${weeklySummary.period.from} to ${weeklySummary.period.to}`,
      '',
      weeklySummary.headline,
      '',
      'Severity Snapshot:',
      ...Object.entries(weeklySummary.severity_snapshot)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `  ${k}: ${v}`),
      '',
    ];
    if (weeklySummary.new_events.length > 0) {
      lines.push('New This Week:');
      weeklySummary.new_events.forEach(e => {
        const title = getEvent(e);
        const sev = getSev(e);
        lines.push(`  [${sev}] ${title}`);
      });
      lines.push('');
    }
    if (weeklySummary.escalated_events.length > 0) {
      lines.push('Escalated:');
      weeklySummary.escalated_events.forEach(e => {
        lines.push(`  ${getEvent(e)} (${getSev(e)})`);
      });
      lines.push('');
    }
    if (weeklySummary.resolved_events.length > 0) {
      lines.push('Resolved:');
      weeklySummary.resolved_events.forEach(e => {
        lines.push(`  ${getEvent(e)}`);
      });
      lines.push('');
    }
    if (weeklySummary.overdue_tickets.length > 0) {
      lines.push(`Overdue Tickets: ${weeklySummary.overdue_tickets.length}`);
      lines.push('');
    }
    if (weeklySummary.top_regions.length > 0) {
      lines.push('Top Regions:');
      weeklySummary.top_regions.forEach(r => {
        lines.push(`  ${r.region}: ${r.event_count} events`);
      });
      lines.push('');
    }
    const d = weeklySummary.week_over_week_delta;
    lines.push(`Week-over-Week: New ${d.new}, Resolved ${d.resolved}, Active Total ${d.active_total}`);
    return lines.join('\n');
  }, [weeklySummary]);

  if (embedded) {
    return (
      <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '12px 16px', WebkitOverflowScrolling: 'touch' }}>
        {weeklyLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />
            ))}
          </div>
        )}
        {!weeklyLoading && !weeklySummary && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: T.dim }}>
            <div style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>No weekly data available</div>
          </div>
        )}
        {!weeklyLoading && weeklySummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ ...TYP.label, color: T.primary, fontFamily: FM }}>Weekly Brief</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.primary, lineHeight: 1.5 }}>
              {weeklySummary.headline}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop variant
  return (
    <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
      {weeklyLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />
          ))}
        </div>
      )}

      {!weeklyLoading && !weeklySummary && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: T.dim }}>
          <div style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>No weekly data available</div>
          <div style={{ fontSize: 9, color: B.subtle, marginTop: 4, fontFamily: FM }}>Backend may be unreachable</div>
        </div>
      )}

      {!weeklyLoading && weeklySummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Header with copy button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...TYP.label, color: T.primary, fontFamily: FM }}>Weekly Brief</span>
            <button
              onClick={() => copyToClipboard(weeklyBriefText, 'weekly-all')}
              style={{ background: S[1], border: `1px solid ${B.subtle}`, borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, fontFamily: FM, color: copiedId === 'weekly-all' ? ACCENT.green : T.tertiary, cursor: 'pointer', transition: 'color .15s' }}
            >
              {copiedId === 'weekly-all' ? 'Copied' : 'Copy Weekly Brief'}
            </button>
          </div>

          {/* Headline */}
          <div style={{ ...TYP.headline, color: T.primary }}>
            {weeklySummary.headline}
          </div>

          {/* Severity distribution bar */}
          <div>
            <div style={{ display: 'flex', gap: 2, marginBottom: 8, height: 6, borderRadius: 3, overflow: 'hidden' }}>
              {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
                const count = weeklySummary.severity_snapshot[sev] || 0;
                if (count === 0) return null;
                return <div key={sev} style={{ flex: count, background: SEV[sev], borderRadius: 3 }} />;
              })}
            </div>
            <div style={{ display: 'flex', gap: 1, borderRadius: 6, overflow: 'hidden', border: `1px solid ${B.subtle}` }}>
              {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
                const count = weeklySummary.severity_snapshot[sev] || 0;
                const color = SEV[sev];
                return (
                  <div key={sev} style={{ flex: 1, background: count > 0 ? `${color}0d` : S[2], padding: '6px 4px', textAlign: 'center', borderRight: `1px solid ${B.subtle}` }}>
                    <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 700, color: count > 0 ? color : T.ghost, lineHeight: 1.2 }}>{count}</div>
                    <div style={{ fontFamily: F, fontSize: 7, color: count > 0 ? T.muted : T.ghost, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, fontWeight: 600 }}>{sev}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Week-over-week delta */}
          <div style={{ display: 'flex', gap: 6, background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '10px 12px' }}>
            {([
              ['New', weeklySummary.week_over_week_delta.new, ACCENT.blue],
              ['Resolved', weeklySummary.week_over_week_delta.resolved, ACCENT.green],
              ['Active', weeklySummary.week_over_week_delta.active_total, ACCENT.orange],
            ] as const).map(([label, val, color]) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color: val.startsWith('+') && val !== '+0' ? color : val.startsWith('-') ? ACCENT.green : T.muted }}>{val}</div>
                <div style={{ fontSize: 7, fontFamily: FM, color: T.ghost, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, fontWeight: 600 }}>WoW {label}</div>
              </div>
            ))}
          </div>

          {/* New This Week */}
          {weeklySummary.new_events.length > 0 && (
            <WeeklySection title="New This Week" borderColor={ACCENT.blue}>
              {weeklySummary.new_events.map((e, i) => (
                <WeeklyEventCard key={i} event={e} />
              ))}
            </WeeklySection>
          )}

          {/* Escalated */}
          {weeklySummary.escalated_events.length > 0 && (
            <WeeklySection title="Escalated" borderColor={ACCENT.red} tint={`${ACCENT.red}08`}>
              {weeklySummary.escalated_events.map((e, i) => (
                <WeeklyEventCard key={i} event={e} tint="red" />
              ))}
            </WeeklySection>
          )}

          {/* Resolved */}
          {weeklySummary.resolved_events.length > 0 && (
            <WeeklySection title="Resolved" borderColor={ACCENT.green} tint={`${ACCENT.green}08`}>
              {weeklySummary.resolved_events.map((e, i) => (
                <WeeklyEventCard key={i} event={e} resolved />
              ))}
            </WeeklySection>
          )}

          {/* Overdue tickets */}
          {weeklySummary.overdue_tickets.length > 0 && (
            <div style={{ background: `${ACCENT.orange}0a`, border: `1px solid ${ACCENT.orange}33`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>!</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT.orange, fontFamily: FM }}>
                  {weeklySummary.overdue_tickets.length} Overdue Ticket{weeklySummary.overdue_tickets.length !== 1 ? 's' : ''}
                </span>
              </div>
              {weeklySummary.overdue_tickets.map((t, i) => (
                <div key={i} style={{ fontSize: 10, color: T.body, lineHeight: 1.5, paddingLeft: 18 }}>
                  {t.event_title || t.event_id} {t.owner ? `(${t.owner})` : ''} -- due {t.due_date}
                </div>
              ))}
            </div>
          )}

          {/* Top regions */}
          {weeklySummary.top_regions.length > 0 && (
            <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ ...TYP.label, color: T.ghost, fontFamily: FM, marginBottom: 8 }}>Top Regions</div>
              {weeklySummary.top_regions.slice(0, 5).map((r, i) => {
                const maxCount = weeklySummary.top_regions[0]?.event_count || 1;
                const pct = Math.round((r.event_count / maxCount) * 100);
                return (
                  <div key={i} style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.body }}>{r.region}</span>
                      <span style={{ fontSize: 9, fontFamily: FM, color: T.tertiary, fontWeight: 600 }}>{r.event_count}</span>
                    </div>
                    <div style={{ height: 3, background: S[2], borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ACCENT.blueFactory, borderRadius: 2, opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty week */}
          {weeklySummary.new_events.length === 0 && weeklySummary.escalated_events.length === 0 && weeklySummary.resolved_events.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 16px', color: T.muted }}>
              <div style={{ fontSize: 10, fontFamily: FM, fontWeight: 600 }}>Quiet week -- no new activity</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components for Weekly Brief ──

function WeeklySection({ title, borderColor, tint, children }: { title: string; borderColor: string; tint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: tint || S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ ...TYP.label, color: borderColor, fontFamily: FM, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function WeeklyEventCard({ event, resolved, tint }: { event: ScanItem; resolved?: boolean; tint?: string }) {
  const title = getEvent(event);
  const sev = getSev(event);
  const region = getRegion(event);
  const sevColor = SEV[sev];
  const bgTint = tint === 'red' ? `${ACCENT.red}06` : resolved ? `${ACCENT.green}06` : 'transparent';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '6px 8px',
      borderRadius: 6,
      background: bgTint,
      borderLeft: `3px solid ${sevColor}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: resolved ? T.muted : T.body,
          lineHeight: 1.4,
          textDecoration: resolved ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 9, color: T.ghost, fontFamily: FM, marginTop: 2 }}>
          {region}
        </div>
      </div>
      <div style={{
        fontSize: 8,
        fontWeight: 700,
        fontFamily: FM,
        color: sevColor,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flexShrink: 0,
        marginTop: 2,
      }}>
        {sev}
      </div>
    </div>
  );
}
