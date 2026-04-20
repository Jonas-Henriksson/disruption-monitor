/**
 * ExpandedCard -- V3 shared detail component.
 * Renders inside both the feed (accordion expand) and the map (bottom-left panel).
 * Three tabs: Summary | Exposure | Act
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DisruptionEvent, ActionItemShape } from './expandedcard_types';
import type { Severity, SupplierAlternativesResponse, BackendAction, DirectoryUser } from '../../types';
import { ActionCheckbox } from './ActionCheckbox';
import { PeoplePicker } from './PeoplePicker';
import { BU_MAP } from '../../data/sites';
import { updateEventStatus, fetchSupplierAlternatives, fetchBuExposure, fetchEventActions, updateActionStatus, generateEventActions, assignTicket, fetchAssessment, fetchEvolutionLatest, submitEventFeedback, assignAction, completeAction, dismissAction, createManualAction } from '../../services/api';
import { enrichExposureData, computeImpactWithGraph } from '../../utils/impact';
import { ROUTES, SUPPLY_GRAPH } from '../../data';
import type { ScanItem, SupplyGraphInput } from '../../types';
import { V3_FONT, V3_FONT_MONO, sevColor, type V3Theme } from '../theme';
import { useV3Theme } from '../ThemeContext';

const TAB_KEY = 'v3-expanded-tab';

/* ── Shared caches (populated by preloader, read here) ───── */
import { assessmentCache as _assessmentCache, evolutionLatestCache as _evolutionLatestCache, evolutionAllCache as _evolutionAllCache, actionsCache as _actionsCache } from '../../services/preloader';

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
type Tab = 'summary' | 'evolution' | 'act';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary',   label: 'Summary' },
  { key: 'evolution', label: 'Evolution' },
  { key: 'act',       label: 'Act' },
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
  phase: {
    title: 'Situation Phase',
    body: 'AI-detected transitions in the nature of a disruption. As events evolve, they pass through phases — e.g. from "Initial Shock" to "Active Conflict" to "Structural Trade Shift". Each phase represents a qualitative change in how the event impacts supply chains.',
  },
  evolution_trajectory: {
    title: 'Severity Trajectory',
    body: 'Severity score plotted over time. Vertical dashed markers indicate phase transitions detected by the evolution analyzer. Rising trends suggest escalation; flat trends suggest stabilization.',
  },
  milestones: {
    title: 'Key Milestones',
    body: 'Significant changes detected by the evolution analyzer — severity jumps, new manufacturing sites affected, category shifts, or supply chain exposure changes.',
  },
  exposure_drift: {
    title: 'Exposure Drift',
    body: 'How SKF\'s exposure to this event has changed over time — new sites entering the risk zone, suppliers affected, or route dependencies shifting.',
  },
  forward_outlook: {
    title: 'Forward Outlook',
    body: 'AI projection of where this event is heading if the current trajectory continues without intervention.',
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

function HoverTip({ tip, theme: V3, children }: { tip: { title: string; body: string }; theme: V3Theme; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  if (!tip) return <>{children}</>;
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          marginTop: 4, padding: '6px 8px', borderRadius: 4, width: 220,
          background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'normal', cursor: 'default',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: V3.text.primary, marginBottom: 3 }}>{tip.title}</div>
          <div style={{ fontSize: 9, color: V3.text.muted, lineHeight: 1.5, fontWeight: 400, fontFamily: V3_FONT }}>{tip.body}</div>
        </div>
      )}
    </div>
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
        {tab === 'summary'  && <SummaryTab event={event} sev={sev} sevCol={sevCol} theme={V3} handleTab={handleTab} />}
        {tab === 'evolution' && <EvolutionTab event={event} sevCol={sevCol} theme={V3} />}
        {tab === 'act'      && <ActTab event={event} theme={V3} onStatusChange={onStatusChange} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1: Summary
   ══════════════════════════════════════════════ */
function SummaryTab({ event, sev, sevCol, theme: V3, handleTab }: { event: DisruptionEvent; sev: Severity; sevCol: string; theme: V3Theme; handleTab: (t: Tab) => void }) {
  const [assessment, setAssessment] = useState<string | null>((event as any).assessment || null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const assessmentFetched = useRef(false);

  useEffect(() => {
    // Use cached assessment from event payload if available
    if ((event as any).assessment) {
      setAssessment((event as any).assessment);
      return;
    }
    const eventId = (event as any).id || (event as any).event_id || '';
    if (!eventId) return;
    // Check module-level cache first
    const cached = _assessmentCache.get(eventId);
    if (cached) { setAssessment(cached); return; }
    if (assessmentFetched.current) return;
    assessmentFetched.current = true;
    setAssessmentLoading(true);
    fetchAssessment(eventId)
      .then(res => {
        if (res?.assessment) {
          _assessmentCache.set(eventId, res.assessment);
          setAssessment(res.assessment);
        }
      })
      .finally(() => setAssessmentLoading(false));
  }, [event]);

  const [evolutionLatest, setEvolutionLatest] = useState<any>(null);
  const evolutionFetched = useRef(false);

  useEffect(() => {
    const eventId = (event as any).id || (event as any).event_id || '';
    if (!eventId) return;
    // Check module-level cache first
    const cached = _evolutionLatestCache.get(eventId);
    if (cached) { setEvolutionLatest(cached); return; }
    if (evolutionFetched.current) return;
    evolutionFetched.current = true;
    fetchEvolutionLatest(eventId).then(res => {
      if (res?.summary) {
        _evolutionLatestCache.set(eventId, res.summary);
        setEvolutionLatest(res.summary);
      }
    });
  }, [event]);

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
          {!velLabel && <span style={{ fontSize: 9, opacity: 0.6 }}> est</span>}
        </InfoBadge>
        <InfoBadge glossaryKey="recovery" badgeBg={inferredRecColor} badgeFg={inferredRecColor} theme={V3}>
          <span style={{ color: V3.text.muted, fontWeight: 500 }}>Recovery</span> {inferredRecovery}
          {!recLabel && <span style={{ fontSize: 9, opacity: 0.6 }}> est</span>}
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

      {/* AI risk assessment */}
      {assessmentLoading && (
        <div style={{
          padding: '8px 10px', borderRadius: 6, marginBottom: 10,
          background: V3.bg.base, border: `1px solid ${V3.border.subtle}`,
        }}>
          <div style={{ fontSize: 11, color: V3.text.muted, fontStyle: 'italic' }}>
            Generating risk assessment...
          </div>
        </div>
      )}
      {assessment && !assessmentLoading && (
        <div style={{
          padding: '8px 10px', borderRadius: 6, marginBottom: 10,
          background: V3.bg.base, border: `1px solid ${V3.border.subtle}`,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO,
            color: V3.text.muted, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 4,
          }}>
            Risk Assessment
          </div>
          <div style={{
            fontSize: 11, color: V3.text.secondary, lineHeight: 1.6,
          }}>
            {assessment}
          </div>
        </div>
      )}

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

      {/* Compact evolution card */}
      {evolutionLatest && (
        <div
          style={{
            background: V3.bg.base, borderRadius: 6, padding: '8px 10px',
            border: `1px solid ${V3.border.subtle}`, marginTop: 8,
            cursor: 'pointer',
          }}
          onClick={() => handleTab('evolution')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <InfoBadge glossaryKey="phase" badgeBg={sevCol} badgeFg={sevCol} theme={V3}>
                PHASE {evolutionLatest.phase_number}
              </InfoBadge>
              <span style={{ fontSize: 10, color: V3.text.secondary }}>
                {evolutionLatest.phase_label}
              </span>
            </div>
            <span style={{ fontSize: 9, color: V3.accent.blue, fontFamily: V3_FONT_MONO }}>
              View timeline →
            </span>
          </div>
          {(() => {
            try {
              const vals: number[] = JSON.parse(evolutionLatest.severity_values || '[]');
              if (vals.length < 2) return null;
              const w = 200; const h = 28; const pad = 2;
              // Fixed 0-100 scale
              const toY = (v: number) => pad + (h - 2 * pad) - (Math.min(v, 100) / 100) * (h - 2 * pad);
              const pts = vals.map((v: number, i: number) => `${(i / (vals.length - 1)) * w},${toY(v)}`).join(' ');
              const area = `0,${toY(0)} ${pts} ${w},${toY(0)}`;
              const last = vals[vals.length - 1];
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
                    <defs>
                      <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sevCol} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={sevCol} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <polygon points={area} fill="url(#sparkFill)" />
                    <polyline points={pts} fill="none" stroke={sevCol} strokeWidth={1.5} strokeLinecap="round" />
                    <circle cx={w} cy={toY(last)} r={2.5} fill={sevCol} />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO, color: sevCol }}>
                    {Math.round(last)}
                  </span>
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      )}

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

/* ── Action templates for the "Add Action" menu ── */
const ACTION_TEMPLATES: { type: string; title: string }[] = [
  { type: 'activate_backup_supplier', title: 'Activate backup supplier' },
  { type: 'increase_safety_stock', title: 'Increase safety stock' },
  { type: 'reroute_shipment', title: 'Reroute shipment' },
  { type: 'contact_supplier', title: 'Contact supplier' },
  { type: 'monitor_situation', title: 'Monitor situation' },
  { type: 'escalate_to_leadership', title: 'Escalate to leadership' },
  { type: 'file_insurance_claim', title: 'File insurance claim' },
  { type: 'activate_bcp', title: 'Activate BCP' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#22c55e',
};

/* ── Group repetitive actions into collapsible clusters ────── */
function GroupedActions({ actions, theme: V3, renderAction }: {
  actions: BackendAction[];
  theme: V3Theme;
  renderAction: (action: BackendAction) => React.ReactNode;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group actions by prefix pattern (e.g., "Review alternative suppliers for")
  const { standalone, groups } = useMemo(() => {
    const GROUP_THRESHOLD = 3; // min items to form a group
    // Extract the action verb prefix (everything before "for X at Y" or "at Y")
    const prefixOf = (title: string): string => {
      // Match patterns like "Review alternative suppliers for Steel at Pune"
      const m = title.match(/^(.+?)\s+(?:for\s+.+?\s+at\s+|at\s+)/i);
      return m ? m[1].trim() : '';
    };

    const prefixMap = new Map<string, BackendAction[]>();
    const solo: BackendAction[] = [];

    // First pass: count prefix occurrences
    const prefixCounts = new Map<string, number>();
    for (const a of actions) {
      const p = prefixOf(a.title);
      if (p) prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
    }

    // Second pass: group or keep standalone
    for (const a of actions) {
      const p = prefixOf(a.title);
      if (p && (prefixCounts.get(p) || 0) >= GROUP_THRESHOLD) {
        if (!prefixMap.has(p)) prefixMap.set(p, []);
        prefixMap.get(p)!.push(a);
      } else {
        solo.push(a);
      }
    }

    return { standalone: solo, groups: Array.from(prefixMap.entries()) };
  }, [actions]);

  if (groups.length === 0) {
    // No grouping needed — render flat
    return <>{actions.map(a => renderAction(a))}</>;
  }

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Render: standalone first, then grouped
  return (
    <>
      {standalone.map(a => renderAction(a))}
      {groups.map(([prefix, items]) => {
        const isExpanded = expandedGroups.has(prefix);
        const pendingCount = items.filter(a => a.status === 'pending' || a.status === 'assigned').length;
        const completedCount = items.filter(a => a.status === 'completed').length;
        const dismissedCount = items.filter(a => a.status === 'dismissed').length;
        // Extract unique site names from titles
        const sites = items.map(a => {
          const m = a.title.match(/at\s+(.+)$/i);
          return m ? m[1] : '';
        }).filter(Boolean);

        return (
          <div key={prefix} style={{ marginBottom: 2 }}>
            <button
              onClick={() => toggleGroup(prefix)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 0', cursor: 'pointer', background: 'none',
                border: 'none', borderBottom: `1px solid ${V3.border.subtle}`,
                fontFamily: V3_FONT, textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 8, color: V3.text.muted, fontFamily: V3_FONT_MONO,
                width: 12, textAlign: 'center', flexShrink: 0,
              }}>
                {isExpanded ? '\u25BC' : '\u25B6'}
              </span>
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                fontFamily: V3_FONT_MONO, textTransform: 'uppercase' as const,
                background: V3.accent.blue + '22', color: V3.accent.blue,
                border: `1px solid ${V3.accent.blue}44`, flexShrink: 0,
              }}>AI</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: V3.text.primary }}>
                  {prefix} <span style={{ color: V3.text.muted, fontWeight: 400 }}>
                    ({items.length} sites)
                  </span>
                </div>
                <div style={{ fontSize: 9, color: V3.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sites.slice(0, 4).join(', ')}{sites.length > 4 ? ` +${sites.length - 4} more` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {pendingCount > 0 && (
                  <span style={{ fontSize: 8, fontFamily: V3_FONT_MONO, color: V3.accent.blue, padding: '1px 4px', borderRadius: 3, background: V3.accent.blue + '15' }}>
                    {pendingCount} open
                  </span>
                )}
                {completedCount > 0 && (
                  <span style={{ fontSize: 8, fontFamily: V3_FONT_MONO, color: V3.accent.green, padding: '1px 4px', borderRadius: 3, background: V3.accent.green + '15' }}>
                    {completedCount} done
                  </span>
                )}
                {dismissedCount > 0 && (
                  <span style={{ fontSize: 8, fontFamily: V3_FONT_MONO, color: V3.text.muted, padding: '1px 4px', borderRadius: 3, background: V3.bg.badge }}>
                    {dismissedCount} skip
                  </span>
                )}
              </div>
            </button>
            {isExpanded && items.map(a => renderAction(a))}
          </div>
        );
      })}
    </>
  );
}

function ActTab({ event, theme: V3, onStatusChange }: { event: DisruptionEvent; theme: V3Theme; onStatusChange?: (eventId: string, newStatus: string) => void }) {
  const [actions, setActions] = useState<BackendAction[]>([]);
  const [backendLoaded, setBackendLoaded] = useState(false);
  const [status, setStatus] = useState(event.status || 'active');
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const sectionHeader = sectionHeaderStyle(V3);

  useEffect(() => {
    setStatus(event.status || 'active');
  }, [event.status]);

  // Build event ID: prefer backend id, fall back to slug|region
  const resolvedId = useMemo(() => {
    if (event.id) return event.id;
    const name = (event.event || event.risk || 'unknown').toLowerCase().slice(0, 40).replace(/\s+/g, '-');
    const region = (event.region || 'unknown').toLowerCase().replace(/\s+/g, '-');
    return `${name}|${region}`;
  }, [event.id, event.event, event.risk, event.region]);

  // Map raw backend actions to typed BackendAction shape
  const mapActions = useCallback((raw: any[], eid: string): BackendAction[] =>
    raw.map(a => ({
      id: a.id,
      event_id: eid,
      action_type: a.action_type || 'monitor_situation',
      title: a.title || a.description || '',
      description: a.description ?? null,
      assignee_hint: a.assignee_hint ?? null,
      priority: (a.priority || 'normal') as BackendAction['priority'],
      status: (a.status || 'pending') as BackendAction['status'],
      due_date: a.due_date ?? null,
      source: ((a as any).source || 'ai') as BackendAction['source'],
      assignee_email: (a as any).assignee_email ?? null,
      assignee_name: (a as any).assignee_name ?? null,
      created_by_email: (a as any).created_by_email ?? null,
      created_by_name: (a as any).created_by_name ?? null,
      completion_note: (a as any).completion_note ?? null,
      evidence_url: (a as any).evidence_url ?? null,
      completed_at: (a as any).completed_at ?? null,
      completed_by_email: (a as any).completed_by_email ?? null,
      completed_by_name: (a as any).completed_by_name ?? null,
      dismissed_reason: (a as any).dismissed_reason ?? null,
      dismissed_at: (a as any).dismissed_at ?? null,
      dismissed_by_email: (a as any).dismissed_by_email ?? null,
      created_at: (a as any).created_at || '',
      updated_at: (a as any).updated_at || '',
    })), []);

  // Fetch backend actions — check preloader cache first
  useEffect(() => {
    if (!resolvedId || backendLoaded) return;
    // Try cache from preloader
    const cached = _actionsCache.get(resolvedId);
    if (cached && cached.length > 0) {
      setActions(mapActions(cached, resolvedId));
      setBackendLoaded(true);
      return;
    }
    fetchEventActions(resolvedId).then(backendActions => {
      if (backendActions && backendActions.length > 0) {
        _actionsCache.set(resolvedId, backendActions);
        setActions(mapActions(backendActions, resolvedId));
      }
      setBackendLoaded(true);
    });
  }, [resolvedId, backendLoaded, mapActions]);

  // Progress computation (exclude dismissed from denominator)
  const activeActions = actions.filter(a => a.status !== 'dismissed');
  const completedCount = activeActions.filter(a => a.status === 'completed').length;
  const progressPct = activeActions.length > 0 ? (completedCount / activeActions.length) * 100 : 0;

  const handleAssign = useCallback(async (actionId: number, user: DirectoryUser) => {
    const result = await assignAction(actionId, { email: user.email, name: user.displayName });
    if (result) {
      setActions(prev => prev.map(a => a.id === actionId ? { ...a, status: 'assigned' as const, assignee_email: user.email, assignee_name: user.displayName } : a));
      // Invalidate preloader cache so re-open reflects the assignment
      _actionsCache.delete(resolvedId);
    } else {
      console.warn('[SC Hub] Action assign failed for id', actionId);
    }
    setAssigningId(null);
  }, [resolvedId]);

  const handleComplete = useCallback(async (actionId: number) => {
    if (!completionNote.trim()) return;
    const result = await completeAction(actionId, completionNote.trim(), evidenceUrl.trim() || undefined);
    if (result) {
      setActions(prev => prev.map(a => a.id === actionId ? {
        ...a, status: 'completed' as const,
        completion_note: completionNote.trim(),
        evidence_url: evidenceUrl.trim() || null,
        completed_at: new Date().toISOString(),
      } : a));
    }
    setCompletingId(null);
    setCompletionNote('');
    setEvidenceUrl('');
  }, [completionNote, evidenceUrl]);

  const handleDismiss = useCallback(async (actionId: number) => {
    const result = await dismissAction(actionId, dismissReason.trim() || undefined);
    if (result) {
      setActions(prev => prev.map(a => a.id === actionId ? {
        ...a, status: 'dismissed' as const,
        dismissed_reason: dismissReason.trim() || null,
        dismissed_at: new Date().toISOString(),
      } : a));
    }
    setDismissingId(null);
    setDismissReason('');
  }, [dismissReason]);

  const handleAddAction = useCallback(async (actionType: string, title: string) => {
    const result = await createManualAction(resolvedId, { action_type: actionType, title });
    if (result) {
      setActions(prev => [...prev, result]);
    }
    setShowAddMenu(false);
    setShowCustomInput(false);
    setCustomTitle('');
  }, [resolvedId]);

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
      {/* Progress bar */}
      <div style={sectionHeader}>Actions</div>
      {activeActions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 3, background: V3.border.subtle, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`,
              height: '100%', background: V3.accent.green, borderRadius: 2, transition: 'width 300ms',
            }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: V3_FONT_MONO, color: V3.text.muted, flexShrink: 0 }}>
            {completedCount} of {activeActions.length} complete
          </span>
        </div>
      )}

      {/* Action rows — grouped when repetitive */}
      {actions.length === 0 && backendLoaded && (
        <EmptyRow label="No actions yet -- add one below" theme={V3} />
      )}
      <GroupedActions actions={actions} theme={V3} renderAction={(action) => {
        const isDismissed = action.status === 'dismissed';
        const isCompleted = action.status === 'completed';
        const isUnassigned = !action.assignee_email && action.status === 'pending';

        return (
          <div key={action.id} style={{
            padding: '6px 0',
            borderBottom: `1px solid ${V3.border.subtle}`,
            opacity: isDismissed ? 0.4 : isUnassigned ? 0.7 : 1,
            textDecoration: isDismissed ? 'line-through' : 'none',
          }}
            title={isDismissed && action.dismissed_reason ? `Dismissed: ${action.dismissed_reason}` : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Source badge */}
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                fontFamily: V3_FONT_MONO, textTransform: 'uppercase' as const,
                background: action.source === 'ai' ? V3.accent.blue + '22' : V3.accent.green + '22',
                color: action.source === 'ai' ? V3.accent.blue : V3.accent.green,
                border: `1px solid ${action.source === 'ai' ? V3.accent.blue + '44' : V3.accent.green + '44'}`,
                flexShrink: 0,
              }}>
                {action.source === 'ai' ? 'AI' : action.created_by_name || 'Manual'}
              </span>

              {/* Priority dot */}
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.normal,
              }} />

              {/* Title + assignee */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: isCompleted ? V3.accent.green : V3.text.primary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {isCompleted && '\u2713 '}{action.title}
                </div>
                <div style={{ fontSize: 9, color: V3.text.muted }}>
                  {action.assignee_name || action.assignee_hint || 'Unassigned'}
                  {action.due_date && ` \u00B7 Due ${action.due_date.slice(0, 10)}`}
                </div>
              </div>

              {/* Status buttons */}
              {!isCompleted && !isDismissed && (
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {!action.assignee_email && (
                    <button
                      onClick={e => { e.stopPropagation(); setAssigningId(assigningId === action.id ? null : action.id); }}
                      style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                        background: V3.bg.badge, color: V3.text.muted, border: `1px solid ${V3.border.subtle}`,
                        fontFamily: V3_FONT,
                      }}
                    >Assign</button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setCompletingId(completingId === action.id ? null : action.id); }}
                    style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                      background: V3.accent.green + '18', color: V3.accent.green, border: `1px solid ${V3.accent.green}44`,
                      fontFamily: V3_FONT,
                    }}
                  >Done</button>
                  <button
                    onClick={e => { e.stopPropagation(); setDismissingId(dismissingId === action.id ? null : action.id); }}
                    style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                      background: V3.bg.badge, color: V3.text.muted, border: `1px solid ${V3.border.subtle}`,
                      fontFamily: V3_FONT,
                    }}
                  >Dismiss</button>
                </div>
              )}
            </div>

            {/* Completed action details */}
            {isCompleted && action.completion_note && (
              <div style={{ fontSize: 9, color: V3.text.muted, marginTop: 3, paddingLeft: 20 }}>
                {action.completion_note}
                {action.evidence_url && (
                  <> &mdash; <a href={action.evidence_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: V3.accent.blue, textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >evidence</a></>
                )}
              </div>
            )}

            {/* Inline assign with PeoplePicker */}
            {assigningId === action.id && (
              <div style={{ marginTop: 4, paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                <PeoplePicker onSelect={user => handleAssign(action.id, user)} placeholder="Search directory..." />
              </div>
            )}

            {/* Inline completion form */}
            {completingId === action.id && (
              <div style={{ marginTop: 4, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
                <textarea
                  value={completionNote}
                  onChange={e => setCompletionNote(e.target.value)}
                  placeholder="Completion note (required)..."
                  rows={2}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 10,
                    background: V3.bg.base, color: V3.text.primary,
                    border: `1px solid ${V3.border.default}`, borderRadius: 4,
                    fontFamily: V3_FONT, outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box' as const,
                  }}
                />
                <input
                  value={evidenceUrl}
                  onChange={e => setEvidenceUrl(e.target.value)}
                  placeholder="Evidence URL (optional)"
                  style={{
                    width: '100%', padding: '4px 8px', fontSize: 10,
                    background: V3.bg.base, color: V3.text.primary,
                    border: `1px solid ${V3.border.default}`, borderRadius: 4,
                    fontFamily: V3_FONT, outline: 'none',
                    boxSizing: 'border-box' as const,
                  }}
                />
                <button
                  onClick={() => handleComplete(action.id)}
                  disabled={!completionNote.trim()}
                  style={{
                    alignSelf: 'flex-start', padding: '3px 10px', fontSize: 10, fontWeight: 600,
                    background: completionNote.trim() ? V3.accent.green + '22' : V3.bg.badge,
                    color: completionNote.trim() ? V3.accent.green : V3.text.muted,
                    border: `1px solid ${completionNote.trim() ? V3.accent.green + '44' : V3.border.subtle}`,
                    borderRadius: 4, cursor: completionNote.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: V3_FONT,
                  }}
                >Submit</button>
              </div>
            )}

            {/* Inline dismiss form */}
            {dismissingId === action.id && (
              <div style={{ marginTop: 4, paddingLeft: 20, display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                <input
                  value={dismissReason}
                  onChange={e => setDismissReason(e.target.value)}
                  placeholder="Reason (optional)"
                  style={{
                    flex: 1, padding: '4px 8px', fontSize: 10,
                    background: V3.bg.base, color: V3.text.primary,
                    border: `1px solid ${V3.border.default}`, borderRadius: 4,
                    fontFamily: V3_FONT, outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleDismiss(action.id)}
                  style={{
                    padding: '3px 10px', fontSize: 10, fontWeight: 600,
                    background: V3.accent.red + '18', color: V3.accent.red,
                    border: `1px solid ${V3.accent.red}44`, borderRadius: 4,
                    cursor: 'pointer', fontFamily: V3_FONT,
                  }}
                >Dismiss</button>
              </div>
            )}
          </div>
        );
      }} />

      {/* Add Action button + menu */}
      <div style={{ marginTop: 8, position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setShowAddMenu(!showAddMenu); }}
          style={{
            fontSize: 10, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            background: V3.accent.blue + '18', color: V3.accent.blue,
            border: `1px solid ${V3.accent.blue}44`, fontFamily: V3_FONT, fontWeight: 600,
          }}
        >+ Add Action</button>
        {showAddMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
            background: V3.bg.card, border: `1px solid ${V3.border.default}`,
            borderRadius: 6, padding: 4, minWidth: 220,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            {ACTION_TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => handleAddAction(t.type, t.title)}
                style={{
                  display: 'block', width: '100%', padding: '5px 8px', fontSize: 10,
                  background: 'transparent', color: V3.text.primary, border: 'none',
                  borderRadius: 4, cursor: 'pointer', textAlign: 'left', fontFamily: V3_FONT,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >{t.title}</button>
            ))}
            <div style={{ borderTop: `1px solid ${V3.border.subtle}`, margin: '4px 0' }} />
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                style={{
                  display: 'block', width: '100%', padding: '5px 8px', fontSize: 10,
                  background: 'transparent', color: V3.accent.blue, border: 'none',
                  borderRadius: 4, cursor: 'pointer', textAlign: 'left', fontFamily: V3_FONT,
                  fontWeight: 600,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >Custom action...</button>
            ) : (
              <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                <input
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  placeholder="Action title..."
                  autoFocus
                  style={{
                    flex: 1, padding: '4px 8px', fontSize: 10,
                    background: V3.bg.base, color: V3.text.primary,
                    border: `1px solid ${V3.border.default}`, borderRadius: 4,
                    fontFamily: V3_FONT, outline: 'none',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && customTitle.trim()) handleAddAction('custom', customTitle.trim()); }}
                />
                <button
                  onClick={() => { if (customTitle.trim()) handleAddAction('custom', customTitle.trim()); }}
                  disabled={!customTitle.trim()}
                  style={{
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    background: customTitle.trim() ? V3.accent.blue + '22' : V3.bg.badge,
                    color: customTitle.trim() ? V3.accent.blue : V3.text.muted,
                    border: `1px solid ${customTitle.trim() ? V3.accent.blue + '44' : V3.border.subtle}`,
                    borderRadius: 4, cursor: customTitle.trim() ? 'pointer' : 'default',
                    fontFamily: V3_FONT,
                  }}
                >Add</button>
              </div>
            )}
          </div>
        )}
      </div>

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
      </div>

      {/* Communicate */}
      <div style={sectionHeader}>Communicate</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
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

      {/* Signal Quality Feedback */}
      <div style={sectionHeader}>Signal Quality</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {(['true_positive', 'false_positive'] as const).map(outcome => (
          <button
            key={outcome}
            onClick={async () => {
              const ok = await submitEventFeedback(resolvedId, outcome);
              if (ok) setFeedbackSent(outcome);
            }}
            disabled={!!feedbackSent}
            style={{
              padding: '4px 10px', fontSize: 10, borderRadius: 4, cursor: feedbackSent ? 'default' : 'pointer',
              border: `1px solid ${feedbackSent === outcome ? V3.accent.green : V3.border.default}`,
              background: feedbackSent === outcome ? V3.severity.lowBg : V3.bg.card,
              color: feedbackSent === outcome ? V3.accent.green : V3.text.secondary,
              fontFamily: V3_FONT, opacity: feedbackSent && feedbackSent !== outcome ? 0.4 : 1,
            }}
          >
            {outcome === 'true_positive' ? '\u2713 Accurate' : '\u2717 False alarm'}
          </button>
        ))}
        {feedbackSent && (
          <span style={{ fontSize: 9, color: V3.text.muted, alignSelf: 'center' }}>
            Thanks — this improves future scans
          </span>
        )}
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

/* ══════════════════════════════════════════════
   TAB: Evolution
   ══════════════════════════════════════════════ */
function EvolutionTab({ event, sevCol, theme: V3 }: { event: DisruptionEvent; sevCol: string; theme: V3Theme }) {
  const eventId = (event as any).id || (event as any).event_id || '';
  const cached = eventId ? _evolutionAllCache.get(eventId) : undefined;
  const [summaries, setSummaries] = useState<any[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const fetched = useRef(!!cached);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    if (!eventId) { setLoading(false); return; }
    import('../../services/api').then(({ fetchEvolution }) =>
      fetchEvolution(eventId).then(res => {
        if (res?.summaries) {
          _evolutionAllCache.set(eventId, res.summaries);
          setSummaries(res.summaries);
        }
        setLoading(false);
      })
    );
  }, [event]);

  const sectionHeader = sectionHeaderStyle(V3);

  if (loading) {
    return <div style={{ padding: 12, color: V3.text.muted, fontSize: 11, fontStyle: 'italic' }}>Loading evolution data...</div>;
  }

  if (summaries.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: 'center', color: V3.text.muted }}>
        <div style={{ fontSize: 11, marginBottom: 4 }}>No evolution data yet</div>
        <div style={{ fontSize: 9 }}>Evolution analysis runs automatically based on event severity. Check back after the first analysis cycle.</div>
      </div>
    );
  }

  const latest = summaries[summaries.length - 1];
  const phaseLabel = latest.phase_label || 'Unknown';
  const phaseNumber = latest.phase_number || 1;

  // Collect severity values with date labels from summaries
  const allSevValues: number[] = [];
  const dateLabels: string[] = [];
  const phaseMarkers: { index: number; label: string; number: number }[] = [];
  let lastPhase = '';
  for (const s of summaries) {
    const vals: number[] = (() => { try { return JSON.parse(s.severity_values || '[]'); } catch { return []; } })();
    const periodStart = s.period_start || '';
    for (let vi = 0; vi < vals.length; vi++) {
      if (s.phase_label && s.phase_label !== lastPhase) {
        phaseMarkers.push({ index: allSevValues.length, label: s.phase_label, number: s.phase_number });
        lastPhase = s.phase_label;
      }
      allSevValues.push(vals[vi]);
      // First point of each summary gets the date label
      dateLabels.push(vi === 0 ? periodStart : '');
    }
  }

  // Collect all milestones
  const allMilestones: { date: string; description: string }[] = [];
  const seenMilestones = new Set<string>();
  for (const s of summaries) {
    const devs: any[] = (() => { try { return JSON.parse(s.key_developments || '[]'); } catch { return []; } })();
    for (const d of devs) {
      const key = `${d.date}|${d.description}`;
      if (!seenMilestones.has(key)) {
        seenMilestones.add(key);
        allMilestones.push(d);
      }
    }
  }
  allMilestones.sort((a, b) => a.date.localeCompare(b.date));

  const exposureDelta = latest.exposure_delta || '';
  const forwardOutlook = latest.forward_outlook || '';
  const narrative = latest.narrative || '';

  // ── Severity trajectory chart (fixed 0-100 scale) ──
  const chartW = 340;
  const chartH = 130;
  const padL = 28;  // left padding for Y labels
  const padR = 8;
  const padT = 8;
  const padB = 18;  // bottom padding for X labels
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  // Severity zone bands (0-100 fixed scale)
  const sevZones = [
    { min: 75, max: 100, color: V3.severity.critical, label: 'Critical' },
    { min: 50, max: 75, color: V3.severity.high, label: 'High' },
    { min: 25, max: 50, color: V3.severity.medium, label: 'Medium' },
    { min: 0, max: 25, color: V3.severity.low, label: 'Low' },
  ];

  const toX = (i: number) => padL + (allSevValues.length > 1 ? (i / (allSevValues.length - 1)) * plotW : plotW / 2);
  const toY = (v: number) => padT + plotH - (Math.min(v, 100) / 100) * plotH;

  // Build polyline and area fill
  const linePoints = allSevValues.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPoints = `${toX(0)},${toY(0)} ${linePoints} ${toX(allSevValues.length - 1)},${toY(0)}`;

  // Select ~4-5 evenly spaced date labels for X axis
  const xLabels: { x: number; label: string }[] = [];
  const uniqueDates = dateLabels.map((d, i) => ({ date: d, index: i })).filter(d => d.date);
  if (uniqueDates.length > 0) {
    const step = Math.max(1, Math.floor(uniqueDates.length / 4));
    for (let i = 0; i < uniqueDates.length; i += step) {
      const d = uniqueDates[i];
      const short = d.date.slice(5); // MM-DD
      xLabels.push({ x: toX(d.index), label: short });
    }
    // Always include last date
    const last = uniqueDates[uniqueDates.length - 1];
    if (!xLabels.find(l => l.label === last.date.slice(5))) {
      xLabels.push({ x: toX(last.index), label: last.date.slice(5) });
    }
  }

  // Current value
  const currentVal = allSevValues[allSevValues.length - 1];
  const currentLabel = currentVal >= 75 ? 'Critical' : currentVal >= 50 ? 'High' : currentVal >= 25 ? 'Medium' : 'Low';

  return (
    <div>
      {/* Phase banner */}
      <HoverTip tip={GLOSSARY.phase} theme={V3}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
            background: sevCol + '18', color: sevCol, border: `1px solid ${sevCol}33`,
            fontFamily: V3_FONT_MONO, textTransform: 'uppercase',
          }}>
            Phase {phaseNumber}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: V3.text.primary }}>{phaseLabel}</span>
          <span style={{ fontSize: 9, color: V3.text.muted, fontFamily: V3_FONT_MONO, marginLeft: 'auto' }}>
            since {latest.period_start}
          </span>
        </div>
      </HoverTip>

      {/* Severity trajectory chart */}
      {allSevValues.length >= 2 && (
        <div>
          <HoverTip tip={GLOSSARY.evolution_trajectory} theme={V3}>
            <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Severity Trajectory</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: V3_FONT_MONO,
                color: sevCol, padding: '1px 6px', borderRadius: 3,
                background: sevCol + '18',
              }}>
                {Math.round(currentVal)}/100 {currentLabel}
              </span>
            </div>
          </HoverTip>
          <div style={{
            background: V3.bg.base, borderRadius: 6, padding: '8px 4px 4px 4px',
            border: `1px solid ${V3.border.subtle}`, marginBottom: 10,
          }}>
            <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="sevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sevCol} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={sevCol} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              {/* Severity zone bands */}
              {sevZones.map(z => (
                <rect key={z.label}
                  x={padL} y={toY(z.max)} width={plotW} height={toY(z.min) - toY(z.max)}
                  fill={z.color} opacity={0.06}
                />
              ))}

              {/* Horizontal grid lines at 25, 50, 75 with labels */}
              {[25, 50, 75].map(v => (
                <g key={v}>
                  <line x1={padL} y1={toY(v)} x2={padL + plotW} y2={toY(v)}
                    stroke={V3.border.subtle} strokeWidth={0.5} strokeDasharray="3,3" />
                  <text x={padL - 3} y={toY(v) + 3} textAnchor="end"
                    fill={V3.text.muted} fontSize={7} fontFamily={V3_FONT_MONO}>{v}</text>
                </g>
              ))}
              {/* 0 and 100 labels */}
              <text x={padL - 3} y={toY(0) + 3} textAnchor="end" fill={V3.text.muted} fontSize={7} fontFamily={V3_FONT_MONO}>0</text>
              <text x={padL - 3} y={toY(100) + 3} textAnchor="end" fill={V3.text.muted} fontSize={7} fontFamily={V3_FONT_MONO}>100</text>

              {/* X-axis date labels */}
              {xLabels.map((lbl, i) => (
                <text key={i} x={lbl.x} y={chartH - 2} textAnchor="middle"
                  fill={V3.text.muted} fontSize={7} fontFamily={V3_FONT_MONO}>{lbl.label}</text>
              ))}

              {/* Area fill under curve */}
              <polygon points={areaPoints} fill="url(#sevFill)" />

              {/* Main severity line */}
              <polyline points={linePoints}
                fill="none" stroke={sevCol} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
              />

              {/* Phase transition markers */}
              {phaseMarkers.map((pm, pi) => {
                const x = toX(pm.index);
                return (
                  <g key={pi}>
                    <line x1={x} y1={padT} x2={x} y2={padT + plotH}
                      stroke={V3.accent.blue} strokeWidth={1} strokeDasharray="3,3" opacity={0.4} />
                    <text x={x + 3} y={padT + 7} fill={V3.accent.blue}
                      fontSize={8} fontFamily={V3_FONT_MONO} opacity={0.8}>
                      P{pm.number}
                    </text>
                    <circle cx={x} cy={toY(allSevValues[pm.index] || 0)} r={3}
                      fill={V3.accent.blue} opacity={0.7} />
                  </g>
                );
              })}

              {/* Current value dot */}
              <circle cx={toX(allSevValues.length - 1)} cy={toY(currentVal)}
                r={4} fill={sevCol} stroke={V3.bg.base} strokeWidth={1.5} />
            </svg>
          </div>
        </div>
      )}

      {/* Key milestones */}
      {allMilestones.length > 0 && (
        <div>
          <HoverTip tip={GLOSSARY.milestones} theme={V3}>
            <div style={sectionHeader}>Key Milestones</div>
          </HoverTip>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {allMilestones.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10, alignItems: 'flex-start' }}>
                <span style={{ color: V3.text.muted, fontFamily: V3_FONT_MONO, minWidth: 70, flexShrink: 0 }}>{m.date}</span>
                <span style={{ color: V3.text.secondary }}>{m.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exposure drift */}
      {exposureDelta && (
        <HoverTip tip={GLOSSARY.exposure_drift} theme={V3}>
          <div style={{
            background: V3.accent.red + '08', borderRadius: 6, padding: '8px 10px',
            border: `1px solid ${V3.accent.red}18`, marginBottom: 10,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: V3_FONT_MONO, color: V3.accent.red, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Exposure Change
            </div>
            <div style={{ fontSize: 11, color: V3.text.secondary, lineHeight: 1.5 }}>{exposureDelta}</div>
          </div>
        </HoverTip>
      )}

      {/* Evolution narrative */}
      {narrative && (
        <div style={{
          padding: '8px 10px', borderRadius: 6, marginBottom: 10,
          background: V3.bg.base, border: `1px solid ${V3.border.subtle}`,
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO, color: V3.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Evolution Assessment
          </div>
          <div style={{ fontSize: 11, color: V3.text.secondary, lineHeight: 1.6 }}>{narrative}</div>
        </div>
      )}

      {/* Forward outlook */}
      {forwardOutlook && (
        <HoverTip tip={GLOSSARY.forward_outlook} theme={V3}>
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: V3.accent.blue + '08', border: `1px solid ${V3.accent.blue}18`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, fontFamily: V3_FONT_MONO, color: V3.accent.blue, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Outlook
            </div>
            <div style={{ fontSize: 11, color: V3.text.secondary, lineHeight: 1.6 }}>{forwardOutlook}</div>
          </div>
        </HoverTip>
      )}
    </div>
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
