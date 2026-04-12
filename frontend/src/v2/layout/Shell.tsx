import { useEffect } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useTheme, V2_FONT } from '../theme';
import { V2_CSS } from '../v2styles';

interface ShellProps {
  leftPanel: ReactNode;
  leftOpen: boolean;
  onLeftToggle: () => void;
  center: ReactNode;
  rightPanel: ReactNode;
  rightOpen: boolean;
  onRightToggle: () => void;
  header: ReactNode;
  heroStrip?: ReactNode;
  filterBar?: ReactNode;
  scanProgress?: number;
}

const LEFT_WIDTH = 300;
const RIGHT_WIDTH = 400;
const HEADER_HEIGHT = 64;
const ANIM = 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)';

function CollapseTab({ side, open, onClick, theme }: {
  side: 'left' | 'right';
  open: boolean;
  onClick: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const isLeft = side === 'left';
  const chevron = isLeft
    ? (open ? '\u2039' : '\u203A')
    : (open ? '\u203A' : '\u2039');

  const style: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [isLeft ? 'right' : 'left']: -14,
    width: 14,
    height: 48,
    background: theme.bg.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: isLeft ? '0 6px 6px 0' : '6px 0 0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: theme.text.muted,
    fontSize: 14,
    fontWeight: 700,
    zIndex: 10,
    transition: 'color .15s, background .15s',
  };

  if (isLeft) {
    style.borderLeft = 'none';
  } else {
    style.borderRight = 'none';
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={style}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.color = theme.text.secondary;
        (e.currentTarget as HTMLElement).style.background = theme.bg.tertiary;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.color = theme.text.muted;
        (e.currentTarget as HTMLElement).style.background = theme.bg.secondary;
      }}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${side} panel`}
    >
      {chevron}
    </div>
  );
}

export function Shell({
  leftPanel,
  leftOpen,
  onLeftToggle,
  center,
  rightPanel,
  rightOpen,
  onRightToggle,
  header,
  heroStrip,
  filterBar,
  scanProgress,
}: ShellProps) {
  const { theme } = useTheme();

  useEffect(() => {
    const id = 'v2-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = V2_CSS;
      document.head.appendChild(s);
    }
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: theme.bg.primary,
        color: theme.text.primary,
        fontFamily: V2_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          borderBottom: `1px solid ${theme.border.subtle}`,
          background: theme.bg.secondary,
          zIndex: 30,
        }}
      >
        {header}
      </div>

      {/* Scan progress bar */}
      {scanProgress != null && scanProgress > 0 && scanProgress < 100 && (
        <div
          style={{
            height: 2,
            background: theme.border.subtle,
            position: 'relative',
            zIndex: 29,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${scanProgress}%`,
              background: theme.accent.blue,
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}

      {/* Hero strip (KPIs) */}
      {heroStrip && (
        <div style={{ borderBottom: `1px solid ${theme.border.subtle}`, background: theme.bg.secondary, zIndex: 20, flexShrink: 0 }}>
          {heroStrip}
        </div>
      )}

      {/* Filter bar */}
      {filterBar && (
        <div style={{ borderBottom: `1px solid ${theme.border.subtle}`, background: theme.bg.secondary, zIndex: 19, flexShrink: 0 }}>
          {filterBar}
        </div>
      )}

      {/* Main content: left panel + map + right panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left panel */}
        <div
          style={{
            width: leftOpen ? LEFT_WIDTH : 0,
            minWidth: leftOpen ? LEFT_WIDTH : 0,
            transition: ANIM,
            overflow: 'hidden',
            borderRight: leftOpen ? `1px solid ${theme.border.subtle}` : 'none',
            background: theme.bg.secondary,
            position: 'relative',
            zIndex: 5,
          }}
        >
          <div style={{ width: LEFT_WIDTH, height: '100%', overflow: 'auto' }}>
            {leftPanel}
          </div>
          <CollapseTab side="left" open={leftOpen} onClick={onLeftToggle} theme={theme} />
        </div>

        {/* Collapse tab for left panel when closed */}
        {!leftOpen && (
          <div style={{ position: 'relative', width: 0, zIndex: 5 }}>
            <CollapseTab side="left" open={leftOpen} onClick={onLeftToggle} theme={theme} />
          </div>
        )}

        {/* Center - map area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {center}
        </div>

        {/* Collapse tab for right panel when closed */}
        {!rightOpen && (
          <div style={{ position: 'relative', width: 0, zIndex: 5 }}>
            <CollapseTab side="right" open={rightOpen} onClick={onRightToggle} theme={theme} />
          </div>
        )}

        {/* Right panel */}
        <div
          style={{
            width: rightOpen ? RIGHT_WIDTH : 0,
            minWidth: rightOpen ? RIGHT_WIDTH : 0,
            transition: ANIM,
            overflow: 'hidden',
            borderLeft: rightOpen ? `1px solid ${theme.border.subtle}` : 'none',
            background: theme.bg.secondary,
            position: 'relative',
            zIndex: 5,
          }}
        >
          <div style={{ width: RIGHT_WIDTH, height: '100%', overflow: 'auto' }}>
            {rightPanel}
          </div>
          <CollapseTab side="right" open={rightOpen} onClick={onRightToggle} theme={theme} />
        </div>
      </div>
    </div>
  );
}
