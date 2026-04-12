import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { S, B, T, TYP, SP, BR } from '../tokens';
import { FM } from '../data/config';

export type MobileTab = 'map' | 'disruptions' | 'brief';

interface MobileBottomSheetProps {
  children: ReactNode;
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const SNAP_COLLAPSED = 56;   // Just the tab bar visible
const SNAP_PEEK = 280;       // Peeking — shows first few cards
const SNAP_FULL_OFFSET = 80; // Full-height leaves this much room at top

type SnapPoint = 'collapsed' | 'peek' | 'full';

/**
 * Mobile bottom sheet with drag-to-expand/collapse.
 * Shows a tab bar at the bottom and a draggable sheet above it.
 */
export function MobileBottomSheet({ children, activeTab, onTabChange }: MobileBottomSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>('collapsed');
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;

  const snapHeights: Record<SnapPoint, number> = {
    collapsed: SNAP_COLLAPSED,
    peek: Math.min(SNAP_PEEK, windowH * 0.4),
    full: windowH - SNAP_FULL_OFFSET,
  };

  const currentHeight = isDragging
    ? Math.max(SNAP_COLLAPSED, Math.min(snapHeights.full, startHeightRef.current + dragOffset))
    : snapHeights[snap];

  // If tab is 'map', collapse; otherwise peek
  useEffect(() => {
    if (activeTab === 'map') {
      setSnap('collapsed');
    } else if (snap === 'collapsed') {
      setSnap('peek');
    }
  }, [activeTab]);

  const handleDragStart = useCallback((clientY: number) => {
    startYRef.current = clientY;
    startHeightRef.current = snapHeights[snap];
    setIsDragging(true);
  }, [snap, snapHeights]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    // Dragging up increases height (negative delta)
    const delta = startYRef.current - clientY;
    setDragOffset(delta);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const finalHeight = Math.max(SNAP_COLLAPSED, startHeightRef.current + dragOffset);
    // Snap to nearest snap point
    const distances = (Object.entries(snapHeights) as [SnapPoint, number][]).map(
      ([key, h]) => ({ key, distance: Math.abs(finalHeight - h) })
    );
    distances.sort((a, b) => a.distance - b.distance);
    const nearest = distances[0].key;
    setSnap(nearest);
    setDragOffset(0);
    // If snapped to collapsed, switch to map tab
    if (nearest === 'collapsed' && activeTab !== 'map') {
      onTabChange('map');
    }
  }, [isDragging, dragOffset, snapHeights, activeTab, onTabChange]);

  // Touch handlers on the drag handle
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse drag support for testing on desktop
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    handleDragStart(e.clientY);
    const onMove = (ev: MouseEvent) => handleDragMove(ev.clientY);
    const onUp = () => { handleDragEnd(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleDragStart, handleDragMove, handleDragEnd]);

  const handleTabClick = (tab: MobileTab) => {
    if (tab === activeTab && tab !== 'map') {
      // Toggle between peek and full
      setSnap(s => s === 'full' ? 'peek' : 'full');
    } else {
      onTabChange(tab);
      if (tab !== 'map') {
        setSnap('peek');
      }
    }
  };

  const showContent = activeTab !== 'map' || snap !== 'collapsed';

  return (
    <div
      ref={sheetRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: currentHeight,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging ? 'none' : 'height 300ms cubic-bezier(.16,1,.3,1)',
        pointerEvents: 'auto',
      }}
    >
      {/* Drag handle + sheet content */}
      {showContent && (
        <div style={{
          flex: 1,
          background: S[0],
          borderTop: `1px solid ${B.popup}`,
          borderRadius: `${BR['2xl']}px ${BR['2xl']}px 0 0`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
          minHeight: 0,
        }}>
          {/* Drag handle bar */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onMouseDown}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: `${SP.md}px 0`,
              cursor: 'grab',
              flexShrink: 0,
              touchAction: 'none',
            }}
          >
            <div style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: B.default,
            }} />
          </div>

          {/* Scrollable content area */}
          <div className="sc-s" style={{
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}>
            {children}
          </div>
        </div>
      )}

      {/* Tab bar — always at bottom */}
      <div style={{
        display: 'flex',
        background: S.base,
        borderTop: `1px solid ${B.subtle}`,
        flexShrink: 0,
        height: SNAP_COLLAPSED,
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {([
          { key: 'map' as MobileTab, label: 'Map', icon: '\uD83D\uDDFA\uFE0F' },
          { key: 'disruptions' as MobileTab, label: 'Disruptions', icon: '\uD83D\uDD34' },
          { key: 'brief' as MobileTab, label: 'Brief', icon: '\uD83D\uDCCB' },
        ]).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: `${SP.sm}px ${SP.xs}px`,
                minHeight: 44,
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{
                ...TYP.label,
                fontSize: 9,
                letterSpacing: 1,
                color: isActive ? '#60a5fa' : T.muted,
                fontFamily: FM,
              }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '20%',
                  right: '20%',
                  height: 2,
                  background: '#2563eb',
                  borderRadius: '0 0 2px 2px',
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
