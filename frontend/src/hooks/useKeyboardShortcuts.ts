import { useEffect, useState, useCallback } from 'react';
import type { ScanMode } from '../types';
import { eventId } from '../utils/format';
import type { useDisruptionState } from './useDisruptionState';
import type { useFilterState } from './useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

interface UseKeyboardShortcutsOptions {
  dis: DisruptionState;
  fil: FilterState;
}

export function useKeyboardShortcuts({ dis, fil }: UseKeyboardShortcutsOptions) {
  const [showHelp, setShowHelp] = useState(false);

  const toggleHelp = useCallback(() => setShowHelp(prev => !prev), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;

      const key = e.key;
      const itemCount = dis.items?.length ?? 0;

      switch (key) {
        case '?': {
          e.preventDefault();
          setShowHelp(prev => !prev);
          break;
        }

        case 'Escape': {
          e.preventDefault();
          if (showHelp) {
            setShowHelp(false);
          } else if (dis.sel !== null) {
            dis.setSel(null);
          } else if (dis.dOpen) {
            dis.closeD();
          }
          break;
        }

        case 'j': {
          e.preventDefault();
          if (!dis.dOpen) {
            dis.setDOpen(true);
          }
          if (itemCount === 0) break;
          if (dis.sel === null) {
            dis.setSel(0);
          } else {
            dis.setSel((dis.sel + 1) % itemCount);
          }
          break;
        }

        case 'k': {
          e.preventDefault();
          if (!dis.dOpen) {
            dis.setDOpen(true);
          }
          if (itemCount === 0) break;
          if (dis.sel === null) {
            dis.setSel(itemCount - 1);
          } else {
            dis.setSel((dis.sel - 1 + itemCount) % itemCount);
          }
          break;
        }

        case 'e':
        case 'Enter': {
          if (key === 'Enter' && document.activeElement?.tagName?.toLowerCase() === 'button') break;
          if (dis.sel !== null && dis.items) {
            e.preventDefault();
            // Toggle: deselect if already selected (collapses), otherwise this is a no-op since sel is set
            dis.setSel(prev => prev === dis.sel ? null : dis.sel);
          }
          break;
        }

        case 'w': {
          if (dis.sel !== null && dis.items) {
            e.preventDefault();
            const d = dis.items[dis.sel];
            if (!d) break;
            const eid = eventId(d as { event?: string; risk?: string; region?: string });
            const reg = dis.registry[eid];
            const backendId = 'id' in d ? (d as { id: string }).id : eid;
            if (reg?.status === 'watching') {
              dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'active' } }));
              dis.syncStatus(backendId, 'active');
            } else {
              dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'watching' } }));
              dis.syncStatus(backendId, 'watching');
            }
          }
          break;
        }

        case 'a': {
          if (dis.sel !== null && dis.items) {
            e.preventDefault();
            const d = dis.items[dis.sel];
            if (!d) break;
            const eid = eventId(d as { event?: string; risk?: string; region?: string });
            const sv = ('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : 'Medium')) as string;
            const backendId = 'id' in d ? (d as { id: string }).id : eid;
            dis.setRegistry(p => ({
              ...p,
              [eid]: { ...p[eid], status: 'archived', archivedSev: sv, archivedAt: new Date().toISOString() },
            }));
            dis.syncStatus(backendId, 'archived');
          }
          break;
        }

        case '1': {
          e.preventDefault();
          dis.scan('disruptions' as ScanMode);
          break;
        }

        case '2': {
          e.preventDefault();
          dis.scan('geopolitical' as ScanMode);
          break;
        }

        case '3': {
          e.preventDefault();
          dis.scan('trade' as ScanMode);
          break;
        }

        case 'r': {
          e.preventDefault();
          if (dis.mode) {
            dis.scan(dis.mode);
          }
          break;
        }

        case 'f': {
          e.preventDefault();
          fil.setFO(prev => !prev);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dis, fil, showHelp]);

  // Auto-scroll selected card into view
  useEffect(() => {
    if (dis.sel === null) return;
    // Small delay so the DOM has rendered
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-card-idx="${dis.sel}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
    return () => clearTimeout(t);
  }, [dis.sel]);

  return { showHelp, toggleHelp, closeHelp };
}
