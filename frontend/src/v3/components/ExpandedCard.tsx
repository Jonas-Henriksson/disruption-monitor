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
import { updateEventStatus, fetchSupplierAlternatives, fetchBuExposure, fetchEventActions, updateActionStatus, generateEventActions, assignTicket } from '../../services/api';
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

/* ── Glossary: hover-tooltip definitions for first-time users ── */

const GLOSSARY: Record<string, { title: string; body: string }> = {
  severity_critical: {
    title: 'Critical (\u226575/100)',
    body: 'Immediate threat to operations. Multiple manufacturing sites or sole-source suppliers directly affected. Requires emergency response within hours.',
  },
  severity_high: {
    title: 'High (50\u201374/100)',
    body: 'Significant operational risk. Key sites or supply routes are exposed but not yet disrupted. Action needed within days.',
  },
  severity_medium: {
    title: 'Medium (25\u201349/100)',
    body: 'Moderate risk with limited direct exposure. Primarily affects non-manufacturing sites or indirect supply paths. Monitor and prepare contingencies.',
  },
  severity_low: {
    title: 'Low (<25/100)',
    body: 'Minimal direct impact. Peripheral exposure through distant sites or commodity-tier suppliers. Track for escalation.',
  },
  velocity: {
    title: 'Velocity \u2014 Speed of Onset',
    body: 'How fast the disruption takes effect. Rapid = already happening or within hours (e.g. earthquake, port closure). Fast = materializes in days (e.g. strike announcement). Gradual = weeks to develop (e.g. tariff implementation). Slow = months (e.g. currency shift). Marked "est" when inferred from severity rather than event data.',
  },
  recovery: {
    title: 'Recovery \u2014 Time to Normalize',
    body: 'Estimated time for supply chain operations to return to normal. Days = minor, localized impact. Weeks = regional logistics rerouting needed. Months = structural change requiring new suppliers or routes. Based on event category and severity.',
  },
  probability: {
    title: 'Probability \u2014 Likelihood of Impact',
    body: 'How likely this event is to materially affect SKF operations (0\u2013100%). Combines event category base rate (e.g. active natural disaster = 90%, trade negotiation = 40%) with trend direction (escalating events score higher). Not a prediction \u2014 a risk-weighted assessment.',
  },
  confidence: {
    title: 'Confidence \u2014 Data Quality',
    body: 'How much corroborating evidence supports this event (0\u2013100%). Based on number of independent sources detected, scan frequency, and cross-mode confirmation (e.g. same event appearing in both disruption and geopolitical scans). Higher confidence = more sources agree.',
  },
  trend: {
    title: 'Trend \u2014 Direction of Change',
    body: '\u2191 Escalating = getting worse across recent scans. \u2192 Stable = severity holding steady. \u2193 De-escalating = situation improving. Based on severity score movement over consecutive scans.',
  },
  mfg_sites: {
    title: 'MFG Sites',
    body: 'Number of SKF manufacturing facilities within the disruption\'s impact radius. These are the highest-priority sites \u2014 they produce bearings, seals, or components.',
  },
  total_sites: {
    title: 'Total Sites',
    body: 'All SKF facilities affected (manufacturing, logistics, sales, admin). Includes sites within 3,000 km of the event, weighted by proximity.',
  },
  scans: {
    title: 'Scans Tracked',
    body: 'Number of automated scan cycles where this event was detected. More scans = longer-tracked event. The system scans disruptions every 15 min, geopolitical every 30 min, trade every 60 min.',
  },
  severity_score: {
    title: 'Severity Score (0\u2013100)',
    body: 'Algorithmic risk score combining four weighted factors: event magnitude (30%), proximity to SKF sites (25%), asset criticality of affected sites (25%), and supply chain depth (20%). Fully deterministic \u2014 no AI in the scoring. The score drives the severity label: \u226575 = Critical, \u226550 = High, \u226525 = Medium, <25 = Low. See the Score Breakdown section below for component details.',
  },
};

