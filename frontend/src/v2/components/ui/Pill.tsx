/**
 * Pill — Shared reusable pill/badge button component for v2 UI.
 *
 * Supports size variants (sm/md/lg), themed active/inactive states,
 * optional count badge, glow effect, and click handling.
 */

import type { ReactNode, CSSProperties } from 'react';
import { useTheme, V2_BR, V2_FONT_MONO } from '../../theme';

export interface PillProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  glow?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
  ariaPressed?: boolean;
}

const SIZE_CFG = {
  sm: { padding: '2px 6px', fontSize: 10 },
  md: { padding: '4px 10px', fontSize: 11 },
  lg: { padding: '6px 14px', fontSize: 12 },
} as const;

export function Pill({
  size = 'md',
  color,
  active = false,
  onClick,
  count,
  glow = false,
  children,
  style: extraStyle,
  ariaLabel,
  ariaPressed,
}: PillProps) {
  const { theme } = useTheme();
  const cfg = SIZE_CFG[size];
  const accent = color || theme.text.tertiary;

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: cfg.padding,
    fontSize: cfg.fontSize,
    fontWeight: 600,
    fontFamily: V2_FONT_MONO,
    borderRadius: V2_BR.full,
    border: `1px solid ${active ? accent + '44' : theme.border.subtle}`,
    background: active ? accent + '1f' : 'transparent',
    color: active ? accent : theme.text.muted,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 200ms ease',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
    boxShadow: glow && active ? `0 0 8px ${accent}33` : 'none',
    ...extraStyle,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!active && onClick) {
      const el = e.currentTarget;
      el.style.background = accent + '0d';
      el.style.color = accent;
      el.style.borderColor = accent + '44';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!active && onClick) {
      const el = e.currentTarget;
      el.style.background = 'transparent';
      el.style.color = theme.text.muted;
      el.style.borderColor = theme.border.subtle;
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      style={base}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {count !== undefined && (
        <span
          style={{
            fontFamily: V2_FONT_MONO,
            fontSize: Math.max(cfg.fontSize - 2, 8),
            opacity: 0.7,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
