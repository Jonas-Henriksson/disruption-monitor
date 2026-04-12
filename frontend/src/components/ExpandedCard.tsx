import { useState, useEffect, useMemo, useRef } from 'react';
import type { ScanItem, Severity, ImpactResult, SupplierAlternativesResponse } from '../types';
import { fetchSupplierAlternatives, saveNarrativeEdit } from '../services/api';
import { FM, F, SUPPLIERS } from '../data';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import { EventActions } from './EventActions';

type DisruptionState = ReturnType<typeof useDisruptionState>;

export interface ExpandedCardProps {
  d: ScanItem & { _i: number };
  dis: DisruptionState;
  impact: ImpactResult | null;
  eid: string;
  sv: Severity;
  co: string;
  reg: Record<string, unknown>;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
}

// Session-level tab memory (persists across card expansions, resets on page reload)
let _lastTab: 'overview' | 'impact' | 'briefing' = 'overview';

export function ExpandedCard({ d, dis, impact, eid, sv, co, reg, copiedId, setCopiedId }: ExpandedCardProps) {
  const ig = dis.mode === 'geopolitical';
  const it = dis.mode === 'trade';
  const priorityColors = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6'];
  const urgencyColors: Record<string, string> = { immediate: '#ef4444', '24h': '#f59e0b', '48h': '#f59e0b', '1w': '#3b82f6', '1m': '#22c55e', '3m': '#8b5cf6', ongoing: '#64748b', contingent: '#94a3b8' };
  const backendId = (d as unknown as Record<string, unknown>).id as string | undefined;
  const recId = backendId || eid;
  const rec = dis.recs[recId];

  // Tab state — remembers last selected tab per session
  const [activeTab, setActiveTab] = useState<'overview' | 'impact' | 'briefing'>(_lastTab);
  const handleTabChange = (tab: 'overview' | 'impact' | 'briefing') => { _lastTab = tab; setActiveTab(tab); };

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

  // Compute impact site count for badge on Impact tab
  const impactSiteCount = useMemo(() => {
    const hasBackendImpact = rec?.impact;
    if (hasBackendImpact) return rec.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length;
    if (impact) return impact.factories.length;
    return 0;
  }, [rec, impact]);

  // Tab definitions
  const tabs: Array<{ key: 'overview' | 'impact' | 'briefing'; label: string; badge?: number }> = [
    { key: 'overview', label: 'OVERVIEW' },
    { key: 'impact', label: 'IMPACT', badge: impactSiteCount > 0 ? impactSiteCount : undefined },
    { key: 'briefing', label: 'BRIEFING' },
  ];

  return (
    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return <button key={tab.key} onClick={(e) => { e.stopPropagation(); handleTabChange(tab.key); }} style={{
            background: isActive ? '#1e3a5c' : 'transparent',
            color: isActive ? '#60a5fa' : '#4a6080',
            border: `1px solid ${isActive ? '#2563eb44' : '#14243e'}`,
            borderRadius: 10,
            padding: '3px 10px',
            fontSize: 8,
            fontWeight: 700,
            fontFamily: FM,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            cursor: 'pointer',
            transition: 'all .15s',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {tab.label}
            {tab.badge !== undefined && <span style={{
              background: isActive ? '#2563eb' : '#1e3050',
              color: isActive ? '#fff' : '#4a6080',
              fontSize: 7,
              fontWeight: 700,
              fontFamily: FM,
              padding: '1px 4px',
              borderRadius: 6,
              minWidth: 14,
              textAlign: 'center',
              lineHeight: '12px',
            }}>{tab.badge}</span>}
          </button>;
        })}
      </div>

      {/* ===== TAB 1: OVERVIEW ===== */}
      {activeTab === 'overview' && <OverviewTab d={d} dis={dis} impact={impact} sv={sv} co={co} ig={ig} it={it} rec={rec} priorityColors={priorityColors} urgencyColors={urgencyColors} />}

      {/* ===== TAB 2: IMPACT ===== */}
      {activeTab === 'impact' && <ImpactTab d={d} impact={impact} co={co} rec={rec} altLoading={altLoading} altData={altData} />}

      {/* ===== TAB 3: BRIEFING ===== */}
      {activeTab === 'briefing' && <BriefingTab d={d} dis={dis} recId={recId} backendId={backendId} copiedId={copiedId} setCopiedId={setCopiedId} />}

      {/* ===== ACTIONS — always visible, outside tabs ===== */}
      <EventActions d={d} dis={dis} impact={impact} eid={eid} sv={sv} co={co} reg={reg} copiedId={copiedId} setCopiedId={setCopiedId} />
    </div>
  );
}

