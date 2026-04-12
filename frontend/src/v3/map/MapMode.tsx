/**
 * MapMode — Full-screen map mode for V3.
 *
 * Full D3 natural earth projection with zoom/pan, event markers,
 * site markers, routing overlays (progressive by zoom), and a
 * bottom-left detail panel for selected events.
 */
import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import {
  geoNaturalEarth1, geoPath, geoGraticule10, geoCentroid,
  zoom, select,
} from 'd3';
import type { GeoPermissibleObjects } from 'd3';
import type { ScanItem, Site, Supplier } from '../../types';
import type { DisruptionEvent } from '../components/expandedcard_types';
import { getSev } from '../../utils/scan';
import { topoToGeo, COUNTRY_NAMES, CENTROID_OVERRIDES } from '../../utils/geo';
import { CHOKEPOINTS, ROUTES } from '../../data/logistics';
import { SUPPLIERS } from '../../data/suppliers';
import { RoutingOverlay } from './RoutingOverlay';
import { ExpandedCard } from '../components/ExpandedCard';
import { useV3Theme } from '../ThemeContext';

const SUPPLIER_COLOR = '#06b6d4'; // cyan/teal for supplier bubbles
const MIN_SUPPLIER_BUBBLE = 20; // only show countries with >= 20 suppliers

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const CONFLICT_ZONES = new Set([
  '804', '643', '364', '376', '275', '887', '760', '368', '422', '729', '736',
]);

// CSS for map animations
const MAP_CSS = `
@keyframes v3-map-critical-pulse {
  0%, 100% { r: 10; opacity: 0.8; }
  50% { r: 18; opacity: 0.2; }
}
@keyframes v3-map-critical-ring {
  0% { r: 12; opacity: 0.5; }
  100% { r: 24; opacity: 0; }
}
@keyframes v3-map-high-pulse {
  0%, 100% { r: 10; opacity: 0.6; }
  50% { r: 16; opacity: 0.15; }
}
@keyframes v3-panel-slide-in {
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes v3-panel-slide-out {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-100%); opacity: 0; }
}
`;

export interface MapModeProps {
  events: ScanItem[];
  sites: Site[];
  suppliers: Supplier[];
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  onCloseMap: () => void;
  filters: Record<string, unknown>;
}

/** Generate a stable ID for a scan item */
function itemId(item: ScanItem): string {
  if ('id' in item && (item as { id?: string }).id) return (item as { id: string }).id;
  const name = 'event' in item ? (item as { event: string }).event : 'risk' in item ? (item as { risk: string }).risk : '';
  const region = 'region' in item ? (item as { region: string }).region : '';
  return `${name}|${region}`;
}

