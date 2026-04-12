/**
 * EventDetail — Expanded view within a card. Three tabs: Overview | Impact | Briefing.
 * Full feature parity with v1 ExpandedCard, reskinned for v2 theme.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { ScanItem, Severity, ImpactResult, SupplierAlternativesResponse } from '../../types';
import { fetchSupplierAlternatives, saveNarrativeEdit, fetchNarrative, type BackendRecommendation, type NarrativeResponse } from '../../services/api';
import { ROUTES, SUPPLY_GRAPH, SUPPLIERS } from '../../data';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import { computeImpactWithGraph } from '../../utils/impact';
import { getSev } from '../../utils/scan';
import { eventId } from '../../utils/format';
import { EventActions } from './EventActions';
import type { useDisruptionState } from '../../hooks/useDisruptionState';
import type { useFilterState } from '../../hooks/useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;

export interface EventDetailProps {
  item: ScanItem;
  mode: string;
  dis: DisruptionState;
  fil: ReturnType<typeof useFilterState>;
}

// Session-level tab memory
let _lastTab: 'overview' | 'impact' | 'briefing' = 'overview';

export function EventDetail({ item, mode, dis }: EventDetailProps) {
  const { theme } = useTheme();
  const d = item;
  const ig = mode === 'geopolitical';
  const it = mode === 'trade';

  const eid = eventId(d as { event?: string; risk?: string; region?: string });
  const backendId = (d as unknown as Record<string, unknown>).id as string | undefined;
  const recId = backendId || eid;
  const rec = dis.recs[recId];
  const sv = getSev(d);

  const impact = useMemo(() => computeImpactWithGraph(d, ROUTES, SUPPLY_GRAPH), [d]);

  const [activeTab, setActiveTab] = useState<'overview' | 'impact' | 'briefing'>(_lastTab);
  const handleTabChange = (tab: 'overview' | 'impact' | 'briefing') => { _lastTab = tab; setActiveTab(tab); };

  // Supplier alternatives
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

  const impactSiteCount = useMemo(() => {
    if (rec?.impact) return rec.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length;
    if (impact) return impact.factories.length;
    return 0;
  }, [rec, impact]);

  const sevColor = theme.severity[sv.toLowerCase() as keyof typeof theme.severity] || theme.text.tertiary;

  const tabs: Array<{ key: 'overview' | 'impact' | 'briefing'; label: string; badge?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'impact', label: 'Impact', badge: impactSiteCount > 0 ? impactSiteCount : undefined },
    { key: 'briefing', label: 'Briefing' },
  ];

  // Section card style
  const sectionStyle: React.CSSProperties = {
    background: theme.bg.secondary, borderRadius: V2_BR.md,
    padding: V2_SP.md, marginBottom: V2_SP.sm,
    border: `1px solid ${theme.border.subtle}`,
  };

  const sectionHeaderStyle: React.CSSProperties = {
    ...V2_TYP.label, color: theme.text.muted, marginBottom: V2_SP.sm,
    display: 'flex', alignItems: 'center', gap: V2_SP.xs,
  };

  return (
    <div style={{ marginTop: V2_SP.md }} onClick={(e) => e.stopPropagation()}>
      {/* Quick Actions */}
      <EventActions item={d} mode={mode} dis={dis} eventId={eid} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: V2_SP.xs, marginTop: V2_SP.md, marginBottom: V2_SP.md }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              aria-label={`${tab.label} tab`}
              aria-selected={isActive}
              role="tab"
              onClick={(e) => { e.stopPropagation(); handleTabChange(tab.key); }}
              style={{
                background: isActive ? theme.accent.blue + '18' : 'transparent',
                color: isActive ? theme.accent.blue : theme.text.muted,
                border: `1px solid ${isActive ? theme.accent.blue + '44' : theme.border.subtle}`,
                borderRadius: V2_BR.full, padding: `${V2_SP.xs}px ${V2_SP.md}px`,
                ...V2_TYP.label, cursor: 'pointer',
                transition: 'all 200ms ease',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; (e.currentTarget as HTMLElement).style.color = theme.text.secondary; } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.muted; } }}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span style={{
                  ...V2_TYP.monoSm, fontSize: 9,
                  background: isActive ? theme.accent.blue : theme.bg.elevated,
                  color: isActive ? '#fff' : theme.text.muted,
                  padding: '1px 5px', borderRadius: V2_BR.full,
                  minWidth: 16, textAlign: 'center', lineHeight: '14px',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div>
          {/* Severity score */}
          {('computed_severity' in d) && (d as unknown as Record<string, unknown>).computed_severity && (() => {
            const cs = (d as unknown as Record<string, unknown>).computed_severity as {
              score: number; label: string; components: Record<string, number>;
              probability?: number; impact_magnitude?: number; velocity?: string; recovery_estimate?: string;
            };
            const scoreColor = cs.score >= 75 ? theme.severity.critical : cs.score >= 50 ? theme.severity.high : cs.score >= 25 ? theme.severity.medium : theme.severity.low;
            const hasDimensions = cs.probability !== undefined || cs.velocity !== undefined;

            const dimBadge = (label: string, value: string, color: string) => (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: color + '12', color, padding: '3px 8px',
                borderRadius: V2_BR.sm, ...V2_TYP.monoSm,
                border: `1px solid ${color}22`,
              }}>
                <span style={{ color: theme.text.muted, fontWeight: 500 }}>{label}:</span> {value}
              </span>
            );

            return (
              <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm, marginBottom: hasDimensions ? V2_SP.sm : 0 }}>
                  <div style={{
                    ...V2_TYP.hero, fontSize: 32, color: scoreColor as string,
                    fontFamily: V2_FONT_MONO, lineHeight: 1,
                  }}>
                    {Math.round(cs.score)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...V2_TYP.bodySm, color: theme.text.muted, marginBottom: 4 }}>
                      AI: {sv} | Algorithm: {Math.round(cs.score)}/100
                    </div>
                    <div style={{ height: 6, background: theme.bg.tertiary, borderRadius: V2_BR.sm, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, cs.score)}%`, height: '100%', background: scoreColor as string, borderRadius: V2_BR.sm, transition: 'width 300ms ease' }} />
                    </div>
                  </div>
                </div>
                {hasDimensions && (
                  <div style={{ display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', marginTop: V2_SP.xs }}>
                    {cs.probability !== undefined && dimBadge('Prob', cs.probability >= 0.7 ? 'High' : cs.probability >= 0.4 ? 'Medium' : 'Low', cs.probability >= 0.7 ? theme.severity.critical : cs.probability >= 0.4 ? theme.severity.medium : theme.severity.low)}
                    {cs.impact_magnitude !== undefined && dimBadge('Impact', cs.impact_magnitude >= 0.7 ? 'Critical' : cs.impact_magnitude >= 0.4 ? 'Significant' : 'Moderate', cs.impact_magnitude >= 0.7 ? theme.severity.critical : cs.impact_magnitude >= 0.4 ? theme.severity.medium : theme.severity.low)}
                    {cs.velocity && cs.velocity !== 'unknown' && dimBadge('Velocity', cs.velocity, cs.velocity === 'immediate' ? theme.severity.critical : cs.velocity === 'days' ? theme.severity.high : theme.severity.medium)}
                    {cs.recovery_estimate && cs.recovery_estimate !== 'unknown' && dimBadge('Recovery', cs.recovery_estimate, cs.recovery_estimate === 'months' ? theme.severity.critical : cs.recovery_estimate === 'weeks' ? theme.severity.high : theme.severity.medium)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Impact Summary Strip */}
          {(() => {
            const mfgCount = rec?.impact ? rec.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length : impact.factories.length;
            const supCount = rec?.impact ? rec.impact.affected_suppliers.count : SUPPLIERS.filter(s => impact.suppliers.includes(s.country)).reduce((sum, s) => sum + s.n, 0);
            if (!mfgCount && !supCount) return null;
            return (
              <div style={{ display: 'flex', gap: 2, marginBottom: V2_SP.sm, borderRadius: V2_BR.md, overflow: 'hidden', border: `1px solid ${sevColor}22` }}>
                {[
                  { label: 'MFG Sites', value: mfgCount, icon: '\uD83C\uDFED' },
                  { label: 'Suppliers', value: supCount, icon: '\uD83D\uDCE6' },
                ].map((m, mi) => (
                  <div key={mi} style={{
                    flex: 1, background: `${sevColor}08`, padding: `${V2_SP.sm}px ${V2_SP.xs}px`,
                    textAlign: 'center', borderRight: mi === 0 ? `1px solid ${sevColor}22` : 'none',
                  }}>
                    <div style={{ ...V2_TYP.mono, fontSize: 16, color: sevColor, lineHeight: 1.2 }}>{m.icon} {m.value}</div>
                    <div style={{ ...V2_TYP.label, fontSize: 8, color: theme.text.muted, marginTop: 3 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Description */}
          {!ig && 'description' in d && (
            <p style={{ ...V2_TYP.body, color: theme.text.secondary, margin: `0 0 ${V2_SP.sm}px`, lineHeight: 1.6 }}>
              {d.description as string}
            </p>
          )}

          {/* Geopolitical "This Week" */}
          {ig && 'this_week' in d && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ fontSize: 12 }}>{'\uD83D\uDCC5'}</span>
                <span>This Week</span>
              </div>
              <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>{(d as { this_week: string }).this_week}</div>
            </div>
          )}

          {/* SKF Exposure / Relevance / Cost Impact */}
          {(() => {
            const aiSrc = it ? ('skf_cost_impact' in d ? d.skf_cost_impact : '') as string
              : ig ? ('skf_relevance' in d ? d.skf_relevance : '') as string
              : ('skf_exposure' in d ? d.skf_exposure : '') as string;
            const label = it ? 'SKF Cost Impact' : ig ? 'SKF Relevance' : 'SKF Exposure';
            return (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span style={{ fontSize: 12 }}>{it ? '\uD83D\uDCB0' : '\uD83C\uDFED'}</span>
                  <span>{label}</span>
                  <span style={{ ...V2_TYP.caption, color: theme.text.muted, marginLeft: 'auto', fontStyle: 'italic', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>AI-generated</span>
                </div>
                <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>{aiSrc}</div>
              </div>
            );
          })()}

          {/* Recommended Actions / Watchpoint */}
          {(() => {
            const label = ig ? 'Watchpoint' : 'Recommended Actions';
            const priorityColors = [theme.severity.critical, theme.severity.high, theme.accent.blue, theme.severity.low, theme.accent.purple];
            const urgencyColors: Record<string, string> = { immediate: theme.severity.critical, '24h': theme.severity.high, '48h': theme.severity.high, '1w': theme.accent.blue, '1m': theme.severity.low, '3m': theme.accent.purple, ongoing: theme.text.tertiary, contingent: theme.text.secondary };

            if (rec?.actions?.length) {
              return (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <span style={{ fontSize: 12 }}>{'\u26A1'}</span>
                    <span>{label}</span>
                    <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.accent.green, marginLeft: 'auto' }}>Backend</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
                    {rec.actions.map((act: { priority: number; action: string; owner: string; urgency: string }, si: number) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: V2_SP.sm }}>
                        <div style={{
                          minWidth: 22, height: 22, borderRadius: 11,
                          background: (priorityColors[si] || theme.text.tertiary) + '18',
                          border: `1.5px solid ${priorityColors[si] || theme.text.tertiary}44`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          ...V2_TYP.monoSm, color: priorityColors[si] || theme.text.tertiary, flexShrink: 0, marginTop: 1,
                        }}>
                          {act.priority}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>{act.action}</div>
                          <div style={{ display: 'flex', gap: V2_SP.xs, marginTop: 3 }}>
                            <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.text.muted, background: theme.bg.tertiary, padding: '2px 6px', borderRadius: V2_BR.sm }}>{act.owner}</span>
                            <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: urgencyColors[act.urgency] || theme.text.tertiary, background: (urgencyColors[act.urgency] || theme.text.tertiary) + '18', padding: '2px 6px', borderRadius: V2_BR.sm, border: `1px solid ${urgencyColors[act.urgency] || theme.text.tertiary}22` }}>{act.urgency}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            const rawSrc = ig ? ('watchpoint' in d ? d.watchpoint : '') as string : ('recommended_action' in d ? d.recommended_action : '') as string;
            const steps = rawSrc ? rawSrc.split(/;\s*|(?<=\.)\s+(?=[A-Z])|\d+\.\s*/).map(s => s.trim().replace(/\.$/, '')).filter(s => s.length > 5) : [];

            return (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span style={{ fontSize: 12 }}>{'\u26A1'}</span>
                  <span>{label}</span>
                </div>
                {steps.length > 1 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
                    {steps.map((step, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: V2_SP.sm }}>
                        <div style={{
                          minWidth: 22, height: 22, borderRadius: 11,
                          background: (priorityColors[si] || theme.text.tertiary) + '18',
                          border: `1.5px solid ${priorityColors[si] || theme.text.tertiary}44`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          ...V2_TYP.monoSm, color: priorityColors[si] || theme.text.tertiary, flexShrink: 0, marginTop: 1,
                        }}>
                          {si + 1}
                        </div>
                        <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>{step}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>{rawSrc}</div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ===== IMPACT TAB ===== */}
      {activeTab === 'impact' && (
        <div>
          {/* Impact Chain */}
          {(() => {
            if (!impact.corridors.length && !impact.factories.length && !impact.suppliers.length) {
              return (
                <div style={{ ...sectionStyle, textAlign: 'center' }}>
                  <span style={{ ...V2_TYP.caption, color: theme.text.muted, fontStyle: 'italic' }}>No impact chain data available for this event</span>
                </div>
              );
            }
            const region = ('region' in d ? d.region : 'Global') as string;
            const chainSteps = [
              { label: 'Disruption Region', items: [region], color: theme.severity.critical, icon: '\uD83C\uDF0D' },
              { label: 'Affected Corridors', items: impact.corridors, color: theme.severity.high, icon: '\uD83D\uDEA2' },
              { label: 'Exposed Factories', items: impact.factories, color: theme.accent.blue, icon: '\uD83C\uDFED' },
              { label: 'Upstream Suppliers', items: impact.suppliers.slice(0, 6), color: theme.accent.purple, icon: '\uD83D\uDCE6' },
            ].filter(s => s.items.length > 0);

            return (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span style={{ fontSize: 12 }}>{'\uD83D\uDD17'}</span>
                  <span>Impact Chain</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {chainSteps.map((step, si) => (
                    <div key={si}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: V2_SP.sm }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 24 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 12,
                            background: step.color + '18', border: `1.5px solid ${step.color}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                          }}>
                            {step.icon}
                          </div>
                          {si < chainSteps.length - 1 && (
                            <div style={{ width: 2, height: 20, background: step.color, opacity: 0.3, marginTop: 3, marginBottom: 3 }} />
                          )}
                        </div>
                        <div style={{ flex: 1, paddingTop: 2 }}>
                          <div style={{ ...V2_TYP.label, color: step.color, marginBottom: V2_SP.xs }}>{step.label}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: V2_SP.xs, marginBottom: si < chainSteps.length - 1 ? V2_SP.xs : 0 }}>
                            {step.items.map((item, ii) => (
                              <span key={ii} style={{
                                background: step.color + '18', color: step.color,
                                padding: '3px 8px', borderRadius: V2_BR.sm,
                                ...V2_TYP.monoSm, border: `1px solid ${step.color}22`,
                              }}>
                                {item}
                              </span>
                            ))}
                            {step.label === 'Upstream Suppliers' && impact.suppliers.length > 6 && (
                              <span style={{ ...V2_TYP.caption, color: theme.text.muted, padding: '3px 6px' }}>
                                +{impact.suppliers.length - 6} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Supplier Alternatives */}
          {(altLoading || altData) && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ fontSize: 12 }}>{'\u26A1'}</span>
                <span>Backup Regions</span>
                {altData && <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.text.muted, marginLeft: 'auto' }}>{altData.alternatives.length} options</span>}
              </div>
              {altLoading && !altData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ height: 28, borderRadius: V2_BR.sm, background: theme.bg.tertiary, animation: 'v2pulse 1.5s ease-in-out infinite', animationDelay: `${i * 100}ms` }} />
                  ))}
                </div>
              )}
              {altData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
                  {altData.alternatives.slice(0, 5).map((alt, ai) => {
                    const overlapColor = alt.overlap_pct >= 70 ? theme.severity.low : alt.overlap_pct >= 40 ? theme.severity.medium : theme.severity.critical;
                    return (
                      <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm }}>
                        <span style={{ ...V2_TYP.bodySm, fontWeight: 600, color: theme.text.primary, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.country}</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm }}>
                            <span style={{ ...V2_TYP.monoSm, color: theme.text.secondary }}>{alt.supplier_count} suppliers</span>
                            <span style={{ ...V2_TYP.monoSm, color: overlapColor, fontWeight: 700 }}>{Math.round(alt.overlap_pct)}%</span>
                          </div>
                          <div style={{ height: 4, background: theme.bg.tertiary, borderRadius: V2_BR.sm, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, alt.overlap_pct)}%`, height: '100%', background: overlapColor, borderRadius: V2_BR.sm, transition: 'width 300ms ease' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Confidence & Sources */}
          {rec && (rec.confidence || rec.sources?.length > 0) && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ fontSize: 12 }}>{'\uD83C\uDFAF'}</span>
                <span>Confidence & Sources</span>
              </div>
              {rec.confidence && (() => {
                const confPct = Math.round(rec.confidence * 100);
                const confColor = confPct >= 90 ? theme.severity.low : confPct >= 70 ? theme.severity.medium : theme.severity.critical;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm, marginBottom: rec.sources?.length ? V2_SP.sm : 0 }}>
                    <div style={{ flex: 1, height: 5, background: theme.bg.tertiary, borderRadius: V2_BR.sm, overflow: 'hidden' }}>
                      <div style={{ width: `${confPct}%`, height: '100%', background: confColor, borderRadius: V2_BR.sm, transition: 'width 300ms ease' }} />
                    </div>
                    <span style={{ ...V2_TYP.mono, fontWeight: 700, color: confColor }}>{confPct}%</span>
                  </div>
                );
              })()}
              {rec.sources?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: V2_SP.xs }}>
                  {rec.sources.map((src: string, si: number) => (
                    <span key={si} style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.text.tertiary, background: theme.bg.tertiary, padding: '3px 8px', borderRadius: V2_BR.sm, border: `1px solid ${theme.border.subtle}` }}>
                      {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== BRIEFING TAB ===== */}
      {activeTab === 'briefing' && <BriefingTab d={d} dis={dis} recId={recId} backendId={backendId} />}

      {/* Duplicate warning */}
      {('possible_duplicate_of' in d) && (d as unknown as Record<string, unknown>).possible_duplicate_of && (
        <div style={{
          background: theme.severity.highBg, border: `1px solid ${theme.severity.high}33`,
          borderRadius: V2_BR.md, padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
          marginTop: V2_SP.sm, display: 'flex', alignItems: 'center', gap: V2_SP.sm,
        }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{'\u26A0'}</span>
          <span style={{ ...V2_TYP.bodySm, color: theme.severity.high }}>
            Possible duplicate of: <strong>{String((d as unknown as Record<string, unknown>).possible_duplicate_of)}</strong>
          </span>
        </div>
      )}

    </div>
  );
}

// ── Briefing Tab ──

function BriefingTab({ d, dis, recId, backendId }: {
  d: ScanItem;
  dis: DisruptionState;
  recId: string;
  backendId: string | undefined;
}) {
  const { theme } = useTheme();
  const [narrativeEditing, setNarrativeEditing] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [narrativeSaving, setNarrativeSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const narrative = dis.narratives[recId];
  const isLoading = dis.narrativeLoading === recId;
  const isEdited = narrative?.generated_by === 'user-edited';

  const sectionStyle: React.CSSProperties = {
    background: theme.bg.secondary, borderRadius: V2_BR.md,
    padding: V2_SP.md, border: `1px solid ${narrativeEditing ? theme.accent.blue + '44' : theme.border.subtle}`,
  };

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.xs, marginBottom: narrative ? V2_SP.sm : 0 }}>
        <span style={{ fontSize: 12 }}>{'\uD83D\uDCDD'}</span>
        <span style={{ ...V2_TYP.label, color: theme.text.muted }}>Executive Briefing</span>
        {isEdited && !narrativeEditing && (
          <span style={{ ...V2_TYP.monoSm, fontSize: 9, color: theme.accent.blue, background: theme.accent.blue + '18', padding: '2px 6px', borderRadius: V2_BR.sm, border: `1px solid ${theme.accent.blue}33` }}>Edited</span>
        )}
        <div style={{ flex: 1 }} />

        {/* Edit / Save / Cancel buttons */}
        {narrative && !narrativeEditing && !isLoading && (
          <button
            onClick={(e) => { e.stopPropagation(); setNarrativeDraft(narrative.narrative); setNarrativeEditing(true); }}
            style={{
              background: theme.accent.blue + '18', color: theme.accent.blue,
              border: `1px solid ${theme.accent.blue}44`, borderRadius: V2_BR.sm,
              padding: '4px 10px', ...V2_TYP.monoSm, cursor: 'pointer',
            }}
          >
            Edit
          </button>
        )}
        {narrativeEditing && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setNarrativeEditing(false); setNarrativeDraft(''); }}
              style={{
                background: 'transparent', color: theme.text.secondary,
                border: `1px solid ${theme.border.default}`, borderRadius: V2_BR.sm,
                padding: '4px 10px', ...V2_TYP.monoSm, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              disabled={narrativeSaving}
              onClick={async (e) => {
                e.stopPropagation();
                if (!narrativeDraft.trim()) return;
                setNarrativeSaving(true);
                const ok = await saveNarrativeEdit(recId, narrativeDraft);
                setNarrativeSaving(false);
                if (ok) {
                  dis.setNarratives((prev: Record<string, NarrativeResponse>) => ({
                    ...prev, [recId]: { ...prev[recId], narrative: narrativeDraft, generated_by: 'user-edited', generated_at: new Date().toISOString() },
                  }));
                  setNarrativeEditing(false);
                  setNarrativeDraft('');
                }
              }}
              style={{
                background: narrativeSaving ? theme.accent.green + '12' : theme.accent.green + '18',
                color: theme.accent.green,
                border: `1px solid ${theme.accent.green}44`, borderRadius: V2_BR.sm,
                padding: '4px 10px', ...V2_TYP.monoSm,
                cursor: narrativeSaving ? 'wait' : 'pointer',
                opacity: narrativeSaving ? 0.6 : 1,
              }}
            >
              {narrativeSaving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
        {!narrative && !isLoading && backendId && (
          <button
            onClick={(e) => { e.stopPropagation(); dis.loadNarrative(recId); }}
            style={{
              background: theme.accent.blue + '18', color: theme.accent.blue,
              border: `1px solid ${theme.accent.blue}44`, borderRadius: V2_BR.sm,
              padding: '4px 10px', ...V2_TYP.monoSm, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {'\u2728'} Generate Briefing
          </button>
        )}
        {narrative && !narrativeEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(narrative.narrative).then(() => {
                setCopiedId(recId);
                setTimeout(() => setCopiedId(null), 1500);
              }).catch(() => {});
            }}
            style={{
              background: copiedId === recId ? theme.accent.green + '18' : 'transparent',
              color: copiedId === recId ? theme.accent.green : theme.accent.blue,
              border: `1px solid ${copiedId === recId ? theme.accent.green + '44' : theme.accent.blue + '44'}`,
              borderRadius: V2_BR.sm, padding: '4px 10px', ...V2_TYP.monoSm, cursor: 'pointer',
            }}
          >
            {copiedId === recId ? 'Copied!' : 'Copy'}
          </button>
        )}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.xs, ...V2_TYP.monoSm, color: theme.text.muted }}>
            <span style={{
              width: 12, height: 12,
              border: `2px solid ${theme.accent.blue}33`, borderTop: `2px solid ${theme.accent.blue}`,
              borderRadius: '50%', display: 'inline-block', animation: 'v2spin 1s linear infinite',
            }} />
            Generating...
          </div>
        )}
      </div>

      {/* Editing textarea */}
      {narrative && narrativeEditing && (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            value={narrativeDraft}
            onChange={(e) => setNarrativeDraft(e.target.value)}
            aria-label="Edit executive briefing"
            style={{
              width: '100%', minHeight: 200, maxHeight: 400,
              background: theme.bg.tertiary, color: theme.text.secondary,
              border: `1px solid ${theme.accent.blue}44`,
              borderRadius: V2_BR.sm, padding: V2_SP.sm,
              ...V2_TYP.body, resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
          <div style={{ ...V2_TYP.caption, color: theme.text.muted, marginTop: V2_SP.xs, fontStyle: 'italic' }}>
            Edit the briefing text above. Your changes will be saved and used instead of AI-generated content.
          </div>
        </div>
      )}

      {/* Read-only narrative */}
      {narrative && !narrativeEditing && (
        <div style={{ ...V2_TYP.body, color: theme.text.secondary }}>
          {narrative.narrative.split(/\n/).map((line, li) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const headerMatch = trimmed.match(/^(SITUATION|EXPOSURE|RECOMMENDED ACTIONS|OUTLOOK|IMPACT|RISK|TIMELINE|RECOVERY|ACTIONS?):?\s*$/i);
            if (headerMatch) {
              const hc: Record<string, string> = { SITUATION: theme.severity.critical, EXPOSURE: theme.severity.high, 'RECOMMENDED ACTIONS': theme.severity.low, ACTIONS: theme.severity.low, OUTLOOK: theme.accent.blue, IMPACT: theme.severity.high, RISK: theme.severity.critical, TIMELINE: theme.accent.blue, RECOVERY: theme.severity.low };
              return <div key={li} style={{ ...V2_TYP.label, color: hc[headerMatch[1].toUpperCase()] || theme.text.secondary, marginTop: li > 0 ? V2_SP.md : 0, marginBottom: V2_SP.xs }}>{headerMatch[1]}</div>;
            }
            if (trimmed.startsWith('\u2022') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
              const text = trimmed.replace(/^[\u2022\-*]\s*/, '');
              const parts = text.split(/(\*\*[^*]+\*\*)/g);
              return (
                <div key={li} style={{ display: 'flex', gap: V2_SP.sm, marginBottom: 4, color: theme.text.secondary }}>
                  <span style={{ color: theme.text.muted, flexShrink: 0, fontSize: 10, marginTop: 3 }}>{'\u2022'}</span>
                  <span>{parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: theme.text.primary, fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}</span>
                </div>
              );
            }
            const parts = trimmed.replace(/^\*\*|\*\*$/g, '').split(/(\*\*[^*]+\*\*)/g);
            return (
              <div key={li} style={{ color: theme.text.secondary, marginBottom: 3 }}>
                {parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: theme.text.primary, fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}
              </div>
            );
          })}
          <div style={{ ...V2_TYP.caption, color: theme.text.muted, marginTop: V2_SP.sm, fontStyle: 'italic' }}>
            {isEdited ? 'Edited' : 'Generated'} {narrative.generated_at ? new Date(narrative.generated_at).toLocaleString() : 'just now'}
            {isEdited && ' (user-modified)'}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!narrative && !isLoading && (
        <div style={{ ...V2_TYP.caption, color: theme.text.muted, fontStyle: 'italic', marginTop: V2_SP.xs }}>
          {backendId ? 'AI-generated executive summary for stakeholder briefings' : 'Connect to backend to enable AI briefing generation'}
        </div>
      )}

    </div>
  );
}
