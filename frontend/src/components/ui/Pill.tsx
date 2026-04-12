import type { CSSProperties } from 'react';
import { FM } from '../../data/config';
import { BR, TYP } from '../../tokens';

interface PillProps {
  label: string;
  bg: string;
  color?: string;
  style?: CSSProperties;
}

/**
 * Small colored pill for dimensions, categories, tags.
 *
 * Standardizes padding to 2px 6px and borderRadius to 3.
 */
export function Pill({ label, bg, color, style }: PillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: bg,
        color: color ?? '#c8d6e5',
        padding: '2px 6px',
        borderRadius: BR.sm,
        fontSize: TYP.label.fontSize,
        fontWeight: TYP.mono.fontWeight,
        fontFamily: FM,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
