import type { CSSProperties } from 'react';
import { FM, F } from '../../data/config';
import { B, FS, TYP } from '../../tokens';

interface MetricCardProps {
  value: string | number;
  label: string;
  /** Optional icon displayed before the value */
  icon?: string;
  /** Primary value color (defaults to severity color or white) */
  color?: string;
  /** Additional inline styles for the outer container */
  style?: CSSProperties;
}

/**
 * KPI / stat display pattern used in impact strips, severity count rows,
 * and metric summaries.
 *
 * Replaces the repeated flex-1-centered-metric pattern:
 *   fontFamily: FM, fontSize: 14, fontWeight: 700, color, lineHeight: 1.2
 *   label: fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.5
 */
export function MetricCard({ value, label, icon, color = '#e2e8f0', style }: MetricCardProps) {
  return (
    <div
      style={{
        flex: 1,
        padding: '8px 6px',
        textAlign: 'center',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: FM,
          fontSize: TYP.h2.fontSize,
          fontWeight: TYP.h2.fontWeight,
          color,
          lineHeight: TYP.h2.lineHeight,
        }}
      >
        {icon && <>{icon} </>}
        {value}
      </div>
      <div
        style={{
          fontFamily: F,
          ...TYP.label,
          color: '#4a6080',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
