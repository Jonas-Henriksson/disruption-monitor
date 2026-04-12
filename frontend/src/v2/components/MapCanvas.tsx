/**
 * MapCanvas — v2 theme-aware D3 interactive world map
 *
 * Renders all 15 map layers (countries, routes, sites, disruptions, suppliers,
 * supply chain arcs, tooltips, popups, legend) with light/dark theme support.
 *
 * Reuses the exact same D3 rendering logic as v1 App.tsx but sources colors
 * from the v2 theme context.
 */

import { useEffect, useMemo, useCallback } from 'react';
import {
  zoom, select, geoNaturalEarth1, geoPath, geoGraticule10,
  line, curveCardinal, curveBasis, geoInterpolate, geoCentroid,
  easeCubicOut, zoomIdentity,
} from 'd3';
import type { GeoPermissibleObjects } from 'd3';
import { useTheme } from '../theme';
import { SiteShape } from '../../components/Map/SiteShape';
import { SiteTooltip } from '../../components/Map/SiteTooltip';
import { DisruptionTooltip } from '../../components/Map/DisruptionTooltip';
import { SupplierTooltip } from '../../components/Map/SupplierTooltip';
import { SitePopup } from '../../components/Map/SitePopup';
import { RoutePopup } from '../../components/Map/RoutePopup';
import { SupplierPopup } from '../../components/Map/SupplierPopup';
import {
  SITES, TYPE_CFG, BU_CFG, SEV, FRIC, CONFLICT_ZONES,
  CHOKEPOINTS, PORTS, AIRPORTS, ROUTES,
  SUPPLIERS, maxSup, SUPPLY_GRAPH,
} from '../../data';
import { COUNTRY_NAMES, CENTROID_OVERRIDES } from '../../utils/geo';
import { getSev } from '../../utils/scan';
import { eventId } from '../../utils/format';
import type { FrictionLevel } from '../../types';
import type { useMapState } from '../../hooks/useMapState';
import type { useDisruptionState } from '../../hooks/useDisruptionState';
import type { useFilterState } from '../../hooks/useFilterState';

// ── CSS keyframe injection ──────────────────────────────────────────

const MAP_CSS_ID = 'sc-v2-map-css';
const MAP_CSS = `
@keyframes spc { 0% { r: 6; opacity: .6 } 100% { r: 22; opacity: 0 } }
@keyframes sph { 0% { r: 5; opacity: .4 } 100% { r: 18; opacity: 0 } }
@keyframes spm { 0% { r: 4; opacity: .3 } 100% { r: 14; opacity: 0 } }
@keyframes spl { 0% { r: 3; opacity: .2 } 100% { r: 10; opacity: 0 } }
@keyframes sc-arc-draw { from { stroke-dashoffset: 1000 } to { stroke-dashoffset: 0 } }
@keyframes sc-scan-slide { from { transform: translateX(-100%) } to { transform: translateX(200%) } }
`;

// ── Props ───────────────────────────────────────────────────────────

interface MapCanvasProps {
  map: ReturnType<typeof useMapState>;
  dis: ReturnType<typeof useDisruptionState>;
  fil: ReturnType<typeof useFilterState>;
  vis: typeof SITES;
  impact: { factories: string[]; routes: number[]; suppliers: string[] } | null;
  corridorFriction: Record<string, string>;
  exposureScores: Record<string, { level: string }>;
  recAffectedSites: Record<string, { distance_km: number; maxSeverity: string }>;
  spendByCountry: Record<string, { spend_pct: number }> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  land: any;
  onSiteClick: (idx: number | null) => void;
  onDisruptionClick: (idx: number | null) => void;
  rightOpen: boolean;
  setRightOpen: (v: boolean) => void;
}

// ── Fonts ───────────────────────────────────────────────────────────

const F = 'Inter, DM Sans, system-ui, sans-serif';
const FM = 'JetBrains Mono, monospace';

// ── Component ───────────────────────────────────────────────────────

