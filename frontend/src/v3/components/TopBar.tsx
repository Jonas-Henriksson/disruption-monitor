/**
 * TopBar — V3 top navigation bar with search, filters, mode tabs, scan controls, theme toggle.
 */

import { useState, useMemo } from 'react';
import { TYPE, V3_FONT, V3_FONT_MONO, sevColor } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { ScanMode, Severity } from '../../types';
import { relTime } from '../../utils/format';
import { UserBadge } from '../../auth/UserBadge';

export interface TopBarProps {
  mode: ScanMode | null;
  onModeChange: (mode: ScanMode) => void;
  severityFilter: Severity | null;
  onSeverityFilterChange: (sev: Severity | null) => void;
  buFilter: string | null;
  onBuFilterChange: (bu: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  scanTime: Date | null;
  scanning: boolean;
  onScanNow: () => void;
  mapMode: boolean;
  onToggleMap: () => void;
  onToggleWhatIf?: () => void;
  whatIfOpen?: boolean;
  onOpenWeeklyBriefing?: () => void;
  myWorkCount?: number;
  onOpenMyWork?: () => void;
}

const MODES: { key: ScanMode; label: string }[] = [
  { key: 'disruptions', label: 'Disruptions' },
  { key: 'trade', label: 'Trade' },
];

const BU_OPTIONS = [
  { key: null as string | null, label: 'All BUs' },
  { key: 'ind', label: 'Industrial' },
  { key: 'sis-aero', label: 'Aerospace' },
  { key: 'sis-seal', label: 'Seals' },
  { key: 'sis-lube', label: 'Lubrication' },
  { key: 'sis-mag', label: 'Magnetics' },
];

const SEV_PILLS: { key: Severity | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'Critical', label: 'Critical' },
  { key: 'High', label: 'High' },
];

type Freshness = 'fresh' | 'stale' | 'degraded' | 'offline';

function getFreshness(scanTime: Date | null): Freshness {
  if (!scanTime) return 'offline';
  const ageMs = Date.now() - scanTime.getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 1) return 'fresh';
  if (hours < 4) return 'stale';
  if (hours < 24) return 'degraded';
  return 'offline';
}

