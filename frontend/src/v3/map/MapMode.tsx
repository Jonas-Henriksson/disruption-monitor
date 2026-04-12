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
import { RoutingOverlay } from './RoutingOverlay';
import { ExpandedCard } from '../components/ExpandedCard';

// V3 tokens
const V3 = {
  ocean: '#0a0f1a',
  oceanGradient: '#0d1525',
  land: '#1a2332',
  landStroke: '#1e2d45',
  graticule: '#0e1525',
  conflictFill: '#1a1520',
  conflictStroke: '#2a1525',
  conflictOverlay: '#ef4444',
  font: "'DM Sans', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  mapLabel: '#2a4060',
  panelBg: '#0b1525e8',
  panelBorder: '#1e293b',
  closeBg: '#0b1525dd',
  closeBorder: '#334155',
  closeColor: '#94a3b8',
  closeHover: '#e2e8f0',
} as const;

const SEV_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

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
  const [panelClosing, setPanelClosing] = useState(false);

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

  // Route arcs computed by RoutingOverlay directly

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
          <path d={pathGen({ type: 'Sphere' } as GeoPermissibleObjects) || ''} fill="url(#v3-map-bg)" stroke="#162040" strokeWidth={0.5} />
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
                  stroke={isSelected ? '#ffffff' : '#000000'}
                  strokeWidth={isSelected ? Math.max(1, 2 * inv) : Math.max(0.5, inv)}
                  filter="url(#v3-map-glow)"
                />

                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    r={baseR * 2}
                    fill="none"
                    stroke="#ffffff"
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
          fill="#1e3050"
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
          (e.target as HTMLElement).style.borderColor = '#64748b';
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
          color: '#64748b',
          backdropFilter: 'blur(8px)',
          zIndex: 110,
        }}
      >
        {zoomLevel.toFixed(1)}x
      </div>

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
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
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

      {/* Progressive disclosure legend */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: V3.closeBg,
          border: `1px solid ${V3.panelBorder}`,
          borderRadius: 8,
          padding: '8px 12px',
          backdropFilter: 'blur(8px)',
          zIndex: 110,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Critical }} />
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: V3.font }}>Critical</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.High }} />
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: V3.font }}>High</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Medium }} />
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: V3.font }}>Medium</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS.Low }} />
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: V3.font }}>Low</span>
        </div>
        {zoomLevel >= 2 && (
          <>
            <div style={{ height: 1, background: '#1e293b', margin: '2px 0' }} />
            <div style={{ fontSize: 9, color: '#4a6080', fontFamily: V3.font }}>Routes visible</div>
          </>
        )}
        {zoomLevel >= 3 && (
          <div style={{ fontSize: 9, color: '#4a6080', fontFamily: V3.font }}>Dependencies visible</div>
        )}
      </div>
    </div>
  );
}

export default MapMode;
