/**
 * ExpandedCard -- V3 shared detail component.
 * Renders inside both the feed (accordion expand) and the map (bottom-left panel).
 * Three tabs: Summary | Exposure | Act
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DisruptionEvent, ActionItemShape } from './expandedcard_types';
import type { Severity, SupplierAlternativesResponse } from '../../types';
import { ActionCheckbox } from './ActionCheckbox';
import { BU_MAP } from '../../data/sites';
import { updateEventStatus, fetchSupplierAlternatives, fetchBuExposure } from '../../services/api';
import { enrichExposureData, computeImpactWithGraph } from '../../utils/impact';
import { ROUTES, SUPPLY_GRAPH } from '../../data';
import type { ScanItem, SupplyGraphInput } from '../../types';
import { V3_FONT, V3_FONT_MONO, sevColor, type V3Theme } from '../theme';
import { useV3Theme } from '../ThemeContext';

const TAB_KEY = 'v3-expanded-tab';

/* ─────────────────────────────────────────────
   Props
   ───────────────────────────────────────────── */
export interface ExpandedCardProps {
  event: DisruptionEvent;
  placement: 'feed' | 'map';
  onClose: () => void;
  onHoverSite?: (siteId: string | null) => void;
  onStatusChange?: (eventId: string, newStatus: string) => void;
}

/* ─────────────────────────────────────────────
   Tab types
   ───────────────────────────────────────────── */
type Tab = 'summary' | 'exposure' | 'act';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary',  label: 'Summary' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'act',      label: 'Act' },
];

/* ─────────────────────────────────────────────
   Style helpers (theme-aware)
   ───────────────────────────────────────────── */
function sectionHeaderStyle(theme: V3Theme): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: theme.text.muted,
    fontFamily: V3_FONT_MONO, margin: '12px 0 6px',
  };
}

