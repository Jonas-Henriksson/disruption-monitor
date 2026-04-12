/**
 * TimelineStrip — thin 24px mini risk timeline for V2 UI.
 *
 * Shows 30 days of daily severity breakdown as stacked micro-bars.
 * If no data, renders a 24px spacer with subtle bottom border.
 * Hover shows day + count tooltip.
 */

import { useState } from 'react';
import { useTheme, V2_FONT_MONO } from '../theme';
import type { useDisruptionState } from '../../hooks/useDisruptionState';
import type { KpiData } from '../../components/KPIStrip';

type DisruptionState = ReturnType<typeof useDisruptionState>;

interface TimelineStripProps {
  dis: DisruptionState;
  kpi: KpiData | null;
  width: number;
}

interface DayBar {
  date: string;
  day: Date;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export function TimelineStrip({ dis, kpi, width }: TimelineStripProps) {
  const { theme } = useTheme();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const hasTimeline = !!dis.timelineData && dis.timelineData.length > 0;

  if (!hasTimeline) {
    // Empty spacer
    return (
      <div
        style={{
          height: 24,
          background: theme.bg.secondary,
          borderBottom: `1px solid ${theme.border.subtle}`,
          flexShrink: 0,
        }}
      />
    );
  }

  // Map timeline data to day bars
  const days: DayBar[] = dis.timelineData!.map(dp => ({
    date: dp.date,
    day: new Date(dp.date),
    critical: dp.critical_count || 0,
    high: dp.high_count || 0,
    medium: Math.max(0, (dp.event_count || 0) - (dp.critical_count || 0) - (dp.high_count || 0)),
    low: 0,
    total: dp.event_count || 1,
  }));

  const maxTotal = Math.max(...days.map(d => d.total), 1);
  const barWidth = Math.max(1, Math.floor((width - 32) / days.length) - 1);
  const barGap = 1;

  return (
    <div
      style={{
        height: 24,
        background: theme.bg.secondary,
        borderBottom: `1px solid ${theme.border.subtle}`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 16px',
        gap: barGap,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {days.map((d, i) => {
        const totalH = Math.max(2, (d.total / maxTotal) * 20);
        const critH = d.critical > 0 ? Math.max(1, (d.critical / d.total) * totalH) : 0;
        const highH = d.high > 0 ? Math.max(1, (d.high / d.total) * totalH) : 0;
        const medH = Math.max(0, totalH - critH - highH);
        const isHovered = hoveredIdx === i;

        return (
          <div
            key={i}
            style={{
              width: barWidth,
              height: totalH,
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              opacity: isHovered ? 1 : 0.75,
              transition: 'opacity .1s',
              position: 'relative',
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Stacked segments: critical on top, then high, then medium */}
            {critH > 0 && (
              <div
                style={{
                  height: critH,
                  background: theme.severity.critical,
                  borderRadius: '1px 1px 0 0',
                }}
              />
            )}
            {highH > 0 && (
              <div
                style={{
                  height: highH,
                  background: theme.severity.high,
                }}
              />
            )}
            {medH > 0 && (
              <div
                style={{
                  height: medH,
                  background: theme.severity.medium,
                  borderRadius: critH === 0 && highH === 0 ? '1px 1px 0 0' : undefined,
                }}
              />
            )}
          </div>
        );
      })}

      {/* Tooltip on hover */}
      {hoveredIdx !== null && days[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            bottom: 26,
            left: Math.min(
              Math.max(8, hoveredIdx * (barWidth + barGap) + 16 - 50),
              width - 120
            ),
            background: theme.bg.elevated || theme.bg.tertiary,
            border: `1px solid ${theme.border.subtle}`,
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 10,
            fontFamily: V2_FONT_MONO,
            color: theme.text.secondary,
            whiteSpace: 'nowrap',
            zIndex: 40,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ fontWeight: 600, color: theme.text.primary }}>
            {days[hoveredIdx].day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
          {' \u00b7 '}
          {days[hoveredIdx].total} events
          {days[hoveredIdx].critical > 0 && (
            <span style={{ color: theme.severity.critical, marginLeft: 4 }}>
              {days[hoveredIdx].critical}C
            </span>
          )}
          {days[hoveredIdx].high > 0 && (
            <span style={{ color: theme.severity.high, marginLeft: 4 }}>
              {days[hoveredIdx].high}H
            </span>
          )}
        </div>
      )}
    </div>
  );
}
