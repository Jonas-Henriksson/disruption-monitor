/**
 * Background preloader — fetches assessment, evolution, and actions
 * for all events starting from most critical, so data appears instantly
 * when the user clicks into an event.
 *
 * Caches are module-level Maps shared with ExpandedCard.
 */

import type { ScanItem } from '../types';
import { fetchAssessment, fetchEvolutionLatest, fetchEvolution, fetchEventActions } from './api';

/* ── Shared caches (imported by ExpandedCard) ──────────────── */
export const assessmentCache = new Map<string, string>();
export const evolutionLatestCache = new Map<string, any>();
export const evolutionAllCache = new Map<string, any[]>();
export const actionsCache = new Map<string, any[]>();

/* ── Preload state ─────────────────────────────────────────── */
let _abortController: AbortController | null = null;
let _preloadRunning = false;

/** Severity score for sort priority (higher = load first) */
function sevScore(item: ScanItem): number {
  const cs = (item as any).computed_severity;
  if (cs && typeof cs === 'object' && typeof cs.score === 'number') return cs.score;
  const s = ((item as any).severity || (item as any).risk_level || '').toLowerCase();
  if (s === 'critical') return 90;
  if (s === 'high') return 70;
  if (s === 'medium') return 40;
  return 10;
}

/** Resolve event ID from a ScanItem */
function eventId(item: ScanItem): string {
  if ((item as any).id) return (item as any).id;
  const name = ((item as any).event || (item as any).risk || 'unknown').toLowerCase().slice(0, 40).replace(/\s+/g, '-');
  const region = ((item as any).region || 'unknown').toLowerCase().replace(/\s+/g, '-');
  return `${name}|${region}`;
}

/** Small delay to avoid hammering the API */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Preload data for a single event (assessment + evolution latest + actions).
 * Skips anything already cached. Returns quickly.
 */
async function preloadOne(id: string, signal: AbortSignal): Promise<void> {
  const jobs: Promise<void>[] = [];

  if (!assessmentCache.has(id)) {
    jobs.push(
      fetchAssessment(id).then(res => {
        if (res?.assessment) assessmentCache.set(id, res.assessment);
      }).catch(() => {})
    );
  }

  if (!evolutionLatestCache.has(id)) {
    jobs.push(
      fetchEvolutionLatest(id).then(res => {
        if (res?.summary) evolutionLatestCache.set(id, res.summary);
      }).catch(() => {})
    );
  }

  if (!evolutionAllCache.has(id)) {
    jobs.push(
      fetchEvolution(id).then(res => {
        if (res?.summaries) evolutionAllCache.set(id, res.summaries);
      }).catch(() => {})
    );
  }

  if (!actionsCache.has(id)) {
    jobs.push(
      fetchEventActions(id).then(res => {
        if (res) actionsCache.set(id, res);
      }).catch(() => {})
    );
  }

  if (jobs.length === 0) return;
  if (signal.aborted) return;

  await Promise.all(jobs);
}

/**
 * Start background preloading for a list of events.
 * Cancels any previous preload run. Processes events in batches
 * of 3 concurrently, sorted by severity (critical first).
 */
export function preloadEventData(items: ScanItem[]): void {
  // Cancel previous run
  if (_abortController) {
    _abortController.abort();
  }
  _abortController = new AbortController();
  const signal = _abortController.signal;

  // Sort by severity descending
  const sorted = [...items].sort((a, b) => sevScore(b) - sevScore(a));
  const ids = sorted.map(eventId).filter(Boolean);

  // Deduplicate
  const unique = [...new Set(ids)];

  _preloadRunning = true;

  (async () => {
    const BATCH = 3;
    const BATCH_DELAY = 150; // ms between batches

    for (let i = 0; i < unique.length; i += BATCH) {
      if (signal.aborted) break;

      const batch = unique.slice(i, i + BATCH);
      await Promise.all(batch.map(id => preloadOne(id, signal)));

      // Small delay between batches to keep UI responsive
      if (i + BATCH < unique.length && !signal.aborted) {
        await delay(BATCH_DELAY);
      }
    }

    _preloadRunning = false;
  })();
}

/** Cancel any running preload */
export function cancelPreload(): void {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
  _preloadRunning = false;
}

/** Check if preloading is active */
export function isPreloading(): boolean {
  return _preloadRunning;
}