export function MapCanvas({
  map, dis, fil, vis, impact, corridorFriction,
  exposureScores, recAffectedSites, spendByCountry,
  land, onSiteClick, onDisruptionClick, rightOpen, setRightOpen,
}: MapCanvasProps) {
  const { theme } = useTheme();
  const isDark = theme.name === 'dark';

  // ── Inject keyframe CSS once ──────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById(MAP_CSS_ID)) {
      const s = document.createElement('style');
      s.id = MAP_CSS_ID;
      s.textContent = MAP_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // ── Theme-derived map colors ──────────────────────────────────────

  const C = useMemo(() => ({
    // Background gradient
    bgOuter: isDark ? '#060a12' : '#e8eef6',
    bgGradCenter: isDark ? '#0c1322' : '#dce4f0',
    bgGradEdge: isDark ? '#060a12' : '#e8eef6',
    // Sphere stroke
    sphereStroke: isDark ? '#162040' : '#b8c7d8',
    // Graticule
    graticule: isDark ? '#0a1220' : '#c8d4e2',
    // Countries
    countryFill: isDark ? '#111c2a' : '#d1dbe8',
    countryStroke: isDark ? '#1a2d45' : '#b8c7d8',
    // Conflict zones
    conflictFill: isDark ? '#1a1520' : '#f5e0e0',
    conflictStroke: isDark ? '#2a1525' : '#e0a0a0',
    conflictOverlay: isDark ? '#ef4444' : '#dc2626',
    conflictOverlayOpacity: isDark ? 0.08 : 0.10,
    conflictOverlayStrokeOpacity: isDark ? 0.15 : 0.20,
    // Country labels
    countryLabel: isDark ? '#2a4060' : '#7b8fa8',
    countryLabelOpacity: isDark ? 0.45 : 0.55,
    // Ports
    portDot: isDark ? '#1a5f8a' : '#0284c7',
    portStroke: isDark ? '#38bdf8' : '#0ea5e9',
    portLabel: isDark ? '#2a6090' : '#0369a1',
    // Airports
    airportFill: isDark ? '#c084fc' : '#a855f7',
    airportLabel: isDark ? '#7c3aed' : '#6d28d9',
    // Chokepoints
    chokeFill: isDark ? '#1e2d44' : '#c8d4e2',
    chokeStroke: isDark ? '#3a506c' : '#94a3b8',
    chokeLabel: isDark ? '#2a4060' : '#64748b',
    // Clusters
    clusterOuter: isDark ? '#14243e' : '#cbd5e1',
    clusterInner: isDark ? '#1e3a5c' : '#e2e8f0',
    clusterStroke: '#3b82f6',
    clusterText: isDark ? '#60a5fa' : '#2563eb',
    // Legend
    legendBg: isDark ? '#080e1cdd' : '#ffffffdd',
    legendStroke: isDark ? '#14243e' : '#e2e8f0',
    legendText: isDark ? '#4a6080' : '#64748b',
    // Hint text
    hintText: isDark ? '#14243e' : '#94a3b8',
    // Impact line labels
    impactLabel: isDark ? '#2a3d5c' : '#64748b',
    // Supplier base colors (semantic — same across themes)
    supLow: '#6b7fa0',
    supMid: '#a78bfa',
    supHigh: '#f59e0b',
    supImpact: '#ef4444',
  }), [isDark]);

  // ── Resize observer ───────────────────────────────────────────────
  useEffect(() => {
    const container = map.cR.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      map.setDm({ w, h });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── D3 zoom ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.svgRef.current) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 20])
      .translateExtent([[0, 0], [map.dm.w, map.dm.h]])
      .wheelDelta(e => -e.deltaY * (e.deltaMode === 1 ? 0.03 : e.deltaMode ? 1 : 0.001))
      .filter(e => {
        if ((e.target as HTMLElement).closest?.('[data-click]')) return false;
        return (!e.ctrlKey || e.type === 'wheel') && !e.button;
      })
      .on('zoom', e => {
        if (map.gR.current) map.gR.current.setAttribute('transform', e.transform.toString());
        map.zR.current = { k: e.transform.k, x: e.transform.x, y: e.transform.y };
        map.clearHovers();
        if (map.raf.current) cancelAnimationFrame(map.raf.current);
        map.raf.current = requestAnimationFrame(() => map.setZK(e.transform.k));
      });
    select(map.svgRef.current).call(z);
    return () => {
      select(map.svgRef.current!).on('.zoom', null);
      if (map.raf.current) cancelAnimationFrame(map.raf.current);
    };
  }, [map.dm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Projection ────────────────────────────────────────────────────
  const proj = useMemo(() =>
    geoNaturalEarth1()
      .fitSize([map.dm.w - 40, map.dm.h - 40], { type: 'Sphere' } as GeoPermissibleObjects)
      .translate([map.dm.w / 2, map.dm.h / 2]),
    [map.dm],
  );
  const pg = useMemo(() => geoPath(proj), [proj]);
  const gr = useMemo(() => geoGraticule10(), []);
  const pt = useCallback(
    (la: number, ln: number) => proj([ln, la]) as [number, number] | null,
    [proj],
  );

  // ── Route arcs ────────────────────────────────────────────────────
  const arcs = useMemo(() => ROUTES.map(r => {
    if ('pts' in r) {
      const projected = r.pts.map(([la, ln]) => proj([ln, la])).filter(Boolean) as [number, number][];
      return line().curve(curveCardinal.tension(0.7))(projected);
    }
    const i = geoInterpolate([r.f[1], r.f[0]], [r.t[1], r.t[0]]);
    return line().curve(curveBasis)(Array.from({ length: 25 }, (_, j) => proj(i(j / 24)) as [number, number]));
  }), [proj]);

  // ── Site clustering at low zoom ───────────────────────────────────
  const clusters = useMemo(() => {
    if (map.zK >= 3) return null;
    const cellSize = 40;
    const cells: Record<string, { sites: typeof vis[number][]; cx: number; cy: number; count: number }> = {};
    const standalone: typeof vis[number][] = [];
    vis.forEach(s => {
      if (s.type === 'mfg' || s.bu === 'sis-aero') {
        standalone.push(s);
        return;
      }
      const p = pt(s.lat, s.lng);
      if (!p) return;
      const gx = Math.floor(p[0] / cellSize);
      const gy = Math.floor(p[1] / cellSize);
      const key = `${gx}_${gy}`;
      if (!cells[key]) cells[key] = { sites: [], cx: 0, cy: 0, count: 0 };
      cells[key].sites.push(s);
      cells[key].cx += p[0];
      cells[key].cy += p[1];
      cells[key].count++;
    });
    Object.values(cells).forEach(c => { c.cx /= c.count; c.cy /= c.count; });
    const clusterList = Object.values(cells).filter(c => c.count > 1);
    const singletons = Object.values(cells).filter(c => c.count === 1).map(c => c.sites[0]);
    return { clusters: clusterList, standalone: [...standalone, ...singletons] };
  }, [vis, map.zK, pt]);

  // ── Derived values ────────────────────────────────────────────────
  const inv = 1 / map.zK;
  const sr = Math.max(1, 3 * inv);
  const mr = Math.max(1.5, 4.5 * inv);
  const cs = Math.max(2, 5 * inv);

  // ── Click background to deselect ──────────────────────────────────
  const handleBgClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest?.('[data-click]')) {
      map.setSelSite(null);
      map.setSelRt(null);
      map.setSelSupC(null);
      dis.setScView(null);
    }
  }, [map, dis]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      ref={map.cR}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        minWidth: 0,
      }}
      onClick={handleBgClick}
    >
      <svg
        ref={map.svgRef}
        width={map.dm.w}
        height={map.dm.h}
        style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
      >
        {/* Base fill */}
        <rect width={map.dm.w} height={map.dm.h} fill={C.bgOuter} />

        {/* Defs: gradients + filters */}
        <defs>
          <radialGradient id="v2-bg">
            <stop offset="0%" stopColor={C.bgGradCenter} />
            <stop offset="100%" stopColor={C.bgGradEdge} />
          </radialGradient>
          <filter id="v2-gl">
            <feGaussianBlur stdDeviation="1.5" result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="v2-g2">
            <feGaussianBlur stdDeviation="3" result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Transform group — D3 zoom target */}
        <g ref={map.gR}>
          {/* Layer 1: Sphere background with gradient */}
          <path
            d={pg({ type: 'Sphere' } as GeoPermissibleObjects) || ''}
            fill="url(#v2-bg)"
            stroke={C.sphereStroke}
            strokeWidth={0.5}
          />

          {/* Layer 2: Graticule grid */}
          <path d={pg(gr) || ''} fill="none" stroke={C.graticule} strokeWidth={0.3} />

          {/* Layer 3: Country polygons */}
          {land?.features?.map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => {
            const isConflict = CONFLICT_ZONES.has(String(f.id));
            return (
              <path
                key={i}
                d={pg(f.geometry) || ''}
                fill={isConflict ? C.conflictFill : C.countryFill}
                stroke={isConflict ? C.conflictStroke : C.countryStroke}
                strokeWidth={0.3}
              />
            );
          })}

          {/* Conflict zone overlay */}
          {land?.features
            ?.filter((f: { id: string }) => CONFLICT_ZONES.has(String(f.id)))
            .map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => (
              <path
                key={'cz' + i}
                d={pg(f.geometry) || ''}
                fill={C.conflictOverlay}
                fillOpacity={C.conflictOverlayOpacity}
                stroke={C.conflictOverlay}
                strokeWidth={0.4}
                strokeOpacity={C.conflictOverlayStrokeOpacity}
              />
            ))}

          {/* Layer 4: Country labels */}
          {land?.features?.map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => {
            const n = COUNTRY_NAMES[String(f.id)];
            if (!n) return null;
            const ov = CENTROID_OVERRIDES[String(f.id)];
            const p = ov ? proj(ov) : proj(geoCentroid(f.geometry));
            if (!p) return null;
            return (
              <text
                key={'cl' + i}
                x={p[0]}
                y={p[1]}
                textAnchor="middle"
                fontSize={Math.max(2, 5 * inv)}
                fill={C.countryLabel}
                fontWeight={600}
                fontFamily="DM Sans,sans-serif"
                opacity={C.countryLabelOpacity}
                pointerEvents="none"
              >
                {n}
              </text>
            );
          })}

          {/* Layer 5: Shipping routes (sea/air, animated dashes, friction coloring) */}
          {fil.sR && arcs.map((d, i) => {
            const rt = ROUTES[i];
            const fLvl = corridorFriction[rt.corridor] as FrictionLevel | undefined;
            const isSea = rt.type === 'sea';
            const isImpacted = impact && impact.routes.includes(i);
            const fCol = fLvl ? FRIC[fLvl] : isSea ? theme.accent.cyan : theme.accent.purple;
            const fOp = isImpacted ? 0.7 : (fLvl ? 0.5 : isSea ? 0.25 : 0.35);
            const fW = isImpacted
              ? Math.max(1, 2.5 * inv)
              : (fLvl ? Math.max(0.6, 1.5 * inv) : isSea ? Math.max(0.4, 1 * inv) : Math.max(0.3, 0.6 * inv));
            const dash = isSea
              ? `${Math.max(2, 4 * inv)},${Math.max(1.5, 3 * inv)}`
              : `${Math.max(0.5, 1 * inv)},${Math.max(0.5, 1 * inv)}`;
            return (
              <g key={'r' + i}>
                {/* Hit area */}
                <path
                  d={d || ''}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(6, 12 * inv)}
                  data-click="1"
                  onClick={(e) => {
                    const rect = map.cR.current!.getBoundingClientRect();
                    map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    map.setSelRt(map.selRt === i ? null : i);
                    map.setSelSite(null);
                    map.setSelSupC(null);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                {/* Visible route */}
                <path
                  d={d || ''}
                  fill="none"
                  stroke={fCol}
                  strokeWidth={fW}
                  strokeOpacity={fOp}
                  strokeDasharray={dash}
                  pointerEvents="none"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    values={`${Math.max(7, 14 * inv)};0`}
                    dur={isSea ? '4s' : '2.5s'}
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            );
          })}

          {/* Layer 6: Ports */}
          {fil.sR && PORTS.map((p, i) => {
            const pp = pt(p.la, p.ln);
            return pp && (
              <g key={'pt' + i}>
                <circle
                  cx={pp[0]} cy={pp[1]}
                  r={Math.max(1, 2 * inv)}
                  fill={C.portDot}
                  stroke={C.portStroke}
                  strokeWidth={Math.max(0.2, 0.4 * inv)}
                  opacity={0.7}
                />
                <text
                  x={pp[0] + Math.max(2, 3.5 * inv)}
                  y={pp[1] + Math.max(0.5, 1 * inv)}
                  fontSize={Math.max(2.5, 6 * inv)}
                  fill={C.portLabel}
                  fontWeight={600}
                  fontFamily="DM Sans,sans-serif"
                  opacity={0.8}
                >
                  {p.n}
                </text>
              </g>
            );
          })}

          {/* Layer 6b: Airports */}
          {fil.sR && AIRPORTS.map((a, i) => {
            const ap = pt(a.la, a.ln);
            return ap && (
              <g key={'ap' + i}>
                <rect
                  x={ap[0] - Math.max(0.5, 1 * inv)}
                  y={ap[1] - Math.max(0.5, 1 * inv)}
                  width={Math.max(1, 2 * inv)}
                  height={Math.max(1, 2 * inv)}
                  rx={Math.max(0.2, 0.3 * inv)}
                  fill={C.airportFill}
                  opacity={0.6}
                />
                <text
                  x={ap[0] + Math.max(2, 3.5 * inv)}
                  y={ap[1] + Math.max(0.5, 1 * inv)}
                  fontSize={Math.max(2.5, 6 * inv)}
                  fill={C.airportLabel}
                  fontWeight={600}
                  fontFamily="DM Sans,sans-serif"
                  opacity={0.8}
                >
                  {a.n}
                </text>
              </g>
            );
          })}

          {/* Layer 7: Chokepoints (diamond markers) */}
          {fil.sC && CHOKEPOINTS.map((c, i) => {
            const p = pt(c.la, c.ln);
            return p && (
              <g key={'c' + i}>
                <polygon
                  points={`${p[0]},${p[1] - cs} ${p[0] + cs * 0.75},${p[1]} ${p[0]},${p[1] + cs} ${p[0] - cs * 0.75},${p[1]}`}
                  fill={C.chokeFill}
                  stroke={C.chokeStroke}
                  strokeWidth={Math.max(0.15, 0.4 * inv)}
                  opacity={0.8}
                />
                <text
                  x={p[0]}
                  y={p[1] - cs - Math.max(1.5, 2.5 * inv)}
                  textAnchor="middle"
                  fontSize={Math.max(2.5, 7 * inv)}
                  fill={C.chokeLabel}
                  fontWeight={500}
                  fontFamily="DM Sans,sans-serif"
                >
                  {c.n}
                </text>
              </g>
            );
          })}

          {/* Layer 8: Supplier bubbles (viewport-culled, spend-colored) */}
          {fil.sSup && map.zK >= 4 && (() => {
            const zt = map.zR.current;
            const vpLeft = -zt.x / zt.k;
            const vpTop = -zt.y / zt.k;
            const vpRight = (map.dm.w - zt.x) / zt.k;
            const vpBottom = (map.dm.h - zt.y) / zt.k;
            const pad = 40 * inv;
            const maxSpendPct = spendByCountry
              ? Math.max(...Object.values(spendByCountry).map(c => c.spend_pct), 1)
              : 1;
            return SUPPLIERS.map((s, i) => {
              const p = pt(s.lat, s.lng);
              if (!p) return null;
              if (p[0] < vpLeft - pad || p[0] > vpRight + pad || p[1] < vpTop - pad || p[1] > vpBottom + pad) return null;
              const r = Math.max(2, (Math.sqrt(s.n / maxSup) * 30)) * inv;
              const ih = map.hSup === i;
              const isAff = impact && impact.suppliers.includes(s.country);
              const spendEntry = spendByCountry?.[s.country];
              const spendT = spendEntry ? Math.min(spendEntry.spend_pct / maxSpendPct, 1) : 0;
              const spendColor = isAff ? C.supImpact : spendT > 0.6 ? C.supHigh : spendT > 0.2 ? C.supMid : C.supLow;
              const spendFillOpacity = isAff ? 0.2 : (ih ? 0.3 : (0.06 + spendT * 0.22));
              const spendStrokeOpacity = isAff ? 0.6 : (ih ? 0.7 : (0.2 + spendT * 0.45));
              return (
                <g
                  key={'sup' + i}
                  onMouseEnter={() => map.setHSup(i)}
                  onMouseLeave={() => map.setHSup(null)}
                  data-click="1"
                  onClick={(e) => {
                    const rect = map.cR.current!.getBoundingClientRect();
                    map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    map.setSelSupC(map.selSupC === i ? null : i);
                    map.setSelSite(null);
                    map.setSelRt(null);
                    dis.setSupExpand({});
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={p[0]} cy={p[1]} r={r}
                    fill={spendColor}
                    fillOpacity={spendFillOpacity}
                    stroke={spendColor}
                    strokeWidth={Math.max(0.3, (isAff ? 1.2 : 0.8) * inv)}
                    strokeOpacity={spendStrokeOpacity}
                  />
                  {(ih || isAff) && (
                    <circle
                      cx={p[0]} cy={p[1]}
                      r={r + Math.max(2, 4 * inv)}
                      fill="none"
                      stroke={spendColor}
                      strokeWidth={Math.max(0.2, 0.4 * inv)}
                      strokeOpacity={0.3}
                    />
                  )}
                </g>
              );
            });
          })()}

          {/* Layer 9: Site markers (clustered at low zoom, individual at high zoom) */}
          {(() => {
            const renderSite = (s: typeof vis[number], i: number) => {
              const p = pt(s.lat, s.lng);
              if (!p) return null;
              const c = TYPE_CFG[s.type] || TYPE_CFG.other;
              const ih = map.hS === i;
              const bo = (s.type === 'sales' || s.type === 'other') ? 0.5 : 0.85;
              const r = (c.shape === 'tri' || c.shape === 'star' || c.shape === 'dia') ? mr : sr;
              const sc = (s.bu && BU_CFG[s.bu]) ? BU_CFG[s.bu].color : c.color;
              const exp = s.type === 'mfg' ? exposureScores[s.name] : null;
              const expC = exp ? (SEV as Record<string, string>)[exp.level] || '#64748b' : null;
              return (
                <g
                  key={'s' + i}
                  data-click="1"
                  onMouseEnter={() => map.setHS(i)}
                  onMouseLeave={() => map.setHS(null)}
                  onClick={(e) => {
                    const rect = map.cR.current!.getBoundingClientRect();
                    map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    map.setSelSite(map.selSite === i ? null : i);
                    map.setSelRt(null);
                    map.setSelSupC(null);
                    dis.setScView(map.selSite === i ? null : s.name);
                    onSiteClick(map.selSite === i ? null : i);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Hover halo */}
                  {ih && <circle cx={p[0]} cy={p[1]} r={r * 2.5} fill={sc} opacity={0.1} />}

                  {/* Impact rings for impacted factories */}
                  {impact && s.type === 'mfg' && impact.factories.includes(s.name) && (
                    <>
                      <circle cx={p[0]} cy={p[1]} r={r * 3} fill="none" stroke={theme.accent.red} strokeWidth={Math.max(0.4, 1 * inv)} opacity={0.5} strokeDasharray={`${Math.max(1, 2 * inv)},${Math.max(0.5, 1 * inv)}`} />
                      <circle cx={p[0]} cy={p[1]} r={r * 2} fill={theme.accent.red} opacity={0.08} />
                    </>
                  )}

                  {/* Recommendation-affected site rings */}
                  {impact && recAffectedSites[s.name] && !impact.factories.includes(s.name) && (() => {
                    const aff = recAffectedSites[s.name];
                    const proximity = Math.max(0, 1 - aff.distance_km / 2000);
                    const ringR = r * (2 + proximity * 2);
                    const ringOpacity = 0.2 + proximity * 0.4;
                    const glowR = ringR + Math.max(1, 3 * inv);
                    return (
                      <>
                        <circle cx={p[0]} cy={p[1]} r={glowR} fill={theme.accent.red} opacity={proximity * 0.06} />
                        <circle cx={p[0]} cy={p[1]} r={ringR} fill="none" stroke={theme.accent.red} strokeWidth={Math.max(0.4, (0.6 + proximity) * inv)} opacity={ringOpacity} strokeDasharray={`${Math.max(1.5, 3 * inv)},${Math.max(1, 2 * inv)}`}>
                          <animate attributeName="stroke-opacity" values={`${ringOpacity};${ringOpacity * 0.4};${ringOpacity}`} dur="3s" repeatCount="indefinite" />
                        </circle>
                      </>
                    );
                  })()}

                  {/* Site shape */}
                  <SiteShape
                    shape={c.shape}
                    x={p[0]} y={p[1]}
                    r={r} sr={sr}
                    color={sc}
                    ih={ih}
                    bo={impact && s.type === 'mfg' && impact.factories.includes(s.name) ? 1 : bo}
                    inv={inv}
                  />

                  {/* Exposure score dot */}
                  {exp && <circle cx={p[0] + r} cy={p[1] - r} r={Math.max(1.5, 3 * inv)} fill={expC!} opacity={0.9} />}
                </g>
              );
            };

            if (clusters) {
              return (
                <>
                  {clusters.standalone.map((s) => {
                    const origIdx = vis.indexOf(s);
                    return renderSite(s, origIdx);
                  })}
                  {clusters.clusters.map((cl, ci) => {
                    const cr = Math.max(6, 12 * inv);
                    return (
                      <g
                        key={'cl' + ci}
                        data-click="1"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          if (!map.svgRef.current || !map.gR.current) return;
                          const targetK = 4;
                          const tx = map.dm.w / 2 - cl.cx * targetK;
                          const ty = map.dm.h / 2 - cl.cy * targetK;
                          const g = select(map.gR.current);
                          g.transition().duration(600).ease(easeCubicOut)
                            .attr('transform', `translate(${tx},${ty}) scale(${targetK})`);
                          map.zR.current = { k: targetK, x: tx, y: ty };
                          setTimeout(() => map.setZK(targetK), 50);
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (map.svgRef.current as any).__zoom = zoomIdentity.translate(tx, ty).scale(targetK);
                        }}
                      >
                        <circle cx={cl.cx} cy={cl.cy} r={cr + 2} fill={C.clusterOuter} opacity={0.6} />
                        <circle cx={cl.cx} cy={cl.cy} r={cr} fill={C.clusterInner} stroke={C.clusterStroke} strokeWidth={Math.max(0.5, 1 * inv)} opacity={0.85} />
                        <text
                          x={cl.cx}
                          y={cl.cy + Math.max(1.5, 3.5 * inv)}
                          textAnchor="middle"
                          fontSize={Math.max(4, 9 * inv)}
                          fill={C.clusterText}
                          fontWeight={700}
                          fontFamily={FM}
                          pointerEvents="none"
                        >
                          {cl.count}
                        </text>
                      </g>
                    );
                  })}
                </>
              );
            }
            return vis.map((s, i) => renderSite(s, i));
          })()}

          {/* Layer 10: Supply chain overlay arcs (when a site is selected) */}
          {dis.scView && (() => {
            const site = SITES.find(s => s.name === dis.scView);
            if (!site) return null;
            const sp = pt(site.lat, site.lng);
            if (!sp) return null;

            // Use API supplier data when available
            if (map.siteSuppliers && map.siteSuppliers.by_country.length > 0) {
              const countries = map.siteSuppliers.by_country;
              const maxSpend = Math.max(...countries.map(c => c.spend_pct), 1);
              return (
                <g>
                  {countries.map((cEntry, ci) => {
                    const sup = SUPPLIERS.find(s => s.country === cEntry.country);
                    if (!sup) return null;
                    const cp = pt(sup.lat, sup.lng);
                    if (!cp) return null;
                    const interp = geoInterpolate([sup.lng, sup.lat], [site.lng, site.lat]);
                    const pts = Array.from({ length: 25 }, (_, j) => proj(interp(j / 24)) as [number, number]);
                    const arcPath = line().curve(curveBasis)(pts);
                    if (!arcPath) return null;
                    const t = cEntry.spend_pct / maxSpend;
                    const rr = Math.round(34 + t * (245 - 34));
                    const gg = Math.round(197 + t * (158 - 197));
                    const bb = Math.round(94 + t * (11 - 94));
                    const arcColor = `rgb(${rr},${gg},${bb})`;
                    const arcW = Math.max(0.5, Math.min(4, Math.sqrt(cEntry.spend_pct / 5) * 2)) * inv;
                    return (
                      <g key={'sc-arc-' + ci}>
                        <path
                          d={arcPath}
                          fill="none"
                          stroke={arcColor}
                          strokeWidth={arcW}
                          strokeLinecap="round"
                          opacity={0.7}
                          strokeDasharray="1000"
                          strokeDashoffset="1000"
                          style={{ animation: `sc-arc-draw 1.2s ease-out ${ci * 0.08}s forwards` }}
                        />
                        <circle
                          cx={cp[0]} cy={cp[1]}
                          r={Math.max(1.5, (2 + Math.sqrt(cEntry.spend_pct / 10)) * inv)}
                          fill={arcColor} opacity={0.5}
                        />
                        {cEntry.has_active_disruption && (
                          <circle
                            cx={cp[0]} cy={cp[1]}
                            r={Math.max(3, 6 * inv)}
                            fill="none"
                            stroke={theme.accent.red}
                            strokeWidth={Math.max(0.3, 0.8 * inv)}
                            opacity={0.6}
                            strokeDasharray={`${Math.max(1, 2 * inv)},${Math.max(0.5, 1 * inv)}`}
                          >
                            <animate attributeName="stroke-opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                          </circle>
                        )}
                      </g>
                    );
                  })}
                  {/* Factory highlight ring */}
                  <circle cx={sp[0]} cy={sp[1]} r={Math.max(4, 8 * inv)} fill="none" stroke={theme.accent.green} strokeWidth={Math.max(0.6, 1.8 * inv)} opacity={0.8}>
                    <animate attributeName="r" values={`${Math.max(4, 8 * inv)};${Math.max(5, 10 * inv)};${Math.max(4, 8 * inv)}`} dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.4;0.8" dur="3s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={sp[0]} cy={sp[1]} r={Math.max(2.5, 5 * inv)} fill={theme.accent.green} opacity={0.15} />
                </g>
              );
            }

            // Fallback: SUPPLY_GRAPH dashed lines
            const graph = SUPPLY_GRAPH[dis.scView];
            if (!graph) return null;
            return (
              <g opacity={0.6}>
                {graph.sup.map((country, ci) => {
                  const sup = SUPPLIERS.find(s => s.country === country);
                  if (!sup) return null;
                  const cp = pt(sup.lat, sup.lng);
                  if (!cp) return null;
                  const interp = geoInterpolate([sup.lng, sup.lat], [site.lng, site.lat]);
                  const pts = Array.from({ length: 25 }, (_, j) => proj(interp(j / 24)) as [number, number]);
                  const arcPath = line().curve(curveBasis)(pts);
                  if (!arcPath) return null;
                  return (
                    <g key={'sc' + ci}>
                      <path d={arcPath} fill="none" stroke={theme.accent.green} strokeWidth={Math.max(0.4, 1.2 * inv)} strokeDasharray={`${Math.max(2, 4 * inv)},${Math.max(1, 2 * inv)}`} opacity={0.4} />
                      <circle cx={cp[0]} cy={cp[1]} r={Math.max(2, 4 * inv)} fill={theme.accent.green} opacity={0.3} />
                    </g>
                  );
                })}
                <circle cx={sp[0]} cy={sp[1]} r={Math.max(3, 6 * inv)} fill="none" stroke={theme.accent.green} strokeWidth={Math.max(0.5, 1.5 * inv)} opacity={0.7} />
              </g>
            );
          })()}

          {/* Layer 11: Disruption-to-site impact lines */}
          {dis.sel !== null && impact && dis.items?.[dis.sel] && (() => {
            const selD = dis.items[dis.sel];
            const dLat = 'lat' in selD ? selD.lat as number : undefined;
            const dLng = 'lng' in selD ? selD.lng as number : undefined;
            if (!dLat || !dLng) return null;
            const dp = pt(dLat, dLng);
            if (!dp) return null;
            return impact.factories.map((fname, fi) => {
              const site = SITES.find(s => s.name === fname);
              if (!site) return null;
              const sp = pt(site.lat, site.lng);
              if (!sp) return null;
              const mx = (dp[0] + sp[0]) / 2;
              const my = (dp[1] + sp[1]) / 2;
              const dashLen = Math.max(2, 4 * inv);
              const gapLen = Math.max(1.5, 3 * inv);
              const totalDash = dashLen + gapLen;
              return (
                <g key={'imp-line-' + fi} style={{ opacity: 0.5, transition: 'opacity 0.3s ease-in' }}>
                  <line
                    x1={dp[0]} y1={dp[1]} x2={sp[0]} y2={sp[1]}
                    stroke={theme.accent.red}
                    strokeWidth={Math.max(0.5, 1.2 * inv)}
                    strokeDasharray={`${dashLen},${gapLen}`}
                    strokeLinecap="round"
                  >
                    <animate attributeName="stroke-dashoffset" values={`${totalDash * 2};0`} dur="1.5s" repeatCount="indefinite" />
                  </line>
                  {map.zK > 2 && (
                    <text
                      x={mx} y={my - Math.max(1, 2 * inv)}
                      textAnchor="middle"
                      fontSize={Math.max(3, 7 * inv)}
                      fill={C.impactLabel}
                      fontFamily="DM Sans,sans-serif"
                      fontWeight={500}
                      pointerEvents="none"
                    >
                      {fname}
                    </text>
                  )}
                </g>
              );
            });
          })()}

          {/* Layer 12: Disruption markers (severity-colored, pulsing) */}
          {dis.items?.map((d, i) => {
            const lat = 'lat' in d ? d.lat : undefined;
            const lng = 'lng' in d ? d.lng : undefined;
            if (!lat || !lng) return null;
            if (fil.sevFilter && getSev(d) !== fil.sevFilter) return null;
            const p = pt(lat as number, lng as number);
            if (!p) return null;
            const sv = getSev(d);
            const co = (SEV as Record<string, string>)[sv] || theme.accent.amber;
            const is = dis.sel === i;
            const pc = sv === 'Critical' ? 'spc' : sv === 'High' ? 'sph' : sv === 'Medium' ? 'spm' : 'spl';
            const du = sv === 'Critical' ? '1.5s' : sv === 'High' ? '2.5s' : '3.5s';
            const cr = Math.max(2, 4.5 * inv);
            const selStroke = isDark ? '#fff' : '#1e293b';
            const defStroke = isDark ? '#000' : '#fff';
            return (
              <g
                key={'d' + i}
                data-click="1"
                onClick={e => {
                  e.stopPropagation();
                  dis.setSel(is ? null : i);
                  onDisruptionClick(is ? null : i);
                  if (!rightOpen) setRightOpen(true);
                  if (!dis.dOpen) { dis.setDOpen(true); dis.setDClosing(false); }
                }}
                onMouseEnter={() => map.setHD(i)}
                onMouseLeave={() => map.setHD(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulse ring */}
                <circle
                  cx={p[0]} cy={p[1]}
                  fill="none"
                  stroke={co}
                  strokeWidth={Math.max(0.5, 1.5 * inv)}
                  opacity={0.4}
                  style={{ animation: `${pc} ${du} ease-in-out infinite` }}
                />
                {/* Second pulse for Critical */}
                {sv === 'Critical' && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    fill="none"
                    stroke={co}
                    strokeWidth={Math.max(0.3, 0.8 * inv)}
                    opacity={0.2}
                    style={{ animation: `${pc} ${du} ease-in-out infinite`, animationDelay: '.75s' }}
                  />
                )}
                {/* Main dot */}
                <circle
                  cx={p[0]} cy={p[1]}
                  r={cr}
                  fill={co}
                  stroke={is ? selStroke : defStroke}
                  strokeWidth={is ? Math.max(1, 2 * inv) : Math.max(0.5, inv)}
                  filter="url(#v2-g2)"
                />
                {/* Selection ring */}
                {is && (
                  <circle
                    cx={p[0]} cy={p[1]}
                    r={cr * 2.2}
                    fill="none"
                    stroke={selStroke}
                    strokeWidth={Math.max(0.3, 0.8 * inv)}
                    strokeDasharray={`${Math.max(1, 3 * inv)},${Math.max(1, 2 * inv)}`}
                    opacity={0.5}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Layer 13: Legend box */}
        <g transform={`translate(14,${map.dm.h - 148})`}>
          <rect
            x={0} y={0}
            width={128} height={142}
            rx={10}
            fill={C.legendBg}
            stroke={C.legendStroke}
            strokeWidth={0.8}
          />
          {/* Manufacturing */}
          <polygon points="14,18 18,14 22,18" fill={TYPE_CFG.mfg.color} />
          <text x={30} y={18} fontSize={9} fill={C.legendText} fontFamily={F}>Manufacturing</text>
          {/* Logistics */}
          <rect x={14.5} y={26.5} width={6} height={6} rx={1} fill={TYPE_CFG.log.color} transform="rotate(45,17.5,29.5)" />
          <text x={30} y={32} fontSize={9} fill={C.legendText} fontFamily={F}>Logistics</text>
          {/* Admin */}
          <rect x={14} y={40} width={7} height={7} rx={1.5} fill={TYPE_CFG.admin.color} />
          <text x={30} y={46} fontSize={9} fill={C.legendText} fontFamily={F}>Admin/HQ</text>
          {/* Sales/Other */}
          <circle cx={18} cy={58} r={2.5} fill={TYPE_CFG.sales.color} />
          <text x={30} y={61} fontSize={9} fill={C.legendText} fontFamily={F}>Sales/Other</text>
          {/* Sea Lane */}
          <line x1={10} y1={74} x2={26} y2={74} stroke={theme.accent.cyan} strokeWidth={1.2} strokeDasharray="4,3" opacity={0.5} />
          <text x={30} y={77} fontSize={9} fill={C.legendText} fontFamily={F}>Sea Lane</text>
          {/* Air Lane */}
          <line x1={10} y1={88} x2={26} y2={88} stroke={theme.accent.purple} strokeWidth={0.8} strokeDasharray="1.5,1.5" opacity={0.6} />
          <text x={30} y={91} fontSize={9} fill={C.legendText} fontFamily={F}>Air Lane</text>
          {/* Disruption */}
          <circle cx={18} cy={104} r={3} fill={theme.accent.red} opacity={0.8} />
          <circle cx={18} cy={104} r={6} fill="none" stroke={theme.accent.red} strokeWidth={0.8} opacity={0.3} />
          <text x={30} y={107} fontSize={9} fill={C.legendText} fontFamily={F}>Disruption</text>
          {/* Suppliers (spend) */}
          <circle cx={12} cy={122} r={4} fill={C.supLow} fillOpacity={0.15} stroke={C.supLow} strokeWidth={0.6} strokeOpacity={0.4} />
          <circle cx={22} cy={122} r={4} fill={C.supMid} fillOpacity={0.2} stroke={C.supMid} strokeWidth={0.6} strokeOpacity={0.5} />
          <circle cx={32} cy={122} r={4} fill={C.supHigh} fillOpacity={0.25} stroke={C.supHigh} strokeWidth={0.6} strokeOpacity={0.6} />
          <text x={42} y={125} fontSize={9} fill={C.legendText} fontFamily={F}>Suppliers (spend)</text>
        </g>

        {/* Hint text */}
        <text
          x={map.dm.w - 14}
          y={map.dm.h - 10}
          textAnchor="end"
          fontSize={8}
          fill={C.hintText}
          fontFamily={F}
        >
          Scroll to zoom {'\u00b7'} Drag to pan
        </text>
      </svg>

      {/* Layer 14: Tooltips (site, disruption, supplier — on hover) */}

      {/* Site tooltip */}
      {map.hS !== null && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
        const s = vis[map.hS];
        if (!s) return null;
        const p = pt(s.lat, s.lng);
        if (!p) return null;
        const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 200);
        const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 44, 8);
        return <SiteTooltip site={s} tx={tx} ty={ty} />;
      })()}

      {/* Disruption tooltip */}
      {map.hD !== null && dis.sel !== map.hD && dis.items && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
        const d = dis.items[map.hD];
        if (!d || !('lat' in d) || !('lng' in d)) return null;
        const p = pt(d.lat as number, d.lng as number);
        if (!p) return null;
        const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 260);
        const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 56, 8);
        return <DisruptionTooltip item={d} mode={dis.mode} tx={tx} ty={ty} />;
      })()}

      {/* Supplier tooltip */}
      {map.hSup !== null && fil.sSup && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
        const s = SUPPLIERS[map.hSup];
        if (!s) return null;
        const p = pt(s.lat, s.lng);
        if (!p) return null;
        const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 240);
        const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 56, 8);
        return <SupplierTooltip supplier={s} tx={tx} ty={ty} />;
      })()}

      {/* Layer 15: Click popups (site, route, supplier — on click) */}

      {/* Site popup */}
      {map.selSite !== null && (() => {
        const s = vis[map.selSite];
        if (!s) return null;
        const tx = Math.min(map.clickPos.x + 12, map.dm.w - 310);
        const ty = Math.max(map.clickPos.y - 20, 8);
        return (
          <div
            data-click="1"
            style={{
              position: 'absolute', left: tx, top: ty, zIndex: 22,
              background: theme.bg.overlay,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 10,
              padding: '14px 16px',
              boxShadow: isDark ? '0 12px 40px rgba(0,0,0,.7)' : '0 12px 40px rgba(0,0,0,.15)',
              backdropFilter: 'blur(16px)',
              width: 290,
              maxHeight: 440,
              overflow: 'auto',
            }}
          >
            <SitePopup
              site={s}
              exposureScore={exposureScores[s.name]}
              onClose={() => { map.setSelSite(null); dis.setScView(null); map.setSiteSuppliers(null); }}
              supExpand={dis.supExpand}
              setSupExpand={dis.setSupExpand}
              siteSuppliers={map.siteSuppliers}
              siteSuppliersLoading={map.siteSuppliersLoading}
            />
          </div>
        );
      })()}

      {/* Route popup */}
      {map.selRt !== null && (() => {
        const rt = ROUTES[map.selRt];
        if (!rt) return null;
        const tx = Math.min(map.clickPos.x + 12, map.dm.w - 300);
        const ty = Math.max(map.clickPos.y - 20, 8);
        const fLvl = corridorFriction[rt.corridor] as FrictionLevel | undefined;
        const tradeEvent = dis.items && dis.mode === 'trade'
          ? dis.items.find(d => 'corridor' in d && (d as { corridor: string }).corridor === rt.corridor)
          : null;
        return (
          <div
            data-click="1"
            style={{
              position: 'absolute', left: tx, top: ty, zIndex: 22,
              background: theme.bg.overlay,
              border: `1px solid ${theme.border.default}`,
              borderRadius: 10,
              padding: '14px 16px',
              boxShadow: isDark ? '0 12px 40px rgba(0,0,0,.7)' : '0 12px 40px rgba(0,0,0,.15)',
              backdropFilter: 'blur(16px)',
              width: 290,
            }}
          >
            <RoutePopup route={rt} frictionLevel={fLvl} tradeEvent={tradeEvent || null} onClose={() => map.setSelRt(null)} />
          </div>
        );
      })()}

      {/* Supplier popup */}
      {map.selSupC !== null && (() => {
        const s = SUPPLIERS[map.selSupC];
        if (!s) return null;
        const tx = Math.min(map.clickPos.x + 12, map.dm.w - 290);
        const ty = Math.max(map.clickPos.y - 20, 8);
        return (
          <div
            data-click="1"
            style={{
              position: 'absolute', left: tx, top: ty, zIndex: 22,
              background: theme.bg.overlay,
              border: `1px solid ${isDark ? '#a78bfa33' : '#a78bfa44'}`,
              borderRadius: 10,
              padding: '14px 16px',
              boxShadow: isDark ? '0 12px 40px rgba(0,0,0,.7)' : '0 12px 40px rgba(0,0,0,.15)',
              backdropFilter: 'blur(16px)',
              width: 290,
              maxHeight: 420,
              overflow: 'auto',
            }}
          >
            <SupplierPopup
              supplier={s}
              supExpand={dis.supExpand}
              setSupExpand={dis.setSupExpand}
              onClose={() => { map.setSelSupC(null); dis.setSupExpand({}); }}
            />
          </div>
        );
      })()}

      {/* Empty state */}
      {!dis.items && !dis.loading && !dis.error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.3 }}>{'\ud83d\udef0\ufe0f'}</div>
          <p style={{ color: theme.text.muted, fontSize: 15, fontWeight: 600, margin: 0 }}>Ready to scan</p>
          <p style={{ color: C.hintText, fontSize: 11, margin: '4px 0 0', fontFamily: FM }}>
            {SITES.length} sites {'\u00b7'} {new Set(SITES.map(s => s.country)).size} countries
          </p>
        </div>
      )}
    </div>
  );
}