function badgeStyle(bg: string, fg: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: bg + '18', color: fg,
    padding: '2px 8px', borderRadius: 4,
    fontSize: 10, fontWeight: 600, fontFamily: V3_FONT_MONO,
    border: `1px solid ${bg}33`, whiteSpace: 'nowrap',
  };
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */
export function ExpandedCard({ event, placement, onClose, onHoverSite, onStatusChange }: ExpandedCardProps) {
  const { theme: V3 } = useV3Theme();
  const [tab, setTab] = useState<Tab>(() => {
    try { return (sessionStorage.getItem(TAB_KEY) as Tab) || 'summary'; }
    catch { return 'summary'; }
  });

  const handleTab = useCallback((t: Tab) => {
    setTab(t);
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* noop */ }
  }, []);

  const isMap = placement === 'map';
  const maxH = isMap ? '50vh' : '420px';
  const sev = (event.severity || 'Medium') as Severity;
  const sevCol = sevColor(sev, V3);

  const containerStyle: React.CSSProperties = {
    maxHeight: maxH,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: isMap ? V3.bg.base + 'ee' : V3.bg.card,
    borderRadius: 8,
    border: `1px solid ${V3.border.subtle}`,
    fontFamily: V3_FONT,
    padding: isMap ? '14px 16px' : '10px 12px',
    position: 'relative',
    transition: 'max-height 300ms ease',
    ...(isMap ? { backdropFilter: 'blur(8px)' } : {}),
  };

  return (
    <div style={containerStyle}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${V3.border.subtle}`,
        marginBottom: 8, flexShrink: 0,
      }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={(e) => { e.stopPropagation(); handleTab(t.key); }}
              style={{
                flex: 1, padding: '6px 0 8px', border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: active ? V3.text.primary : V3.text.muted,
                fontSize: 11, fontWeight: active ? 700 : 500,
                fontFamily: V3_FONT,
                borderBottom: `2px solid ${active ? sevCol : 'transparent'}`,
                transition: 'all 150ms ease',
              }}
            >
              {t.label}
            </button>
          );
        })}
        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: V3.text.muted, fontSize: 14, padding: '4px 6px',
            lineHeight: 1, flexShrink: 0,
          }}
          aria-label="Close detail panel"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        {tab === 'summary'  && <SummaryTab event={event} sev={sev} sevCol={sevCol} theme={V3} />}
        {tab === 'exposure' && <ExposureTab event={event} onHoverSite={onHoverSite} theme={V3} />}
        {tab === 'act'      && <ActTab event={event} theme={V3} onStatusChange={onStatusChange} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1: Summary
   ══════════════════════════════════════════════ */
function SummaryTab({ event, sev, sevCol, theme: V3 }: { event: DisruptionEvent; sev: Severity; sevCol: string; theme: V3Theme }) {
  const cs = event.computed_severity;
  const title = event.event || event.risk || '';
  const description = event.description
    || (event.payload?.description as string | undefined)
    || '';

  const velocity = cs?.velocity;
  const recovery = cs?.recovery_estimate;
  const probability = cs?.probability;

  const velColor = velocity === 'immediate' || velocity === 'days'
    ? V3.accent.red : V3.accent.blue;
  const velLabel = velocity === 'immediate' ? 'Rapid' : velocity === 'days' ? 'Fast'
    : velocity === 'weeks' ? 'Gradual' : velocity === 'months' ? 'Slow' : velocity || 'N/A';

  const recColor = recovery === 'months' ? V3.accent.red : recovery === 'weeks'
    ? V3.accent.amber : V3.accent.green;
  const recLabel = recovery || 'N/A';

  const probPct = probability != null ? Math.round(probability * 100) : null;
  const probColor = (probability ?? 0) >= 0.7 ? V3.accent.red
    : (probability ?? 0) >= 0.4 ? V3.accent.amber : V3.accent.green;

  const sectionHeader = sectionHeaderStyle(V3);

  return (
    <div>
      {/* Title + severity badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 14, fontWeight: 700, color: V3.text.primary,
          fontFamily: V3_FONT, flex: 1, lineHeight: 1.3,
        }}>
          {title}
        </span>
        <span style={badgeStyle(sevCol, sevCol)}>{sev}</span>
      </div>

      {/* Description */}
      {description && (
        <p style={{ color: V3.text.secondary, fontSize: 12, lineHeight: 1.6, margin: '0 0 10px' }}>
          {description}
        </p>
      )}

      {/* Inline dimension badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={badgeStyle(velColor, velColor)}>
          <span style={{ color: V3.text.muted, fontWeight: 500 }}>Velocity</span> {velLabel}
        </span>
        <span style={badgeStyle(recColor, recColor)}>
          <span style={{ color: V3.text.muted, fontWeight: 500 }}>Recovery</span> {recLabel}
        </span>
        {probPct != null && (
          <span style={badgeStyle(probColor, probColor)}>
            <span style={{ color: V3.text.muted, fontWeight: 500 }}>Prob</span> {probPct}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      <SeveritySparkline event={event} sevCol={sevCol} theme={V3} />

      {/* Score breakdown */}
      {cs?.components && (
        <div style={{
          background: V3.bg.base, borderRadius: 6, padding: '8px 10px',
          border: `1px solid ${V3.border.subtle}`, marginTop: 8,
        }}>
          <div style={sectionHeader}>Score Breakdown</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(cs.components).map(([key, val]) => {
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const v = typeof val === 'number' ? val : 0;
              return (
                <div key={key} style={{ flex: '1 0 80px', minWidth: 80 }}>
                  <div style={{ fontSize: 9, color: V3.text.muted, fontFamily: V3_FONT_MONO, marginBottom: 2 }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1, height: 4, background: V3.border.subtle, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, v)}%`, height: '100%', background: sevCol, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: V3.text.secondary, fontFamily: V3_FONT_MONO }}>
                      {Math.round(v)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sparkline sub-component ── */
function SeveritySparkline({ event, sevCol, theme: V3 }: { event: DisruptionEvent; sevCol: string; theme: V3Theme }) {
  const score = event.computed_severity?.score;
  if (score == null) return null;

  const count = Math.min(event.scan_count || 1, 5);
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = Math.sin(i * 2.7 + (score || 50) * 0.1) * 8;
    points.push(Math.max(5, Math.min(95, score + jitter - (count - 1 - i) * 3)));
  }
  if (points.length < 2) return null;

  const w = 120, h = 28, px = 4;
  const minV = Math.min(...points) - 5;
  const maxV = Math.max(...points) + 5;
  const range = maxV - minV || 1;
  const coords = points.map((v, i) => ({
    x: px + (i / (points.length - 1)) * (w - 2 * px),
    y: px + (1 - (v - minV) / range) * (h - 2 * px),
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={w} height={h} style={{ flexShrink: 0 }}>
        <path d={pathD} fill="none" stroke={sevCol} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 1.5}
            fill={i === coords.length - 1 ? sevCol : sevCol + '88'} />
        ))}
      </svg>
      <span style={{ fontSize: 10, color: V3.text.muted, fontFamily: V3_FONT_MONO }}>
        {Math.round(score)}/100 over {count} scan{count > 1 ? 's' : ''}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 2: Exposure
   ══════════════════════════════════════════════ */
