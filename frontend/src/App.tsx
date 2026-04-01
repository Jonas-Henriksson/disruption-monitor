import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { zoom, select, geoNaturalEarth1, geoPath, geoGraticule10, line, curveCardinal, curveBasis, geoInterpolate, geoCentroid, easeCubicOut, zoomIdentity } from "d3";
import type { GeoPermissibleObjects } from "d3";
import { SiteShape } from "./components/Map/SiteShape";
import { SiteTooltip } from "./components/Map/SiteTooltip";
import { DisruptionTooltip } from "./components/Map/DisruptionTooltip";
import { SupplierTooltip } from "./components/Map/SupplierTooltip";
import { SitePopup } from "./components/Map/SitePopup";
import { RoutePopup } from "./components/Map/RoutePopup";
import { SupplierPopup } from "./components/Map/SupplierPopup";
import { DrawerPanel } from "./components/DrawerPanel";
import { HeaderBar } from "./components/HeaderBar";
import { KPIStrip, useKpiData } from "./components/KPIStrip";
import { TimelineStrip } from "./components/TimelineStrip";
import { GLOBAL_CSS } from "./styles";
import {
  SITES, TYPE_CFG, REGION_CFG, BU_CFG,
  SEV, FRIC, GEO_URL, CONFLICT_ZONES, F, FM,
  CHOKEPOINTS, PORTS, AIRPORTS, ROUTES,
  SUPPLIERS, maxSup, SUPPLY_GRAPH,
  typeCounts, regionCounts, countryCount,
} from "./data";
import { topoToGeo, COUNTRY_NAMES, CENTROID_OVERRIDES } from "./utils/geo";
import { computeImpactWithGraph, computeExposureScores } from "./utils/impact";
import { eventId } from "./utils/format";
import { getSev } from "./utils/scan";
import type { FrictionLevel } from "./types";
import { useMapState } from "./hooks/useMapState";
import { useDisruptionState } from "./hooks/useDisruptionState";
import { useFilterState } from "./hooks/useFilterState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";

