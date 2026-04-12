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

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        borderRadius: 20,
        background: '#1e293b',
        border: '1px solid #475569',
        overflow: 'hidden',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace',
        userSelect: 'none',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      <button
        onClick={() => handleSwitch('v1')}
        style={{
          padding: '6px 16px',
          border: 'none',
          cursor: version === 'v1' ? 'default' : 'pointer',
          background: version === 'v1' ? '#3b82f6' : 'transparent',
          color: version === 'v1' ? '#fff' : '#94a3b8',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          borderRadius: '19px 0 0 19px',
          transition: 'background .2s, color .2s',
        }}
      >
        v1
      </button>
      <button
        onClick={() => handleSwitch('v2')}
        style={{
          padding: '6px 16px',
          border: 'none',
          cursor: version === 'v2' ? 'default' : 'pointer',
          background: version === 'v2' ? '#3b82f6' : 'transparent',
          color: version === 'v2' ? '#fff' : '#94a3b8',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          borderRadius: '0 19px 19px 0',
          transition: 'background .2s, color .2s',
        }}
      >
        v2
      </button>
    </div>
  );
}
