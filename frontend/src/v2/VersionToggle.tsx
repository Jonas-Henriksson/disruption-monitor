import { useCallback } from 'react';

/**
 * Floating pill button to switch between v1 and v2 UI.
 * Self-contained: reads/writes localStorage and reloads the page.
 */
export function VersionToggle({ version }: { version: 'v1' | 'v2' }) {
  const handleSwitch = useCallback((target: 'v1' | 'v2') => {
    if (target === version) return;
    try {
      localStorage.setItem('ui-version', target);
    } catch { /* ignore */ }
    window.location.reload();
  }, [version]);

  const pillBg = version === 'v2' ? '#111a2e' : '#0a1220';
  const borderColor = version === 'v2' ? '#334155' : '#14243e';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 52,
        right: 16,
        zIndex: 60,
        display: 'flex',
        borderRadius: 14,
        background: pillBg,
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace',
        userSelect: 'none',
      }}
    >
      <button
        onClick={() => handleSwitch('v1')}
        style={{
          padding: '5px 10px',
          border: 'none',
          cursor: version === 'v1' ? 'default' : 'pointer',
          background: version === 'v1' ? '#3b82f6' : 'transparent',
          color: version === 'v1' ? '#fff' : '#64748b',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          borderRadius: '13px 0 0 13px',
          transition: 'background .2s, color .2s',
        }}
      >
        v1
      </button>
      <button
        onClick={() => handleSwitch('v2')}
        style={{
          padding: '5px 10px',
          border: 'none',
          cursor: version === 'v2' ? 'default' : 'pointer',
          background: version === 'v2' ? '#3b82f6' : 'transparent',
          color: version === 'v2' ? '#fff' : '#64748b',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          borderRadius: '0 13px 13px 0',
          transition: 'background .2s, color .2s',
        }}
      >
        v2
      </button>
    </div>
  );
}
