/**
 * CorridorStrip — Horizontal row of trade corridor pills.
 *
 * Shown only in Trade mode, between ExecutiveHero and FeedList.
 * Each pill shows corridor code, friction level (color), and trend arrow.
 * Clicking a pill selects/deselects that corridor for feed filtering.
 */

import { useState, useEffect } from 'react';
import { V3_FONT_MONO, type V3Theme } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { CorridorSummaryResponse } from '../../types';
import { fetchCorridorSummary } from '../../services/api';

interface CorridorStripProps {
  selectedCorridor: string | null;
  onSelectCorridor: (corridor: string | null) => void;
}

const frictionColors = (theme: V3Theme): Record<string, string> => ({
  Prohibitive: theme.friction.prohibitive,
  High: theme.friction.high,
  Moderate: theme.friction.moderate,
  Low: theme.friction.low,
  Free: theme.friction.free,
});

const TREND_ARROW: Record<string, string> = {
  Escalating: '\u25B2',
  New: '\u25C6',
  Stable: '\u2014',
  'De-escalating': '\u25BC',
};

export function CorridorStrip({ selectedCorridor, onSelectCorridor }: CorridorStripProps) {
  const { theme: V3 } = useV3Theme();
  const [data, setData] = useState<CorridorSummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCorridorSummary();
      if (!cancelled) setData(result);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data || data.corridors.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: `4px ${V3.spacing.lg}px`,
      background: V3.bg.card,
      borderBottom: `1px solid ${V3.border.subtle}`,
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9,
        fontFamily: V3_FONT_MONO,
        color: V3.text.muted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap' as const,
        marginRight: 4,
      }}>
        Corridors
      </span>

      {data.corridors.map(c => {
        const isSelected = selectedCorridor === c.corridor;
        const bg = frictionColors(V3)[c.friction_level] || V3.text.muted;
        const arrow = TREND_ARROW[c.trend] || '\u2014';

        return (
          <button
            key={c.corridor}
            onClick={() => onSelectCorridor(isSelected ? null : c.corridor)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: V3.radius.sm,
              border: isSelected ? `1.5px solid ${bg}` : `1px solid ${bg}44`,
              background: isSelected ? bg + '25' : bg + '12',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: V3_FONT_MONO,
              fontWeight: 600,
              color: isSelected ? bg : V3.text.secondary,
              whiteSpace: 'nowrap' as const,
              transition: 'all 100ms',
              lineHeight: 1.4,
            }}
            title={`${c.label} \u2014 ${c.friction_level} friction, ${c.trend}`}
          >
            <span>{c.corridor}</span>
            <span style={{ fontSize: 8 }}>{arrow}</span>
            {c.event_count > 1 && (
              <span style={{
                fontSize: 8,
                background: bg + '33',
                borderRadius: 6,
                padding: '0 4px',
                color: bg,
              }}>
                {c.event_count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
