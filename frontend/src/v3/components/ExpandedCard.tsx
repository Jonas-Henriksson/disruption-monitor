/**
 * ExpandedCard -- V3 shared detail component.
 * Renders inside both the feed (accordion expand) and the map (bottom-left panel).
 * Three tabs: Summary | Exposure | Act
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DisruptionEvent, ActionItemShape } from './expandedcard_types';
import type { Severity } from '../../types';
import { ActionCheckbox } from './ActionCheckbox';
import { BU_MAP } from '../../data/sites';
import { updateEventStatus } from '../../services/api';
import { V3 as V3Theme, V3_FONT, V3_FONT_MONO, sevColor } from '../theme';

/* ─────────────────────────────────────────────
   V3 Design Tokens — imported from v3/theme.ts
   ───────────────────────────────────────────── */
const V3 = {
  bg:   { base: V3Theme.bg.base, card: V3Theme.bg.card, elevated: V3Theme.bg.expanded },
  text: { primary: V3Theme.text.primary, secondary: V3Theme.text.secondary, muted: V3Theme.text.muted, dim: '#475569' },
  border: { subtle: V3Theme.border.subtle, default: V3Theme.border.default },
  severity: {
    critical: V3Theme.severity.critical, high: V3Theme.severity.high, medium: V3Theme.severity.medium, low: V3Theme.severity.low,
  } as Record<string, string>,
  accent: V3Theme.accent,
  font: V3_FONT,
  mono: V3_FONT_MONO,
} as const;

const SEV_COLOR = (s: string): string => sevColor(s as any) || V3.text.muted;

/* ─────────────────────────────────────────────
   Shared style helpers
   ───────────────────────────────────────────── */
const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: V3.text.muted,
  fontFamily: V3.mono, margin: '12px 0 6px',
};

const badgeStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: bg + '18', color: fg,
  padding: '2px 8px', borderRadius: 4,
  fontSize: 10, fontWeight: 600, fontFamily: V3.mono,
  border: `1px solid ${bg}33`, whiteSpace: 'nowrap',
});

const TAB_KEY = 'v3-expanded-tab';

/* ─────────────────────────────────────────────
   Props
   ───────────────────────────────────────────── */
