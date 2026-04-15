/**
 * FeedCard — Compact event card for the V3 feed list.
 * Expands inline to show ExpandedCard when clicked.
 */

import { TYPE, V3_FONT, V3_FONT_MONO, sevColor, sevBg, sevBorder } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { ScanItem } from '../../types';
import { getSev, getEvent, getRegion } from '../../utils/scan';
import { relTime } from '../../utils/format';
import { ExpandedCard } from './ExpandedCard';

const SEV_HINTS: Record<string, string> = {
  Critical: 'Critical (\u226575/100) — Immediate threat to operations. Emergency response needed.',
  High: 'High (50–74/100) — Significant risk to key sites or routes. Action needed within days.',
  Medium: 'Medium (25–49/100) — Moderate risk, limited direct exposure. Monitor and prepare.',
  Low: 'Low (<25/100) — Minimal impact. Track for escalation.',
};

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
        <span
          title={SEV_HINTS[sev] || sev}
          style={{
            flexShrink: 0,
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
          </div>
        </div>

        {/* Impact score */}
        {score != null && (
          <div
            title="Severity score (0–100): Magnitude×30% + Proximity×25% + Criticality×25% + SC Impact×20%"
            style={{
              flexShrink: 0,
              ...TYPE.impact,
              fontFamily: V3_FONT_MONO,
              color: color,
              textAlign: 'right',
            }}
          >
            {score}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          className="sc-s"
          style={{
            maxHeight: 420,
            overflow: 'auto',
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