export function MapMode({
  events,
  sites,
  suppliers: _suppliers,
  selectedEventId,
  onSelectEvent,
  onCloseMap,
  filters: _filters,
}: MapModeProps) {
  const { theme: V3T, mode: themeMode } = useV3Theme();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomState = useRef({ k: 1, x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [land, setLand] = useState<{
    features: Array<{ id: string; geometry: GeoPermissibleObjects; properties: Record<string, unknown> }>
  } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);
  const [hoveredSupplier, setHoveredSupplier] = useState<{ x: number; y: number; country: string; n: number; cats: string[] } | null>(null);
  const [panelClosing, setPanelClosing] = useState(false);

  // Theme-aware map tokens
  const V3 = useMemo(() => {
    const isDark = themeMode === 'dark';
    return {
      ocean: isDark ? '#0a0f1a' : '#dbeafe',
      oceanGradient: isDark ? '#0d1525' : '#bfdbfe',
      land: isDark ? '#1a2332' : '#f1f5f9',
      landStroke: isDark ? '#1e2d45' : '#cbd5e1',
      graticule: isDark ? '#0e1525' : '#e2e8f0',
      conflictFill: isDark ? '#1a1520' : '#fef2f2',
      conflictStroke: isDark ? '#2a1525' : '#fca5a5',
      conflictOverlay: isDark ? '#ef4444' : '#dc2626',
      font: "'DM Sans', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      mapLabel: isDark ? '#2a4060' : '#64748b',
      panelBg: isDark ? '#0b1525e8' : '#ffffffe8',
      panelBorder: isDark ? '#1e293b' : '#cbd5e1',
      closeBg: isDark ? '#0b1525dd' : '#ffffffdd',
      closeBorder: isDark ? '#334155' : '#cbd5e1',
      closeColor: isDark ? '#94a3b8' : '#64748b',
      closeHover: isDark ? '#e2e8f0' : '#0f172a',
      sphereStroke: isDark ? '#162040' : '#93c5fd',
      zoomText: isDark ? '#64748b' : '#94a3b8',
      hintText: isDark ? '#1e3050' : '#94a3b8',
      legendBg: isDark ? '#0b1525e0' : '#ffffffee',
      legendBorder: isDark ? '#1e293b' : '#e2e8f0',
      legendSection: isDark ? '#475569' : '#64748b',
      legendText: isDark ? '#94a3b8' : '#475569',
      legendTextDim: isDark ? '#64748b' : '#94a3b8',
      selRing: isDark ? '#ffffff' : '#0f172a',
      dotStroke: isDark ? '#000000' : '#ffffff',
      tooltipBg: isDark ? '#0b1525ee' : '#ffffffee',
      tooltipBorder: isDark ? '#1e3a5c' : '#cbd5e1',
      tooltipTitle: isDark ? '#e2e8f0' : '#0f172a',
      tooltipText: isDark ? '#94a3b8' : '#475569',
    };
  }, [themeMode]);

  const SEV_COLORS: Record<string, string> = useMemo(() => ({
    Critical: V3T.severity.critical,
    High: V3T.severity.high,
    Medium: V3T.severity.medium,
    Low: V3T.accent.green,
  }), [V3T]);

  // Inject CSS
  useEffect(() => {
    const id = 'v3-mapmode-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = MAP_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // Load world map
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then(t => setLand(topoToGeo(t, 'countries') as typeof land))
      .catch(() => {});
  }, []);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // D3 zoom
  useEffect(() => {
    if (!svgRef.current) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 20])
      .translateExtent([[0, 0], [dims.w, dims.h]])
      .wheelDelta(e => -e.deltaY * (e.deltaMode === 1 ? 0.03 : e.deltaMode ? 1 : 0.001))
      .filter(e => {
        if ((e.target as HTMLElement).closest?.('[data-click]')) return false;
        return (!e.ctrlKey || e.type === 'wheel') && !e.button;
      })
      .on('zoom', e => {
        if (gRef.current) gRef.current.setAttribute('transform', e.transform.toString());
        zoomState.current = { k: e.transform.k, x: e.transform.x, y: e.transform.y };
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => setZoomLevel(e.transform.k));
      });
    select(svgRef.current).call(z);
    return () => {
      if (svgRef.current) select(svgRef.current).on('.zoom', null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dims]);

  const proj = useMemo(() =>
    geoNaturalEarth1()
      .fitSize([dims.w - 40, dims.h - 40], { type: 'Sphere' } as GeoPermissibleObjects)
      .translate([dims.w / 2, dims.h / 2]),
    [dims]
  );
  const pathGen = useMemo(() => geoPath(proj), [proj]);
  const graticule = useMemo(() => geoGraticule10(), []);
  const pt = useCallback((la: number, ln: number) => proj([ln, la]) as [number, number] | null, [proj]);

  const inv = 1 / zoomLevel;

  // Selected event data
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find(e => itemId(e) === selectedEventId) || null;
  }, [selectedEventId, events]);

  const handleDeselectEvent = useCallback(() => {
    if (!selectedEventId) return;
    setPanelClosing(true);
    setTimeout(() => {
      onSelectEvent(null);
      setPanelClosing(false);
    }, 250);
  }, [selectedEventId, onSelectEvent]);

  // Site rendering — only mfg and key types at default zoom
  const visibleSites = useMemo(() => {
    if (zoomLevel < 2) {
      return sites.filter(s => s.type === 'mfg' || s.type === 'log');
    }
    return sites;
  }, [sites, zoomLevel]);

  // Supplier bubbles — filtered to countries with enough suppliers
  const supplierBubbles = useMemo(() => {
    return SUPPLIERS
      .filter(s => s.n >= MIN_SUPPLIER_BUBBLE && s.country !== 'Undefined/Undefined')
      .sort((a, b) => b.n - a.n);
  }, []);

  // Sqrt scale for supplier bubble radius
  const maxSupN = useMemo(() => Math.max(...supplierBubbles.map(s => s.n)), [supplierBubbles]);
  const supRadius = useCallback((n: number) => {
    const minR = 8;
    const maxR = 30;
    return minR + (maxR - minR) * Math.sqrt(n / maxSupN);
  }, [maxSupN]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: V3.ocean,
        overflow: 'hidden',
      }}
    >
      {/* Map SVG */}
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest?.('[data-click]')) {
            handleDeselectEvent();
          }
        }}
      >
        <rect width={dims.w} height={dims.h} fill={V3.ocean} />
        <defs>
          <radialGradient id="v3-map-bg">
            <stop offset="0%" stopColor={V3.oceanGradient} />
            <stop offset="100%" stopColor={V3.ocean} />
          </radialGradient>
          <filter id="v3-map-glow">
            <feGaussianBlur stdDeviation="2" result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="v3-map-glow-lg">
            <feGaussianBlur stdDeviation="4" result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g ref={gRef}>
          {/* Sphere + graticule */}
          <path d={pathGen({ type: 'Sphere' } as GeoPermissibleObjects) || ''} fill="url(#v3-map-bg)" stroke={V3.sphereStroke} strokeWidth={0.5} />
          <path d={pathGen(graticule) || ''} fill="none" stroke={V3.graticule} strokeWidth={0.3} />

          {/* Countries */}
          {land?.features?.map((f, i) => {
            const isConflict = CONFLICT_ZONES.has(String(f.id));
            return (
              <path
                key={i}
                d={pathGen(f.geometry) || ''}
                fill={isConflict ? V3.conflictFill : V3.land}
                stroke={isConflict ? V3.conflictStroke : V3.landStroke}
                strokeWidth={0.3}
              />
            );
          })}

          {/* Conflict zone overlays */}
          {land?.features?.filter(f => CONFLICT_ZONES.has(String(f.id))).map((f, i) => (
            <path
              key={'cz-' + i}
              d={pathGen(f.geometry) || ''}
              fill={V3.conflictOverlay}
              fillOpacity={0.06}
              stroke={V3.conflictOverlay}
              strokeWidth={0.4}
              strokeOpacity={0.12}
            />
          ))}

          {/* Country labels (at zoom >= 2) */}
          {zoomLevel >= 2 && land?.features?.map((f, i) => {
            const n = COUNTRY_NAMES[String(f.id)];
            if (!n) return null;
            const ov = CENTROID_OVERRIDES[String(f.id)];
            const p = ov ? proj(ov) : proj(geoCentroid(f.geometry));
            if (!p) return null;
            return (
              <text
                key={'cl-' + i}
                x={p[0]}
                y={p[1]}
                textAnchor="middle"
                fontSize={Math.max(3, 6 * inv)}
                fill={V3.mapLabel}
                fontWeight={600}
                fontFamily={V3.font}
                opacity={0.5}
                pointerEvents="none"
              >
                {n}
              </text>
            );
          })}

          {/* Routing overlay — rendered as a layer, visibility controlled by zoom */}
          <RoutingOverlay
            svgRef={svgRef}
            projection={proj}
            events={events}
            zoomLevel={zoomLevel}
            routes={ROUTES}
            chokepoints={CHOKEPOINTS}
          />

          {/* Supplier country bubbles — render behind sites and events */}
          {supplierBubbles.map((sup, i) => {
            const p = pt(sup.lat, sup.lng);
            if (!p) return null;
            // Scale radius by zoom: shrink as user zooms in
            const baseR = supRadius(sup.n);
            const zoomFactor = zoomLevel < 2 ? 1 : zoomLevel < 3 ? 0.7 : 0.4;
            const r = baseR * inv * zoomFactor;
            const fadeOpacity = zoomLevel >= 4 ? 0 : zoomLevel >= 3 ? 0.06 : 0.15;
            if (fadeOpacity === 0) return null;
            const showLabel = sup.n >= 50 && zoomLevel >= 2;
            const topCats = zoomLevel >= 3 ? sup.cats.slice(0, 5) : sup.cats.slice(0, 3);

            return (
              <g
                key={'sup-' + i}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setHoveredSupplier({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    country: sup.country,
                    n: sup.n,
                    cats: topCats,
                  });
                }}
                onMouseMove={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setHoveredSupplier(prev => prev ? {
                    ...prev,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  } : null);
                }}
                onMouseLeave={() => setHoveredSupplier(null)}
              >
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r={r}
                  fill={SUPPLIER_COLOR}
                  fillOpacity={fadeOpacity}
                  stroke={SUPPLIER_COLOR}
                  strokeWidth={Math.max(0.3, 1 * inv)}
                  strokeOpacity={fadeOpacity * 2}
                />
                {showLabel && (
                  <text
                    x={p[0]}
                    y={p[1] + Math.max(1.5, 3.5 * inv)}
                    textAnchor="middle"
                    fontSize={Math.max(3, 8 * inv)}
                    fontWeight={600}
                    fontFamily={V3.fontMono}
                    fill={SUPPLIER_COLOR}
                    opacity={0.6}
                    pointerEvents="none"
                  >
                    {sup.n}
                  </text>
                )}
              </g>
            );
          })}

          {/* Site markers */}
          {visibleSites.map((s, i) => {
            const p = pt(s.lat, s.lng);
            if (!p) return null;
            const isMfg = s.type === 'mfg';
            const r = isMfg ? Math.max(2, 4 * inv) : Math.max(1.5, 3 * inv);
            const color = isMfg ? '#3b82f6' : s.type === 'log' ? '#f59e0b' : '#4a5568';
            const opacity = isMfg ? 0.7 : 0.35;

            return (
              <g key={'s-' + i}>
                {isMfg ? (
                  // Triangle for manufacturing
                  <polygon
                    points={`${p[0]},${p[1] - r * 1.2} ${p[0] + r},${p[1] + r * 0.6} ${p[0] - r},${p[1] + r * 0.6}`}
                    fill={color}
                    stroke={color}
                    strokeWidth={Math.max(0.2, 0.4 * inv)}
                    opacity={opacity}
                  />
                ) : (
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={r}
                    fill={color}
                    opacity={opacity}
                  />
                )}
              </g>
            );
          })}

          {/* Event markers — large dots with severity coloring */}
          {events.map((evt, i) => {
            const lat = 'lat' in evt ? (evt as { lat: number }).lat : undefined;
            const lng = 'lng' in evt ? (evt as { lng: number }).lng : undefined;
            if (!lat || !lng) return null;
            const p = pt(lat, lng);
            if (!p) return null;

            const sev = getSev(evt);
            const color = SEV_COLORS[sev] || SEV_COLORS.Medium;
            const eid = itemId(evt);
            const isSelected = selectedEventId === eid;
            const isHovered = hoveredEvent === i;
            const isCritical = sev === 'Critical';
            const isHigh = sev === 'High';
            const baseR = Math.max(3, 8 * inv);

            return (
              <g
                key={'evt-' + i}
                data-click="1"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelected) {
                    handleDeselectEvent();
                  } else {
                    setPanelClosing(false);
                    onSelectEvent(eid);
                  }
                }}
                onMouseEnter={() => setHoveredEvent(i)}
                onMouseLeave={() => setHoveredEvent(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer pulse rings */}
                {isCritical && (
                  <>
                    <circle
                      cx={p[0]} cy={p[1]}
                      fill="none" stroke={color}
                      strokeWidth={Math.max(0.5, 1.5 * inv)}
                      opacity={0.4}
                      style={{ animation: 'v3-map-critical-pulse 1.5s ease-in-out infinite' }}
                    />
                    <circle
                      cx={p[0]} cy={p[1]}
                      fill="none" stroke={color}
                      strokeWidth={Math.max(0.3, 0.8 * inv)}
                      opacity={0.2}
                      style={{ animation: 'v3-map-critical-ring 2s ease-in-out infinite' }}
                    />
                  </>
                )}
                {isHigh && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    fill="none" stroke={color}
                    strokeWidth={Math.max(0.4, 1 * inv)}
                    opacity={0.3}
                    style={{ animation: 'v3-map-high-pulse 2.5s ease-in-out infinite' }}
                  />
                )}

                {/* Hover glow */}
                {(isHovered || isSelected) && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    r={baseR * 2}
                    fill={color}
                    opacity={0.12}
                    filter="url(#v3-map-glow-lg)"
                  />
                )}

                {/* Main dot */}
                <circle
                  cx={p[0]} cy={p[1]}
                  r={isSelected ? baseR * 1.3 : baseR}
                  fill={color}
                  stroke={isSelected ? V3.selRing : V3.dotStroke}
                  strokeWidth={isSelected ? Math.max(1, 2 * inv) : Math.max(0.5, inv)}
                  filter="url(#v3-map-glow)"
                />

                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    r={baseR * 2}
                    fill="none"
                    stroke={V3.selRing}
                    strokeWidth={Math.max(0.4, 0.8 * inv)}
                    strokeDasharray={`${Math.max(1.5, 3 * inv)},${Math.max(1, 2 * inv)}`}
                    opacity={0.5}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Zoom hint */}
        <text
          x={dims.w - 14}
          y={dims.h - 10}
          textAnchor="end"
          fontSize={9}
          fill={V3.hintText}
          fontFamily={V3.font}
        >
          Scroll to zoom {'\u00b7'} Drag to pan
        </text>
      </svg>

      {/* Close button */}
      <button
        onClick={onCloseMap}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: V3.closeBg,
          border: `1px solid ${V3.closeBorder}`,
          color: V3.closeColor,
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          backdropFilter: 'blur(8px)',
          transition: 'color 0.15s, border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.color = V3.closeHover;
          (e.target as HTMLElement).style.borderColor = themeMode === 'dark' ? '#64748b' : '#94a3b8';
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.color = V3.closeColor;
          (e.target as HTMLElement).style.borderColor = V3.closeBorder;
        }}
        title="Close map"
      >
        {'\u2715'}
      </button>

      {/* Zoom level indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: V3.closeBg,
          border: `1px solid ${V3.panelBorder}`,
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: V3.fontMono,
          color: V3.zoomText,
          backdropFilter: 'blur(8px)',
          zIndex: 110,
        }}
      >
        {zoomLevel.toFixed(1)}x
      </div>

      {/* Supplier hover tooltip */}
      {hoveredSupplier && (
        <div
          style={{
            position: 'absolute',
            left: hoveredSupplier.x + 16,
            top: hoveredSupplier.y - 20,
            background: V3.tooltipBg,
            border: `1px solid ${V3.tooltipBorder}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontFamily: V3.font,
            boxShadow: themeMode === 'dark' ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 120,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            maxWidth: 260,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: V3.tooltipTitle }}>
            {hoveredSupplier.country}
          </div>
          <div style={{ fontSize: 11, color: SUPPLIER_COLOR, fontWeight: 600, marginTop: 2 }}>
            {hoveredSupplier.n.toLocaleString()} suppliers
          </div>
          {hoveredSupplier.cats.length > 0 && (
            <div style={{ fontSize: 10, color: V3.tooltipText, marginTop: 4 }}>
              {hoveredSupplier.cats.join(' \u00b7 ')}
            </div>
          )}
        </div>
      )}

      {/* Bottom-left detail panel — slides in when event selected */}
      {selectedEvent && (
        <div
          data-click="1"
          style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            maxWidth: 400,
            maxHeight: '50vh',
            background: V3.panelBg,
            border: `1px solid ${V3.panelBorder}`,
            borderRadius: 12,
            boxShadow: themeMode === 'dark' ? '0 12px 48px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(16px)',
            overflow: 'auto',
            zIndex: 110,
            animation: panelClosing
              ? 'v3-panel-slide-out 250ms ease-in forwards'
              : 'v3-panel-slide-in 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <ExpandedCard
            event={selectedEvent as unknown as DisruptionEvent}
            placement="map"
            onClose={handleDeselectEvent}
          />
        </div>
      )}

      {/* Comprehensive map legend */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: V3.legendBg,
          border: `1px solid ${V3.legendBorder}`,
          borderRadius: 8,
          padding: '10px 14px',
          backdropFilter: 'blur(10px)',
          zIndex: 110,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          minWidth: 140,
        }}
      >
        {/* Section: Event Severity */}
        <div style={{ fontSize: 9, fontWeight: 600, color: V3.legendSection, fontFamily: V3.font, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>
          Events
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative', width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Critical }} />
            <div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${SEV_COLORS.Critical}`, opacity: 0.4, animation: 'v3-map-critical-pulse 1.5s ease-in-out infinite' }} />
          </div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Critical</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.High }} /></div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>High</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Medium }} /></div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Medium</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Low }} /></div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Low</span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: V3.legendBorder, margin: '3px 0' }} />

        {/* Section: Site Types */}
        <div style={{ fontSize: 9, fontWeight: 600, color: V3.legendSection, fontFamily: V3.font, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>
          Sites
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <polygon points="6,1.5 10.5,9.5 1.5,9.5" fill="#3b82f6" opacity={0.7} />
          </svg>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Manufacturing</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />
          </div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Logistics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4a5568', opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 10, color: V3.legendTextDim, fontFamily: V3.font }}>Sales / Admin</span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: V3.legendBorder, margin: '3px 0' }} />

        {/* Section: Network */}
        <div style={{ fontSize: 9, fontWeight: 600, color: V3.legendSection, fontFamily: V3.font, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>
          Network
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <line x1={0} y1={6} x2={12} y2={6} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="3,2" opacity={0.5} />
          </svg>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Sea Route</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <line x1={0} y1={6} x2={12} y2={6} stroke="#c084fc" strokeWidth={0.8} strokeDasharray="1.5,1.5" opacity={0.5} />
          </svg>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Air Route</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: SUPPLIER_COLOR, opacity: 0.18, border: `1px solid ${SUPPLIER_COLOR}` }} />
          </div>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Supplier Cluster</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <polygon points="6,1 10,6 6,11 2,6" fill={themeMode === 'dark' ? '#1e2d44' : '#e2e8f0'} stroke={themeMode === 'dark' ? '#3a506c' : '#94a3b8'} strokeWidth={0.8} opacity={0.9} />
          </svg>
          <span style={{ fontSize: 10, color: V3.legendText, fontFamily: V3.font }}>Chokepoint</span>
        </div>
      </div>
    </div>
  );
}

export default MapMode;
