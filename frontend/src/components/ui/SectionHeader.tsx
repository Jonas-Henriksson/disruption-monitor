import type { ReactNode, CSSProperties } from 'react';
import { T, FS } from '../../tokens';
import { FM } from '../../data/config';

interface SectionHeaderProps {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}

/**
 * Standardized section header label.
 *
 * Replaces the repeated pattern:
 *   fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
 *   letterSpacing: 1.5, color: T.ghost, fontFamily: FM
 */
export function SectionHeader({ children, color = T.ghost, style }: SectionHeaderProps) {
  return (
    <span
      style={{
        fontSize: FS.xs,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color,
        fontFamily: FM,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
