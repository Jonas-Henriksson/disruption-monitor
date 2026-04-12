/**
 * FilterBar — full-width horizontal filter bar for V2 UI.
 *
 * Sits below the hero strip (toggled via header "Filters" button).
 * Groups: TYPE, REGION, LAYERS, DIVISION — separated by thin vertical dividers.
 * Each pill shows a count in mono font, uses accent color when active.
 */

import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import { TYPE_CFG, REGION_CFG, BU_CFG, SITES, typeCounts, regionCounts } from '../../data';
import type { useFilterState } from '../../hooks/useFilterState';

type FilterState = ReturnType<typeof useFilterState>;

interface FilterBarProps {
  fil: FilterState;
}

/** Reusable filter pill button */
function Pill({
  label,
  count,
  active,
  color,
  onClick,
  ariaLabel,
  small,
}: {
  label: string;
  count?: number;
  active: boolean;
  color: string;
  onClick: () => void;
  ariaLabel: string;
  small?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <button
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        padding: small ? '2px 6px' : `${V2_SP.xs}px ${V2_SP.sm}px`,
        border: `1px solid ${active ? color + '44' : theme.border.subtle}`,
        borderRadius: small ? V2_BR.sm : V2_BR.md,
        background: active ? color + '18' : 'transparent',
        color: active ? color : theme.text.muted,
        fontSize: small ? 10 : 11,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all .15s ease',
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
        fontFamily: 'inherit',
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            fontFamily: V2_FONT_MONO,
            fontSize: small ? 8 : 9,
            opacity: 0.55,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Vertical divider between filter groups */
function Divider() {
  const { theme } = useTheme();
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: theme.border.subtle,
        margin: `0 ${V2_SP.xs}px`,
        flexShrink: 0,
      }}
    />
  );
}

/** Group label (TYPE, REGION, etc.) */
function GroupLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <span
      style={{
        ...V2_TYP.label,
        color: theme.text.muted,
        fontFamily: V2_FONT_MONO,
        letterSpacing: '0.1em',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export function FilterBar({ fil }: FilterBarProps) {
  const { theme } = useTheme();

  const sisKeys = ['sis-seal', 'sis-lube', 'sis-aero', 'sis-mag'] as const;
  const allSisOn = sisKeys.every(k => fil.buF[k]);
  const someSisOn = sisKeys.some(k => fil.buF[k]);
  const sisTotal = SITES.filter(s => s.bu && s.bu.startsWith('sis-')).length;
  const indCount = SITES.filter(s => s.bu === 'ind').length;

  return (
    <div
      role="toolbar"
      aria-label="Map filters"
      style={{
        background: theme.bg.secondary,
        borderBottom: `1px solid ${theme.border.subtle}`,
        padding: `${V2_SP.sm}px ${V2_SP.lg}px`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: V2_SP.md,
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 25,
        animation: 'sfu 200ms ease both',
      }}
    >
      {/* TYPE group */}
      <GroupLabel>TYPE</GroupLabel>
      <div
        style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}
        role="group"
        aria-label="Filter by site type"
      >
        {Object.entries(TYPE_CFG).map(([k, v]) => {
          const on = fil.tF[k];
          return (
            <Pill
              key={k}
              label={v.label}
              count={typeCounts[k] || 0}
              active={on}
              color={v.color}
              onClick={() => fil.setTF(p => ({ ...p, [k]: !p[k] }))}
              ariaLabel={`${v.label}: ${typeCounts[k] || 0} sites`}
            />
          );
        })}
      </div>

      <Divider />

      {/* REGION group */}
      <GroupLabel>REGION</GroupLabel>
      <div
        style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}
        role="group"
        aria-label="Filter by region"
      >
        {Object.entries(REGION_CFG).map(([k, v]) => {
          const on = fil.rF[k];
          return (
            <Pill
              key={k}
              label={v.label}
              count={regionCounts[k] || 0}
              active={on}
              color={v.color}
              onClick={() => fil.setRF(p => ({ ...p, [k]: !p[k] }))}
              ariaLabel={`${v.label}: ${regionCounts[k] || 0} sites`}
            />
          );
        })}
      </div>

      <Divider />

      {/* LAYER toggles */}
      <div
        style={{ display: 'flex', gap: 3 }}
        role="group"
        aria-label="Map layer toggles"
      >
        <Pill
          label="Routes"
          active={fil.sR}
          color={theme.accent.cyan}
          onClick={() => fil.setSR(!fil.sR)}
          ariaLabel="Toggle shipping routes"
        />
        <Pill
          label="Chokepoints"
          active={fil.sC}
          color={theme.text.tertiary || '#94a3b8'}
          onClick={() => fil.setSC(!fil.sC)}
          ariaLabel="Toggle chokepoints"
        />
        <Pill
          label="Suppliers"
          count={5090}
          active={fil.sSup}
          color={theme.accent.purple}
          onClick={() => fil.setSSup(!fil.sSup)}
          ariaLabel="Toggle suppliers overlay"
        />
      </div>

      <Divider />

      {/* DIVISION group */}
      <GroupLabel>DIVISION</GroupLabel>
      <div
        style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}
        role="group"
        aria-label="Filter by business division"
      >
        {/* Industrial toggle */}
        <Pill
          label={BU_CFG['ind'].label}
          count={indCount}
          active={fil.buF['ind']}
          color={BU_CFG['ind'].color}
          onClick={() => fil.setBuF(p => ({ ...p, ind: !p.ind }))}
          ariaLabel={`Industrial: ${indCount} sites`}
        />

        {/* SIS group toggle */}
        <Pill
          label="SIS"
          count={sisTotal}
          active={someSisOn}
          color={theme.accent.purple}
          onClick={() => {
            const next = !allSisOn;
            fil.setBuF(p => {
              const n = { ...p };
              sisKeys.forEach(k => (n[k] = next));
              return n;
            });
          }}
          ariaLabel={`SIS all: ${sisTotal} sites`}
        />

        {/* SIS sub-filters */}
        {sisKeys.map(k => {
          const v = BU_CFG[k];
          const on = fil.buF[k];
          const cnt = SITES.filter(s => s.bu === k).length;
          const short = v.label.replace('SIS ', '');
          return (
            <Pill
              key={k}
              label={short}
              count={cnt}
              active={on}
              color={v.color}
              onClick={() => fil.setBuF(p => ({ ...p, [k]: !p[k] }))}
              ariaLabel={`${v.label}: ${cnt} sites`}
              small
            />
          );
        })}
      </div>
    </div>
  );
}
