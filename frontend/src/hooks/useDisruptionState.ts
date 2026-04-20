import { useState, useEffect, useCallback } from "react";
import type { ScanMode, ScanItem, Severity, EventRegistryEntry, EditEntry, Ticket } from "../types";
import { SO, SAMPLE } from "../data";
import { eventId } from "../utils/format";
import { fetchLatestScan, triggerScan, extractItems, fetchRecommendations, updateEventStatus, fetchNarrative, fetchTimeline, type BackendRecommendation, type NarrativeResponse, type TimelineDataPoint } from "../services/api";
import { preloadEventData } from "../services/preloader";

export type DataSource = "live" | "sample" | "fallback";

/** Disruption/scan state: items, mode, selection, registry, edits, tickets, scanning progress */
export function useDisruptionState() {
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ScanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [sTime, setSTime] = useState<Date | null>(null);
  const [dOpen, setDOpen] = useState(false);
  const [dClosing, setDClosing] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [registry, setRegistry] = useState<Record<string, EventRegistryEntry>>({});
  const [edits, setEdits] = useState<Record<string, EditEntry>>({});
  const [tickets, setTickets] = useState<Record<string, Ticket>>({});
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [supExpand, setSupExpand] = useState<Record<string, boolean>>({});
  const [scView, setScView] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("sample");
  const [recs, setRecs] = useState<Record<string, BackendRecommendation>>({});
  const [narratives, setNarratives] = useState<Record<string, NarrativeResponse>>({});
  const [narrativeLoading, setNarrativeLoading] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[] | null>(null);

  // Fetch timeline data from backend on mount
  useEffect(() => {
    (async () => {
      const data = await fetchTimeline(30);
      if (data) setTimelineData(data);
    })();
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    (async () => {
      try {
        // @ts-expect-error window.storage is injected by the hosting environment
        const r = await window.storage?.get('scan-data');
        if (r?.value) {
          const d = JSON.parse(r.value);
          if (d.items?.length) { setItems(d.items); setMode(d.mode || null); setSTime(new Date(d.time)); setDOpen(false); preloadEventData(d.items); }
        }
        // @ts-expect-error window.storage
        const reg = await window.storage?.get('event-registry');
        if (reg?.value) setRegistry(JSON.parse(reg.value));
        // @ts-expect-error window.storage
        const ed = await window.storage?.get('event-edits');
        if (ed?.value) setEdits(JSON.parse(ed.value));
        // @ts-expect-error window.storage
        const tk = await window.storage?.get('event-tickets');
        if (tk?.value) setTickets(JSON.parse(tk.value));
      } catch { /* no saved data */ }
    })();
  }, []);

  // Persist state changes
  useEffect(() => {
    if (Object.keys(registry).length) {
      // @ts-expect-error window.storage
      try { window.storage?.set('event-registry', JSON.stringify(registry)); } catch { /* */ }
    }
  }, [registry]);
  useEffect(() => {
    if (Object.keys(edits).length) {
      // @ts-expect-error window.storage
      try { window.storage?.set('event-edits', JSON.stringify(edits)); } catch { /* */ }
    }
  }, [edits]);
  useEffect(() => {
    if (Object.keys(tickets).length) {
      // @ts-expect-error window.storage
      try { window.storage?.set('event-tickets', JSON.stringify(tickets)); } catch { /* */ }
    }
  }, [tickets]);

  const closeD = useCallback(() => {
    setDClosing(true);
    setTimeout(() => { setDOpen(false); setDClosing(false); }, 200);
  }, []);

  /** Sort items by severity (Critical first) */
  const sortBySeverity = (arr: ScanItem[]): ScanItem[] =>
    [...arr].sort((a, b) => {
      const sa = ('severity' in a ? a.severity : ('risk_level' in a ? a.risk_level : 'Medium')) as Severity;
      const sb = ('severity' in b ? b.severity : ('risk_level' in b ? b.risk_level : 'Medium')) as Severity;
      return (SO[sa] || 3) - (SO[sb] || 3);
    });

  /** Merge results into the event registry */
  const mergeRegistry = (all: ScanItem[]) => {
    const now = new Date().toISOString();
    const newReg: Record<string, EventRegistryEntry> = {};
    setRegistry(prevRegistry => {
      Object.assign(newReg, prevRegistry);
      const detectedIds = new Set(all.map(d => eventId(d as { event?: string; risk?: string; region?: string })));
      all.forEach(d => {
        const id = eventId(d as { event?: string; risk?: string; region?: string });
        const prev = newReg[id];
        const sev = ('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : 'Medium')) as string;
        if (!prev) {
          newReg[id] = { status: 'active', firstSeen: now, lastSeen: now, scanCount: 1, lastSev: sev, _new: true };
        } else {
          const wasArchived = prev.status === 'archived';
          const sevRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
          const escalated = wasArchived && (sevRank[sev] || 0) > (sevRank[prev.archivedSev || ''] || 0);
          if (wasArchived && !escalated) { /* stay archived */ }
          else {
            newReg[id] = {
              ...prev, status: escalated ? 'active' : prev.status === 'watching' ? 'watching' : 'active',
              lastSeen: now, scanCount: (prev.scanCount || 0) + 1, lastSev: sev,
              _new: !prev.firstSeen, _returning: !!prev.firstSeen && prev.status !== 'watching',
              _reEmerged: escalated, _reEmergedFrom: escalated ? prev.archivedSev || null : null,
            };
          }
        }
      });
      Object.keys(newReg).forEach(id => {
        if (!detectedIds.has(id) && (newReg[id].status === 'active' || newReg[id].status === 'watching')) {
          newReg[id] = { ...newReg[id], _notDetected: true };
        } else if (detectedIds.has(id)) {
          newReg[id] = { ...newReg[id], _notDetected: false };
        }
      });
      return { ...newReg };
    });
  };

  /** Run a scan using backend API with fallback to local SAMPLE data */
  const scan = useCallback(async (m: ScanMode) => {
    setLoading(true); setError(null); setMode(m); setSel(null); setScanPct(0);
    setDOpen(true); setDClosing(false);

    // Preserve existing items during scan — only clear if we have nothing
    setItems(prev => prev && prev.length > 0 ? prev : null);

    // Try backend API first
    setScanPct(10);
    const apiResult = await triggerScan(m);
    if (apiResult) {
      setScanPct(80);
      // After scan completes, reload ALL active events for this mode (not just the scan's items)
      const fullResult = await fetchLatestScan(m);
      const allItems = fullResult ? extractItems(fullResult) : extractItems(apiResult);
      if (allItems.length > 0) {
        const sorted = sortBySeverity(allItems);
        setItems(sorted);
        setScanPct(100);
        setDataSource(apiResult.source === "live" ? "live" : "sample");
        mergeRegistry(sorted);
        preloadEventData(sorted);
        setSTime(new Date());
        const now = new Date().toISOString();
        try {
          // @ts-expect-error window.storage
          await window.storage?.set('scan-data', JSON.stringify({ items: sorted, mode: m, time: now }));
        } catch { /* */ }
        setLoading(false);
        setTimeout(() => setScanPct(0), 600);
        return;
      }
    }

    // Scan failed — if we already have backend data loaded, keep it instead of falling back
    const latestResult = await fetchLatestScan(m);
    if (latestResult) {
      const latestItems = extractItems(latestResult);
      if (latestItems.length > 0) {
        const sorted = sortBySeverity(latestItems);
        setItems(sorted);
        setScanPct(100);
        setDataSource(latestResult.source === "live" ? "live" : "sample");
        mergeRegistry(sorted);
        preloadEventData(sorted);
        setSTime(new Date(latestResult.scanned_at));
        setLoading(false);
        setTimeout(() => setScanPct(0), 600);
        return;
      }
    }

    // Final fallback: use local SAMPLE data only if nothing else available
    setDataSource("fallback");
    const data = SAMPLE[m] as ScanItem[];
    if (!data) { setError('Unknown mode'); setLoading(false); return; }
    const chunks = [data.slice(0, 3), data.slice(3, 6), data.slice(6, 8), data.slice(8)];
    let all: ScanItem[] = [];
    for (let i = 0; i < chunks.length; i++) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
      all = [...all, ...chunks[i]];
      const sorted = sortBySeverity(all);
      setItems(sorted);
      setScanPct(Math.round(((i + 1) / chunks.length) * 100));
    }
    mergeRegistry(all);
    setSTime(new Date());
    try {
      const now = new Date().toISOString();
      // @ts-expect-error window.storage
      await window.storage?.set('scan-data', JSON.stringify({ items: all, mode: m, time: now }));
    } catch { /* */ }
    setLoading(false);
    setTimeout(() => setScanPct(0), 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Try to load the latest scan from the backend on mount (before auto-scan kicks in) */
  const loadLatest = useCallback(async (m: ScanMode): Promise<boolean> => {
    const res = await fetchLatestScan(m);
    if (res) {
      const apiItems = extractItems(res);
      if (apiItems.length > 0) {
        const sorted = sortBySeverity(apiItems);
        setItems(sorted);
        setMode(m);
        setSTime(new Date(res.scanned_at));
        setDataSource(res.source === "live" ? "live" : "sample");
        setDOpen(true);
        mergeRegistry(sorted);
        preloadEventData(sorted);
        return true;
      }
    }
    return false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Fetch structured recommendations from backend (cached per event ID) */
  const loadRecs = useCallback(async (eid: string) => {
    if (recs[eid]) return recs[eid];
    const rec = await fetchRecommendations(eid);
    if (rec) {
      setRecs(prev => ({ ...prev, [eid]: rec }));
      return rec;
    }
    return null;
  }, [recs]);

  /** Sync event status to backend */
  const syncStatus = useCallback(async (eid: string, status: string) => {
    await updateEventStatus(eid, status);
  }, []);

  /** Fetch narrative briefing (cached per event ID) */
  const loadNarrative = useCallback(async (eid: string) => {
    if (narratives[eid]) return narratives[eid];
    setNarrativeLoading(eid);
    const res = await fetchNarrative(eid);
    setNarrativeLoading(null);
    if (res) {
      setNarratives(prev => ({ ...prev, [eid]: res }));
      return res;
    }
    return null;
  }, [narratives]);

  return {
    mode, setMode, loading, items, setItems, error, setError,
    sel, setSel, sTime, setSTime,
    dOpen, setDOpen, dClosing, setDClosing, closeD,
    scanPct, registry, setRegistry, edits, setEdits,
    tickets, setTickets, showAssign, setShowAssign,
    supExpand, setSupExpand, scView, setScView,
    scan, loadLatest, dataSource, recs, loadRecs, syncStatus,
    narratives, setNarratives, narrativeLoading, loadNarrative,
    timelineOpen, setTimelineOpen,
    timelineData,
  };
}
