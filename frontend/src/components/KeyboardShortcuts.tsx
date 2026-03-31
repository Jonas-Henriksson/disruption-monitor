import { useEffect, useRef } from 'react';
import { FM, F } from '../data';

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'j', desc: 'Next event card' },
  { key: 'k', desc: 'Previous event card' },
  { key: 'e', desc: 'Expand / collapse card' },
  { key: 'Enter', desc: 'Expand / collapse card' },
  { key: 'w', desc: 'Toggle Watch status' },
  { key: 'a', desc: 'Archive selected event' },
  { key: '1', desc: 'Disruptions mode' },
  { key: '2', desc: 'Geopolitical mode' },
  { key: '3', desc: 'Trade mode' },
  { key: 'r', desc: 'Trigger rescan' },
  { key: 'f', desc: 'Toggle filter panel' },
  { key: 'Esc', desc: 'Close drawer / clear selection' },
  { key: '?', desc: 'Toggle this overlay' },
];

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const mid = Math.ceil(SHORTCUTS.length / 2);
  const col1 = SHORTCUTS.slice(0, mid);
  const col2 = SHORTCUTS.slice(mid);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div
        ref={overlayRef}
        className="sc-ce"
        style={{
          background: '#080e1cf8',
          border: '1px solid #14243e',
          borderRadius: 10,
          width: 400,
          padding: '16px 24px',
          fontFamily: F,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            style={{
              background: '#0a1220', border: '1px solid #14243e', borderRadius: 4,
              color: '#4a6080', padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              fontFamily: FM, fontWeight: 600,
            }}
          >
            ESC
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {[col1, col2].map((col, ci) => (
            <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: '#0a1220',
                    border: '1px solid #14243e',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontFamily: FM,
                    color: '#c8d6e5',
                    fontWeight: 500,
                    minWidth: 32,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    {s.key}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