function ExposureTab({ event, onHoverSite, theme: V3 }: {
  event: DisruptionEvent;
  onHoverSite?: (id: string | null) => void;
  theme: V3Theme;
}) {
  const enriched = useMemo(() => enrichExposureData(event as unknown as ScanItem), [event]);
  const allSites = (event.affected_sites?.length ? event.affected_sites : enriched.affected_sites) || [];
  const suppliersByTier = useSuppliersByTier(event, enriched.input_details);
  const routes: Array<string | { description?: string; route?: string }> =
    ((event.routing_context?.length ? event.routing_context : enriched.routing_context.length ? enriched.routing_context : event.affected_routes) || []) as Array<string | { description?: string; route?: string }>;

  // Compute impact chain data
  const region = event.region || 'Global';
  const mfgSites = allSites.filter(s => (s.type || '').toLowerCase() === 'mfg');
  const t1Inputs = suppliersByTier.find(t => t.tier === 1)?.items || [];
  const soleSourceCount = suppliersByTier.flatMap(t => t.items).filter(s => s.sole_source).length;
  const totalInputs = suppliersByTier.reduce((sum, t) => sum + t.items.length, 0);

  // Compute corridors from impact utility
  const impact = useMemo(() => {
    try { return computeImpactWithGraph(event as unknown as ScanItem, ROUTES, SUPPLY_GRAPH); }
    catch { return null; }
  }, [event]);
  const corridors = impact?.corridors || [];

  // BU exposure data (fetched once)
  const [buExposure, setBuExposure] = useState<Array<{ bu: string; exposed_spend_pct: number }> | null>(null);
  useEffect(() => {
    fetchBuExposure().then(data => {
      if (data) setBuExposure(data);
    });
  }, []);

  // Supplier alternatives
  const [altData, setAltData] = useState<SupplierAlternativesResponse | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const altFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!region || region === 'Global' || altFetchedRef.current === region) return;
    altFetchedRef.current = region;
    setAltLoading(true);
    fetchSupplierAlternatives(region).then(res => {
      if (res) setAltData(res);
      setAltLoading(false);
    });
  }, [region]);

  // Build impact chain steps (skip empty steps)
  const chainSteps: Array<{ label: string; items: Array<{ text: string; badge?: string; badgeColor?: string }>; color: string; icon: string }> = [];

  // Step 1: Region
  chainSteps.push({ label: 'Disruption Region', items: [{ text: region }], color: V3.accent.red, icon: '\uD83C\uDF0D' });

  // Step 2: Corridors (skip if none)
  if (corridors.length > 0) {
    chainSteps.push({
      label: 'Affected Corridors',
      items: corridors.slice(0, 6).map(c => ({ text: c })),
      color: V3.accent.amber,
      icon: '\uD83D\uDEA2',
    });
  }

  // Step 3: Exposed Factories (MFG only, max 6)
  if (mfgSites.length > 0) {
    chainSteps.push({
      label: 'Exposed Factories',
      items: mfgSites.slice(0, 6).map(s => {
        const bu = BU_MAP[s.name] || '';
        const buLabel = buDisplay(bu);
        return { text: s.name, badge: buLabel || undefined, badgeColor: V3.accent.purple };
      }),
      color: V3.accent.blue,
      icon: '\uD83C\uDFED',
    });
  }

  // Step 4: At-Risk Inputs (T1 critical, max 8, with sole-source indicator)
  if (t1Inputs.length > 0) {
    chainSteps.push({
      label: 'Critical Inputs (T1)',
      items: t1Inputs.slice(0, 8).map(inp => ({
        text: inp.name,
        badge: inp.sole_source ? '\u26A0 Sole Source' : undefined,
        badgeColor: inp.sole_source ? V3.accent.red : undefined,
      })),
      color: V3.accent.purple,
      icon: '\uD83D\uDCE6',
    });
  }

  // Step 5: Downstream exposure (hop 2) — max 6
  const downstreamFactories = enriched.downstream_exposure || [];
  if (downstreamFactories.length > 0) {
    chainSteps.push({
      label: `Downstream Risk (${downstreamFactories.length} factories)`,
      items: downstreamFactories.slice(0, 6).map(d => ({
        text: d.factory,
        badge: `via ${d.shared_country}`,
        badgeColor: V3.accent.cyan,
      })),
      color: V3.accent.cyan,
      icon: '\uD83D\uDD04',
    });
  }

  const _sectionHeader = sectionHeaderStyle(V3);

  // Empty state
  if (allSites.length === 0 && suppliersByTier.length === 0 && corridors.length === 0) {
    return <EmptyRow label="No exposure data available for this event" theme={V3} />;
  }

  return (
    <div>
      {/* -- Risk Summary Bar -- */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12,
        padding: '8px 10px', background: V3.bg.card, borderRadius: 8,
        border: `1px solid ${V3.border.subtle}`,
      }}>
        {mfgSites.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
            color: V3.accent.red, background: V3.accent.red + '18',
            padding: '2px 8px', borderRadius: 4, border: `1px solid ${V3.accent.red}33`,
          }}>
            {mfgSites.length} MFG site{mfgSites.length !== 1 ? 's' : ''} exposed
          </span>
        )}
        {t1Inputs.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
            color: V3.accent.amber, background: V3.accent.amber + '18',
            padding: '2px 8px', borderRadius: 4, border: `1px solid ${V3.accent.amber}33`,
          }}>
            {t1Inputs.length} T1 input{t1Inputs.length !== 1 ? 's' : ''} at risk
          </span>
        )}
        {soleSourceCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
            color: V3.accent.red, background: V3.accent.red + '18',
            padding: '2px 8px', borderRadius: 4, border: `1px solid ${V3.accent.red}33`,
          }}>
            {'\u26A0'} {soleSourceCount} sole-source
          </span>
        )}
        {buExposure && buExposure.filter(b => b.exposed_spend_pct > 0).slice(0, 3).map((b, bi) => (
          <span key={`bu-${bi}`} style={{
            fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
            color: b.exposed_spend_pct >= 30 ? V3.accent.red : b.exposed_spend_pct >= 15 ? V3.accent.amber : V3.accent.green,
            background: (b.exposed_spend_pct >= 30 ? V3.accent.red : b.exposed_spend_pct >= 15 ? V3.accent.amber : V3.accent.green) + '18',
            padding: '2px 8px', borderRadius: 4,
            border: `1px solid ${(b.exposed_spend_pct >= 30 ? V3.accent.red : b.exposed_spend_pct >= 15 ? V3.accent.amber : V3.accent.green)}33`,
          }}>
            {b.bu}: {b.exposed_spend_pct}% spend at risk
          </span>
        ))}
        {totalInputs > 0 && t1Inputs.length === 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, fontFamily: V3_FONT_MONO,
            color: V3.text.muted, background: V3.bg.base,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {totalInputs} supplier input{totalInputs !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* -- Impact Chain -- */}
      <div style={{
        background: V3.bg.card, borderRadius: 8, padding: '10px 12px', marginBottom: 12,
        border: `1px solid ${V3.border.subtle}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
          <span style={{ fontSize: 11 }}>{'\uD83D\uDD17'}</span>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO, color: V3.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.2 }}>Impact Chain</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
          {chainSteps.map((step, si) => (
            <div key={si}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flexShrink: 0, width: 22 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: step.color + '22', border: `1.5px solid ${step.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, lineHeight: 1,
                  }}>{step.icon}</div>
                  {si < chainSteps.length - 1 && <div style={{
                    width: 1.5, height: 14, background: step.color, opacity: 0.35,
                    marginTop: 2, marginBottom: 2,
                  }} />}
                </div>
                <div style={{ flex: 1, paddingTop: 2, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
                    color: step.color, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: 0.8,
                  }}>
                    {step.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: si < chainSteps.length - 1 ? 4 : 0 }}>
                    {step.items.map((item, ii) => (
                      <span key={ii} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          background: step.color + '18', color: step.color,
                          padding: '2px 7px', borderRadius: 4, fontSize: 10,
                          fontFamily: V3_FONT_MONO, fontWeight: 500, border: `1px solid ${step.color}22`,
                          whiteSpace: 'nowrap' as const,
                        }}>{item.text}</span>
                        {item.badge && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, fontFamily: V3_FONT_MONO,
                            color: item.badgeColor || V3.text.muted,
                            background: (item.badgeColor || V3.text.muted) + '18',
                            padding: '1px 5px', borderRadius: 3,
                            border: `1px solid ${(item.badgeColor || V3.text.muted)}33`,
                            whiteSpace: 'nowrap' as const,
                          }}>{item.badge}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* -- Backup Regions -- */}
      {(altLoading || altData) && (
        <div style={{
          background: V3.bg.card, borderRadius: 8, padding: '10px 12px', marginBottom: 12,
          border: `1px solid ${V3.border.subtle}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: altData ? 8 : 4 }}>
            <span style={{ fontSize: 11 }}>{'\u26A1'}</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO, color: V3.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.2 }}>Backup Regions</span>
            {altData && <span style={{ fontSize: 9, fontFamily: V3_FONT_MONO, color: V3.text.muted, marginLeft: 'auto' }}>{altData.alternatives.length} options</span>}
          </div>
          {altLoading && !altData && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {[0, 1, 2].map(i => <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />)}
            </div>
          )}
          {altData && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {altData.alternatives.slice(0, 5).map((alt, ai) => {
                const overlapColor = alt.overlap_pct >= 70 ? V3.accent.green
                  : alt.overlap_pct >= 40 ? V3.accent.amber : V3.accent.red;
                return (
                  <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: V3.text.secondary, minWidth: 70, fontFamily: V3_FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{alt.country}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 2, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: V3_FONT_MONO, fontSize: 10, color: V3.text.muted }}>{alt.supplier_count} suppliers</span>
                        <span style={{ fontFamily: V3_FONT_MONO, fontSize: 10, color: overlapColor, fontWeight: 700 }}>{Math.round(alt.overlap_pct)}%</span>
                      </div>
                      <div style={{ height: 3, background: V3.bg.base, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, alt.overlap_pct)}%`, height: '100%', background: overlapColor, borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -- Routing Context (compact, max 3) -- */}
      {routes.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {routes.slice(0, 3).map((r, ri) => {
            const text = typeof r === 'string' ? r : (r.description || r.route || JSON.stringify(r));
            return (
              <div key={ri} style={{
                padding: '4px 0', borderBottom: `1px solid ${V3.border.subtle}`,
                fontSize: 10, color: V3.text.muted, lineHeight: 1.5, fontFamily: V3_FONT,
              }}>{text}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Supplier tier grouping hook ── */
interface SupplierEntry { name: string; tier: number; sole_source: boolean }
interface TierGroup { tier: number; items: SupplierEntry[] }

function useSuppliersByTier(event: DisruptionEvent, fallbackDetails?: SupplyGraphInput[]): TierGroup[] {
  return useMemo(() => {
    const details: Array<{ name?: string; tier?: number; sole_source?: boolean }> =
      (event.payload?.input_details as Array<{ name?: string; tier?: number; sole_source?: boolean }> | undefined)
      || event.input_details
      || fallbackDetails
      || [];
    if (!Array.isArray(details) || details.length === 0) return [];

    const grouped: Record<number, SupplierEntry[]> = {};
    for (const d of details) {
      const tier = d.tier || 3;
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push({
        name: d.name || 'Unknown',
        tier,
        sole_source: !!d.sole_source,
      });
    }
    return [1, 2, 3]
      .filter(t => grouped[t]?.length)
      .map(t => ({ tier: t, items: grouped[t] }));
  }, [event, fallbackDetails]);
}

/* ══════════════════════════════════════════════
   TAB 3: Act
   ══════════════════════════════════════════════ */
function parseActionsFromString(text: string): ActionItemShape[] {
  if (!text) return [];
  // Split on semicolons or numbered list patterns (1. 2. etc.)
  const parts = text.split(/;\s*|\d+\.\s+/).map(s => s.trim()).filter(Boolean);
  return parts.map((p, i) => ({
    id: i,
    text: p.replace(/^[-\u2013\u2022]\s*/, ''),
    status: 'open' as const,
    owner: p.toLowerCase().includes('supplier') || p.toLowerCase().includes('procurement')
      ? 'Procurement'
      : p.toLowerCase().includes('route') || p.toLowerCase().includes('ship')
        ? 'Logistics'
        : 'SC Operations',
    due: '',
    created: new Date().toISOString(),
  }));
}

function ActTab({ event, theme: V3, onStatusChange }: { event: DisruptionEvent; theme: V3Theme; onStatusChange?: (eventId: string, newStatus: string) => void }) {
  const [actions, setActions] = useState<ActionItemShape[]>(() => {
    const recs = event.recommendations?.actions;
    if (Array.isArray(recs) && recs.length > 0) return recs;
    const payActions = event.payload?.actions;
    if (Array.isArray(payActions) && payActions.length > 0) return payActions as ActionItemShape[];
    // Fall back to parsing recommended_action string
    const actionStr = (event as any).recommended_action
      || event.payload?.recommended_action
      || '';
    if (actionStr) return parseActionsFromString(actionStr);
    return [];
  });
  const [status, setStatus] = useState(event.status || 'active');
  const [assignInput, setAssignInput] = useState('');
  const [showAssignInput, setShowAssignInput] = useState(false);

  const sectionHeader = sectionHeaderStyle(V3);

  useEffect(() => {
    setStatus(event.status || 'active');
  }, [event.status]);

  const handleToggle = useCallback((id: string, done: boolean) => {
    setActions(prev => prev.map(a =>
      String(a.id) === id ? { ...a, status: done ? 'done' : 'open' } : a
    ));
  }, []);

  // Build event ID: prefer backend id, fall back to slug|region (matches backend _make_disruption_id)
  const resolvedId = useMemo(() => {
    if (event.id) return event.id;
    const name = (event.event || event.risk || 'unknown').toLowerCase().slice(0, 40).replace(/\s+/g, '-');
    const region = (event.region || 'unknown').toLowerCase().replace(/\s+/g, '-');
    return `${name}|${region}`;
  }, [event.id, event.event, event.risk, event.region]);

  const [statusLoading, setStatusLoading] = useState(false);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!resolvedId) return;
    setStatusLoading(true);
    const ok = await updateEventStatus(resolvedId, newStatus);
    setStatusLoading(false);
    if (ok) {
      setStatus(newStatus as typeof status);
      onStatusChange?.(resolvedId, newStatus);
    }
  }, [resolvedId, onStatusChange]);

  const eventTitle = event.event || event.risk || 'Disruption Event';
  const eventDesc = event.description
    || (event.payload?.description as string | undefined)
    || '';
  const emailSubject = encodeURIComponent(`[SC Alert] ${eventTitle}`);
  const emailBody = encodeURIComponent(
    `Supply Chain Alert: ${eventTitle}\n\n${eventDesc}\n\nSeverity: ${event.severity || 'Medium'}`
  );
  const teamsMsg = encodeURIComponent(
    `[SC Alert] ${eventTitle} - ${event.severity || 'Medium'} severity`
  );

  return (
    <div>
      {/* Recommended Actions */}
      <div style={sectionHeader}>Recommended Actions</div>
      {actions.length === 0 && (
        <EmptyRow label="No actions available -- generate a briefing to populate" theme={V3} />
      )}
      {actions.map((a, i) => (
        <ActionCheckbox key={a.id ?? i} action={a} onToggle={handleToggle} />
      ))}

      {/* Lifecycle */}
      <div style={sectionHeader}>Lifecycle</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <LifecycleBtn
          label="Watch" icon={'\uD83D\uDC41'}
          active={status === 'watching'}
          loading={statusLoading}
          onClick={() => handleStatusChange(status === 'watching' ? 'active' : 'watching')}
          theme={V3}
        />
        <LifecycleBtn
          label="Archive" icon={'\uD83D\uDCE6'}
          active={status === 'archived'}
          loading={statusLoading}
          onClick={() => handleStatusChange(status === 'archived' ? 'active' : 'archived')}
          theme={V3}
        />
        <LifecycleBtn
          label="Assign" icon={'\uD83D\uDC64'}
          active={showAssignInput}
          onClick={() => setShowAssignInput(!showAssignInput)}
          theme={V3}
        />
      </div>
      {showAssignInput && (
        <div
          style={{ display: 'flex', gap: 6, marginBottom: 10 }}
          onClick={e => e.stopPropagation()}
        >
          <input
            value={assignInput}
            onChange={e => setAssignInput(e.target.value)}
            placeholder="Assignee name..."
            style={{
              flex: 1, padding: '5px 8px', fontSize: 11,
              background: V3.bg.base, color: V3.text.primary,
              border: `1px solid ${V3.border.default}`, borderRadius: 4,
              fontFamily: V3_FONT, outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = V3.accent.blue; }}
            onBlur={e => { e.currentTarget.style.borderColor = V3.border.default; }}
          />
          <button
            onClick={() => { setShowAssignInput(false); }}
            style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 600,
              background: V3.accent.blue + '22', color: V3.accent.blue,
              border: `1px solid ${V3.accent.blue}44`, borderRadius: 4,
              cursor: 'pointer', fontFamily: V3_FONT_MONO,
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* Communicate */}
      <div style={sectionHeader}>Communicate</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <CommBtn
          label="Email" icon={'\u2709'}
          href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
          theme={V3}
        />
        <CommBtn
          label="Teams" icon={'\uD83D\uDCAC'}
          href={`https://teams.microsoft.com/l/chat/0/0?message=${teamsMsg}`}
          theme={V3}
        />
        <CommBtn
          label="Meeting" icon={'\uD83D\uDCC5'}
          href={`https://outlook.office.com/calendar/0/deeplink/compose?subject=${emailSubject}&body=${emailBody}`}
          theme={V3}
        />
      </div>
    </div>
  );
}

/* ── Lifecycle button ── */
function LifecycleBtn({ label, icon, active, loading, onClick, theme: V3 }: {
  label: string; icon: string; active: boolean; loading?: boolean; onClick: () => void; theme: V3Theme;
}) {
  return (
    <button
      disabled={loading}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
        fontSize: 11, fontWeight: 600, fontFamily: V3_FONT,
        background: active ? V3.accent.blue + '22' : V3.bg.base,
        color: active ? V3.accent.blue : V3.text.muted,
        border: `1px solid ${active ? V3.accent.blue + '44' : V3.border.subtle}`,
        transition: 'all 150ms ease',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  );
}

/* ── Communicate button ── */
function CommBtn({ label, icon, href, theme: V3 }: { label: string; icon: string; href: string; theme: V3Theme }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 600, fontFamily: V3_FONT,
        background: V3.bg.base, color: V3.text.muted,
        border: `1px solid ${V3.border.subtle}`,
        textDecoration: 'none', transition: 'all 150ms ease',
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </a>
  );
}

/* ── Empty row placeholder ── */
function EmptyRow({ label, theme: V3 }: { label: string; theme: V3Theme }) {
  return (
    <div style={{
      padding: '10px 0', fontSize: 11, color: V3.text.muted,
      fontStyle: 'italic', fontFamily: V3_FONT,
    }}>
      {label}
    </div>
  );
}

/* ── BU display mapping ── */
function buDisplay(bu: string): string {
  const map: Record<string, string> = {
    'ind': 'Industrial', 'sis-seal': 'Seals', 'sis-lube': 'Lubrication',
    'sis-aero': 'Aerospace', 'sis-mag': 'Magnetics',
  };
  return map[bu] || '';
}

export default ExpandedCard;
