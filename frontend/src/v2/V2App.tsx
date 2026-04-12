/**
 * V2App — Main integration component for the V2 UI.
 *
 * Wires all shared hooks, derived data, and v2 components into a single
 * application entry point with full feature parity with v1.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { GLOBAL_CSS } from "../styles";
import {
  SITES, TYPE_CFG, REGION_CFG, BU_CFG,
  SEV, FRIC, GEO_URL, CONFLICT_ZONES, F, FM,
  CHOKEPOINTS, PORTS, AIRPORTS, ROUTES,
  SUPPLIERS, maxSup, SUPPLY_GRAPH,
  typeCounts, regionCounts, countryCount,
} from "../data";
import { topoToGeo } from "../utils/geo";
import { computeImpactWithGraph, computeExposureScores } from "../utils/impact";
import { eventId } from "../utils/format";
import { getSev } from "../utils/scan";
import type { FrictionLevel, SiteSuppliersResponse } from "../types";
import { fetchSiteSuppliers, fetchSupplierSpendByCountry } from "../services/api";
import type { SupplierCountrySpend } from "../services/api";
import { useMapState } from "../hooks/useMapState";
import { useDisruptionState } from "../hooks/useDisruptionState";
import { useFilterState } from "../hooks/useFilterState";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { KeyboardShortcuts } from "../components/KeyboardShortcuts";
import { useViewport } from "../hooks/useMediaQuery";
import { useKpiData } from "../components/KPIStrip";
import type { GeoPermissibleObjects } from "d3";
import type { ScanMode } from "../types";

// V2 components
import { V2ThemeProvider } from "./ThemeProvider";
import { useTheme } from "./theme";
import { Shell } from "./layout/Shell";
import { Header } from "./layout/Header";
import { HeroStrip } from "./components/HeroStrip";
import { KPIBar } from "./components/KPIBar";
import { EventPanel } from "./components/EventPanel";
import { ExecPanel } from "./components/ExecPanel";
import { MapCanvas } from "./components/MapCanvas";
import { FilterBar } from "./components/FilterBar";
import { TimelineStrip } from "./components/TimelineStrip";
import { VersionToggle } from "./VersionToggle";

interface V2AppProps {
  version: 'v1' | 'v2' | 'v3';
  onVersionChange: (v: 'v1' | 'v2' | 'v3') => void;
}

/** Inner component that uses theme context */
function V2AppInner({ version, onVersionChange }: V2AppProps) {
  const { theme, toggleTheme } = useTheme();

  // ── Shared hooks ──────────────────────────────────────────────────
  const map = useMapState();
  const dis = useDisruptionState();
  const fil = useFilterState();
  const kb = useKeyboardShortcuts({ dis, fil });
  const viewport = useViewport();

  // ── Local state ───────────────────────────────────────────────────
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [land, setLand] = useState<{
    type: string;
    features: Array<{
      id: string;
      geometry: GeoPermissibleObjects;
      properties: Record<string, unknown>;
    }>;
  } | null>(null);
  const [spendByCountry, setSpendByCountry] = useState<Record<string, SupplierCountrySpend> | null>(null);

  // ── CSS injection ─────────────────────────────────────────────────
  useEffect(() => {
    const id = 'sc-mon-css';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
  }, []);

  // ── Auto-load disruptions on mount ────────────────────────────────
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

  // ── Auto-open drawer with top Critical event ──────────────────────
  const autoOpenFired = useRef(false);
  useEffect(() => {
    if (autoOpenFired.current || !dis.items?.length) return;
    const critIdx = dis.items.findIndex(d => getSev(d) === 'Critical');
    if (critIdx >= 0) {
      autoOpenFired.current = true;
      dis.setDOpen(true);
      setRightOpen(true);
      dis.setSel(critIdx);
    }
  }, [dis.items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch recommendations when card selected ──────────────────────
  useEffect(() => {
    if (dis.sel !== null && dis.items) {
      const d = dis.items[dis.sel];
      if (d) {
        const eid = eventId(d as { event?: string; risk?: string; region?: string });
        if (dis.mode === 'disruptions' && d && 'id' in d) {
          dis.loadRecs((d as { id: string }).id);
        } else {
          dis.loadRecs(eid);
        }
      }
    }
  }, [dis.sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch supplier data when factory site selected ────────────────
  const supplierCache = useRef<Record<string, SiteSuppliersResponse>>({});
  useEffect(() => {
    if (map.selSite === null) {
      map.setSiteSuppliers(null);
      map.setSiteSuppliersLoading(false);
      return;
    }
    const site = vis[map.selSite];
    if (!site || site.type !== 'mfg') {
      map.setSiteSuppliers(null);
      return;
    }
    if (supplierCache.current[site.name]) {
      map.setSiteSuppliers(supplierCache.current[site.name]);
      return;
    }
    const abortCtrl = new AbortController();
    map.setSiteSuppliersLoading(true);
    fetchSiteSuppliers(site.name, abortCtrl.signal).then(data => {
      if (!abortCtrl.signal.aborted) {
        if (data) supplierCache.current[site.name] = data;
        map.setSiteSuppliers(data);
        map.setSiteSuppliersLoading(false);
      }
    });
    return () => { abortCtrl.abort(); };
  }, [map.selSite]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch supplier spend by country ───────────────────────────────
  useEffect(() => {
    fetchSupplierSpendByCountry().then(data => {
      if (data) setSpendByCountry(data);
    });
  }, []);

  // ── Load world map GeoJSON ────────────────────────────────────────
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then(t => setLand(topoToGeo(t, 'countries')))
      .catch(() => {});
  }, []);

  // ── Computed: visible sites ───────────────────────────────────────
  const vis = useMemo(
    () =>
      SITES.filter(
        s => fil.tF[s.type] && fil.rF[s.region] && (s.type !== 'mfg' || !s.bu || fil.buF[s.bu])
      ).sort((a, b) => (TYPE_CFG[b.type]?.pri || 9) - (TYPE_CFG[a.type]?.pri || 9)),
    [fil.tF, fil.rF, fil.buF]
  );

  // ── Computed: impact for selected event ───────────────────────────
  const impact = useMemo(() => {
    if (dis.sel === null || !dis.items?.[dis.sel]) return null;
    return computeImpactWithGraph(dis.items[dis.sel], ROUTES, SUPPLY_GRAPH);
  }, [dis.sel, dis.items]);

  // ── Computed: corridor friction from trade items ──────────────────
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

  // ── Computed: site clustering at low zoom ─────────────────────────
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
      // Simple equirectangular approximation for clustering (MapCanvas handles actual D3 projection)
      const x = (s.lng + 180) * (map.dm.w / 360);
      const y = (90 - s.lat) * (map.dm.h / 180);
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      const key = `${gx}_${gy}`;
      if (!cells[key]) cells[key] = { sites: [], cx: 0, cy: 0, count: 0 };
      cells[key].sites.push(s);
      cells[key].cx += x;
      cells[key].cy += y;
      cells[key].count++;
    });
    Object.values(cells).forEach(c => {
      c.cx /= c.count;
      c.cy /= c.count;
    });
    const clusterList = Object.values(cells).filter(c => c.count > 1);
    const singletons = Object.values(cells).filter(c => c.count === 1).map(c => c.sites[0]);
    return { clusters: clusterList, standalone: [...standalone, ...singletons] };
  }, [vis, map.zK, map.dm]);

  // ── Computed: affected sites from selected event's recs ───────────
  const recAffectedSites = useMemo(() => {
    const aff: Record<string, { distance_km: number; maxSeverity: string }> = {};
    if (dis.sel === null || !dis.items?.[dis.sel]) return aff;
    const selId = eventId(dis.items[dis.sel]);
    const rec = dis.recs[selId];
    if (rec?.impact?.affected_sites) {
      rec.impact.affected_sites.forEach(s => {
        aff[s.name] = { distance_km: s.distance_km, maxSeverity: rec.severity || 'Medium' };
      });
    }
    return aff;
  }, [dis.sel, dis.items, dis.recs]);

  // ── Computed: exposure scores ─────────────────────────────────────
  const exposureScores = useMemo(() => {
    if (!dis.items) return {};
    return computeExposureScores(dis.items, ROUTES, SUPPLY_GRAPH);
  }, [dis.items]);

  // ── Computed: KPI data ────────────────────────────────────────────
  const kpi = useKpiData(dis.items);

  // ── Derived values ────────────────────────────────────────────────
  const ha = !!(dis.items && dis.items.length > 0);
  const cc = dis.items ? dis.items.filter(d => getSev(d) === 'Critical').length : 0;
  const currentMode = (dis.mode || 'disruptions') as 'disruptions' | 'trade' | 'geopolitical';

  // ── Handlers ──────────────────────────────────────────────────────
  const handleModeChange = useCallback(async (mode: string) => {
    dis.setMode(mode as ScanMode);
    const loaded = await dis.loadLatest(mode as ScanMode);
    if (!loaded) dis.scan(mode as ScanMode);
  }, [dis]);

  const handleScan = useCallback(() => {
    if (!dis.loading) {
      dis.scan(currentMode);
    }
  }, [dis, currentMode]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <Shell
        header={
          <Header
            mode={currentMode}
            onModeChange={handleModeChange}
            onScan={handleScan}
            scanning={dis.loading}
            scanPct={dis.scanPct}
            filterOpen={fil.fO}
            onFilterToggle={() => fil.setFO((prev: boolean) => !prev)}
            hasData={ha}
            criticalCount={cc}
          />
        }
        heroStrip={
          kpi ? (
            <>
              <HeroStrip
                kpi={{
                  sevCounts: kpi.sevCounts,
                  affectedMfgSites: kpi.affectedMfgSites,
                  affectedSuppliers: kpi.affectedSuppliers,
                  trend: kpi.trend as 'escalating' | 'improving' | 'stable',
                }}
                mode={dis.mode || 'disruptions'}
                fil={fil}
              />
              <KPIBar
                kpi={{
                  sevCounts: kpi.sevCounts,
                  affectedMfgSites: kpi.affectedMfgSites,
                  affectedSuppliers: kpi.affectedSuppliers,
                  trend: kpi.trend,
                }}
                mode={dis.mode || 'disruptions'}
              />
              <TimelineStrip dis={dis} kpi={kpi} width={map.dm.w} />
            </>
          ) : undefined
        }
        filterBar={fil.fO ? <FilterBar fil={fil} /> : undefined}
        leftPanel={
          <ExecPanel
            dis={dis}
            open={leftOpen}
            onToggle={() => setLeftOpen(o => !o)}
          />
        }
        center={
          <MapCanvas
            map={map}
            dis={dis}
            fil={fil}
            vis={vis}
            impact={impact}
            land={land}
            corridorFriction={corridorFriction as Record<string, string>}
            clusters={clusters}
            recAffectedSites={recAffectedSites}
            exposureScores={exposureScores as Record<string, { level: string; score: number }>}
            spendByCountry={spendByCountry}
          />
        }
        rightPanel={
          <EventPanel dis={dis} fil={fil} viewport={viewport} />
        }
        leftOpen={leftOpen}
        onLeftToggle={() => setLeftOpen(o => !o)}
        rightOpen={rightOpen}
        onRightToggle={() => setRightOpen(o => !o)}
        scanProgress={dis.loading ? dis.scanPct : undefined}
      />

      {/* Version toggle pill */}
      <VersionToggle version={version} />

      {/* Keyboard shortcuts overlay */}
      <KeyboardShortcuts open={kb.showHelp} onClose={kb.closeHelp} />

      {/* Keyboard shortcut help button */}
      <button
        onClick={kb.toggleHelp}
        title="Keyboard shortcuts (?)"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 50,
          width: 28,
          height: 28,
          borderRadius: 6,
          background: theme.bg.secondary,
          border: `1px solid ${theme.border.subtle}`,
          color: theme.text.muted,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: FM,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color .15s, border-color .15s',
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.color = theme.text.secondary;
          (e.target as HTMLElement).style.borderColor = theme.border.default;
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.color = theme.text.muted;
          (e.target as HTMLElement).style.borderColor = theme.border.subtle;
        }}
      >
        ?
      </button>
    </>
  );
}

/** V2App — wrapped in theme provider */
export function V2App(props: V2AppProps) {
  return (
    <V2ThemeProvider>
      <V2AppInner {...props} />
    </V2ThemeProvider>
  );
}
