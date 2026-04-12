import type { CSSProperties } from 'react';
import { FM } from '../../data/config';
import { FS, SP, BR, TYP } from '../../tokens';

interface BadgeProps {
  label: string;
  color: string;
  /** Background color. Defaults to `color` + '22' (12% opacity). */
  bg?: string;
  /** Border color. Defaults to `color` + '33'. */
  border?: string;
  size?: 'sm' | 'md';
  glow?: boolean;
  style?: CSSProperties;
}

/**
 * Unified badge / pill for severity, status, trend, and overdue indicators.
 *
 * Replaces ~30 inline constructions like:
 *   background: SBG[sv], color: co, padding: '2px 8px', borderRadius: 4,
 *   fontSize: 9, fontWeight: 700, fontFamily: FM, border: `1px solid ${co}33`
 */
export function Badge({ label, color, bg, border, size = 'md', glow = false, style }: BadgeProps) {
  const isSm = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: bg ?? `${color}22`,
        color,
        padding: isSm ? `1px ${SP.sm}px` : `${SP.xxs}px ${SP.md}px`,
        borderRadius: isSm ? BR.sm : BR.md,
        fontSize: isSm ? FS.xs : FS.sm,
        fontWeight: 700,
        fontFamily: FM,
        border: `1px solid ${border ?? `${color}33`}`,
        lineHeight: isSm ? '14px' : undefined,
        boxShadow: glow ? `0 0 8px ${color}66` : undefined,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
