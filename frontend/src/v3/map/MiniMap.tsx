/**
 * MiniMap — Sidebar mini-map component for V3.
 *
 * Compact D3 natural earth projection showing event dots (severity-coded)
 * and SKF site dots. Supports bidirectional hover highlighting and
 * click-to-expand into full map mode.
 */
import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3';
import type { GeoPermissibleObjects } from 'd3';
import type { ScanItem, Site } from '../../types';
import { getSev } from '../../utils/scan';
import { topoToGeo } from '../../utils/geo';
import { useV3Theme } from '../ThemeContext';

// CSS for pulse animation
const PULSE_CSS = `
@keyframes v3-mini-pulse {
  0% { r: 6; opacity: 0.8; }
  50% { r: 12; opacity: 0.2; }
  100% { r: 6; opacity: 0.8; }
}
@keyframes v3-mini-critical-ring {
  0% { r: 8; opacity: 0.6; stroke-width: 1.5; }
  100% { r: 16; opacity: 0; stroke-width: 0.5; }
}
`;

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export interface MiniMapProps {
  events: ScanItem[];
  sites: Site[];
  hoveredEventId: string | null;
  selectedEventId: string | null;
  onHoverEvent: (id: string | null) => void;
  onSelectEvent: (id: string) => void;
  onExpandMap: () => void;
}

/** Generate a stable ID for a scan item */
function itemId(item: ScanItem): string {
  if ('id' in item && (item as { id?: string }).id) return (item as { id: string }).id;
  const name = 'event' in item ? (item as { event: string }).event : 'risk' in item ? (item as { risk: string }).risk : '';
  const region = 'region' in item ? (item as { region: string }).region : '';
  return `${name}|${region}`;
}

