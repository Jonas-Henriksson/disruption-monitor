/**
 * RoutingOverlay — D3 layer for routing dependency visualizations.
 *
 * Renders sea routes as curved great-arc lines, highlights affected routes,
 * shows chokepoint markers, and provides hover tooltips.
 */
import { useMemo, useState } from 'react';
import { geoInterpolate, line, curveBasis } from 'd3';
import type { GeoProjection } from 'd3';
import type { ScanItem, Chokepoint, Route, SeaRoute } from '../../types';
// getSev import removed — will be restored when dependency lines are implemented

// V3 map tokens
const MAP = {
  routeDefault: '#1a5f8a',
  routeAffected: '#ef4444',
  routeAffectedAlt: '#f97316',
  chokeFill: '#1e2d44',
  chokeStroke: '#3a506c',
  chokeAffected: '#ef4444',
  tooltipBg: '#0b1525ee',
  tooltipBorder: '#1e3a5c',
  tooltipText: '#c8d6e5',
  tooltipLabel: '#94a3b8',
  font: "'DM Sans', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
} as const;

interface RoutingOverlayProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  projection: GeoProjection;
  events: ScanItem[];
  zoomLevel: number;
  routes: Route[];
  chokepoints: Chokepoint[];
}

interface TooltipState {
  x: number;
  y: number;
  content: string;
  subContent?: string;
}

/** Check if an event affects a given route corridor */
function getAffectedCorridors(events: ScanItem[]): Map<string, string[]> {
  const corridorEvents = new Map<string, string[]>();

  const REGION_CORRIDORS: Record<string, string[]> = {
    'Europe': ['EU-CN', 'EU-US', 'EU-ASEAN', 'EU-ME', 'EU-IN', 'EU-BR', 'CN-EU'],
    'Middle East': ['EU-CN', 'EU-ASEAN', 'EU-ME', 'EU-IN', 'CN-EU'],
    'China': ['EU-CN', 'CN-US', 'CN-ASEAN', 'CN-EU'],
    'India': ['EU-IN'],
    'Americas': ['EU-US', 'CN-US', 'EU-BR'],
    'Africa': ['EU-CN', 'EU-IN', 'EU-ASEAN'],
    'Global': ['EU-CN', 'EU-US', 'CN-US', 'EU-IN', 'EU-ASEAN', 'EU-ME', 'EU-BR', 'CN-EU'],
  };

  events.forEach(evt => {
    const region = 'region' in evt ? (evt as { region: string }).region : '';
    const name = 'event' in evt ? (evt as { event: string }).event : 'risk' in evt ? (evt as { risk: string }).risk : 'Unknown';
    const corridors = REGION_CORRIDORS[region] || [];
    corridors.forEach(c => {
      if (!corridorEvents.has(c)) corridorEvents.set(c, []);
      corridorEvents.get(c)!.push(name);
    });
  });

  return corridorEvents;
}

/** Count active disruptions near chokepoints */
function getChokepointDisruptions(events: ScanItem[], chokepoints: Chokepoint[]): Map<string, number> {
  const result = new Map<string, number>();

  chokepoints.forEach(cp => {
    let count = 0;
    events.forEach(evt => {
      const tagged = (evt as Record<string, unknown>).affected_chokepoints;
      if (Array.isArray(tagged) && tagged.includes(cp.n)) {
        count++;
      }
    });
    if (count > 0) result.set(cp.n, count);
  });

  return result;
}