export default function App() {
  const map = useMapState();
  const dis = useDisruptionState();
  const fil = useFilterState();
  const kb = useKeyboardShortcuts({ dis, fil });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [land, setLand] = useState<any>(null);
  // Inject CSS
  useEffect(() => {
    const id = 'sc-mon-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // Auto-load disruptions on mount: try backend first, then fall back to local scan
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

  // P7: Auto-open drawer with top Critical event on initial load
  const autoOpenFired = useRef(false);
  useEffect(() => {
    if (autoOpenFired.current || !dis.items?.length) return;
    const critIdx = dis.items.findIndex(d => getSev(d) === 'Critical');
    if (critIdx >= 0) {
      autoOpenFired.current = true;
      dis.setDOpen(true);
      dis.setSel(critIdx);
    }
  }, [dis.items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch backend recommendations when a card is selected
  useEffect(() => {
    if (dis.sel !== null && dis.items) {
      const d = dis.items[dis.sel];
      if (d) {
        const eid = eventId(d as { event?: string; risk?: string; region?: string });
        // Only fetch for disruptions mode (which has structured recs)
        if (dis.mode === 'disruptions' && d && 'id' in d) {
          dis.loadRecs((d as { id: string }).id);
        } else {
          dis.loadRecs(eid);
        }
      }
    }
  }, [dis.sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load world map
  useEffect(() => {
    fetch(GEO_URL).then(r => r.json()).then(t => setLand(topoToGeo(t, 'countries'))).catch(() => {});
  }, []);

  // Resize observer
  useEffect(() => {
    const ro = new ResizeObserver(e => {
      const { width: w, height: h } = e[0].contentRect;
      map.setDm({ w, h });
    });
    if (map.cR.current) ro.observe(map.cR.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // D3 zoom
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

  const proj = useMemo(() =>
    geoNaturalEarth1().fitSize([map.dm.w - 40, map.dm.h - 40], { type: "Sphere" } as GeoPermissibleObjects).translate([map.dm.w / 2, map.dm.h / 2]),
    [map.dm]
  );
  const pg = useMemo(() => geoPath(proj), [proj]);
  const gr = useMemo(() => geoGraticule10(), []);
  const pt = useCallback((la: number, ln: number) => proj([ln, la]) as [number, number] | null, [proj]);

  const arcs = useMemo(() => ROUTES.map(r => {
    if ('pts' in r) {
      const projected = r.pts.map(([la, ln]) => proj([ln, la])).filter(Boolean) as [number, number][];
      return line().curve(curveCardinal.tension(0.7))(projected);
    }
    const i = geoInterpolate([r.f[1], r.f[0]], [r.t[1], r.t[0]]);
    return line().curve(curveBasis)(Array.from({ length: 25 }, (_, j) => proj(i(j / 24)) as [number, number]));
  }), [proj]);

  const corridorFriction = useMemo(() => {
    if (!dis.items || dis.mode !== 'trade') return {};
    const cf: Record<string, FrictionLevel> = {};
    dis.items.forEach(d => {
      if ('corridor' in d && 'friction_level' in d) {
        const td = d as { corridor: string; friction_level: FrictionLevel };
        const rank: Record<string, number> = { Prohibitive: 4, High: 3, Moderate: 2, Low: 1, Free: 0 };
        if (!cf[td.corridor] || rank[td.friction_level] > (rank[cf[td.corridor]] || 0)) {
          cf[td.corridor] = td.friction_level;
        }
      }
    });
    return cf;
  }, [dis.items, dis.mode]);

  const vis = useMemo(() =>
    SITES.filter(s => fil.tF[s.type] && fil.rF[s.region] && (s.type !== 'mfg' || !s.bu || fil.buF[s.bu]))
      .sort((a, b) => (TYPE_CFG[b.type]?.pri || 9) - (TYPE_CFG[a.type]?.pri || 9)),
    [fil.tF, fil.rF, fil.buF]
  );

  const impact = useMemo(() => {
    if (dis.sel === null || !dis.items?.[dis.sel]) return null;
    return computeImpactWithGraph(dis.items[dis.sel], ROUTES, SUPPLY_GRAPH);
  }, [dis.sel, dis.items]);

  // Site clustering at low zoom — grid-based grouping for non-critical sites
  const clusters = useMemo(() => {
    if (map.zK >= 3) return null; // Only cluster at global zoom
    const cellSize = 40; // px grid cell size
    const cells: Record<string, { sites: typeof vis[number][]; cx: number; cy: number; count: number }> = {};
    const standalone: typeof vis[number][] = [];
    vis.forEach(s => {
      // Never cluster mfg or sis-aero sites — they're critical
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
    // Finalize centroids
    Object.values(cells).forEach(c => {
      c.cx /= c.count;
      c.cy /= c.count;
    });
    // Cells with only 1 site render as standalone
    const clusterList = Object.values(cells).filter(c => c.count > 1);
    const singletons = Object.values(cells).filter(c => c.count === 1).map(c => c.sites[0]);
    return { clusters: clusterList, standalone: [...standalone, ...singletons] };
  }, [vis, map.zK, pt]);

  // Affected sites from backend recommendations — sites with red ring/glow based on distance
  const recAffectedSites = useMemo(() => {
    const aff: Record<string, { distance_km: number; maxSeverity: string }> = {};
    Object.values(dis.recs).forEach(rec => {
      if (rec?.impact?.affected_sites) {
        rec.impact.affected_sites.forEach(s => {
          const prev = aff[s.name];
          if (!prev || s.distance_km < prev.distance_km) {
            aff[s.name] = { distance_km: s.distance_km, maxSeverity: rec.severity || 'Medium' };
          }
        });
      }
    });
    return aff;
  }, [dis.recs]);

  const exposureScores = useMemo(() => {
    if (!dis.items) return {};
    return computeExposureScores(dis.items, ROUTES, SUPPLY_GRAPH);
  }, [dis.items]);

  const kpi = useKpiData(dis.items);

  const inv = 1 / map.zK;
  const sr = Math.max(1, 3 * inv);
  const mr = Math.max(1.5, 4.5 * inv);
  const cs = Math.max(2, 5 * inv);
  const ha = !!(dis.items && dis.items.length > 0);
  const cc = dis.items ? dis.items.filter(d => getSev(d) === 'Critical').length : 0;

  void dis.impactView; // used in future phases

  return (
    <div style={{ fontFamily: F, background: '#060a12', color: '#c8d6e5', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* HEADER */}
      <HeaderBar dis={dis} fil={fil} vis={vis} ha={ha} cc={cc} />

      {/* SCAN PROGRESS BAR */}
      {(dis.loading || dis.scanPct > 0) && <div style={{ height: 2, background: '#0a1220', flexShrink: 0, overflow: 'hidden', position: 'relative', zIndex: 29 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: dis.scanPct + '%', background: '#2563eb', transition: 'width 0.3s ease-out' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: dis.scanPct + '%', background: 'linear-gradient(90deg,transparent 60%,#60a5fa,transparent)', animation: 'sc-scan-slide 2s ease-in-out infinite alternate', transition: 'width 0.3s ease-out' }} />
      </div>}

      {/* KPI STRIP */}
      {kpi && <KPIStrip kpi={kpi} mode={dis.mode} fil={fil} />}

      {/* RISK TIMELINE */}
      {kpi && <TimelineStrip dis={dis} kpi={kpi} mapWidth={map.dm.w} />}

      {/* FILTERS */}
      {fil.fO && <div style={{ background: '#080e1c', borderBottom: '1px solid #14243e', padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flexShrink: 0, zIndex: 25, animation: 'sfu 200ms ease both' }}>
        <span style={{ fontSize: 8, color: '#2a3d5c', fontWeight: 700, letterSpacing: 2, fontFamily: FM }}>TYPE</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{Object.entries(TYPE_CFG).map(([k, v]) => { const on = fil.tF[k]; return <button key={k} onClick={() => fil.setTF(p => ({ ...p, [k]: !p[k] }))} style={{ padding: '3px 8px', border: `1px solid ${on ? v.color + '44' : '#14243e'}`, borderRadius: 4, background: on ? v.color + '18' : 'transparent', color: on ? v.color : '#1e3050', fontSize: 10, cursor: 'pointer', fontWeight: on ? 600 : 400 }}>{v.label} <span style={{ fontFamily: FM, fontSize: 8, opacity: .5 }}>{typeCounts[k] || 0}</span></button>; })}</div>
        <div style={{ width: 1, height: 20, background: '#162040', margin: '0 4px' }} />
        <span style={{ fontSize: 8, color: '#2a3d5c', fontWeight: 700, letterSpacing: 2, fontFamily: FM }}>REGION</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{Object.entries(REGION_CFG).map(([k, v]) => { const on = fil.rF[k]; return <button key={k} onClick={() => fil.setRF(p => ({ ...p, [k]: !p[k] }))} style={{ padding: '3px 8px', border: `1px solid ${on ? v.color + '44' : '#14243e'}`, borderRadius: 4, background: on ? v.color + '18' : 'transparent', color: on ? v.color : '#1e3050', fontSize: 10, cursor: 'pointer', fontWeight: on ? 600 : 400 }}>{v.label} <span style={{ fontFamily: FM, fontSize: 8, opacity: .5, marginLeft: 4 }}>{regionCounts[k] || 0}</span></button>; })}</div>
        <div style={{ width: 1, height: 20, background: '#162040', margin: '0 4px' }} />
        <button onClick={() => fil.setSR(!fil.sR)} style={{ padding: '3px 8px', border: `1px solid ${fil.sR ? '#1a5f8a44' : '#14243e'}`, borderRadius: 4, background: fil.sR ? '#1a5f8a18' : 'transparent', color: fil.sR ? '#38bdf8' : '#1e3050', fontSize: 10, cursor: 'pointer' }}>Routes</button>
        <button onClick={() => fil.setSC(!fil.sC)} style={{ padding: '3px 8px', border: `1px solid ${fil.sC ? '#64748b44' : '#14243e'}`, borderRadius: 4, background: fil.sC ? '#64748b18' : 'transparent', color: fil.sC ? '#94a3b8' : '#1e3050', fontSize: 10, cursor: 'pointer' }}>Chokepoints</button>
        <button onClick={() => fil.setSSup(!fil.sSup)} style={{ padding: '3px 8px', border: `1px solid ${fil.sSup ? '#a78bfa44' : '#14243e'}`, borderRadius: 4, background: fil.sSup ? '#a78bfa18' : 'transparent', color: fil.sSup ? '#a78bfa' : '#1e3050', fontSize: 10, cursor: 'pointer' }}>Suppliers <span style={{ fontFamily: FM, fontSize: 8, opacity: 0.5 }}>5,090</span></button>
        <div style={{ width: 1, height: 20, background: '#162040', margin: '0 4px' }} />
        <span style={{ fontSize: 8, color: '#2a3d5c', fontWeight: 700, letterSpacing: 2, fontFamily: FM }}>DIVISION</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{Object.entries(BU_CFG).map(([k, v]) => { const on = fil.buF[k]; const cnt = SITES.filter(s => s.bu === k).length; return <button key={k} onClick={() => fil.setBuF(p => ({ ...p, [k]: !p[k] }))} style={{ padding: '3px 8px', border: `1px solid ${on ? v.color + '44' : '#14243e'}`, borderRadius: 4, background: on ? v.color + '18' : 'transparent', color: on ? v.color : '#1e3050', fontSize: 10, cursor: 'pointer', fontWeight: on ? 600 : 400 }}>{v.label} <span style={{ fontFamily: FM, fontSize: 8, opacity: .5 }}>{cnt}</span></button>; })}</div>
      </div>}

      {/* MAP */}
      <div ref={map.cR} style={{ flex: 1, position: 'relative', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }} onClick={(e) => { if (!(e.target as HTMLElement).closest?.('[data-click]')) { map.setSelSite(null); map.setSelRt(null); map.setSelSupC(null); dis.setScView(null); } }}>
        <svg ref={map.svgRef} width={map.dm.w} height={map.dm.h} style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}>
          <rect width={map.dm.w} height={map.dm.h} fill="#060a12" />
          <defs>
            <radialGradient id="bg"><stop offset="0%" stopColor="#0c1322" /><stop offset="100%" stopColor="#060a12" /></radialGradient>
            <filter id="gl"><feGaussianBlur stdDeviation="1.5" result="g" /><feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="g2"><feGaussianBlur stdDeviation="3" result="g" /><feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g ref={map.gR}>
            <path d={pg({ type: "Sphere" } as GeoPermissibleObjects) || ''} fill="url(#bg)" stroke="#162040" strokeWidth={.5} />
            <path d={pg(gr) || ''} fill="none" stroke="#0a1220" strokeWidth={.3} />

            {/* Countries */}
            {land?.features?.map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => {
              const isConflict = CONFLICT_ZONES.has(String(f.id));
              return <path key={i} d={pg(f.geometry) || ''} fill={isConflict ? '#1a1520' : '#111c2a'} stroke={isConflict ? '#2a1525' : '#1a2d45'} strokeWidth={.3} />;
            })}
            {/* Conflict zone overlay */}
            {land?.features?.filter((f: { id: string }) => CONFLICT_ZONES.has(String(f.id))).map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => (
              <path key={'cz' + i} d={pg(f.geometry) || ''} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeWidth={.4} strokeOpacity={0.15} />
            ))}
            {/* Country labels */}
            {land?.features?.map((f: { id: string; geometry: GeoPermissibleObjects }, i: number) => {
              const n = COUNTRY_NAMES[String(f.id)];
              if (!n) return null;
              const ov = CENTROID_OVERRIDES[String(f.id)];
              const p = ov ? proj(ov) : proj(geoCentroid(f.geometry));
              if (!p) return null;
              return <text key={'cl' + i} x={p[0]} y={p[1]} textAnchor="middle" fontSize={Math.max(2, 5 * inv)} fill="#2a4060" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.45} pointerEvents="none">{n}</text>;
            })}

            {/* Routes */}
            {fil.sR && arcs.map((d, i) => {
              const rt = ROUTES[i];
              const fLvl = corridorFriction[rt.corridor] as FrictionLevel | undefined;
              const isSea = rt.type === 'sea';
              const isImpacted = impact && impact.routes.includes(i);
              const fCol = fLvl ? FRIC[fLvl] : isSea ? '#38bdf8' : '#c084fc';
              const fOp = isImpacted ? 0.7 : (fLvl ? 0.5 : isSea ? 0.25 : 0.35);
              const fW = isImpacted ? Math.max(1, 2.5 * inv) : (fLvl ? Math.max(0.6, 1.5 * inv) : isSea ? Math.max(0.4, 1 * inv) : Math.max(0.3, 0.6 * inv));
              const dash = isSea ? `${Math.max(2, 4 * inv)},${Math.max(1.5, 3 * inv)}` : `${Math.max(0.5, 1 * inv)},${Math.max(0.5, 1 * inv)}`;
              return <g key={'r' + i}>
                <path d={d || ''} fill="none" stroke="transparent" strokeWidth={Math.max(6, 12 * inv)} data-click="1" onClick={(e) => { const rect = map.cR.current!.getBoundingClientRect(); map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top }); map.setSelRt(map.selRt === i ? null : i); map.setSelSite(null); map.setSelSupC(null); }} style={{ cursor: 'pointer' }} />
                <path d={d || ''} fill="none" stroke={fCol} strokeWidth={fW} strokeOpacity={fOp} strokeDasharray={dash} pointerEvents="none">
                  <animate attributeName="stroke-dashoffset" values={`${Math.max(7, 14 * inv)};0`} dur={isSea ? "4s" : "2.5s"} repeatCount="indefinite" />
                </path>
              </g>;
            })}

            {/* Port labels */}
            {fil.sR && PORTS.map((p, i) => { const pp = pt(p.la, p.ln); return pp && <g key={'pt' + i}>
              <circle cx={pp[0]} cy={pp[1]} r={Math.max(1, 2 * inv)} fill="#1a5f8a" stroke="#38bdf8" strokeWidth={Math.max(0.2, 0.4 * inv)} opacity={0.7} />
              <text x={pp[0] + Math.max(2, 3.5 * inv)} y={pp[1] + Math.max(0.5, 1 * inv)} fontSize={Math.max(2.5, 6 * inv)} fill="#2a6090" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.8}>{p.n}</text>
            </g>; })}

            {/* Airport labels */}
            {fil.sR && AIRPORTS.map((a, i) => { const ap = pt(a.la, a.ln); return ap && <g key={'ap' + i}>
              <rect x={ap[0] - Math.max(0.5, 1 * inv)} y={ap[1] - Math.max(0.5, 1 * inv)} width={Math.max(1, 2 * inv)} height={Math.max(1, 2 * inv)} rx={Math.max(0.2, 0.3 * inv)} fill="#c084fc" opacity={.6} />
              <text x={ap[0] + Math.max(2, 3.5 * inv)} y={ap[1] + Math.max(0.5, 1 * inv)} fontSize={Math.max(2.5, 6 * inv)} fill="#7c3aed" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.8}>{a.n}</text>
            </g>; })}

            {/* Chokepoints */}
            {fil.sC && CHOKEPOINTS.map((c, i) => { const p = pt(c.la, c.ln); return p && <g key={'c' + i}>
              <polygon points={`${p[0]},${p[1] - cs} ${p[0] + cs * .75},${p[1]} ${p[0]},${p[1] + cs} ${p[0] - cs * .75},${p[1]}`} fill="#1e2d44" stroke="#3a506c" strokeWidth={Math.max(.15, .4 * inv)} opacity={.8} />
              <text x={p[0]} y={p[1] - cs - Math.max(1.5, 2.5 * inv)} textAnchor="middle" fontSize={Math.max(2.5, 7 * inv)} fill="#2a4060" fontWeight={500} fontFamily="DM Sans,sans-serif">{c.n}</text>
            </g>; })}

            {/* Supplier bubbles — hidden at zoom < 4x (too small), viewport-culled at zoom >= 4x */}
            {fil.sSup && map.zK >= 4 && (() => {
              // Compute viewport bounds in projected coordinates for culling
              const zt = map.zR.current;
              const vpLeft = -zt.x / zt.k;
              const vpTop = -zt.y / zt.k;
              const vpRight = (map.dm.w - zt.x) / zt.k;
              const vpBottom = (map.dm.h - zt.y) / zt.k;
              const pad = 40 * inv; // padding so circles near edge aren't clipped
              return SUPPLIERS.map((s, i) => {
                const p = pt(s.lat, s.lng); if (!p) return null;
                // Viewport culling — skip suppliers outside visible area
                if (p[0] < vpLeft - pad || p[0] > vpRight + pad || p[1] < vpTop - pad || p[1] > vpBottom + pad) return null;
                const r = Math.max(2, (Math.sqrt(s.n / maxSup) * 30)) * inv;
                const ih = map.hSup === i;
                const isAff = impact && impact.suppliers.includes(s.country);
                return <g key={'sup' + i} onMouseEnter={() => map.setHSup(i)} onMouseLeave={() => map.setHSup(null)} data-click="1" onClick={(e) => { const rect = map.cR.current!.getBoundingClientRect(); map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top }); map.setSelSupC(map.selSupC === i ? null : i); map.setSelSite(null); map.setSelRt(null); dis.setSupExpand({}); }} style={{ cursor: 'pointer' }}>
                  <circle cx={p[0]} cy={p[1]} r={r} fill={isAff ? "#ef4444" : "#a78bfa"} fillOpacity={isAff ? 0.2 : (ih ? 0.25 : 0.12)} stroke={isAff ? "#ef4444" : "#a78bfa"} strokeWidth={Math.max(0.3, (isAff ? 1.2 : 0.8) * inv)} strokeOpacity={isAff ? 0.6 : (ih ? 0.6 : 0.3)} />
                  {(ih || isAff) && <circle cx={p[0]} cy={p[1]} r={r + Math.max(2, 4 * inv)} fill="none" stroke={isAff ? "#ef4444" : "#a78bfa"} strokeWidth={Math.max(0.2, 0.4 * inv)} strokeOpacity={0.3} />}
                </g>;
              });
            })()}

            {/* Sites — clustered at global zoom (< 3x), individual at higher zoom */}
            {(() => {
              const renderSite = (s: typeof vis[number], i: number) => {
                const p = pt(s.lat, s.lng); if (!p) return null;
                const c = TYPE_CFG[s.type] || TYPE_CFG.other;
                const ih = map.hS === i;
                const bo = (s.type === 'sales' || s.type === 'other') ? 0.5 : 0.85;
                const r = (c.shape === 'tri' || c.shape === 'star' || c.shape === 'dia') ? mr : sr;
                const sc = (s.bu && BU_CFG[s.bu]) ? BU_CFG[s.bu].color : c.color;
                const exp = s.type === 'mfg' ? exposureScores[s.name] : null;
                const expC = exp ? SEV[exp.level] || '#64748b' : null;
                return <g key={'s' + i} data-click="1" onMouseEnter={() => map.setHS(i)} onMouseLeave={() => map.setHS(null)} onClick={(e) => { const rect = map.cR.current!.getBoundingClientRect(); map.setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top }); map.setSelSite(map.selSite === i ? null : i); map.setSelRt(null); map.setSelSupC(null); dis.setScView(map.selSite === i ? null : s.name); }} style={{ cursor: 'pointer' }}>
                  {ih && <circle cx={p[0]} cy={p[1]} r={r * 2.5} fill={sc} opacity={.1} />}
                  {impact && s.type === 'mfg' && impact.factories.includes(s.name) && <>
                    <circle cx={p[0]} cy={p[1]} r={r * 3} fill="none" stroke="#ef4444" strokeWidth={Math.max(.4, 1 * inv)} opacity={.5} strokeDasharray={`${Math.max(1, 2 * inv)},${Math.max(.5, 1 * inv)}`} />
                    <circle cx={p[0]} cy={p[1]} r={r * 2} fill="#ef4444" opacity={.08} />
                  </>}
                  {recAffectedSites[s.name] && !impact?.factories.includes(s.name) && (() => {
                    const aff = recAffectedSites[s.name];
                    const proximity = Math.max(0, 1 - aff.distance_km / 2000);
                    const ringR = r * (2 + proximity * 2);
                    const ringOpacity = 0.2 + proximity * 0.4;
                    const glowR = ringR + Math.max(1, 3 * inv);
                    return <>
                      <circle cx={p[0]} cy={p[1]} r={glowR} fill="#ef4444" opacity={proximity * 0.06} />
                      <circle cx={p[0]} cy={p[1]} r={ringR} fill="none" stroke="#ef4444" strokeWidth={Math.max(.4, (0.6 + proximity) * inv)} opacity={ringOpacity} strokeDasharray={`${Math.max(1.5, 3 * inv)},${Math.max(1, 2 * inv)}`}>
                        <animate attributeName="stroke-opacity" values={`${ringOpacity};${ringOpacity * 0.4};${ringOpacity}`} dur="3s" repeatCount="indefinite" />
                      </circle>
                    </>;
                  })()}
                  <SiteShape shape={c.shape} x={p[0]} y={p[1]} r={r} sr={sr} color={sc} ih={ih} bo={impact && s.type === 'mfg' && impact.factories.includes(s.name) ? 1 : bo} inv={inv} />
                  {exp && <circle cx={p[0] + r} cy={p[1] - r} r={Math.max(1.5, 3 * inv)} fill={expC!} opacity={.9} />}
                </g>;
              };

              if (clusters) {
                // Clustered mode: render standalone sites + cluster badges
                return <>
                  {clusters.standalone.map((s) => {
                    const origIdx = vis.indexOf(s);
                    return renderSite(s, origIdx);
                  })}
                  {clusters.clusters.map((cl, ci) => {
                    const cr = Math.max(6, 12 * inv);
                    return <g key={'cl' + ci} data-click="1" style={{ cursor: 'pointer' }}
                      onClick={() => {
                        // Zoom into this cluster region
                        if (!map.svgRef.current || !map.gR.current) return;
                        const targetK = 4;
                        const tx = map.dm.w / 2 - cl.cx * targetK;
                        const ty = map.dm.h / 2 - cl.cy * targetK;
                        // Animate the transform directly and update state
                        const g = select(map.gR.current);
                        g.transition().duration(600).ease(easeCubicOut)
                          .attr('transform', `translate(${tx},${ty}) scale(${targetK})`);
                        // Update zoom state so React re-renders with new zoom level
                        map.zR.current = { k: targetK, x: tx, y: ty };
                        setTimeout(() => map.setZK(targetK), 50);
                        // Sync D3 zoom state so scroll/pan continues from new position
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (map.svgRef.current as any).__zoom = zoomIdentity.translate(tx, ty).scale(targetK);
                      }}>
                      <circle cx={cl.cx} cy={cl.cy} r={cr + 2} fill="#14243e" opacity={.6} />
                      <circle cx={cl.cx} cy={cl.cy} r={cr} fill="#1e3a5c" stroke="#3b82f6" strokeWidth={Math.max(.5, 1 * inv)} opacity={.85} />
                      <text x={cl.cx} y={cl.cy + Math.max(1.5, 3.5 * inv)} textAnchor="middle" fontSize={Math.max(4, 9 * inv)} fill="#60a5fa" fontWeight={700} fontFamily="JetBrains Mono,monospace" pointerEvents="none">{cl.count}</text>
                    </g>;
                  })}
                </>;
              }
              // Normal mode: render all sites individually
              return vis.map((s, i) => renderSite(s, i));
            })()}

            {/* Supply chain overlay */}
            {dis.scView && SUPPLY_GRAPH[dis.scView] && (() => {
              const graph = SUPPLY_GRAPH[dis.scView];
              const site = SITES.find(s => s.name === dis.scView);
              if (!site) return null;
              const sp = pt(site.lat, site.lng);
              if (!sp) return null;
              return <g opacity={.6}>
                {graph.sup.map((country, ci) => {
                  const sup = SUPPLIERS.find(s => s.country === country);
                  if (!sup) return null;
                  const cp = pt(sup.lat, sup.lng);
                  if (!cp) return null;
                  return <g key={'sc' + ci}>
                    <line x1={cp[0]} y1={cp[1]} x2={sp[0]} y2={sp[1]} stroke="#22c55e" strokeWidth={Math.max(.4, 1.2 * inv)} strokeDasharray={`${Math.max(2, 4 * inv)},${Math.max(1, 2 * inv)}`} opacity={.4} />
                    <circle cx={cp[0]} cy={cp[1]} r={Math.max(2, 4 * inv)} fill="#22c55e" opacity={.3} />
                  </g>;
                })}
                <circle cx={sp[0]} cy={sp[1]} r={Math.max(3, 6 * inv)} fill="none" stroke="#22c55e" strokeWidth={Math.max(.5, 1.5 * inv)} opacity={.7} />
              </g>;
            })()}

            {/* Disruption-to-site impact lines — visible when an event is selected */}
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
                return <g key={'imp-line-' + fi} style={{ opacity: 0.5, transition: 'opacity 0.3s ease-in' }}>
                  <line
                    x1={dp[0]} y1={dp[1]} x2={sp[0]} y2={sp[1]}
                    stroke="#ef4444"
                    strokeWidth={Math.max(0.5, 1.2 * inv)}
                    strokeDasharray={`${dashLen},${gapLen}`}
                    strokeLinecap="round"
                  >
                    <animate attributeName="stroke-dashoffset" values={`${totalDash * 2};0`} dur="1.5s" repeatCount="indefinite" />
                  </line>
                  {map.zK > 2 && <text
                    x={mx} y={my - Math.max(1, 2 * inv)}
                    textAnchor="middle"
                    fontSize={Math.max(3, 7 * inv)}
                    fill="#2a3d5c"
                    fontFamily="DM Sans,sans-serif"
                    fontWeight={500}
                    pointerEvents="none"
                  >{fname}</text>}
                </g>;
              });
            })()}

            {/* Disruption markers */}
            {dis.items?.map((d, i) => {
              const lat = 'lat' in d ? d.lat : undefined;
              const lng = 'lng' in d ? d.lng : undefined;
              if (!lat || !lng) return null;
              if (fil.sevFilter && getSev(d) !== fil.sevFilter) return null;
              const p = pt(lat as number, lng as number);
              if (!p) return null;
              const sv = getSev(d);
              const co = SEV[sv] || '#eab308';
              const is = dis.sel === i;
              const pc = sv === 'Critical' ? 'spc' : sv === 'High' ? 'sph' : sv === 'Medium' ? 'spm' : 'spl';
              const du = sv === 'Critical' ? '1.5s' : sv === 'High' ? '2.5s' : '3.5s';
              const cr = Math.max(2, 4.5 * inv);
              return <g key={'d' + i} data-click="1" onClick={e => { e.stopPropagation(); dis.setSel(is ? null : i); if (!dis.dOpen) { dis.setDOpen(true); dis.setDClosing(false); } }} onMouseEnter={() => map.setHD(i)} onMouseLeave={() => map.setHD(null)} style={{ cursor: 'pointer' }}>
                <circle cx={p[0]} cy={p[1]} fill="none" stroke={co} strokeWidth={Math.max(.5, 1.5 * inv)} opacity={.4} style={{ animation: `${pc} ${du} ease-in-out infinite` }} />
                {sv === 'Critical' && <circle cx={p[0]} cy={p[1]} fill="none" stroke={co} strokeWidth={Math.max(.3, .8 * inv)} opacity={.2} style={{ animation: `${pc} ${du} ease-in-out infinite`, animationDelay: '.75s' }} />}
                <circle cx={p[0]} cy={p[1]} r={cr} fill={co} stroke={is ? '#fff' : '#000'} strokeWidth={is ? Math.max(1, 2 * inv) : Math.max(.5, inv)} filter="url(#g2)" />
                {is && <circle cx={p[0]} cy={p[1]} r={cr * 2.2} fill="none" stroke="#fff" strokeWidth={Math.max(.3, .8 * inv)} strokeDasharray={`${Math.max(1, 3 * inv)},${Math.max(1, 2 * inv)}`} opacity={.5} />}
              </g>;
            })}
          </g>

          {/* Legend */}
          <g transform={`translate(14,${map.dm.h - 138})`}>
            <rect x={0} y={0} width={120} height={132} rx={8} fill="#080e1cdd" stroke="#14243e" strokeWidth={.8} />
            <polygon points="14,16 18,12 22,16" fill={TYPE_CFG.mfg.color} /><text x={30} y={16} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Manufacturing</text>
            <rect x={14.5} y={24.5} width={6} height={6} rx={1} fill={TYPE_CFG.log.color} transform="rotate(45,17.5,27.5)" /><text x={30} y={30} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Logistics</text>
            <rect x={14} y={38} width={7} height={7} rx={1.5} fill={TYPE_CFG.admin.color} /><text x={30} y={44} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Admin/HQ</text>
            <circle cx={18} cy={56} r={2.5} fill={TYPE_CFG.sales.color} /><text x={30} y={59} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Sales/Other</text>
            <line x1={10} y1={70} x2={26} y2={70} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="4,3" opacity={.5} /><text x={30} y={73} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Sea Lane</text>
            <line x1={10} y1={84} x2={26} y2={84} stroke="#c084fc" strokeWidth={0.8} strokeDasharray="1.5,1.5" opacity={.6} /><text x={30} y={87} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Air Lane</text>
            <circle cx={18} cy={98} r={3} fill="#ef4444" opacity={.8} /><circle cx={18} cy={98} r={6} fill="none" stroke="#ef4444" strokeWidth={.8} opacity={.3} /><text x={30} y={101} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Disruption</text>
            <circle cx={18} cy={114} r={5} fill="#a78bfa" fillOpacity={.15} stroke="#a78bfa" strokeWidth={.6} strokeOpacity={.4} /><text x={30} y={117} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Suppliers</text>
          </g>
          <text x={map.dm.w - 14} y={map.dm.h - 10} textAnchor="end" fontSize={8} fill="#14243e" fontFamily="DM Sans">Scroll to zoom {'\u00b7'} Drag to pan</text>
        </svg>

        {/* Site tooltip */}
        {map.hS !== null && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
          const s = vis[map.hS]; if (!s) return null;
          const p = pt(s.lat, s.lng); if (!p) return null;
          const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 200);
          const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 44, 8);
          return <SiteTooltip site={s} tx={tx} ty={ty} />;
        })()}

        {/* Disruption tooltip */}
        {map.hD !== null && dis.sel !== map.hD && dis.items && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
          const d = dis.items[map.hD]; if (!d || !('lat' in d) || !('lng' in d)) return null;
          const p = pt(d.lat as number, d.lng as number); if (!p) return null;
          const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 260);
          const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 56, 8);
          return <DisruptionTooltip item={d} mode={dis.mode} tx={tx} ty={ty} />;
        })()}

        {/* Supplier tooltip */}
        {map.hSup !== null && fil.sSup && map.selSite === null && map.selRt === null && map.selSupC === null && (() => {
          const s = SUPPLIERS[map.hSup]; if (!s) return null;
          const p = pt(s.lat, s.lng); if (!p) return null;
          const tx = Math.min(p[0] * map.zR.current.k + map.zR.current.x + 14, map.dm.w - 240);
          const ty = Math.max(p[1] * map.zR.current.k + map.zR.current.y - 56, 8);
          return <SupplierTooltip supplier={s} tx={tx} ty={ty} />;
        })()}

        {/* CLICK POPUPS */}
        {map.selSite !== null && (() => {
          const s = vis[map.selSite]; if (!s) return null;
          const tx = Math.min(map.clickPos.x + 12, map.dm.w - 310);
          const ty = Math.max(map.clickPos.y - 20, 8);
          return <div data-click="1" style={{ position: 'absolute', left: tx, top: ty, zIndex: 22, background: '#080e1cf0', border: '1px solid #1e3a5c', borderRadius: 10, padding: '14px 16px', boxShadow: '0 12px 40px rgba(0,0,0,.7)', backdropFilter: 'blur(16px)', width: 290, maxHeight: 440, overflow: 'auto' }} className="sc-s">
            <SitePopup site={s} exposureScore={exposureScores[s.name]} onClose={() => { map.setSelSite(null); dis.setScView(null); }} supExpand={dis.supExpand} setSupExpand={dis.setSupExpand} />
          </div>;
        })()}

        {map.selRt !== null && (() => {
          const rt = ROUTES[map.selRt]; if (!rt) return null;
          const tx = Math.min(map.clickPos.x + 12, map.dm.w - 300);
          const ty = Math.max(map.clickPos.y - 20, 8);
          const fLvl = corridorFriction[rt.corridor] as FrictionLevel | undefined;
          const tradeEvent = dis.items && dis.mode === 'trade' ? dis.items.find(d => 'corridor' in d && (d as { corridor: string }).corridor === rt.corridor) : null;
          return <div data-click="1" style={{ position: 'absolute', left: tx, top: ty, zIndex: 22, background: '#080e1cf0', border: '1px solid #1e3a5c', borderRadius: 10, padding: '14px 16px', boxShadow: '0 12px 40px rgba(0,0,0,.7)', backdropFilter: 'blur(16px)', width: 290 }}>
            <RoutePopup route={rt} frictionLevel={fLvl} tradeEvent={tradeEvent || null} onClose={() => map.setSelRt(null)} />
          </div>;
        })()}

        {map.selSupC !== null && (() => {
          const s = SUPPLIERS[map.selSupC]; if (!s) return null;
          const tx = Math.min(map.clickPos.x + 12, map.dm.w - 290);
          const ty = Math.max(map.clickPos.y - 20, 8);
          return <div data-click="1" style={{ position: 'absolute', left: tx, top: ty, zIndex: 22, background: '#080e1cf0', border: '1px solid #a78bfa33', borderRadius: 10, padding: '14px 16px', boxShadow: '0 12px 40px rgba(0,0,0,.7)', backdropFilter: 'blur(16px)', width: 290, maxHeight: 420, overflow: 'auto' }} className="sc-s">
            <SupplierPopup supplier={s} supExpand={dis.supExpand} setSupExpand={dis.setSupExpand} onClose={() => { map.setSelSupC(null); dis.setSupExpand({}); }} />
          </div>;
        })()}

        {/* Empty state */}
        {!dis.items && !dis.loading && !dis.error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 48, marginBottom: 10, opacity: .3 }}>{'\ud83d\udef0\ufe0f'}</div>
          <p style={{ color: '#1e3050', fontSize: 15, fontWeight: 600, margin: 0 }}>Ready to scan</p>
          <p style={{ color: '#14243e', fontSize: 11, margin: '4px 0 0', fontFamily: FM }}>{SITES.length} sites {'\u00b7'} {countryCount} countries</p>
        </div>}

        {/* RIGHT DRAWER */}
        <DrawerPanel dis={dis} fil={fil} />
      </div>

      {/* Keyboard shortcut help button */}
      <button
        onClick={kb.toggleHelp}
        title="Keyboard shortcuts (?)"
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 50,
          width: 28, height: 28, borderRadius: 6,
          background: '#0a1220', border: '1px solid #14243e',
          color: '#4a6080', fontSize: 14, fontWeight: 700, fontFamily: FM,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color .15s, border-color .15s',
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = '#c8d6e5'; (e.target as HTMLElement).style.borderColor = '#1e3a5c'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = '#4a6080'; (e.target as HTMLElement).style.borderColor = '#14243e'; }}
      >
        ?
      </button>

      {/* Keyboard shortcuts overlay */}
      <KeyboardShortcuts open={kb.showHelp} onClose={kb.closeHelp} />
    </div>
  );
}
