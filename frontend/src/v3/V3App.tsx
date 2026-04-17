/**
 * V3App — Main V3 entry component (mission-control feed layout).
 *
 * Orchestrates existing hooks with V3 components:
 * TopBar, DeltaBanner, FeedList (left), Sidebar with MiniMap + RiskSummary (right).
 * Supports full-screen MapMode toggle.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { V3_FONT } from './theme';
import { V3ThemeProvider, useV3Theme } from './ThemeContext';
import { GLOBAL_CSS } from '../styles';
import { useDisruptionState } from '../hooks/useDisruptionState';
import { useFilterState } from '../hooks/useFilterState';
import { useMapState } from '../hooks/useMapState';
import { SITES, SUPPLIERS } from '../data';
import { eventId } from '../utils/format';
import type { ScanMode } from '../types';

// V3 components
import { TopBar } from './components/TopBar';
import { DeltaBanner } from './components/DeltaBanner';
import { FeedList } from './components/FeedList';
import { RiskSummary } from './components/RiskSummary';
import { WeeklyBriefing } from './components/WeeklyBriefing';
import { WhatIfPanel } from './components/WhatIfPanel';
// V1/V2/V3 toggle removed — V3 is now the primary UI

// Map components (created by map agent — using direct imports)
import { MiniMap } from './map/MiniMap';
import { MapMode } from './map/MapMode';

// CSS injection for V3 animations
const V3_CSS = `
@keyframes sc-skeleton {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
@keyframes sc-spin {
  to { transform: rotate(360deg); }
}
`;

export interface V3AppProps {
  version: 'v1' | 'v2' | 'v3';
  onVersionChange: (v: 'v1' | 'v2' | 'v3') => void;
}

function V3AppInner({ version, onVersionChange }: V3AppProps) {
  const { theme: V3 } = useV3Theme();

  const dis = useDisruptionState();
  const fil = useFilterState();
  useMapState(); // initialized for future map integration

  // V3-specific state
  const [mapMode, setMapMode] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [showWeeklyBriefing, setShowWeeklyBriefing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [buFilter, setBuFilter] = useState<string | null>(null);
  const [showWhatIf, setShowWhatIf] = useState(false);

  // Inject CSS
  const cssInjected = useRef(false);
  useEffect(() => {
    if (cssInjected.current) return;
    cssInjected.current = true;
    // Inject global CSS (shared animations)
    if (!document.getElementById('sc-mon-css')) {
      const s = document.createElement('style');
      s.id = 'sc-mon-css';
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
    // Inject V3-specific CSS
    if (!document.getElementById('v3-css')) {
      const s = document.createElement('style');
      s.id = 'v3-css';
      s.textContent = V3_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // Auto-load disruptions on mount
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!autoLoaded.current) {
      autoLoaded.current = true;
      (async () => {
        const loaded = await dis.loadLatest('disruptions');
        if (!loaded) dis.scan('disruptions');
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Map selected index <-> selectedEventId
  const selectedIndex = useMemo(() => {
    if (!selectedEventId || !dis.items) return null;
    return dis.items.findIndex(d => {
      const eid = eventId(d as { event?: string; risk?: string; region?: string });
      return eid === selectedEventId;
    });
  }, [selectedEventId, dis.items]);

  const handleSelectIndex = useCallback((idx: number | null) => {
    if (idx === null || !dis.items?.[idx]) {
      setSelectedEventId(null);
      dis.setSel(null);
      return;
    }
    const eid = eventId(dis.items[idx] as { event?: string; risk?: string; region?: string });
    setSelectedEventId(eid);
    dis.setSel(idx);
    dis.setDOpen(true);
    // Load recs
    const item = dis.items[idx];
    if (item && 'id' in item) {
      dis.loadRecs((item as { id: string }).id);
    } else {
      dis.loadRecs(eid);
    }
  }, [dis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHoverIndex = useCallback((idx: number | null) => {
    if (idx === null || !dis.items?.[idx]) {
      setHoveredEventId(null);
      return;
    }
    const eid = eventId(dis.items[idx] as { event?: string; risk?: string; region?: string });
    setHoveredEventId(eid);
  }, [dis.items]);

  const handleModeChange = useCallback((mode: ScanMode) => {
    dis.scan(mode);
    setSelectedEventId(null);
  }, [dis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScanNow = useCallback(() => {
    const mode = dis.mode || 'disruptions';
    dis.scan(mode);
  }, [dis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMapSelectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (id && dis.items) {
      const idx = dis.items.findIndex(d => {
        const eid = eventId(d as { event?: string; risk?: string; region?: string });
        return eid === id;
      });
      if (idx >= 0) {
        dis.setSel(idx);
        dis.setDOpen(true);
      }
    }
  }, [dis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle status changes from ExpandedCard (watch/archive)
  const handleStatusChange = useCallback((_eventId: string, newStatus: string) => {
    if (newStatus === 'archived') {
      // Remove archived item from the list and deselect
      if (dis.items && dis.sel !== null) {
        const updated = [...dis.items];
        updated.splice(dis.sel, 1);
        dis.setItems(updated);
      }
      setSelectedEventId(null);
      dis.setSel(null);
    } else {
      // For 'watching' or 'active', update status on the item in-place
      if (dis.items && dis.sel !== null) {
        const updated = [...dis.items];
        const item = { ...updated[dis.sel] } as Record<string, unknown>;
        item.status = newStatus;
        updated[dis.sel] = item as typeof updated[0];
        dis.setItems(updated);
      }
    }
  }, [dis.items, dis.sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full-screen map mode
  if (mapMode) {
    return (
      <div style={{ fontFamily: V3_FONT, background: V3.bg.base, color: V3.text.primary, height: '100vh' }}>
        <MapMode
          events={dis.items || []}
          sites={SITES}
          suppliers={SUPPLIERS}
          selectedEventId={selectedEventId}
          onSelectEvent={handleMapSelectEvent}
          onCloseMap={() => setMapMode(false)}
          filters={{}}
          onStatusChange={handleStatusChange}
        />
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: V3_FONT,
      background: V3.bg.base,
      color: V3.text.primary,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top Bar */}
      <TopBar
        mode={dis.mode}
        onModeChange={handleModeChange}
        severityFilter={fil.sevFilter}
        onSeverityFilterChange={fil.setSevFilter}
        buFilter={buFilter}
        onBuFilterChange={setBuFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        scanTime={dis.sTime}
        scanning={dis.loading}
        onScanNow={handleScanNow}
        mapMode={mapMode}
        onToggleMap={() => setMapMode(true)}
        onToggleWhatIf={() => setShowWhatIf(prev => !prev)}
        whatIfOpen={showWhatIf}
      />

      {/* Scan progress bar */}
      {(dis.loading || dis.scanPct > 0) && (
        <div style={{
          height: 2,
          background: V3.bg.base,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: dis.scanPct + '%',
            background: V3.accent.blue,
            transition: 'width 0.3s ease-out',
          }} />
        </div>
      )}

      {/* Delta Banner */}
      <DeltaBanner
        items={dis.items}
        registry={dis.registry}
        mode={dis.mode}
        onOpenWeeklyBriefing={() => setShowWeeklyBriefing(true)}
      />

      {/* Main content: Feed (left) + Sidebar (right) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Feed List — 65% */}
        <div style={{
          flex: '0 0 65%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRight: `1px solid ${V3.border.subtle}`,
        }}>
          <FeedList
            items={dis.items}
            loading={dis.loading}
            error={dis.error}
            severityFilter={fil.sevFilter}
            searchQuery={searchQuery}
            selectedIndex={selectedIndex}
            onSelectIndex={handleSelectIndex}
            onHoverIndex={handleHoverIndex}
            onStatusChange={handleStatusChange}
          />
        </div>

        {/* Sidebar — 35% */}
        <div style={{
          flex: '0 0 35%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: V3.bg.sidebar,
        }}>
          {/* Mini Map */}
          <div style={{ padding: V3.spacing.lg, paddingBottom: 0 }}>
            <MiniMap
              events={dis.items || []}
              sites={SITES}
              hoveredEventId={hoveredEventId}
              selectedEventId={selectedEventId}
              onHoverEvent={setHoveredEventId}
              onSelectEvent={(id: string) => handleMapSelectEvent(id)}
              onExpandMap={() => setMapMode(true)}
            />
          </div>

          {/* Risk Summary */}
          <RiskSummary items={dis.items} />
        </div>
      </div>

      {/* Weekly Briefing modal */}
      <WeeklyBriefing
        open={showWeeklyBriefing}
        onClose={() => setShowWeeklyBriefing(false)}
      />

      {/* What-If scenario drawer */}
      <WhatIfPanel open={showWhatIf} onClose={() => setShowWhatIf(false)} />

    </div>
  );
}

export function V3App(props: V3AppProps) {
  return (
    <V3ThemeProvider>
      <V3AppInner {...props} />
    </V3ThemeProvider>
  );
}

export default V3App;