// ── Overview Tab ──

interface OverviewTabProps {
  d: ScanItem & { _i: number };
  dis: DisruptionState;
  impact: ImpactResult | null;
  sv: Severity;
  co: string;
  ig: boolean;
  it: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec: any;
  priorityColors: string[];
  urgencyColors: Record<string, string>;
}

function OverviewTab({ d, dis, impact, sv, co, ig, it, rec, priorityColors, urgencyColors }: OverviewTabProps) {
  return <>
    {/* Computed severity score badge */}
    {('computed_severity' in d) && (d as unknown as Record<string, unknown>).computed_severity && (() => {
      const cs = (d as unknown as Record<string, unknown>).computed_severity as { score: number; label: string; components: Record<string, number>; probability?: number; impact_magnitude?: number; velocity?: string; recovery_estimate?: string };
      const scoreColor = cs.score >= 75 ? '#ef4444' : cs.score >= 50 ? '#f97316' : cs.score >= 25 ? '#eab308' : '#22c55e';
      // Dimension display helpers
      const probLabel = (v: number) => v >= 0.7 ? 'High' : v >= 0.4 ? 'Medium' : 'Low';
      const probColor = (v: number) => v >= 0.7 ? '#ef4444' : v >= 0.4 ? '#f59e0b' : '#22c55e';
      const impLabel = (v: number) => v >= 0.7 ? 'Critical' : v >= 0.4 ? 'Significant' : v >= 0.15 ? 'Moderate' : 'Minor';
      const impColor = (v: number) => v >= 0.7 ? '#ef4444' : v >= 0.4 ? '#f59e0b' : v >= 0.15 ? '#eab308' : '#22c55e';
      const velColor = (v: string) => v === 'immediate' ? '#ef4444' : v === 'days' ? '#f59e0b' : v === 'weeks' ? '#eab308' : '#22c55e';
      const recColor = (v: string) => v === 'months' ? '#ef4444' : v === 'weeks' ? '#f59e0b' : v === 'days' ? '#eab308' : '#22c55e';
      const hasDimensions = cs.probability !== undefined || cs.velocity !== undefined;
      return <div style={{ marginBottom: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#060a12', borderRadius: hasDimensions ? '6px 6px 0 0' : 6, padding: '6px 10px', border: '1px solid #14243e',
          borderBottom: hasDimensions ? 'none' : '1px solid #14243e',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM, whiteSpace: 'nowrap' }}>AI: {sv}</span>
            <span style={{ color: '#1e3050', fontSize: 10 }}>{'\u007C'}</span>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: scoreColor, fontFamily: FM, whiteSpace: 'nowrap' }}>Algorithm: {Math.round(cs.score)}/100</span>
          </div>
          <div style={{ width: 80, height: 6, background: '#0d1525', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${Math.min(100, cs.score)}%`, height: '100%', background: scoreColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
        {hasDimensions && <div style={{
          display: 'flex', gap: 4, flexWrap: 'wrap',
          background: '#060a12', borderRadius: '0 0 6px 6px', padding: '5px 10px 7px', border: '1px solid #14243e', borderTop: '1px solid #0d1525',
        }}>
          {cs.probability !== undefined && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: probColor(cs.probability) + '18', color: probColor(cs.probability), padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 600, fontFamily: FM, border: `1px solid ${probColor(cs.probability)}33` }}>
            <span style={{ color: '#4a6080', fontWeight: 500 }}>Prob:</span> {probLabel(cs.probability)}
          </span>}
          {cs.impact_magnitude !== undefined && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: impColor(cs.impact_magnitude) + '18', color: impColor(cs.impact_magnitude), padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 600, fontFamily: FM, border: `1px solid ${impColor(cs.impact_magnitude)}33` }}>
            <span style={{ color: '#4a6080', fontWeight: 500 }}>Impact:</span> {impLabel(cs.impact_magnitude)}
          </span>}
          {cs.velocity && cs.velocity !== 'unknown' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: velColor(cs.velocity) + '18', color: velColor(cs.velocity), padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 600, fontFamily: FM, border: `1px solid ${velColor(cs.velocity)}33`, textTransform: 'capitalize' }}>
            <span style={{ color: '#4a6080', fontWeight: 500, textTransform: 'none' }}>Velocity:</span> {cs.velocity}
          </span>}
          {cs.recovery_estimate && cs.recovery_estimate !== 'unknown' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: recColor(cs.recovery_estimate) + '18', color: recColor(cs.recovery_estimate), padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 600, fontFamily: FM, border: `1px solid ${recColor(cs.recovery_estimate)}33`, textTransform: 'capitalize' }}>
            <span style={{ color: '#4a6080', fontWeight: 500, textTransform: 'none' }}>Recovery:</span> {cs.recovery_estimate}
          </span>}
        </div>}
      </div>;
    })()}

    {/* Impact Summary Strip */}
    {(() => {
      const hasBackendImpact = rec?.impact;
      const mfgCount = hasBackendImpact ? rec.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length : (impact ? impact.factories.length : 0);
      const supCount = hasBackendImpact ? rec.impact.affected_suppliers.count : (impact ? SUPPLIERS.filter(s => impact.suppliers.includes(s.country)).reduce((sum, s) => sum + s.n, 0) : 0);
      if (!impact && !hasBackendImpact) return null;
      const metrics = [
        { label: 'MFG Sites', value: mfgCount, icon: '\ud83c\udfed' },
        { label: 'Suppliers', value: supCount, icon: '\ud83d\udce6' },
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
  </>;
}

// ── Impact Tab ──

interface ImpactTabProps {
  d: ScanItem & { _i: number };
  impact: ImpactResult | null;
  co: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec: any;
  altLoading: boolean;
  altData: SupplierAlternativesResponse | null;
}

function ImpactTab({ d, impact, co, rec, altLoading, altData }: ImpactTabProps) {
  return <>
    {/* Impact Chain Visualization */}
    {(() => {
      if (!impact || (!impact.corridors.length && !impact.factories.length && !impact.suppliers.length)) {
        return <div style={{ background: '#060a12', borderRadius: 6, padding: '12px 10px', marginBottom: 8, border: '1px solid #14243e', textAlign: 'center' }}>
          <span style={{ fontSize: 9, color: '#2a3d5c', fontFamily: FM, fontStyle: 'italic' }}>No impact chain data available for this event</span>
        </div>;
      }
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
  </>;
}

// ── Briefing Tab ──

interface BriefingTabProps {
  d: ScanItem & { _i: number };
  dis: DisruptionState;
  recId: string;
  backendId: string | undefined;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
}

function BriefingTab({ d, dis, recId, backendId, copiedId, setCopiedId }: BriefingTabProps) {
  // Narrative editing state
  const [narrativeEditing, setNarrativeEditing] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [narrativeSaving, setNarrativeSaving] = useState(false);

  return <>
    {/* Narrative Briefing — editable */}
    {(() => {
      const narrative = dis.narratives[recId];
      const isLoading = dis.narrativeLoading === recId;
      const isEdited = narrative?.generated_by === 'user-edited';
      return <div style={{ background: '#060a12', borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: `1px solid ${narrativeEditing ? '#2563eb44' : '#14243e'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: narrative ? 8 : 0 }}>
          <span style={{ fontSize: 10 }}>{'\ud83d\udcdd'}</span>
          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Executive Briefing</span>
          {isEdited && !narrativeEditing && <span style={{ background: '#2563eb22', color: '#60a5fa', padding: '1px 6px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: FM, letterSpacing: 0.5, border: '1px solid #2563eb33' }}>Edited</span>}
          <div style={{ flex: 1 }} />
          {/* Edit / Save / Cancel buttons */}
          {narrative && !narrativeEditing && !isLoading && <button
            onClick={(e) => {
              e.stopPropagation();
              setNarrativeDraft(narrative.narrative);
              setNarrativeEditing(true);
            }}
            style={{
              background: '#1e3a5c', color: '#60a5fa', border: '1px solid #2563eb44',
              borderRadius: 4, padding: '3px 8px', fontSize: 9, fontWeight: 600,
              cursor: 'pointer', fontFamily: FM,
            }}
          >
            Edit
          </button>}
          {narrativeEditing && <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNarrativeEditing(false);
                setNarrativeDraft('');
              }}
              style={{
                background: '#0d1525', color: '#94a3b8', border: '1px solid #1e3050',
                borderRadius: 4, padding: '3px 8px', fontSize: 9, fontWeight: 600,
                cursor: 'pointer', fontFamily: FM,
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
                  // Update the local narratives cache with the edited version
                  dis.setNarratives((prev: Record<string, typeof narrative>) => ({
                    ...prev,
                    [recId]: { ...prev[recId], narrative: narrativeDraft, generated_by: 'user-edited', generated_at: new Date().toISOString() },
                  }));
                  setNarrativeEditing(false);
                  setNarrativeDraft('');
                }
              }}
              style={{
                background: narrativeSaving ? '#16533022' : '#165530', color: '#22c55e',
                border: '1px solid #22c55e44',
                borderRadius: 4, padding: '3px 8px', fontSize: 9, fontWeight: 600,
                cursor: narrativeSaving ? 'wait' : 'pointer', fontFamily: FM,
                opacity: narrativeSaving ? 0.6 : 1,
              }}
            >
              {narrativeSaving ? 'Saving...' : 'Save'}
            </button>
          </>}
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
          {narrative && !narrativeEditing && <button
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
        {/* Editing textarea */}
        {narrative && narrativeEditing && <div onClick={(e) => e.stopPropagation()}>
          <textarea
            value={narrativeDraft}
            onChange={(e) => setNarrativeDraft(e.target.value)}
            style={{
              width: '100%', minHeight: 200, maxHeight: 400,
              background: '#0a1220', color: '#c8d6e5', border: '1px solid #2563eb44',
              borderRadius: 4, padding: 8, fontSize: 11, lineHeight: 1.6,
              fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
          <div style={{ fontSize: 8, color: '#4a6080', fontFamily: FM, marginTop: 4, fontStyle: 'italic' }}>
            Edit the briefing text above. Your changes will be saved and used instead of AI-generated content.
          </div>
        </div>}
        {/* Read-only narrative display */}
        {narrative && !narrativeEditing && <div className="sc-narr-in" style={{ fontSize: 11, lineHeight: 1.6 }}>
          {narrative.narrative.split(/\n/).map((line, li) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const headerMatch = trimmed.match(/^(SITUATION|EXPOSURE|RECOMMENDED ACTIONS|OUTLOOK|IMPACT|RISK|TIMELINE|RECOVERY|ACTIONS?):?\s*$/i);
            if (headerMatch) {
              const hc: Record<string, string> = { SITUATION: '#ef4444', EXPOSURE: '#f59e0b', 'RECOMMENDED ACTIONS': '#22c55e', ACTIONS: '#22c55e', OUTLOOK: '#3b82f6', IMPACT: '#f59e0b', RISK: '#ef4444', TIMELINE: '#3b82f6', RECOVERY: '#22c55e' };
              return <div key={li} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: hc[headerMatch[1].toUpperCase()] || '#94a3b8', fontFamily: FM, marginTop: li > 0 ? 10 : 0, marginBottom: 4 }}>{headerMatch[1]}</div>;
            }
            if (trimmed.startsWith('\u2022') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
              const text = trimmed.replace(/^[\u2022\-*]\s*/, '');
              const parts = text.split(/(\*\*[^*]+\*\*)/g);
              return <div key={li} style={{ display: 'flex', gap: 6, marginBottom: 3, color: '#c8d6e5' }}>
                <span style={{ color: '#2a3d5c', flexShrink: 0, fontSize: 8, marginTop: 2 }}>{'\u2022'}</span>
                <span>{parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}</span>
              </div>;
            }
            const parts = trimmed.replace(/^\*\*|\*\*$/g, '').split(/(\*\*[^*]+\*\*)/g);
            return <div key={li} style={{ color: '#c8d6e5', marginBottom: 2 }}>
              {parts.map((p, pi) => p.startsWith('**') ? <strong key={pi} style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.replace(/\*\*/g, '')}</strong> : p)}
            </div>;
          })}
          <div style={{ marginTop: 6, fontSize: 8, color: '#1e3050', fontFamily: FM, fontStyle: 'italic' }}>
            {isEdited ? 'Edited' : 'Generated'} {narrative.generated_at ? new Date(narrative.generated_at).toLocaleString() : 'just now'}
            {isEdited && ' (user-modified)'}
          </div>
        </div>}
        {!narrative && !isLoading && <div style={{ fontSize: 9, color: '#1e3050', fontStyle: 'italic', marginTop: 4 }}>
          {backendId ? 'AI-generated executive summary for stakeholder briefings' : 'Connect to backend to enable AI briefing generation'}
        </div>}
      </div>;
    })()}

    {/* Duplicate warning banner */}
    {('possible_duplicate_of' in d) && (d as unknown as Record<string, unknown>).possible_duplicate_of && <div style={{
      background: '#78350f18', border: '1px solid #92400e44', borderRadius: 6,
      padding: '5px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 10, opacity: .7 }}>{'\u26A0'}</span>
      <span style={{ fontSize: 10, color: '#d97706', fontFamily: FM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>Possible duplicate of: <span style={{ fontWeight: 600, color: '#fbbf24' }}>{String((d as unknown as Record<string, unknown>).possible_duplicate_of)}</span></span>
    </div>}
  </>;
}