export interface ExpandedCardProps {
  event: DisruptionEvent;
  placement: 'feed' | 'map';
  onClose: () => void;
  onHoverSite?: (siteId: string | null) => void;
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
   Main Component
   ───────────────────────────────────────────── */
export function ExpandedCard({ event, placement, onClose, onHoverSite }: ExpandedCardProps) {
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
  const sevCol = SEV_COLOR(sev);

  const containerStyle: React.CSSProperties = {
    maxHeight: maxH,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: isMap ? V3.bg.base + 'ee' : V3.bg.card,
    borderRadius: 8,
    border: `1px solid ${V3.border.subtle}`,
    fontFamily: V3.font,
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
                color: active ? V3.text.primary : V3.text.dim,
                fontSize: 11, fontWeight: active ? 700 : 500,
                fontFamily: V3.font,
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
            color: V3.text.dim, fontSize: 14, padding: '4px 6px',
            lineHeight: 1, flexShrink: 0,
          }}
          aria-label="Close detail panel"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        {tab === 'summary'  && <SummaryTab event={event} sev={sev} sevCol={sevCol} />}
        {tab === 'exposure' && <ExposureTab event={event} onHoverSite={onHoverSite} />}
        {tab === 'act'      && <ActTab event={event} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1: Summary
   ══════════════════════════════════════════════ */
function SummaryTab({ event, sev, sevCol }: { event: DisruptionEvent; sev: Severity; sevCol: string }) {
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

  return (
    <div>
      {/* Title + severity badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 14, fontWeight: 700, color: V3.text.primary,
          fontFamily: V3.font, flex: 1, lineHeight: 1.3,
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
          <span style={{ color: V3.text.dim, fontWeight: 500 }}>Velocity</span> {velLabel}
        </span>
        <span style={badgeStyle(recColor, recColor)}>
          <span style={{ color: V3.text.dim, fontWeight: 500 }}>Recovery</span> {recLabel}
        </span>
        {probPct != null && (
          <span style={badgeStyle(probColor, probColor)}>
            <span style={{ color: V3.text.dim, fontWeight: 500 }}>Prob</span> {probPct}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      <SeveritySparkline event={event} sevCol={sevCol} />

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
                  <div style={{ fontSize: 9, color: V3.text.dim, fontFamily: V3.mono, marginBottom: 2 }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1, height: 4, background: V3.border.subtle, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, v)}%`, height: '100%', background: sevCol, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: V3.text.secondary, fontFamily: V3.mono }}>
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
function SeveritySparkline({ event, sevCol }: { event: DisruptionEvent; sevCol: string }) {
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
      <span style={{ fontSize: 10, color: V3.text.muted, fontFamily: V3.mono }}>
        {Math.round(score)}/100 over {count} scan{count > 1 ? 's' : ''}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 2: Exposure
   ══════════════════════════════════════════════ */
function ExposureTab({ event, onHoverSite }: {
  event: DisruptionEvent;
  onHoverSite?: (id: string | null) => void;
}) {
  const sites = event.affected_sites || [];
  const suppliersByTier = useSuppliersByTier(event);
  const routes: Array<string | { description?: string; route?: string }> =
    (event.routing_context || event.affected_routes || []) as Array<string | { description?: string; route?: string }>;

  return (
    <div>
      {/* Affected Sites */}
      <div style={sectionHeader}>Affected Sites</div>
      {sites.length === 0 && <EmptyRow label="No affected sites identified" />}
      {sites.map((s, i) => {
        const bu = BU_MAP[s.name] || '';
        const typeLabel = (s.type || '').toUpperCase();
        const typeBg = typeLabel === 'MFG' ? V3.accent.red
          : typeLabel === 'LOG' ? V3.accent.amber
          : typeLabel === 'SALES' ? V3.accent.blue
          : V3.accent.purple;
        const buLabel = buDisplay(bu);

        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 0', borderBottom: `1px solid ${V3.border.subtle}`,
              cursor: onHoverSite ? 'pointer' : 'default',
            }}
            onMouseEnter={() => onHoverSite?.(s.name)}
            onMouseLeave={() => onHoverSite?.(null)}
          >
            <span style={{
              flex: 1, fontSize: 12, color: V3.text.secondary, fontFamily: V3.font,
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.name}
            </span>
            <span style={badgeStyle(typeBg, typeBg)}>{typeLabel || 'OTHER'}</span>
            {buLabel && <span style={badgeStyle(V3.accent.purple, V3.accent.purple)}>{buLabel}</span>}
            <span style={{
              fontSize: 10, color: V3.text.dim, fontFamily: V3.mono, whiteSpace: 'nowrap',
            }}>
              {s.distance_km != null ? `${Math.round(s.distance_km)} km` : ''}
            </span>
          </div>
        );
      })}

      {/* Supplier Impact */}
      <div style={sectionHeader}>Supplier Impact</div>
      {suppliersByTier.length === 0 && <EmptyRow label="No supplier data available" />}
      {suppliersByTier.map(tierGroup => (
        <div key={tierGroup.tier} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: V3.mono,
              color: tierGroup.tier === 1 ? V3.accent.red
                : tierGroup.tier === 2 ? V3.accent.amber : V3.accent.blue,
            }}>
              T{tierGroup.tier}
            </span>
            <span style={{ fontSize: 10, color: V3.text.dim, fontFamily: V3.mono }}>
              {tierGroup.items.length} supplier{tierGroup.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          {tierGroup.items.map((sup, si) => (
            <div key={si} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 0 3px 16px',
              borderBottom: `1px solid ${V3.border.subtle}`,
            }}>
              <span style={{ flex: 1, fontSize: 11, color: V3.text.secondary, fontFamily: V3.font }}>
                {sup.name}
              </span>
              {sup.sole_source && (
                <span style={badgeStyle(V3.accent.red, V3.accent.red)}>
                  {'\u26A0'} Sole Source
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Routing Dependencies */}
      {routes.length > 0 && (
        <>
          <div style={sectionHeader}>Routing Dependencies</div>
          {routes.map((r, ri) => {
            const text = typeof r === 'string'
              ? r
              : (r.description || r.route || JSON.stringify(r));
            return (
              <div key={ri} style={{
                padding: '5px 0',
                borderBottom: `1px solid ${V3.border.subtle}`,
                fontSize: 11, color: V3.text.secondary, lineHeight: 1.5,
              }}>
                {text}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ── Supplier tier grouping hook ── */
interface SupplierEntry { name: string; tier: number; sole_source: boolean }
interface TierGroup { tier: number; items: SupplierEntry[] }

function useSuppliersByTier(event: DisruptionEvent): TierGroup[] {
  return useMemo(() => {
    const details: Array<{ name?: string; tier?: number; sole_source?: boolean }> =
      (event.payload?.input_details as Array<{ name?: string; tier?: number; sole_source?: boolean }> | undefined)
      || event.input_details
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
  }, [event]);
}

/* ══════════════════════════════════════════════
   TAB 3: Act
   ══════════════════════════════════════════════ */
function ActTab({ event }: { event: DisruptionEvent }) {
  const [actions, setActions] = useState<ActionItemShape[]>(() => {
    const recs = event.recommendations?.actions;
    if (Array.isArray(recs)) return recs;
    const payActions = event.payload?.actions;
    if (Array.isArray(payActions)) return payActions as ActionItemShape[];
    return [];
  });
  const [status, setStatus] = useState(event.status || 'active');
  const [assignInput, setAssignInput] = useState('');
  const [showAssignInput, setShowAssignInput] = useState(false);

  useEffect(() => {
    setStatus(event.status || 'active');
  }, [event.status]);

  const handleToggle = useCallback((id: string, done: boolean) => {
    setActions(prev => prev.map(a =>
      String(a.id) === id ? { ...a, status: done ? 'done' : 'open' } : a
    ));
  }, []);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    const eid = event.id || '';
    if (!eid) return;
    const ok = await updateEventStatus(eid, newStatus);
    if (ok) setStatus(newStatus as typeof status);
  }, [event.id]);

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
        <EmptyRow label="No actions available -- generate a briefing to populate" />
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
          onClick={() => handleStatusChange(status === 'watching' ? 'active' : 'watching')}
        />
        <LifecycleBtn
          label="Archive" icon={'\uD83D\uDCE6'}
          active={status === 'archived'}
          onClick={() => handleStatusChange(status === 'archived' ? 'active' : 'archived')}
        />
        <LifecycleBtn
          label="Assign" icon={'\uD83D\uDC64'}
          active={showAssignInput}
          onClick={() => setShowAssignInput(!showAssignInput)}
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
              fontFamily: V3.font, outline: 'none',
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
              cursor: 'pointer', fontFamily: V3.mono,
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
        />
        <CommBtn
          label="Teams" icon={'\uD83D\uDCAC'}
          href={`https://teams.microsoft.com/l/chat/0/0?message=${teamsMsg}`}
        />
        <CommBtn
          label="Meeting" icon={'\uD83D\uDCC5'}
          href={`https://outlook.office.com/calendar/0/deeplink/compose?subject=${emailSubject}&body=${emailBody}`}
        />
      </div>
    </div>
  );
}

/* ── Lifecycle button ── */
function LifecycleBtn({ label, icon, active, onClick }: {
  label: string; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 600, fontFamily: V3.font,
        background: active ? V3.accent.blue + '22' : V3.bg.base,
        color: active ? V3.accent.blue : V3.text.muted,
        border: `1px solid ${active ? V3.accent.blue + '44' : V3.border.subtle}`,
        transition: 'all 150ms ease',
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  );
}

/* ── Communicate button ── */
function CommBtn({ label, icon, href }: { label: string; icon: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 600, fontFamily: V3.font,
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
function EmptyRow({ label }: { label: string }) {
  return (
    <div style={{
      padding: '10px 0', fontSize: 11, color: V3.text.dim,
      fontStyle: 'italic', fontFamily: V3.font,
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
