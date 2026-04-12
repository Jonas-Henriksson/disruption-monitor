import { useState, useEffect, useCallback } from "react";
import { TYPE_CFG, REGION_CFG, BU_CFG } from "../data";
import type { Severity } from "../types";

const LS_FILTERS_KEY = 'sc-hub-filters';

interface PersistedFilters {
  tF?: Record<string, boolean>;
  buF?: Record<string, boolean>;
  rF?: Record<string, boolean>;
  sR?: boolean;
  sC?: boolean;
  fO?: boolean;
  sSup?: boolean;
  sevFilter?: Severity | null;
  groupBy?: 'severity' | 'region';
  assignFilter?: string | null;
}

function loadFilters(): PersistedFilters | null {
  try {
    const raw = localStorage.getItem(LS_FILTERS_KEY);
    if (raw) return JSON.parse(raw) as PersistedFilters;
  } catch { /* localStorage unavailable or corrupt */ }
  return null;
}

function saveFilters(filters: PersistedFilters): void {
  try {
    localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(filters));
  } catch { /* localStorage unavailable */ }
}

/** Filter state: type, BU, region, layer toggles, severity/group/assign filters */
export function useFilterState() {
  // Default: show mfg, log, admin; hide va, service, sales, other
  const HIDDEN_BY_DEFAULT = new Set(['va', 'service', 'sales', 'other']);
  const saved = loadFilters();

  const [tF, setTF] = useState(() => {
    if (saved?.tF) return saved.tF;
    const f: Record<string, boolean> = {};
    Object.keys(TYPE_CFG).forEach(k => f[k] = !HIDDEN_BY_DEFAULT.has(k));
    return f;
  });
  const [buF, setBuF] = useState(() => {
    if (saved?.buF) return saved.buF;
    const f: Record<string, boolean> = {};
    Object.keys(BU_CFG).forEach(k => f[k] = true);
    return f;
  });
  const [rF, setRF] = useState(() => {
    if (saved?.rF) return saved.rF;
    const f: Record<string, boolean> = {};
    Object.keys(REGION_CFG).forEach(k => f[k] = true);
    return f;
  });
  const [sR, setSR] = useState(saved?.sR ?? true);
  const [sC, setSC] = useState(saved?.sC ?? true);
  const [fO, setFO] = useState(saved?.fO ?? false);
  const [sSup, setSSup] = useState(saved?.sSup ?? true);
  const [sevFilter, setSevFilter] = useState<Severity | null>(saved?.sevFilter ?? null);
  const [groupBy, setGroupBy] = useState<'severity' | 'region'>(saved?.groupBy ?? 'severity');
  const [assignFilter, setAssignFilter] = useState<string | null>(saved?.assignFilter ?? null);

  // Persist to localStorage on any change
  useEffect(() => {
    saveFilters({ tF, buF, rF, sR, sC, fO, sSup, sevFilter, groupBy, assignFilter });
  }, [tF, buF, rF, sR, sC, fO, sSup, sevFilter, groupBy, assignFilter]);

  return {
    tF, setTF, buF, setBuF, rF, setRF,
    sR, setSR, sC, setSC, fO, setFO, sSup, setSSup,
    sevFilter, setSevFilter, groupBy, setGroupBy,
    assignFilter, setAssignFilter,
  };
}
