/**
 * CorridorDetail — Sidebar panel showing corridor-level detail.
 *
 * Replaces RiskSummary when a corridor is selected.
 * Shows friction gauge, trajectory, affected sites, and related events.
 */

import { TYPE, V3_FONT_MONO, sevColor, type V3Theme } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { CorridorSummaryItem, ScanItem } from '../../types';
import { getSev } from '../../utils/scan';

interface CorridorDetailProps {
  corridor: CorridorSummaryItem;
  events: ScanItem[];
  onSelectEvent: (id: string) => void;
  onClose: () => void;
}

const frictionColors = (theme: V3Theme): Record<string, string> => ({
  Prohibitive: theme.friction.prohibitive,
  High: theme.friction.high,
  Moderate: theme.friction.moderate,
  Low: theme.friction.low,
  Free: theme.friction.free,
});

const FRICTION_WIDTH: Record<string, number> = {
  Free: 10,
  Low: 30,
  Moderate: 50,
  High: 75,
  Prohibitive: 100,
};

const TREND_LABEL: Record<string, string> = {
  Escalating: '\u25B2 Escalating',
  New: '\u25C6 New',
  Stable: '\u2014 Stable',
  'De-escalating': '\u25BC De-escalating',
};

export function CorridorDetail({ corridor, events, onSelectEvent, onClose }: CorridorDetailProps) {
  const { theme: V3 } = useV3Theme();
  const frictionColor = frictionColors(V3)[corridor.friction_level] || V3.text.muted;
  const barWidth = FRICTION_WIDTH[corridor.friction_level] || 50;
  const trendLabel = TREND_LABEL[corridor.trend] || corridor.trend;

  // Filter events to this corridor
  const corridorEvents = events.filter(
    e => (e as any).corridor === corridor.corridor
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: `${V3.spacing.md}px ${V3.spacing.md}px ${V3.spacing.sm}px`,
        borderBottom: `1px solid ${V3.border.subtle}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: V3.spacing.sm, marginBottom: V3.spacing.sm }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: V3.text.accent,
              cursor: 'pointer',
              fontSize: 11,
              padding: 0,
              fontFamily: V3_FONT_MONO,
            }}
          >
            {'\u2190'} Back
          </button>
        </div>
        <div style={{ fontFamily: V3_FONT_MONO, fontSize: 14, fontWeight: 700, color: V3.text.primary }}>
          {corridor.corridor}
        </div>
        <div style={{ fontSize: 11, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
          {corridor.label}
        </div>

        {/* Friction gauge */}
        <div style={{ marginBottom: V3.spacing.sm }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            fontFamily: V3_FONT_MONO,
            color: V3.text.muted,
            marginBottom: 3,
          }}>
            <span>FRICTION</span>
            <span style={{ color: frictionColor, fontWeight: 700 }}>{corridor.friction_level.toUpperCase()}</span>
          </div>
          <div style={{
            height: 6,
            background: V3.bg.base,
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${barWidth}%`,
              height: '100%',
              background: frictionColor,
              borderRadius: 3,
              transition: 'width 300ms ease',
            }} />
          </div>
        </div>

        {/* Trend */}
        <div style={{
          fontSize: 11,
          color: frictionColor,
          fontWeight: 600,
          marginBottom: V3.spacing.sm,
        }}>
          {trendLabel}
        </div>

        {/* Trajectory text */}
        {corridor.trajectory_text && (
          <div style={{
            fontSize: 11,
            color: V3.text.secondary,
            lineHeight: 1.4,
            fontStyle: 'italic',
            paddingLeft: V3.spacing.sm,
            borderLeft: `2px solid ${frictionColor}44`,
            marginBottom: V3.spacing.sm,
          }}>
            {corridor.trajectory_text}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', gap: V3.spacing.md, fontSize: 10, color: V3.text.muted }}>
          <span><strong style={{ color: V3.text.secondary }}>{corridor.skf_sites_affected}</strong> SKF sites</span>
          <span><strong style={{ color: V3.text.secondary }}>{corridor.skf_suppliers_affected}</strong> suppliers</span>
          <span><strong style={{ color: V3.text.secondary }}>{corridor.event_count}</strong> events</span>
        </div>
      </div>

      {/* Related events list */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: V3.spacing.md,
      }}>
        <div style={{
          ...TYPE.sectionHeader,
          fontSize: 9,
          color: V3.text.muted,
          marginBottom: V3.spacing.sm,
        }}>
          Related Events
        </div>
        {corridorEvents.length === 0 ? (
          <div style={{ fontSize: 10, color: V3.text.muted, fontStyle: 'italic' }}>
            No active trade events for this corridor.
          </div>
        ) : (
          corridorEvents.map((evt, i) => {
            const eid = (evt as any).id || '';
            const title = (evt as any).event || (evt as any).risk || '?';
            const sev = getSev(evt);
            return (
              <div
                key={eid + i}
                onClick={() => onSelectEvent(eid)}
                style={{
                  padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
                  borderRadius: V3.radius.sm,
                  cursor: 'pointer',
                  marginBottom: 4,
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  fontSize: 11,
                  color: V3.text.primary,
                  lineHeight: 1.3,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: sevColor(sev),
                    marginRight: 4,
                    verticalAlign: 'middle',
                  }} />
                  {title}
                </div>
                <div style={{ fontSize: 9, color: V3.text.muted, paddingLeft: 10 }}>
                  {(evt as any).friction_level || ''} friction
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Clear filter */}
      <div style={{
        padding: V3.spacing.md,
        borderTop: `1px solid ${V3.border.subtle}`,
      }}>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
            background: 'transparent',
            border: `1px solid ${V3.border.subtle}`,
            borderRadius: V3.radius.sm,
            color: V3.text.accent,
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: V3_FONT_MONO,
          }}
        >
          Clear filter
        </button>
      </div>
    </div>
  );
}