export function RoutingOverlay({
  svgRef,
  projection,
  events,
  zoomLevel,
  routes,
  chokepoints,
}: RoutingOverlayProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const inv = 1 / zoomLevel;

  // Only active (non-archived) events
  const activeEvents = useMemo(() =>
    events.filter(e => {
      const status = 'status' in e ? (e as { status?: string }).status : 'active';
      return status !== 'archived';
    }),
    [events]
  );

  const affectedCorridors = useMemo(() => getAffectedCorridors(activeEvents), [activeEvents]);
  const chokeCounts = useMemo(() => getChokepointDisruptions(activeEvents, chokepoints), [activeEvents, chokepoints]);

  // Build route paths
  const routePaths = useMemo(() => {
    return routes.map((r) => {
      if ('pts' in r) {
        const pts = (r as SeaRoute).pts;
        const projected = pts.map(([la, ln]) => projection([ln, la])).filter(Boolean) as [number, number][];
        const pathGen = line().curve(curveBasis);
        return pathGen(projected);
      }
      // Air route — great arc
      const ar = r as { f: [number, number]; t: [number, number] };
      const interp = geoInterpolate([ar.f[1], ar.f[0]], [ar.t[1], ar.t[0]]);
      const pts = Array.from({ length: 25 }, (_, j) => projection(interp(j / 24)) as [number, number]);
      const pathGen = line().curve(curveBasis);
      return pathGen(pts);
    });
  }, [routes, projection]);

  // Routes always visible: ghost at zoom < 2, full at zoom >= 2
  const showGhostRoutes = zoomLevel < 2;
  const showRoutes = zoomLevel >= 2;
  const showChokepoints = zoomLevel >= 2;

  // Smooth opacity interpolation for ghost-to-full transition
  // At zoom 1.0: ghostOp = 0.08, at zoom 1.5: ghostOp ~0.15, at zoom 2.0: fully transitioned to normal
  const ghostOpacity = Math.min(0.10, 0.06 + 0.04 * (zoomLevel - 1));
  // showDependencyLines will be used when dependency line rendering is implemented

  const handleRouteHover = (e: React.MouseEvent, route: Route, isAffected: boolean) => {
    if (!isAffected) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const affEvts = affectedCorridors.get(route.corridor) || [];
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      content: route.label,
      subContent: affEvts.length > 0 ? `Affected by: ${affEvts[0]}${affEvts.length > 1 ? ` (+${affEvts.length - 1} more)` : ''}` : undefined,
    });
  };

  const handleChokepointHover = (e: React.MouseEvent, cp: Chokepoint) => {
    const count = chokeCounts.get(cp.n) || 0;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      content: cp.n,
      subContent: count > 0 ? `${count} active disruption${count > 1 ? 's' : ''}` : 'No active disruptions',
    });
  };

  const pt = (la: number, ln: number) => projection([ln, la]) as [number, number] | null;

  return (
    <g className="routing-overlay">
      {/* Ghost shipping lanes at default zoom — faint hints of the network */}
      {showGhostRoutes && routePaths.map((d, i) => {
        if (!d) return null;
        const route = routes[i];
        const isSea = route.type === 'sea';
        return (
          <path
            key={'ghost-' + i}
            d={d}
            fill="none"
            stroke={isSea ? '#64748b' : '#a78bfa'}
            strokeWidth={isSea ? 0.5 : 0.3}
            strokeOpacity={isSea ? ghostOpacity : ghostOpacity * 0.7}
            strokeDasharray={isSea ? 'none' : '2,2'}
            pointerEvents="none"
          />
        );
      })}

      {/* Sea / Air routes */}
      {showRoutes && routePaths.map((d, i) => {
        if (!d) return null;
        const route = routes[i];
        const isSea = route.type === 'sea';
        const affEvts = affectedCorridors.get(route.corridor);
        const isAffected = !!affEvts && affEvts.length > 0;

        const strokeColor = isAffected ? MAP.routeAffected : isSea ? '#38bdf8' : '#c084fc';
        const strokeW = isAffected
          ? Math.max(1.2, 3 * inv)
          : isSea
            ? Math.max(0.4, 1 * inv)
            : Math.max(0.3, 0.6 * inv);
        const strokeOp = isAffected ? 0.7 : isSea ? 0.2 : 0.25;
        const dash = isAffected
          ? `${Math.max(4, 8 * inv)},${Math.max(2, 4 * inv)}`
          : isSea
            ? `${Math.max(2, 4 * inv)},${Math.max(1.5, 3 * inv)}`
            : `${Math.max(0.5, 1 * inv)},${Math.max(0.5, 1 * inv)}`;

        return (
          <g key={'ro-' + i}>
            {/* Invisible hit area */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(8, 16 * inv)}
              style={{ cursor: isAffected ? 'pointer' : 'default' }}
              onMouseEnter={(e) => handleRouteHover(e, route, isAffected)}
              onMouseMove={(e) => handleRouteHover(e, route, isAffected)}
              onMouseLeave={() => setTooltip(null)}
            />
            {/* Visible route */}
            <path
              d={d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeW}
              strokeOpacity={strokeOp}
              strokeDasharray={dash}
              pointerEvents="none"
            >
              <animate
                attributeName="stroke-dashoffset"
                values={isAffected ? `${Math.max(12, 24 * inv)};0` : `${Math.max(7, 14 * inv)};0`}
                dur={isAffected ? '1.5s' : isSea ? '4s' : '2.5s'}
                repeatCount="indefinite"
              />
            </path>
            {/* Affected glow */}
            {isAffected && (
              <path
                d={d}
                fill="none"
                stroke={MAP.routeAffected}
                strokeWidth={strokeW * 2.5}
                strokeOpacity={0.1}
                strokeDasharray={dash}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}

      {/* Chokepoints — rendered last for highest z-order */}
      {showChokepoints && chokepoints.map((cp, i) => {
        const p = pt(cp.la, cp.ln);
        if (!p) return null;
        const count = chokeCounts.get(cp.n) || 0;
        const isAffected = count > 0;
        const cs = Math.max(3, 6 * inv);
        const hitR = Math.max(6, 14 * inv);
        const fillColor = isAffected ? MAP.chokeAffected + '33' : MAP.chokeFill;
        const strokeColor = isAffected ? MAP.chokeAffected : MAP.chokeStroke;

        return (
          <g
            key={'cp-' + i}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => handleChokepointHover(e, cp)}
            onMouseMove={(e) => handleChokepointHover(e, cp)}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Invisible larger hit area for easy click/hover */}
            <circle
              cx={p[0]}
              cy={p[1]}
              r={hitR}
              fill="transparent"
              pointerEvents="all"
            />
            {/* Pulse glow for affected */}
            {isAffected && (
              <circle
                cx={p[0]}
                cy={p[1]}
                r={cs * 2}
                fill={MAP.chokeAffected}
                fillOpacity={0}
                stroke={MAP.chokeAffected}
                strokeWidth={Math.max(0.3, 0.6 * inv)}
                strokeOpacity={0.4}
                pointerEvents="none"
              >
                <animate
                  attributeName="r"
                  values={`${cs * 1.5};${cs * 2.5};${cs * 1.5}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="stroke-opacity"
                  values="0.4;0.1;0.4"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {/* Diamond marker */}
            <polygon
              points={`${p[0]},${p[1] - cs} ${p[0] + cs * 0.75},${p[1]} ${p[0]},${p[1] + cs} ${p[0] - cs * 0.75},${p[1]}`}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={Math.max(0.2, 0.5 * inv)}
              opacity={0.9}
              pointerEvents="none"
            />
            {/* Label */}
            <text
              x={p[0]}
              y={p[1] - cs - Math.max(2, 3 * inv)}
              textAnchor="middle"
              fontSize={Math.max(3, 7 * inv)}
              fill={isAffected ? MAP.chokeAffected : '#3a506c'}
              fontWeight={isAffected ? 700 : 500}
              fontFamily={MAP.font}
              pointerEvents="none"
              opacity={0.9}
            >
              {cp.n}
            </text>
            {/* Count badge for affected */}
            {isAffected && (
              <g>
                <circle
                  cx={p[0] + cs}
                  cy={p[1] - cs}
                  r={Math.max(2.5, 5 * inv)}
                  fill={MAP.chokeAffected}
                  opacity={0.9}
                />
                <text
                  x={p[0] + cs}
                  y={p[1] - cs + Math.max(1, 2 * inv)}
                  textAnchor="middle"
                  fontSize={Math.max(2.5, 5 * inv)}
                  fill="#ffffff"
                  fontWeight={700}
                  fontFamily={MAP.fontMono}
                  pointerEvents="none"
                >
                  {count}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Dependency lines — stub: will render event-to-factory arcs when site coordinates are available */}

      {/* Tooltip overlay — rendered in SVG foreignObject with inverse zoom scale */}
      {tooltip && (
        <foreignObject
          x={tooltip.x * inv}
          y={tooltip.y * inv}
          width={240 * inv}
          height={70 * inv}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div
            style={{
              transformOrigin: 'top left',
              transform: `scale(${inv})`,
              background: MAP.tooltipBg,
              border: `1px solid ${MAP.tooltipBorder}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontFamily: MAP.font,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              width: 'max-content',
              maxWidth: 280,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: MAP.tooltipText }}>{tooltip.content}</div>
            {tooltip.subContent && (
              <div style={{ fontSize: 10, color: MAP.tooltipLabel, marginTop: 2 }}>{tooltip.subContent}</div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default RoutingOverlay;
