import type { ReactNode, CSSProperties } from 'react';
import { T, TYP } from '../../tokens';
import { FM } from '../../data/config';

interface SectionHeaderProps {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}

/**
 * Standardized section header label.
 *
 * Uses TYP.label preset: fontSize 8, fontWeight 700, uppercase, letterSpacing 1.5
 */
export function SectionHeader({ children, color = T.ghost, style }: SectionHeaderProps) {
  return (
    <span
      style={{
        ...TYP.label,
        color,
        fontFamily: FM,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