export function MiniMap({
  events,
  sites,
  hoveredEventId,
  selectedEventId,
  onHoverEvent,
  onSelectEvent,
  onExpandMap,
}: MiniMapProps) {
  const { theme: V3, mode: themeMode } = useV3Theme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 380, h: 220 });
  const [land, setLand] = useState<{ features: Array<{ id: string; geometry: GeoPermissibleObjects }> } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Theme-aware map tokens
  const V3_MAP = useMemo(() => {
    const isDark = themeMode === 'dark';
    return {
      ocean: isDark ? '#0a0f1a' : '#dbeafe',
      land: isDark ? '#1a2332' : '#f1f5f9',
      landStroke: isDark ? '#1e2d45' : '#cbd5e1',
      graticule: isDark ? '#0e1525' : '#e2e8f0',
      siteDot: isDark ? '#4a5568' : '#94a3b8',
      expandIcon: isDark ? '#4a6080' : '#94a3b8',
      tooltipBg: isDark ? '#0b1525ee' : '#ffffffee',
      tooltipText: isDark ? '#94a3b8' : '#475569',
      borderColor: isDark ? '#1e293b' : '#cbd5e1',
      sphereStroke: isDark ? '#162040' : '#93c5fd',
    };
  }, [themeMode]);

  const SEV_COLORS: Record<string, string> = useMemo(() => ({
    Critical: V3.severity.critical,
    High: V3.severity.high,
    Medium: V3.accent.blue,
    Low: V3.accent.green,
  }), [V3]);

  // Inject pulse CSS
  useEffect(() => {
    const id = 'v3-minimap-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = PULSE_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // Load world map data
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

  const proj = useMemo(() =>
    geoNaturalEarth1()
      .fitSize([dims.w - 16, dims.h - 16], { type: 'Sphere' } as GeoPermissibleObjects)
      .translate([dims.w / 2, dims.h / 2]),
    [dims]
  );

  const pathGen = useMemo(() => geoPath(proj), [proj]);
  const graticule = useMemo(() => geoGraticule10(), []);

  const pt = useCallback(
    (lat: number, lng: number) => proj([lng, lat]) as [number, number] | null,
    [proj]
  );

  // Event markers with projected positions
  const eventMarkers = useMemo(() => {
    return events
      .filter(e => {
        const lat = 'lat' in e ? (e as { lat: number }).lat : undefined;
        const lng = 'lng' in e ? (e as { lng: number }).lng : undefined;
        return lat && lng;
      })
      .map(e => {
        const lat = (e as { lat: number }).lat;
        const lng = (e as { lng: number }).lng;
        const p = pt(lat, lng);
        const sev = getSev(e);
        const id = itemId(e);
        return { e, p, sev, id, lat, lng };
      })
      .filter(m => m.p !== null);
  }, [events, pt]);

  // Site dots (muted, small)
  const siteMarkers = useMemo(() => {
    return sites
      .filter(s => s.type === 'mfg' || s.type === 'log')
      .map(s => {
        const p = pt(s.lat, s.lng);
        return { s, p };
      })
      .filter(m => m.p !== null);
  }, [sites, pt]);

  return (
    <div
      ref={containerRef}
      onClick={onExpandMap}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => { setShowTooltip(false); onHoverEvent(null); }}
      style={{
        position: 'relative',
        width: '100%',
        height: 220,
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        background: V3_MAP.ocean,
        border: `1px solid ${V3_MAP.borderColor}`,
        transition: 'border-color 0.2s ease',
      }}
      title="Click to expand map"
    >
      <svg
        width={dims.w}
        height={dims.h}
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect width={dims.w} height={dims.h} fill={V3_MAP.ocean} />

        {/* Defs */}
        <defs>
          <filter id="v3-mini-glow">
            <feGaussianBlur stdDeviation="2" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="v3-mini-glow-strong">
            <feGaussianBlur stdDeviation="3.5" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sphere outline */}
        <path
          d={pathGen({ type: 'Sphere' } as GeoPermissibleObjects) || ''}
          fill={V3_MAP.ocean}
          stroke={V3_MAP.sphereStroke}
          strokeWidth={0.5}
        />

        {/* Graticule */}
        <path
          d={pathGen(graticule) || ''}
          fill="none"
          stroke={V3_MAP.graticule}
          strokeWidth={0.3}
        />

        {/* Countries */}
        {land?.features?.map((f, i) => (
          <path
            key={i}
            d={pathGen(f.geometry) || ''}
            fill={V3_MAP.land}
            stroke={V3_MAP.landStroke}
            strokeWidth={0.3}
          />
        ))}

        {/* Site dots — tiny, muted */}
        {siteMarkers.map((m, i) => (
          <circle
            key={'site-' + i}
            cx={m.p![0]}
            cy={m.p![1]}
            r={2}
            fill={V3_MAP.siteDot}
            opacity={0.3}
          />
        ))}

        {/* Event markers */}
        {eventMarkers.map((m, i) => {
          const color = SEV_COLORS[m.sev] || SEV_COLORS.Medium;
          const isHovered = hoveredEventId === m.id;
          const isSelected = selectedEventId === m.id;
          const isCritical = m.sev === 'Critical';
          const baseR = 5;
          const r = isHovered || isSelected ? baseR * 1.8 : baseR;

          return (
            <g
              key={'evt-' + i}
              onMouseEnter={(e) => { e.stopPropagation(); onHoverEvent(m.id); }}
              onMouseLeave={(e) => { e.stopPropagation(); onHoverEvent(null); }}
              onClick={(e) => { e.stopPropagation(); onSelectEvent(m.id); }}
              style={{ cursor: 'pointer' }}
            >
              {/* Pulse ring for Critical */}
              {isCritical && (
                <circle
                  cx={m.p![0]}
                  cy={m.p![1]}
                  r={baseR}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={0.6}
                  style={{ animation: 'v3-mini-critical-ring 1.8s ease-in-out infinite' }}
                />
              )}

              {/* Hover/selected glow */}
              {(isHovered || isSelected) && (
                <circle
                  cx={m.p![0]}
                  cy={m.p![1]}
                  r={r + 4}
                  fill={color}
                  opacity={0.15}
                  filter="url(#v3-mini-glow-strong)"
                />
              )}

              {/* Main dot */}
              <circle
                cx={m.p![0]}
                cy={m.p![1]}
                r={r}
                fill={color}
                opacity={isHovered || isSelected ? 1 : 0.85}
                filter={isHovered || isSelected ? 'url(#v3-mini-glow)' : undefined}
                style={{ transition: 'r 0.15s ease, opacity 0.15s ease' }}
              />

              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={m.p![0]}
                  cy={m.p![1]}
                  r={r + 2}
                  fill="none"
                  stroke={themeMode === 'dark' ? '#ffffff' : '#0f172a'}
                  strokeWidth={1}
                  opacity={0.6}
                  strokeDasharray="3,2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Expand icon */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 22,
          height: 22,
          borderRadius: 4,
          background: themeMode === 'dark' ? 'rgba(10, 15, 26, 0.7)' : 'rgba(255, 255, 255, 0.8)',
          border: `1px solid ${V3_MAP.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: V3_MAP.expandIcon,
          fontSize: 12,
          fontWeight: 600,
          transition: 'color 0.15s, border-color 0.15s',
          pointerEvents: 'none',
        }}
      >
        {'\u2197'}
      </div>

      {/* "Click to expand" tooltip */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: V3_MAP.tooltipBg,
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 10,
            color: V3_MAP.tooltipText,
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Click to expand map
        </div>
      )}
    </div>
  );
}

export default MiniMap;
