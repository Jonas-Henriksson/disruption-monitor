/**
 * V3 VersionToggle — 3-way toggle between v1, v2, and v3 UI versions.
 * Used inside V3App; mirrors the V2 VersionToggle pattern.
 */

import { useCallback } from 'react';

type UIVersion = 'v1' | 'v2' | 'v3';

export interface VersionToggleProps {
  version: UIVersion;
  onVersionChange: (v: UIVersion) => void;
}

export function VersionToggle({ version, onVersionChange }: VersionToggleProps) {
  const handleSwitch = useCallback((target: UIVersion) => {
    if (target === version) return;
    try {
      localStorage.setItem('ui-version', target);
    } catch { /* ignore */ }
    onVersionChange(target);
  }, [version, onVersionChange]);

  const versions: UIVersion[] = ['v1', 'v2', 'v3'];

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
      {versions.map((v, i) => (
        <button
          key={v}
          onClick={() => handleSwitch(v)}
          style={{
            padding: '6px 16px',
            border: 'none',
            cursor: version === v ? 'default' : 'pointer',
            background: version === v ? '#3b82f6' : 'transparent',
            color: version === v ? '#fff' : '#94a3b8',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            fontWeight: 'inherit',
            borderRadius: i === 0 ? '19px 0 0 19px' : i === versions.length - 1 ? '0 19px 19px 0' : '0',
            transition: 'background .2s, color .2s',
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
