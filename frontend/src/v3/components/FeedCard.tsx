/**
 * FeedCard — Compact event card for the V3 feed list.
 * Expands inline to show ExpandedCard when clicked.
 */

import { useState } from 'react';
import { TYPE, V3_FONT, V3_FONT_MONO, sevColor, sevBg, sevBorder, type V3Theme } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { ScanItem } from '../../types';
import { getSev, getEvent, getRegion } from '../../utils/scan';
import { relTime } from '../../utils/format';
import { ExpandedCard } from './ExpandedCard';

const SEV_HINTS: Record<string, { title: string; body: string }> = {
  Critical: {
    title: 'Critical (\u226575/100)',
    body: 'Immediate threat to operations. Multiple MFG sites or sole-source suppliers directly affected. Emergency response needed.',
  },
  High: {
    title: 'High (50\u201374/100)',
    body: 'Significant operational risk. Key sites or supply routes exposed. Action needed within days.',
  },
  Medium: {
    title: 'Medium (25\u201349/100)',
    body: 'Moderate risk, limited direct exposure. Monitor and prepare contingencies.',
  },
  Low: {
    title: 'Low (<25/100)',
    body: 'Minimal direct impact. Peripheral exposure. Track for escalation.',
  },
};

const SCORE_HINT = {
  title: 'Severity Score (0\u2013100)',
  body: 'Magnitude\u00d730% + Proximity\u00d725% + Criticality\u00d725% + SC Impact\u00d720%. Fully algorithmic \u2014 no AI in scoring.',
};

/** Inline hover tooltip for compact FeedCard elements */
function CardTip({ tip, theme: V3, children, style }: {
  tip: { title: string; body: string };
  theme: V3Theme;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', cursor: 'help', ...style }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={e => e.stopPropagation()}
    >
      {children}
      {show && (
        <span
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 50,
            marginTop: 4, padding: '6px 8px', borderRadius: 4, width: 200,
            background: V3.bg.sidebar, border: `1px solid ${V3.border.default}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'normal',
            cursor: 'default',
          }}
        >
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: V3.text.primary, marginBottom: 3 }}>
            {tip.title}
          </span>
          <span style={{ display: 'block', fontSize: 9, color: V3.text.muted, lineHeight: 1.5, fontWeight: 400, fontFamily: V3_FONT }}>
            {tip.body}
          </span>
        </span>
      )}
    </span>
  );
}

export interface FeedCardProps {
  item: ScanItem;
  index: number;
  expanded: boolean;
  onSelect: (index: number | null) => void;
  onHover: (index: number | null) => void;
  onStatusChange?: (eventId: string, newStatus: string) => void;
}

export function FeedCard({ item, index, expanded, onSelect, onHover, onStatusChange }: FeedCardProps) {
  const { theme: V3 } = useV3Theme();
  const sev = getSev(item);
  const title = getEvent(item);
  const region = getRegion(item);
  const color = sevColor(sev, V3);
  const score = item.computed_severity?.score;
  const lastSeen = item.last_seen ? new Date(item.last_seen) : null;

  return (
    <div
      style={{
        borderLeft: `3px solid ${color}`,
        borderRadius: V3.radius.md,
        background: expanded ? V3.bg.expanded : V3.bg.card,
        transition: 'background 150ms, box-shadow 150ms',
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        minHeight: 68,
      }}
      onMouseEnter={(e) => {
        if (!expanded) e.currentTarget.style.background = V3.bg.cardHover;
        onHover(index);
      }}
      onMouseLeave={(e) => {
        if (!expanded) e.currentTarget.style.background = V3.bg.card;
        onHover(null);
      }}
      onClick={() => onSelect(expanded ? null : index)}
    >
      {/* Compact row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: V3.spacing.sm,
        padding: `${V3.spacing.md}px ${V3.spacing.lg}px`,
        minHeight: 68,
      }}>
        {/* Severity badge */}
        <CardTip tip={SEV_HINTS[sev] || { title: sev, body: '' }} theme={V3} style={{ flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-block',
              padding: `2px ${V3.spacing.sm}px`,
              borderRadius: V3.radius.full,
              background: sevBg(sev, V3),
              border: `1px solid ${sevBorder(sev, V3)}`,
              color: color,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: V3_FONT,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {sev}
          </span>
        </CardTip>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            ...TYPE.title,
            color: V3.text.primary,
            fontFamily: V3_FONT,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title}
          </div>
          <div style={{
            ...TYPE.meta,
            color: V3.text.muted,
            fontFamily: V3_FONT,
            marginTop: 2,
          }}>
            {region}
            {lastSeen && (
              <> {'\u00b7'} {relTime(lastSeen)}</>
            )}
            {item.possible_duplicate_of && (
              <span style={{ color: V3.accent.amber, marginLeft: 6, fontSize: 10 }}>DUP</span>
            )}
            {item.resurfaced_at && (() => {
              const resurfacedTime = new Date(item.resurfaced_at as string);
              const hoursSince = (Date.now() - resurfacedTime.getTime()) / (1000 * 60 * 60);
              if (hoursSince > 48) return null;
              const oldScore = (item as any).archived_severity || 0;
              const newScore = item.computed_severity?.score || 0;
              const delta = newScore - oldScore;
              return (
                <CardTip
                  tip={{
                    title: 'Resurfaced Event',
                    body: 'This event was previously archived but has resurfaced because its severity increased beyond the level at which it was dismissed.',
                  }}
                  theme={V3}
                >
                  <span style={{ color: V3.accent.amber, marginLeft: 6, fontSize: 10, fontWeight: 600 }}>
                    ↑ RESURFACED{delta > 0 ? ` +${delta}` : ''}
                  </span>
                </CardTip>
              );
            })()}
          </div>
        </div>

        {/* Impact score */}
        {score != null && (
          <CardTip tip={SCORE_HINT} theme={V3} style={{ flexShrink: 0 }}>
            <span
              style={{
                ...TYPE.impact,
                fontFamily: V3_FONT_MONO,
                color: color,
                textAlign: 'right',
              }}
            >
              {score}
            </span>
          </CardTip>
        )}
      </div>

      {/* Expanded content — no inner scroll; feed list handles scrolling */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            borderTop: `1px solid ${V3.border.subtle}`,
          }}
        >
          <ExpandedCard
            event={item as unknown as import('./expandedcard_types').DisruptionEvent}
            placement="feed"
            onClose={() => onSelect(null)}
            onStatusChange={onStatusChange}
          />
        </div>
      )}
    </div>
  );
}
