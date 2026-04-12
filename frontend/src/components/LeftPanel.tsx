import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Severity, WeeklySummary, ScanItem } from '../types';
import { SEV, FM, F, SITES } from '../data';
import { S, T, B, ACCENT } from '../tokens';
import { getRegion, getEvent, getTrend, getSev } from '../utils/scan';
import { fetchWeeklySummary } from '../services/api';
import type { useDisruptionState } from '../hooks/useDisruptionState';

type DisruptionState = ReturnType<typeof useDisruptionState>;

type TabId = 'talking-points' | 'weekly-brief';

interface LeftPanelProps {
  dis: DisruptionState;
  open: boolean;
  onToggle: () => void;
}

export function LeftPanel({ dis, open, onToggle }: LeftPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('talking-points');
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Fetch weekly summary when tab is selected
  useEffect(() => {
    if (activeTab !== 'weekly-brief') return;
    if (weeklySummary) return; // already loaded
    setWeeklyLoading(true);
    fetchWeeklySummary(7).then(data => {
      setWeeklySummary(data);
      setWeeklyLoading(false);
    });
  }, [activeTab, weeklySummary]);

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
          o[r] = 0;
        }
      }
    });
    return o;
  }, [dis.items]);

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

  const modeLabel = dis.mode === 'trade' ? 'trade policy events' : dis.mode === 'geopolitical' ? 'geopolitical risks' : 'disruptions';

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

  return (
    <div
      className="sc-left-panel"
      style={{
        width: open ? 360 : 32,
        minWidth: open ? 360 : 32,
        height: '100%',
        background: S[0],
        borderRight: `1px solid ${B.subtle}`,
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 280ms cubic-bezier(.16,1,.3,1), min-width 280ms cubic-bezier(.16,1,.3,1)',
      }}
    >
      {/* Panel content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transition: 'opacity 200ms ease',
        pointerEvents: open ? 'auto' : 'none',
        minWidth: 328,
      }}>
        {/* Header with tab toggle */}
        <div style={{ padding: '14px 16px 0', borderBottom: `1px solid ${B.subtle}`, flexShrink: 0 }}>
          {/* Tab toggle row */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: S[2], borderRadius: 6, padding: 2 }}>
            {([['talking-points', 'Talking Points'], ['weekly-brief', 'Weekly Brief']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: FM,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all .15s',
                  background: activeTab === id ? S[0] : 'transparent',
                  color: activeTab === id ? T.primary : T.muted,
                  boxShadow: activeTab === id ? `0 1px 3px ${S.base}` : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab === 'talking-points' && dis.sTime && (
            <div style={{ fontSize: 9, color: T.ghost, fontFamily: FM, paddingBottom: 10 }}>
              Scanned {dis.sTime.toLocaleTimeString()} {'\u00b7'} {dis.sTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
          )}
          {activeTab === 'weekly-brief' && weeklySummary && (
            <div style={{ fontSize: 9, color: T.ghost, fontFamily: FM, paddingBottom: 10 }}>
              {weeklySummary.period.from} to {weeklySummary.period.to}
            </div>
          )}
        </div>

        {/* ── Talking Points tab ── */}
        {activeTab === 'talking-points' && (
          <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            {execBrief && (() => {
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

              const bullets: { text: string; borderColor: string; label: string; items?: string[] }[] = [
                { text: headlineLine, borderColor: worstColor, label: 'HEADLINE' },
              ];
              if (exposureLine) bullets.push({ text: exposureLine, borderColor: ACCENT.blueFactory, label: 'EXPOSURE' });
              if (execBrief.escalating.length > 0) bullets.push({ text: escalatingLine, borderColor: ACCENT.red, label: 'ESCALATING', items: execBrief.escalating });
              if (execBrief.actions.length > 0) bullets.push({ text: actionLine, borderColor: ACCENT.green, label: 'ACTION', items: execBrief.actions });

              return (
                <div>
                  {/* Brief header with copy */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FM }}>Executive Summary</span>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(fullBriefText); setCopiedId('brief-all'); setTimeout(() => setCopiedId(null), 1500); }}
                      style={{ background: S[1], border: `1px solid ${B.subtle}`, borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, fontFamily: FM, color: copiedId === 'brief-all' ? ACCENT.green : T.tertiary, cursor: 'pointer', transition: 'color .15s' }}
                    >
                      {copiedId === 'brief-all' ? 'Copied' : 'Copy Brief'}
                    </button>
                  </div>

                  {/* Severity distribution bar */}
                  <div style={{ display: 'flex', gap: 2, marginBottom: 16, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                    {execBrief.sevCounts.Critical > 0 && <div style={{ flex: execBrief.sevCounts.Critical, background: SEV.Critical, borderRadius: 2 }} />}
                    {execBrief.sevCounts.High > 0 && <div style={{ flex: execBrief.sevCounts.High, background: SEV.High, borderRadius: 2 }} />}
                    {execBrief.sevCounts.Medium > 0 && <div style={{ flex: execBrief.sevCounts.Medium, background: SEV.Medium, borderRadius: 2 }} />}
                    {execBrief.sevCounts.Low > 0 && <div style={{ flex: execBrief.sevCounts.Low, background: SEV.Low, borderRadius: 2 }} />}
                  </div>

                  {/* Severity counts row */}
                  <div style={{ display: 'flex', gap: 1, marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: `1px solid ${B.subtle}` }}>
                    {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
                      const count = execBrief.sevCounts[sev] || 0;
                      if (count === 0) return null;
                      const color = SEV[sev];
                      return (
                        <div key={sev} style={{ flex: 1, background: `${color}0d`, padding: '8px 6px', textAlign: 'center', borderRight: `1px solid ${B.subtle}` }}>
                          <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color, lineHeight: 1.2 }}>{count}</div>
                          <div style={{ fontFamily: F, fontSize: 8, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2, fontWeight: 600 }}>{sev}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Talking points bullets */}
                  <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {bullets.map((b, i) => {
                        const isCopied = copiedId === 'brief-' + b.text.slice(0, 20);
                        const isListSection = (b.label === 'ESCALATING' || b.label === 'ACTION') && b.items && b.items.length > 0;
                        return (
                          <div key={i}>
                            {i > 0 && <div style={{ height: 1, background: B.subtle, margin: '6px 0', opacity: 0.5 }} />}
                            <div
                              onClick={() => copyLine(b.text)}
                              title="Click to copy"
                              style={{ borderLeft: `3px solid ${b.borderColor}`, paddingLeft: 10, paddingTop: 5, paddingBottom: 5, cursor: 'pointer', borderRadius: 2, transition: 'background .15s', background: isCopied ? `${b.borderColor}0d` : 'transparent' }}
                            >
                              <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: `${b.borderColor}88`, fontFamily: FM, marginBottom: 3 }}>{b.label}</div>
                              {i === 0 ? (
                                <div style={{ fontSize: 13, fontWeight: 700, color: worstColor, lineHeight: 1.5 }}>
                                  <span style={{ fontFamily: FM, fontWeight: 700 }}>{execBrief.total}</span>{' active ' + modeLabel + ', '}<span style={{ fontFamily: FM, fontWeight: 700, color: worstColor }}>{execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High : 0}</span>{execBrief.sevCounts.Critical > 0 ? ' critical' : execBrief.sevCounts.High > 0 ? ' high severity' : ' — none critical'}
                                </div>
                              ) : isListSection ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                                  {b.items!.map((item, ii) => (
                                    <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: T.body, lineHeight: 1.4 }}>
                                      <span style={{ color: b.borderColor, fontSize: 8, marginTop: 3, flexShrink: 0, opacity: 0.7 }}>{b.label === 'ESCALATING' ? '\u25b8' : '\u2014'}</span>
                                      <span>{item}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, fontWeight: 400, color: T.body, lineHeight: 1.5 }}>{b.text}</div>
                              )}
                              {isCopied && <div style={{ fontSize: 8, color: ACCENT.green, fontFamily: FM, marginTop: 2 }}>Copied</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Regional breakdown */}
                  {Object.keys(execBrief.regions).length > 1 && (
                    <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: T.ghost, fontFamily: FM, marginBottom: 10 }}>Regional Breakdown</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Object.entries(execBrief.regions).sort((a, b) => b[1] - a[1]).map(([region, count]) => {
                          const pct = Math.round((count / execBrief.total) * 100);
                          const siteCount = rsc[region] || 0;
                          return (
                            <div key={region}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: T.body }}>{region}</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 9, fontFamily: FM, color: T.muted }}>{siteCount} sites</span>
                                  <span style={{ fontSize: 9, fontFamily: FM, color: T.tertiary, fontWeight: 600 }}>{count} events</span>
                                </div>
                              </div>
                              <div style={{ height: 3, background: S[2], borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: ACCENT.blueFactory, borderRadius: 2, opacity: 0.6, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Empty state */}
            {!execBrief && !dis.loading && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: T.dim }}>
                <div style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>No data loaded</div>
                <div style={{ fontSize: 9, color: B.subtle, marginTop: 4, fontFamily: FM }}>Run a scan to generate talking points</div>
              </div>
            )}

            {/* Loading state */}
            {dis.loading && !dis.items && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Weekly Brief tab ── */}
        {activeTab === 'weekly-brief' && (
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
                  <span style={{ fontSize: 8, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FM }}>Weekly Brief</span>
                  <button
                    onClick={() => copyToClipboard(weeklyBriefText, 'weekly-all')}
                    style={{ background: S[1], border: `1px solid ${B.subtle}`, borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, fontFamily: FM, color: copiedId === 'weekly-all' ? ACCENT.green : T.tertiary, cursor: 'pointer', transition: 'color .15s' }}
                  >
                    {copiedId === 'weekly-all' ? 'Copied' : 'Copy Weekly Brief'}
                  </button>
                </div>

                {/* Headline */}
                <div style={{ fontSize: 13, fontWeight: 700, color: T.primary, lineHeight: 1.5 }}>
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
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: T.ghost, fontFamily: FM, marginBottom: 8 }}>Top Regions</div>
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
        )}
      </div>

      {/* Collapse/expand toggle */}
      <div
        onClick={onToggle}
        style={{
          position: 'absolute',
          top: '50%',
          right: 0,
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
          borderRadius: '0 6px 6px 0',
          background: S[1],
          border: `1px solid ${B.subtle}`,
          borderLeft: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.muted,
          fontSize: 10,
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.body; (e.currentTarget as HTMLElement).style.background = S[2]; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.muted; (e.currentTarget as HTMLElement).style.background = S[1]; }}
        >
          <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms ease', display: 'inline-block', lineHeight: 1 }}>{'\u25C0'}</span>
        </div>
      </div>

      {/* Collapsed label */}
      {!open && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 6,
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center center',
          whiteSpace: 'nowrap',
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: T.ghost,
          fontFamily: FM,
          pointerEvents: 'none',
        }}>
          {activeTab === 'talking-points' ? 'Talking Points' : 'Weekly Brief'}
        </div>
      )}
    </div>
  );
}

// ── Sub-components for Weekly Brief ──

function WeeklySection({ title, borderColor, tint, children }: { title: string; borderColor: string; tint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: tint || S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: borderColor, fontFamily: FM, marginBottom: 8 }}>{title}</div>
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