export function TopBar({
  mode,
  onModeChange,
  severityFilter,
  onSeverityFilterChange,
  buFilter,
  onBuFilterChange,
  searchQuery,
  onSearchChange,
  scanTime,
  scanning,
  onScanNow,
  mapMode,
  onToggleMap,
  onToggleWhatIf,
  whatIfOpen,
  onOpenWeeklyBriefing,
  myWorkCount,
  onOpenMyWork,
}: TopBarProps) {
  const { theme: V3, mode: themeMode, toggleTheme } = useV3Theme();
  const [buOpen, setBuOpen] = useState(false);
  const freshness = useMemo(() => getFreshness(scanTime), [scanTime]);
  const activeBuLabel = BU_OPTIONS.find(b => b.key === buFilter)?.label || 'All BUs';

  const FRESHNESS_COLORS: Record<Freshness, string> = {
    fresh: V3.accent.green,
    stale: V3.accent.amber,
    degraded: V3.accent.red,
    offline: V3.text.muted,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: V3.spacing.md,
      padding: `${V3.spacing.sm}px ${V3.spacing.lg}px`,
      background: V3.bg.topbar,
      borderBottom: `1px solid ${V3.border.subtle}`,
      fontFamily: V3_FONT,
      flexShrink: 0,
      zIndex: 40,
      minHeight: 48,
    }}>
      {/* Logo */}
      <div style={{
        ...TYPE.title,
        fontSize: 16,
        fontWeight: 700,
        color: V3.text.primary,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        cursor: 'default',
      }}>
        SC Hub
      </div>

      {/* Search */}
      <div style={{ position: 'relative', flexShrink: 0, width: 200 }}>
        <input
          type="text"
          placeholder="Search events..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: `${V3.spacing.xs}px ${V3.spacing.sm}px ${V3.spacing.xs}px 28px`,
            background: V3.bg.input,
            border: `1px solid ${V3.border.subtle}`,
            borderRadius: V3.radius.md,
            color: V3.text.primary,
            fontSize: TYPE.body.fontSize,
            fontFamily: V3_FONT,
            outline: 'none',
            transition: 'border-color 150ms',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = V3.border.focus; }}
          onBlur={e => { e.currentTarget.style.borderColor = V3.border.subtle; }}
        />
        <span style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: V3.text.muted,
          fontSize: 13,
          pointerEvents: 'none',
        }}>
          {'\u2315'}
        </span>
      </div>

      {/* Severity pills */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {SEV_PILLS.map(pill => {
          const active = severityFilter === pill.key;
          const pillColor = pill.key ? sevColor(pill.key, V3) : V3.accent.blue;
          return (
            <button
              key={pill.label}
              onClick={() => onSeverityFilterChange(pill.key)}
              style={{
                padding: `3px ${V3.spacing.sm}px`,
                border: `1px solid ${active ? pillColor + '55' : V3.border.subtle}`,
                borderRadius: V3.radius.full,
                background: active ? pillColor + '18' : 'transparent',
                color: active ? pillColor : V3.text.muted,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                fontFamily: V3_FONT,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Mode tabs */}
      <div style={{
        display: 'flex',
        background: V3.bg.base,
        borderRadius: V3.radius.md,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}>
        {MODES.map(m => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              style={{
                padding: `4px ${V3.spacing.md}px`,
                border: 'none',
                borderRadius: V3.radius.sm,
                background: active ? V3.accent.blueDim : 'transparent',
                color: active ? V3.text.accent : V3.text.muted,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                fontFamily: V3_FONT,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* BU dropdown */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setBuOpen(!buOpen)}
          style={{
            padding: `4px ${V3.spacing.md}px`,
            border: `1px solid ${V3.border.subtle}`,
            borderRadius: V3.radius.sm,
            background: buFilter ? V3.accent.blueDim : 'transparent',
            color: buFilter ? V3.text.accent : V3.text.muted,
            fontSize: 11,
            fontFamily: V3_FONT,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {activeBuLabel}
          <span style={{ fontSize: 8, opacity: 0.6 }}>{buOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {buOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: V3.bg.card,
            border: `1px solid ${V3.border.default}`,
            borderRadius: V3.radius.md,
            padding: V3.spacing.xs,
            zIndex: 50,
            minWidth: 140,
            boxShadow: themeMode === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            {BU_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => { onBuFilterChange(opt.key); setBuOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
                  border: 'none',
                  borderRadius: V3.radius.sm,
                  background: buFilter === opt.key ? V3.accent.blueDim : 'transparent',
                  color: buFilter === opt.key ? V3.text.accent : V3.text.secondary,
                  fontSize: 11,
                  fontFamily: V3_FONT,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => { if (buFilter !== opt.key) e.currentTarget.style.background = V3.bg.cardHover; }}
                onMouseLeave={e => { if (buFilter !== opt.key) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* What-If toggle */}
      {onToggleWhatIf && (
        <button onClick={onToggleWhatIf} style={{
          padding: '5px 10px', borderRadius: 6,
          border: `1px solid ${whatIfOpen ? V3.accent.purple : V3.border.subtle}`,
          background: whatIfOpen ? V3.accent.purple + '22' : V3.bg.card,
          color: whatIfOpen ? V3.accent.purple : V3.text.secondary,
          fontSize: 10, fontWeight: 700, fontFamily: V3_FONT_MONO,
          cursor: 'pointer', textTransform: 'uppercase' as const,
        }}>
          What-If
        </button>
      )}

      {/* Map toggle */}
      <button
        onClick={onToggleMap}
        title={mapMode ? 'Exit map view' : 'Open full map'}
        style={{
          padding: `4px ${V3.spacing.sm}px`,
          border: `1px solid ${mapMode ? V3.accent.blue + '55' : V3.border.subtle}`,
          borderRadius: V3.radius.sm,
          background: mapMode ? V3.accent.blueDim : 'transparent',
          color: mapMode ? V3.text.accent : V3.text.muted,
          fontSize: 13,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {'\u{1F5FA}'}
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        style={{
          width: 30,
          height: 30,
          borderRadius: V3.radius.full,
          border: `1px solid ${V3.border.subtle}`,
          background: V3.bg.input,
          color: V3.text.muted,
          fontSize: 14,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 150ms',
          padding: 0,
        }}
      >
        {themeMode === 'dark' ? '\u2600' : '\u263E'}
      </button>

      {/* My Work */}
      {onOpenMyWork && (
        <button
          onClick={onOpenMyWork}
          title="My Work"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
            color: V3.text.muted, fontSize: 16, padding: '4px 6px',
            borderRadius: V3.radius.sm,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = V3.text.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = V3.text.muted)}
        >
          {'\uD83D\uDCDD'}
          {(myWorkCount ?? 0) > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -4,
              background: V3.severity.critical, color: '#fff',
              fontSize: 8, fontWeight: 700, borderRadius: '50%',
              minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}>
              {myWorkCount}
            </span>
          )}
        </button>
      )}

      {/* Weekly Briefing */}
      {onOpenWeeklyBriefing && (
        <button
          onClick={onOpenWeeklyBriefing}
          title="Weekly Briefing"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: V3.text.muted, fontSize: 16, padding: '4px 6px',
            borderRadius: V3.radius.sm,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = V3.text.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = V3.text.muted)}
        >
          {'\uD83D\uDCCB'}
        </button>
      )}

      {/* User badge */}
      <UserBadge theme={{
        bg: V3.bg.base,
        border: V3.border.subtle,
        avatarBg: V3.accent.blueDim,
        avatarBorder: V3.accent.blue + '44',
        avatarColor: V3.accent.blue,
        nameColor: V3.text.primary,
        emailColor: V3.text.muted,
        btnBorder: V3.border.subtle,
        btnColor: V3.text.muted,
        font: V3_FONT_MONO,
      }} />

      {/* Scan status + button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: V3.spacing.sm, flexShrink: 0 }}>
        {/* Staleness dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: FRESHNESS_COLORS[freshness],
            flexShrink: 0,
          }} />
          <span style={{
            ...TYPE.meta,
            color: V3.text.muted,
            fontFamily: V3_FONT_MONO,
            fontSize: 10,
          }}>
            {scanTime ? relTime(scanTime) : 'No scan'}
          </span>
        </div>

        <button
          onClick={onScanNow}
          disabled={scanning}
          style={{
            padding: `4px ${V3.spacing.md}px`,
            border: `1px solid ${V3.accent.blue}55`,
            borderRadius: V3.radius.sm,
            background: scanning ? V3.accent.blueDim : V3.accent.blue + '18',
            color: scanning ? V3.text.muted : V3.accent.blue,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: V3_FONT,
            cursor: scanning ? 'not-allowed' : 'pointer',
            transition: 'all 150ms',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {scanning && (
            <span style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              border: `2px solid ${V3.text.muted}`,
              borderTopColor: V3.accent.blue,
              borderRadius: '50%',
              animation: 'sc-spin 0.8s linear infinite',
            }} />
          )}
          Scan Now
        </button>
      </div>

      {/* Degraded banner — inline warning when data is very stale */}
      {freshness === 'offline' && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: V3.severity.criticalBg,
          borderBottom: `1px solid ${V3.severity.criticalBorder}`,
          padding: `${V3.spacing.xs}px ${V3.spacing.lg}px`,
          fontSize: 11,
          color: V3.severity.critical,
          textAlign: 'center',
          zIndex: 39,
        }}>
          Data is more than 24h old -- scan results may be stale
        </div>
      )}
    </div>
  );
}
