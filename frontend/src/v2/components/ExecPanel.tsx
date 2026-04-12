/**
 * ExecPanel — left panel (300px) with Talking Points / Weekly Brief tabs
 *
 * Clean pill-style tab toggle at top, content area below. Uses theme
 * tokens for all colors, generous padding (20px).
 */

import { useState } from 'react';
import { useTheme, V2_TYP, V2_SP, V2_BR } from '../theme';
import { TalkingPoints } from './TalkingPoints';
import { WeeklyBrief } from './WeeklyBrief';
import type { useDisruptionState } from '../../hooks/useDisruptionState';

interface ExecPanelProps {
  dis: ReturnType<typeof useDisruptionState>;
  open: boolean;
  onToggle: () => void;
}

type Tab = 'talking-points' | 'weekly-brief';

export function ExecPanel({ dis, open, onToggle }: ExecPanelProps) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('talking-points');
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);
  const [hoveredToggle, setHoveredToggle] = useState(false);

  // Collapsed state: thin toggle bar
  if (!open) {
    return (
      <div
        style={{
          width: 36,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: theme.bg.secondary,
          borderRight: `1px solid ${theme.border.subtle}`,
          paddingTop: V2_SP.lg,
        }}
      >
        <button
          aria-label="Open executive panel"
          onClick={onToggle}
          onMouseEnter={() => setHoveredToggle(true)}
          onMouseLeave={() => setHoveredToggle(false)}
          style={{
            width: 28,
            height: 28,
            borderRadius: V2_BR.sm,
            border: `1px solid ${theme.border.subtle}`,
            background: hoveredToggle ? theme.bg.tertiary : 'transparent',
            color: theme.text.tertiary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            transition: 'all 0.15s ease',
          }}
        >
          {'\u276F'}
        </button>
        {/* Vertical label */}
        <div
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            ...V2_TYP.label,
            color: theme.text.muted,
            marginTop: V2_SP.lg,
            letterSpacing: '0.1em',
          }}
        >
          Executive
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: theme.bg.primary,
        borderRight: `1px solid ${theme.border.subtle}`,
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${V2_SP.md}px ${V2_SP.xl}px`,
          borderBottom: `1px solid ${theme.border.subtle}`,
          flexShrink: 0,
        }}
      >
        <span style={{ ...V2_TYP.label, color: theme.text.muted }}>Executive</span>
        <button
          aria-label="Close executive panel"
          onClick={onToggle}
          onMouseEnter={() => setHoveredToggle(true)}
          onMouseLeave={() => setHoveredToggle(false)}
          style={{
            width: 24,
            height: 24,
            borderRadius: V2_BR.sm,
            border: `1px solid ${theme.border.subtle}`,
            background: hoveredToggle ? theme.bg.tertiary : 'transparent',
            color: theme.text.tertiary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            transition: 'all 0.15s ease',
          }}
        >
          {'\u276E'}
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: V2_SP.xs,
          padding: `${V2_SP.sm}px ${V2_SP.xl}px`,
          borderBottom: `1px solid ${theme.border.subtle}`,
          flexShrink: 0,
        }}
      >
        {([
          { id: 'talking-points' as Tab, label: 'Talking Points' },
          { id: 'weekly-brief' as Tab, label: 'Weekly Brief' },
        ]).map(t => {
          const isActive = tab === t.id;
          const isHovered = hoveredTab === t.id;
          return (
            <button
              key={t.id}
              aria-label={`${t.label} tab`}
              aria-pressed={isActive}
              onClick={() => setTab(t.id)}
              onMouseEnter={() => setHoveredTab(t.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                flex: 1,
                padding: `${V2_SP.sm}px ${V2_SP.md}px`,
                borderRadius: V2_BR.full,
                border: 'none',
                background: isActive
                  ? theme.accent.blue + '18'
                  : isHovered
                    ? theme.bg.tertiary
                    : 'transparent',
                color: isActive ? theme.accent.blue : theme.text.tertiary,
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tab === 'talking-points' ? (
          <TalkingPoints items={dis.items} mode={dis.mode || 'disruptions'} />
        ) : (
          <WeeklyBrief dis={dis} />
        )}
      </div>
    </div>
  );
}