function InfoBadge({ glossaryKey, badgeBg, badgeFg, children, theme: V3 }: {
  glossaryKey: string;
  badgeBg: string;
  badgeFg: string;
  children: React.ReactNode;
  theme: V3Theme;
}) {
  const [show, setShow] = useState(false);
  const entry = GLOSSARY[glossaryKey];
  return (
    <span
      style={{ ...badgeStyle(badgeBg, badgeFg), position: 'relative', cursor: entry ? 'help' : 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && entry && (
        <span
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 50,
            marginTop: 4, padding: '6px 8px', borderRadius: 4, width: 220,
            background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'normal',
            cursor: 'default',
          }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: V3.text.primary, marginBottom: 3 }}>
            {entry.title}
          </span>
          <span style={{ display: 'block', fontSize: 9, color: V3.text.muted, lineHeight: 1.5, fontWeight: 400 }}>
            {entry.body}
          </span>
        </span>
      )}
    </span>
  );
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
  const isFeed = placement === 'feed';
  const sev = (event.severity || 'Medium') as Severity;
  const sevCol = sevColor(sev, V3);

  const containerStyle: React.CSSProperties = {
    ...(isMap ? { maxHeight: '50vh', overflow: 'hidden' } : {}),
    display: 'flex', flexDirection: 'column',
    background: isMap ? V3.bg.base + 'ee' : V3.bg.card,
    borderRadius: isFeed ? 0 : 8,
    border: isFeed ? 'none' : `1px solid ${V3.border.subtle}`,
    fontFamily: V3_FONT,
    padding: isMap ? '14px 16px' : '10px 12px',
    position: 'relative',
    ...(isMap ? { backdropFilter: 'blur(8px)', transition: 'max-height 300ms ease' } : {}),
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

      {/* Content — scrolls internally only on map placement; feed relies on parent scroll */}
      <div className={isFeed ? undefined : 'sc-s'} style={isFeed ? {} : { flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
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
    ? V3.accent.red : velocity === 'weeks' ? V3.accent.amber : V3.accent.blue;
  const velLabel = velocity === 'immediate' ? 'Rapid' : velocity === 'days' ? 'Fast'
    : velocity === 'weeks' ? 'Gradual' : velocity === 'months' ? 'Slow' : velocity || null;

  const recColor = recovery === 'months' ? V3.accent.red : recovery === 'weeks'
    ? V3.accent.amber : V3.accent.green;
  const recLabel = recovery || null;

  const probPct = probability != null ? Math.round(probability * 100) : null;
  const probColor = (probability ?? 0) >= 0.7 ? V3.accent.red
    : (probability ?? 0) >= 0.4 ? V3.accent.amber : V3.accent.green;

  // Derive extra context
  const affectedSites = event.affected_sites || [];
  const mfgCount = affectedSites.filter(s => (s.type || '').toLowerCase() === 'mfg').length;
  const totalSites = affectedSites.length;
  const confidence = event.confidence != null ? Math.round(event.confidence * 100) : null;
  const scanCount = event.scan_count || 0;
  const trend = event.trend || (event.payload?.trend as string | undefined) || '';
  const category = (event as any).category || (event.payload?.category as string | undefined) || '';
  const region = event.region || '';
  const firstSeen = event.first_seen ? new Date(event.first_seen) : null;
  const lastSeen = event.last_seen ? new Date(event.last_seen) : null;
  const sources = event.sources || [];
  const skfExposure = (event as any).skf_exposure
    || (event.payload?.skf_exposure as string | undefined)
    || (event as any).skf_relevance
    || (event.payload?.skf_relevance as string | undefined)
    || '';

  const sectionHeader = sectionHeaderStyle(V3);

  // Infer velocity/recovery from severity if not provided
  const inferredVelocity = velLabel || (sev === 'Critical' ? 'Rapid' : sev === 'High' ? 'Fast' : sev === 'Medium' ? 'Gradual' : 'Slow');
  const inferredVelColor = !velLabel
    ? (sev === 'Critical' || sev === 'High' ? V3.accent.red : sev === 'Medium' ? V3.accent.amber : V3.accent.blue)
    : velColor;
  const inferredRecovery = recLabel || (sev === 'Critical' ? 'months' : sev === 'High' ? 'weeks' : sev === 'Medium' ? 'weeks' : 'days');
  const inferredRecColor = !recLabel
    ? (sev === 'Critical' ? V3.accent.red : sev === 'High' ? V3.accent.amber : V3.accent.green)
    : recColor;

  const trendIcon = trend === 'Escalating' ? '\u2191' : trend === 'De-escalating' ? '\u2193' : trend === 'Stable' ? '\u2192' : '\u2022';
  const trendColor = trend === 'Escalating' ? V3.accent.red : trend === 'De-escalating' ? V3.accent.green : V3.accent.amber;

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
        <InfoBadge glossaryKey={`severity_${sev.toLowerCase()}`} badgeBg={sevCol} badgeFg={sevCol} theme={V3}>{sev}</InfoBadge>
      </div>

      {/* Category + Region + Trend row */}
      {(category || region || trend) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {category && (
            <span style={{
              fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO,
              color: V3.text.muted, background: V3.bg.base,
              padding: '2px 6px', borderRadius: 3, border: `1px solid ${V3.border.subtle}`,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{category}</span>
          )}
          {region && (
            <span style={{
              fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO,
              color: V3.accent.blue, background: V3.accent.blue + '12',
              padding: '2px 6px', borderRadius: 3, border: `1px solid ${V3.accent.blue}22`,
            }}>{region}</span>
          )}
          {trend && (
            <InfoBadge glossaryKey="trend" badgeBg={trendColor} badgeFg={trendColor} theme={V3}>
              {trendIcon} {trend}
            </InfoBadge>
          )}
        </div>
      )}

      {/* Description */}
      {description && (
        <p style={{ color: V3.text.secondary, fontSize: 12, lineHeight: 1.6, margin: '0 0 10px' }}>
          {description}
        </p>
      )}

      {/* SKF-specific exposure */}
      {skfExposure && (
        <div style={{
          background: V3.accent.red + '08', borderRadius: 6, padding: '8px 10px',
          border: `1px solid ${V3.accent.red}18`, marginBottom: 10,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: V3_FONT_MONO, color: V3.accent.red, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            SKF Exposure
          </div>
          <div style={{ fontSize: 11, color: V3.text.secondary, lineHeight: 1.5 }}>
            {skfExposure}
          </div>
        </div>
      )}

      {/* Dimension badges: velocity, recovery, probability */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <InfoBadge glossaryKey="velocity" badgeBg={inferredVelColor} badgeFg={inferredVelColor} theme={V3}>
          <span style={{ color: V3.text.muted, fontWeight: 500 }}>Velocity</span> {inferredVelocity}
          {!velLabel && <span style={{ fontSize: 7, opacity: 0.6 }}> est</span>}
        </InfoBadge>
        <InfoBadge glossaryKey="recovery" badgeBg={inferredRecColor} badgeFg={inferredRecColor} theme={V3}>
          <span style={{ color: V3.text.muted, fontWeight: 500 }}>Recovery</span> {inferredRecovery}
          {!recLabel && <span style={{ fontSize: 7, opacity: 0.6 }}> est</span>}
        </InfoBadge>
        {probPct != null && (
          <InfoBadge glossaryKey="probability" badgeBg={probColor} badgeFg={probColor} theme={V3}>
            <span style={{ color: V3.text.muted, fontWeight: 500 }}>Prob</span> {probPct}%
          </InfoBadge>
        )}
        {confidence != null && (
          <InfoBadge glossaryKey="confidence" badgeBg={V3.accent.blue} badgeFg={V3.accent.blue} theme={V3}>
            <span style={{ color: V3.text.muted, fontWeight: 500 }}>Confidence</span> {confidence}%
          </InfoBadge>
        )}
      </div>

      {/* Site exposure summary */}
      {totalSites > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 10,
          padding: '6px 10px', background: V3.bg.base, borderRadius: 6,
          border: `1px solid ${V3.border.subtle}`,
        }}>
          {[
            { value: mfgCount, label: 'MFG Sites', color: V3.accent.red, key: 'mfg_sites' },
            { value: totalSites, label: 'Total Sites', color: V3.accent.amber, key: 'total_sites' },
            { value: scanCount, label: 'Scans', color: V3.accent.blue, key: 'scans' },
          ].map((col, ci) => (
            <SiteStatCell key={col.key} glossaryKey={col.key} value={col.value} label={col.label} color={col.color} theme={V3} isLast={ci === 2} />
          ))}
        </div>
      )}

      {/* Sparkline */}
      <SeveritySparkline event={event} sevCol={sevCol} theme={V3} />

      {/* Score breakdown */}
      {cs?.components && <ScoreBreakdown components={cs.components} score={cs.score} sevCol={sevCol} theme={V3} />}

      {/* Tracking timeline */}
      {(firstSeen || lastSeen || sources.length > 0) && (
        <div style={{
          background: V3.bg.base, borderRadius: 6, padding: '8px 10px',
          border: `1px solid ${V3.border.subtle}`, marginTop: 8,
        }}>
          <div style={sectionHeader}>Tracking</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {firstSeen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <span style={{ color: V3.text.muted, fontFamily: V3_FONT_MONO, minWidth: 60 }}>First seen</span>
                <span style={{ color: V3.text.secondary }}>{firstSeen.toLocaleDateString()} {firstSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {lastSeen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <span style={{ color: V3.text.muted, fontFamily: V3_FONT_MONO, minWidth: 60 }}>Last seen</span>
                <span style={{ color: V3.text.secondary }}>{lastSeen.toLocaleDateString()} {lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {sources.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, marginTop: 2 }}>
                <span style={{ color: V3.text.muted, fontFamily: V3_FONT_MONO, minWidth: 60, flexShrink: 0 }}>Sources</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {sources.slice(0, 4).map((src, si) => (
                    <span key={si} style={{
                      fontSize: 9, fontFamily: V3_FONT_MONO,
                      color: V3.accent.blue, background: V3.accent.blue + '12',
                      padding: '1px 5px', borderRadius: 3,
                    }}>{src}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Site stat cell with glossary tooltip ── */
function SiteStatCell({ glossaryKey, value, label, color, theme: V3, isLast }: {
  glossaryKey: string; value: number; label: string; color: string; theme: V3Theme; isLast: boolean;
}) {
  const [show, setShow] = useState(false);
  const entry = GLOSSARY[glossaryKey];
  return (
    <>
      <div
        style={{ flex: 1, textAlign: 'center', position: 'relative', cursor: entry ? 'help' : 'default' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: V3_FONT_MONO, color }}>{value}</div>
        <div style={{ fontSize: 8, fontWeight: 600, color: V3.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {show && entry && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, marginTop: 4, padding: '6px 8px', borderRadius: 4, width: 200,
            background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)', textAlign: 'left',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: V3.text.primary, marginBottom: 3 }}>{entry.title}</div>
            <div style={{ fontSize: 9, color: V3.text.muted, lineHeight: 1.5 }}>{entry.body}</div>
          </div>
        )}
      </div>
      {!isLast && <div style={{ width: 1, background: V3.border.subtle }} />}
    </>
  );
}

/* ── Score Breakdown with methodology ── */

const SCORE_META: Record<string, { weight: string; short: string; detail: string }> = {
  magnitude: {
    weight: '30%',
    short: 'How severe is this type of event?',
    detail: 'Based on event category (Natural Disaster 90, Geopolitical 80, Logistics 70, Trade 50, Currency 40) blended 60/40 with AI-assessed severity. Escalating trend adds +15%.',
  },
  proximity: {
    weight: '25%',
    short: 'How close is it to our sites?',
    detail: 'Haversine distance from the event to each of 245 SKF sites within a 3,000 km radius, using square-root decay. If a shipping route or chokepoint passes through the disruption zone, routing dependency overrides distance (70% routing / 30% haversine).',
  },
  asset_criticality: {
    weight: '25%',
    short: 'How important are the affected sites?',
    detail: 'Site type weight (MFG 100, VA 80, Logistics 70, Sales 30, Admin 10) multiplied by business unit weight (Industrial/Aerospace 100, Seals 80, Lube 70, Magnetics 60). Takes worst-case across all affected sites.',
  },
  supply_chain_impact: {
    weight: '20%',
    short: 'How deep is the supply chain exposure?',
    detail: 'Logarithmic scaling on affected site count (1 site = 30, 5 = 70, 10+ = 90) with MFG bonus (+10 each, max +30). Amplified by supplier tier: Tier 1 sole-source 1.5x, Tier 1 1.2x, Tier 2 1.0x, Tier 3 0.8x.',
  },
};

function ScoreBreakdown({ components, score, sevCol, theme: V3 }: {
  components: Record<string, number>;
  score?: number;
  sevCol: string;
  theme: V3Theme;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const sectionHeader = sectionHeaderStyle(V3);

  return (
    <div style={{
      background: V3.bg.base, borderRadius: 6, padding: '8px 10px',
      border: `1px solid ${V3.border.subtle}`, marginTop: 8,
    }}>
      {/* Header with info toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={sectionHeader}>Score Breakdown</div>
        <button
          onClick={() => setShowInfo(p => !p)}
          style={{
            background: showInfo ? V3.accent.blue + '22' : 'transparent',
            border: `1px solid ${showInfo ? V3.accent.blue + '44' : V3.border.subtle}`,
            borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
            fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO,
            color: showInfo ? V3.accent.blue : V3.text.muted,
            transition: 'all 150ms',
          }}
        >?</button>
      </div>

      {/* Methodology panel */}
      {showInfo && (
        <div style={{
          background: V3.accent.blue + '08', borderRadius: 4, padding: '8px 10px',
          border: `1px solid ${V3.accent.blue}18`, marginBottom: 8, marginTop: 4,
        }}>
          <div style={{ fontSize: 10, color: V3.text.secondary, lineHeight: 1.6, marginBottom: 6 }}>
            Severity is scored 0–100 from four weighted components. The score is <strong style={{ color: V3.text.primary }}>deterministic</strong> — no AI in the scoring loop.
          </div>
          <div style={{ fontSize: 10, color: V3.text.secondary, lineHeight: 1.6, marginBottom: 6 }}>
            <strong style={{ color: V3.text.primary }}>Formula:</strong>{' '}
            <span style={{ fontFamily: V3_FONT_MONO, fontSize: 9 }}>
              Magnitude{'\u00D7'}30% + Proximity{'\u00D7'}25% + Criticality{'\u00D7'}25% + SC Impact{'\u00D7'}20%
            </span>
          </div>
          <div style={{ fontSize: 10, color: V3.text.secondary, lineHeight: 1.5 }}>
            <strong style={{ color: V3.text.primary }}>Labels:</strong>{' '}
            <span style={{ fontFamily: V3_FONT_MONO, fontSize: 9 }}>{'\u2265'}75 Critical, {'\u2265'}50 High, {'\u2265'}25 Medium, {'<'}25 Low</span>
          </div>
          <div style={{ fontSize: 9, color: V3.text.muted, marginTop: 6, fontStyle: 'italic' }}>
            Hover each component below for details.
          </div>
        </div>
      )}

      {/* Component bars */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(components).map(([key, val]) => {
          const meta = SCORE_META[key];
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const raw = typeof val === 'number' ? val : 0;
          const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
          const isHovered = hoveredKey === key;
          return (
            <div
              key={key}
              style={{ flex: '1 0 80px', minWidth: 80, position: 'relative' }}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <div style={{
                fontSize: 9, color: V3.text.muted, fontFamily: V3_FONT_MONO, marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {label}
                {meta && <span style={{ fontSize: 8, color: V3.text.muted, opacity: 0.6 }}>{meta.weight}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, height: 4, background: V3.border.subtle, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: sevCol, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: V3.text.secondary, fontFamily: V3_FONT_MONO }}>
                  {pct}
                </span>
              </div>
              {/* Tooltip on hover */}
              {isHovered && meta && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  marginTop: 4, padding: '6px 8px', borderRadius: 4,
                  background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: V3.text.primary, marginBottom: 3 }}>
                    {meta.short}
                  </div>
                  <div style={{ fontSize: 9, color: V3.text.muted, lineHeight: 1.5 }}>
                    {meta.detail}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Score tooltip wrapper ── */
function ScoreTooltipWrap({ theme: V3, children }: { theme: V3Theme; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const entry = GLOSSARY.severity_score;
  return (
    <div
      style={{ position: 'relative', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && entry && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          marginTop: 4, padding: '6px 8px', borderRadius: 4, width: 240,
          background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: V3.text.primary, marginBottom: 3 }}>{entry.title}</div>
          <div style={{ fontSize: 9, color: V3.text.muted, lineHeight: 1.5 }}>{entry.body}</div>
        </div>
      )}
    </div>
  );
}

/* ── Sparkline sub-component ── */
function SeveritySparkline({ event, sevCol, theme: V3 }: { event: DisruptionEvent; sevCol: string; theme: V3Theme }) {
  const score = event.computed_severity?.score;
  if (score == null) return null;

  // Use real severity history if available from backend
  const history: Array<{score: number; timestamp?: string}> =
    (event as any).severity_history || [];

  // If we have real history points, render an actual sparkline
  if (history.length >= 2) {
    const points = history.map(h => h.score);
    const w = 120, h2 = 28, px = 4;
    const minV = Math.min(...points) - 5;
    const maxV = Math.max(...points) + 5;
    const range = maxV - minV || 1;
    const coords = points.map((v, i) => ({
      x: px + (i / (points.length - 1)) * (w - 2 * px),
      y: px + (1 - (v - minV) / range) * (h2 - 2 * px),
    }));
    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');

    const delta = points[points.length - 1] - points[0];
    const deltaColor = delta > 5 ? V3.accent.red : delta < -5 ? V3.accent.green : V3.text.muted;
    const deltaLabel = delta > 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;

    return (
      <ScoreTooltipWrap theme={V3}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width={w} height={h2} style={{ flexShrink: 0 }}>
            <path d={pathD} fill="none" stroke={sevCol} strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 1.5}
                fill={i === coords.length - 1 ? sevCol : sevCol + '88'} />
            ))}
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 10, color: V3.text.muted, fontFamily: V3_FONT_MONO }}>
              {Math.round(score)}/100
            </span>
            <span style={{ fontSize: 9, color: deltaColor, fontFamily: V3_FONT_MONO, fontWeight: 700 }}>
              {deltaLabel} over {history.length} scan{history.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </ScoreTooltipWrap>
    );
  }

  // Fallback: single score with scan count (no fake data)
  const scanCount = event.scan_count || 1;
  const trend = (event as any).trend || '';
  const trendIcon = trend === 'Escalating' ? '\u2191' : trend === 'De-escalating' ? '\u2193' : trend === 'Stable' ? '\u2192' : '';
  const trendColor = trend === 'Escalating' ? V3.accent.red : trend === 'De-escalating' ? V3.accent.green : V3.text.muted;

  return (
    <ScoreTooltipWrap theme={V3}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20,
          background: sevCol + '15', border: `2px solid ${sevCol}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: V3_FONT_MONO, color: sevCol }}>
            {Math.round(score)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 10, color: V3.text.muted, fontFamily: V3_FONT_MONO }}>
            Severity score / 100
          </span>
          <span style={{ fontSize: 9, fontFamily: V3_FONT_MONO }}>
            {trendIcon && <span style={{ color: trendColor, fontWeight: 700 }}>{trendIcon} </span>}
            <span style={{ color: V3.text.muted }}>
              {scanCount} scan{scanCount > 1 ? 's' : ''} tracked
            </span>
          </span>
        </div>
      </div>
    </ScoreTooltipWrap>
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
    if (corridors.length > 6) {
      chainSteps[chainSteps.length - 1].items.push({ text: `+${corridors.length - 6} more`, badgeColor: V3.text.muted });
    }
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
    if (mfgSites.length > 6) {
      chainSteps[chainSteps.length - 1].items.push({ text: `+${mfgSites.length - 6} more`, badgeColor: V3.text.muted });
    }
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
    if (t1Inputs.length > 8) {
      chainSteps[chainSteps.length - 1].items.push({ text: `+${t1Inputs.length - 8} more`, badgeColor: V3.text.muted });
    }
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
    if (downstreamFactories.length > 6) {
      chainSteps[chainSteps.length - 1].items.push({ text: `+${downstreamFactories.length - 6} more`, badgeColor: V3.text.muted });
    }
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

/** Generate smart default actions based on event characteristics */
function generateDefaultActions(event: DisruptionEvent): ActionItemShape[] {
  const sev = (event.severity || 'Medium') as string;
  const region = event.region || '';
  const category = (event as any).category || (event.payload?.category as string | undefined) || '';
  const mfgSites = (event.affected_sites || []).filter(s => (s.type || '').toLowerCase() === 'mfg');
  const now = new Date().toISOString();
  const actions: ActionItemShape[] = [];
  let id = 0;

  const dueDate = (hoursFromNow: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hoursFromNow);
    return d.toISOString();
  };
  const urgencyHours = sev === 'Critical' ? 24 : sev === 'High' ? 48 : sev === 'Medium' ? 168 : 336;

  // Always: assess and communicate
  if (sev === 'Critical' || sev === 'High') {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: `Convene emergency response call for ${region || 'affected region'} exposure`,
    });
  }

  if (mfgSites.length > 0) {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: `Contact ${mfgSites.slice(0, 3).map(s => s.name).join(', ')}${mfgSites.length > 3 ? ` +${mfgSites.length - 3} more` : ''} for operational status`,
    });
  }

  // Category-specific actions
  const catLower = category.toLowerCase();
  if (catLower.includes('logistics') || catLower.includes('port')) {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Logistics',
      text: 'Review alternative shipping corridors and rerouting options',
    });
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Logistics',
      text: 'Check buffer stock levels at downstream distribution centers',
    });
  } else if (catLower.includes('natural') || catLower.includes('disaster')) {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: 'Verify employee safety and facility integrity at affected sites',
    });
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Procurement',
      text: 'Activate backup supplier contracts for affected inputs',
    });
  } else if (catLower.includes('geopolitical') || catLower.includes('sanction')) {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: 'Review compliance exposure and legal implications',
    });
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Procurement',
      text: 'Map alternative sourcing paths outside sanctioned regions',
    });
  } else if (catLower.includes('trade') || catLower.includes('tariff')) {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Procurement',
      text: 'Quantify cost impact of tariff changes on affected BUs',
    });
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: 'Evaluate nearshoring options to mitigate trade friction',
    });
  } else {
    // Generic fallbacks
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Procurement',
      text: 'Review supplier exposure and activate backup sourcing if needed',
    });
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'Logistics',
      text: 'Assess logistics corridor impact and identify rerouting options',
    });
  }

  // Always: monitor and brief
  actions.push({
    id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
    owner: 'SC Operations',
    text: `Set monitoring cadence: ${sev === 'Critical' ? 'every 4 hours' : sev === 'High' ? 'daily' : 'weekly'} updates until resolved`,
  });

  if (sev === 'Critical' || sev === 'High') {
    actions.push({
      id: id++, status: 'open', due: dueDate(urgencyHours), created: now,
      owner: 'SC Operations',
      text: 'Prepare executive briefing for VP Supply Chain with exposure summary',
    });
  }

  return actions;
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
    if (actionStr) {
      const parsed = parseActionsFromString(actionStr);
      if (parsed.length > 0) return parsed;
    }
    // Generate smart defaults based on event characteristics
    return generateDefaultActions(event);
  });
  const [backendLoaded, setBackendLoaded] = useState(false);
  const [status, setStatus] = useState(event.status || 'active');
  const [assignInput, setAssignInput] = useState('');
  const [showAssignInput, setShowAssignInput] = useState(false);

  const sectionHeader = sectionHeaderStyle(V3);

  useEffect(() => {
    setStatus(event.status || 'active');
  }, [event.status]);

  // Build event ID: prefer backend id, fall back to slug|region (matches backend _make_disruption_id)
  const resolvedId = useMemo(() => {
    if (event.id) return event.id;
    const name = (event.event || event.risk || 'unknown').toLowerCase().slice(0, 40).replace(/\s+/g, '-');
    const region = (event.region || 'unknown').toLowerCase().replace(/\s+/g, '-');
    return `${name}|${region}`;
  }, [event.id, event.event, event.risk, event.region]);

  useEffect(() => {
    if (!resolvedId || backendLoaded) return;
    fetchEventActions(resolvedId).then(backendActions => {
      if (backendActions && backendActions.length > 0) {
        setActions(backendActions.map(a => ({
          id: a.id,
          text: a.title || a.description || '',
          owner: a.assignee_hint || 'SC Operations',
          due: a.due_date || '',
          status: (a.status === 'completed' ? 'done' : 'open') as 'open' | 'done',
          created: '',
        })));
      }
      setBackendLoaded(true);
    });
  }, [resolvedId, backendLoaded]);

  const handleToggle = useCallback((id: string, done: boolean) => {
    setActions(prev => prev.map(a =>
      String(a.id) === id ? { ...a, status: done ? 'done' : 'open' } : a
    ));
    const numId = parseInt(id, 10);
    if (!isNaN(numId) && numId > 0) {
      updateActionStatus(numId, done ? 'completed' : 'pending');
    }
  }, []);

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
      {actions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 3, background: V3.border.subtle, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${(actions.filter(a => a.status === 'done').length / actions.length) * 100}%`,
              height: '100%', background: V3.accent.green, borderRadius: 2, transition: 'width 300ms'
            }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: V3_FONT_MONO, color: V3.text.muted, flexShrink: 0 }}>
            {actions.filter(a => a.status === 'done').length}/{actions.length}
          </span>
        </div>
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
            onClick={() => {
              if (assignInput.trim() && resolvedId) {
                assignTicket(resolvedId, assignInput.trim());
              }
              setShowAssignInput(false);
            }}
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
