import { useTheme, V2_TYP, V2_SP, V2_FONT, V2_FONT_MONO } from '../theme';

interface HeaderProps {
  mode: 'disruptions' | 'trade' | 'geopolitical';
  onModeChange: (mode: string) => void;
  onScan: () => void;
  scanning: boolean;
  scanPct: number;
  filterOpen: boolean;
  onFilterToggle: () => void;
  hasData: boolean;
  criticalCount: number;
}

const MODES = [
  { key: 'disruptions', label: 'Disruptions' },
  { key: 'trade', label: 'Trade Policy' },
  { key: 'geopolitical', label: 'Geopolitical' },
] as const;

// SVG icons inline to avoid dependencies
function SunIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ScanIcon({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function FilterIcon({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function Header({
  mode,
  onModeChange,
  onScan,
  scanning,
  scanPct,
  filterOpen,
  onFilterToggle,
  hasData,
  criticalCount,
}: HeaderProps) {
  const { theme, themeName, toggleTheme } = useTheme();

  const iconBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${theme.border.subtle}`,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .15s, border-color .15s',
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${V2_SP.xl}px`,
        fontFamily: V2_FONT,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: V2_SP.sm, flexShrink: 0 }}>
        <span style={{
          ...V2_TYP.pageTitle,
          fontFamily: V2_FONT_MONO,
          color: theme.text.primary,
        }}>
          SC Hub
        </span>
        <span style={{
          ...V2_TYP.bodySm,
          color: theme.text.muted,
        }}>
          Disruption Monitor
        </span>
      </div>

      {/* Center: Mode tabs */}
      <div style={{
        display: 'flex',
        gap: 2,
        background: theme.bg.primary,
        borderRadius: 10,
        padding: 3,
      }}>
        {MODES.map(m => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              style={{
                padding: `${V2_SP.xs + 2}px ${V2_SP.lg}px`,
                borderRadius: 8,
                border: 'none',
                background: active ? theme.accent.blue : 'transparent',
                color: active ? '#fff' : theme.text.tertiary,
                fontSize: V2_TYP.bodySm.fontSize,
                fontWeight: active ? 600 : 400,
                fontFamily: V2_FONT,
                cursor: active ? 'default' : 'pointer',
                transition: 'background .2s, color .2s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = theme.text.secondary;
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = theme.text.tertiary;
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm, flexShrink: 0 }}>
        {/* Critical badge */}
        {criticalCount > 0 && (
          <div style={{
            ...V2_TYP.monoSm,
            background: theme.severity.criticalBg,
            color: theme.severity.critical,
            padding: `2px ${V2_SP.sm}px`,
            borderRadius: 6,
            border: `1px solid ${theme.severity.critical}33`,
          }}>
            {criticalCount} critical
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={onScan}
          disabled={scanning}
          style={{
            ...iconBtnStyle,
            width: 'auto',
            padding: `0 ${V2_SP.md}px`,
            gap: V2_SP.xs,
            opacity: scanning ? 0.6 : 1,
            color: theme.text.secondary,
            fontSize: V2_TYP.bodySm.fontSize,
            fontFamily: V2_FONT,
            fontWeight: 500,
          }}
          onMouseEnter={e => {
            if (!scanning) {
              (e.currentTarget as HTMLElement).style.background = theme.bg.tertiary;
              (e.currentTarget as HTMLElement).style.borderColor = theme.border.default;
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle;
          }}
          title={scanning ? `Scanning... ${scanPct}%` : 'Trigger scan'}
        >
          <span style={{ display: 'flex', animation: scanning ? 'v2spin 1s linear infinite' : undefined }}>
            <ScanIcon size={14} color={theme.text.secondary} />
          </span>
          {scanning ? `${scanPct}%` : 'Scan'}
        </button>

        {/* Filter toggle */}
        <button
          onClick={onFilterToggle}
          style={{
            ...iconBtnStyle,
            background: filterOpen ? theme.accent.blue + '20' : 'transparent',
            borderColor: filterOpen ? theme.accent.blue + '40' : theme.border.subtle,
          }}
          onMouseEnter={e => {
            if (!filterOpen) {
              (e.currentTarget as HTMLElement).style.background = theme.bg.tertiary;
              (e.currentTarget as HTMLElement).style.borderColor = theme.border.default;
            }
          }}
          onMouseLeave={e => {
            if (!filterOpen) {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle;
            }
          }}
          title="Toggle filters"
        >
          <FilterIcon size={14} color={filterOpen ? theme.accent.blue : theme.text.muted} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={iconBtnStyle}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = theme.bg.tertiary;
            (e.currentTarget as HTMLElement).style.borderColor = theme.border.default;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle;
          }}
          title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
        >
          {themeName === 'dark'
            ? <SunIcon size={16} color={theme.text.muted} />
            : <MoonIcon size={16} color={theme.text.muted} />}
        </button>
      </div>
    </div>
  );
}
