/**
 * API service layer for the SC Hub Disruption Monitor backend.
 *
 * Base URL is configurable via VITE_API_URL env var (default: http://localhost:3101).
 * All functions gracefully return null on failure so callers can fall back to sample data.
 */

import type { ScanMode, ScanItem, SupplierAlternativesResponse, SiteSuppliersResponse, Ticket, TicketStatus, WeeklySummary, BuExposure, WhatIfScenario, WhatIfResult, ExecutiveSummary, CorridorSummaryResponse } from "../types";
import { getToken, getGraphToken } from "../auth/tokenProvider";

const BASE_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:3101";
const API_PREFIX = "/api/v1";

/** Build headers with optional Bearer token for authenticated requests. */
async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  try {
    const token = await getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // Proceed without auth header — graceful fallback
  }
  return headers;
}

/** Structured recommendation from backend */
export interface BackendRecommendation {
  event_id: string;
  event: string;
  severity: string;
  impact: {
    affected_sites: { name: string; type: string; distance_km: number }[];
    affected_suppliers: { count: number; countries: string[] };
    estimated_units_per_week: number;
    recovery_weeks_with_mitigation: number;
    recovery_weeks_without: number;
  };
  actions: { priority: number; action: string; owner: string; urgency: string }[];
  confidence: number;
  sources: string[];
  skf_exposure: string;
}

/** Shape returned by GET /api/v1/scans/latest/{mode} and POST /api/v1/scans */
export interface ScanResponse {
  mode: ScanMode;
  source: "sample" | "live";
  scanned_at: string;
  count: number;
  /** Items may arrive under the mode key (GET latest) or under "items" (POST scan) */
  items?: ScanItem[];
  disruptions?: ScanItem[];
  geopolitical?: ScanItem[];
  trade?: ScanItem[];
  /** Present on POST responses */
  scan_id?: string;
  status?: string;
  progress?: number;
  started_at?: string;
  completed_at?: string;
  fallback?: boolean;
  error?: string;
}

/** Extract the items array from a ScanResponse regardless of key layout */
export function extractItems(res: ScanResponse): ScanItem[] {
  // POST /scans returns items under "items"
  if (res.items && res.items.length > 0) return res.items;
  // GET /scans/latest/{mode} returns items under the mode key
  const modeItems = res[res.mode as keyof ScanResponse];
  if (Array.isArray(modeItems) && modeItems.length > 0) return modeItems as ScanItem[];
  return [];
}

/**
 * Fetch the latest scan results for a given mode.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchLatestScan(mode: ScanMode): Promise<ScanResponse | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/scans/latest/${mode}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as ScanResponse;
  } catch {
    // Network error, timeout, backend down -- all silently return null
    return null;
  }
}

/**
 * Trigger a new scan on the backend.
 * Returns null if the backend is unreachable or returns an error.
 */
/**
 * Fetch structured recommendations for a specific event from the backend.
 * Returns null if not available (404 = no structured recs, or backend down).
 */
export async function fetchRecommendations(eventId: string): Promise<BackendRecommendation | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/recommendations`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as BackendRecommendation;
  } catch {
    return null;
  }
}

/**
 * Send a Telegram alert for a specific event.
 * Returns { success, message } or null on failure.
 */
export async function sendEventAlert(eventId: string): Promise<{ success: boolean; message?: string } | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/alert`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Create a ticket for a specific event with sensible defaults.
 * Returns the created Ticket or null on failure.
 */
export async function createEventTicket(eventId: string): Promise<Ticket | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/ticket`, {
      method: "POST",
      headers,
      body: JSON.stringify({ owner: "", notes: "Auto-created from Quick Actions" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Ticket;
  } catch {
    return null;
  }
}

/**
 * Update event lifecycle status on the backend.
 */
export async function updateEventStatus(eventId: string, status: string): Promise<boolean> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/status`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Narrative response from POST /api/v1/events/{id}/narrative */
export interface NarrativeResponse {
  event_id: string;
  narrative: string;
  generated_at: string;
  generated_by?: string;
}

/**
 * Generate an executive briefing narrative for a specific event.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchNarrative(eventId: string): Promise<NarrativeResponse | null> {
  const url = `${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/narrative`;
  console.log('[SC Hub] Fetching narrative:', url);
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(90000), // 90s for Lambda cold start + Bedrock
    });
    console.log('[SC Hub] Narrative response:', resp.status, resp.statusText);
    if (!resp.ok) {
      const body = await resp.text();
      console.warn('[SC Hub] Narrative failed:', body);
      return null;
    }
    const data = (await resp.json()) as NarrativeResponse;
    // Backend returns generated_by, frontend expects generated_at — normalize
    if (!data.generated_at && (data as unknown as Record<string, unknown>).generated_by) {
      data.generated_at = new Date().toISOString();
    }
    return data;
  } catch (err) {
    console.error('[SC Hub] Narrative error:', err);
    return null;
  }
}

/**
 * Save a user-edited narrative for an event.
 * Returns true on success, false on failure.
 */
export async function saveNarrativeEdit(eventId: string, narrative: string): Promise<boolean> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/narrative`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ narrative }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Fetch AI-generated risk dimension assessment (velocity, recovery, probability, trend). */
export async function fetchAssessment(eventId: string): Promise<{ assessment: string; generated_by: string } | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/assessment`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(90000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Fetch all evolution summaries for an event. */
export async function fetchEvolution(eventId: string, periodType?: string): Promise<{ summaries: any[] } | null> {
  try {
    const headers = await authHeaders();
    const params = periodType ? `?period_type=${periodType}` : '';
    const resp = await fetch(
      `${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/evolution${params}`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Fetch the latest evolution summary for an event. */
export async function fetchEvolutionLatest(eventId: string): Promise<{ summary: any | null } | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(
      `${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/evolution/latest`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Event edit entry from backend */
export interface EventEdit {
  id: number;
  event_id: string;
  field: string;
  original_value: string;
  edited_value: string;
  edited_by: string;
  edited_at: string;
}

/**
 * Fetch all user edits for a specific event.
 * Returns empty array on failure.
 */
export async function fetchEventEdits(eventId: string): Promise<EventEdit[]> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/edits`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    return (await resp.json()) as EventEdit[];
  } catch {
    return [];
  }
}

/** Shape of computed severity from the backend scoring algorithm */
export interface ComputedSeverity {
  score: number;
  label: string;
  components: {
    magnitude: number;
    proximity: number;
    asset_criticality: number;
    supply_chain_impact: number;
  };
  affected_site_count: number;
}

/** Timeline data point returned by GET /api/v1/events/timeline */
export interface TimelineDataPoint {
  date: string;
  event_count: number;
  critical_count: number;
  high_count: number;
  affected_sites_count: number;
}

/**
 * Fetch risk timeline data from the backend.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchTimeline(days: number = 30): Promise<TimelineDataPoint[] | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/timeline?days=${days}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as TimelineDataPoint[];
  } catch {
    return null;
  }
}

/**
 * Fetch supplier alternatives for a disrupted country.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchSupplierAlternatives(country: string): Promise<SupplierAlternativesResponse | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/suppliers/alternatives?country=${encodeURIComponent(country)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as SupplierAlternativesResponse;
  } catch {
    return null;
  }
}

/**
 * Assign a ticket to a team member for a specific event.
 * Optionally set a due_date (ISO string) and priority for SLA tracking.
 * Returns the created/updated Ticket or null on failure.
 */
export async function assignTicket(
  eventId: string,
  owner: string,
  options?: { due_date?: string | null; priority?: string | null },
): Promise<Ticket | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const body: Record<string, unknown> = { owner, notes: "" };
    if (options?.due_date) body.due_date = options.due_date;
    if (options?.priority) body.priority = options.priority;
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/ticket`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Ticket;
  } catch {
    return null;
  }
}

/**
 * Update the ticket status for a specific event.
 * Returns the updated Ticket or null on failure.
 */
export async function updateTicketStatus(eventId: string, status: TicketStatus): Promise<Ticket | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/ticket`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Ticket;
  } catch {
    return null;
  }
}

/**
 * Fetch supplier data for a specific factory site.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchSiteSuppliers(siteId: string, signal?: AbortSignal): Promise<SiteSuppliersResponse | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/sites/${encodeURIComponent(siteId)}/suppliers`, {
      headers,
      signal: signal || AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as SiteSuppliersResponse;
  } catch {
    return null;
  }
}

/** Spend share per supplier country (% of global spend). */
export interface SupplierCountrySpend {
  country: string;
  spend_pct: number;
  supplier_count: number;
  site_count: number;
}

export async function fetchSupplierSpendByCountry(): Promise<Record<string, SupplierCountrySpend> | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/suppliers/spend-by-country`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const map: Record<string, SupplierCountrySpend> = {};
    for (const c of data.countries) map[c.country] = c;
    return map;
  } catch {
    return null;
  }
}

/**
 * Fetch the weekly summary for the Monday-morning executive review.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchWeeklySummary(days: number = 7): Promise<WeeklySummary | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/weekly-summary?days=${days}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as WeeklySummary;
  } catch {
    return null;
  }
}

/** Fetch the executive summary for the hero panel. */
export async function fetchExecutiveSummary(): Promise<ExecutiveSummary | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/executive-summary`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as ExecutiveSummary;
  } catch {
    return null;
  }
}

/** Fetch corridor-level risk summary for the trade corridor strip. */
export async function fetchCorridorSummary(): Promise<CorridorSummaryResponse | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/corridor-summary`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as CorridorSummaryResponse;
  } catch {
    return null;
  }
}

export async function triggerScan(mode: ScanMode): Promise<ScanResponse | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/scans`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mode }),
      // Live scans with Claude API can take up to 30s
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as ScanResponse;
  } catch {
    return null;
  }
}

/**
 * Fetch BU-level exposure summary from the backend.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchBuExposure(): Promise<BuExposure[] | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/exposure/bu-summary`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as BuExposure[];
  } catch {
    return null;
  }
}

/**
 * Run a what-if scenario analysis on the backend.
 * Returns null if the backend is unreachable or returns an error.
 */
export async function fetchWhatIf(scenario: WhatIfScenario): Promise<WhatIfResult | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/exposure/what-if`, {
      method: "POST",
      headers,
      body: JSON.stringify(scenario),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as WhatIfResult;
  } catch {
    return null;
  }
}

/**
 * Fetch severity history for a specific event (for real sparkline).
 * Returns array of {score, timestamp} or null.
 */
export async function fetchSeverityHistory(eventId: string): Promise<Array<{score: number; timestamp: string}> | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.severity_history || null;
  } catch {
    return null;
  }
}

/**
 * Fetch structured actions for an event from the backend.
 */
export async function fetchEventActions(eventId: string): Promise<Array<{id: number; action_type: string; title: string; description: string; assignee_hint: string; priority: string; status: string; due_date: string | null}> | null> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/actions`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Update a specific action's status on the backend.
 */
export async function updateActionStatus(actionId: number, status: string): Promise<boolean> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/actions/${actionId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Generate actions for an event on the backend.
 */
export async function generateEventActions(eventId: string): Promise<Array<{id: number; action_type: string; title: string; description: string; assignee_hint: string; priority: string; status: string; due_date: string | null}> | null> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/events/${encodeURIComponent(eventId)}/actions/generate`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Graph API integration
// ---------------------------------------------------------------------------

/** Build headers with both backend auth token and Graph API token. */
async function graphHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers = await authHeaders(extra);
  try {
    const graphToken = await getGraphToken();
    if (graphToken) {
      headers["X-Graph-Token"] = graphToken;
    }
  } catch {
    // Proceed without Graph token — backend will return 401
  }
  return headers;
}

/** Graph API response — generic JSON from MS Graph endpoints */
export interface GraphResponse {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

/** Fetch the authenticated user's MS Graph profile. */
export async function graphGetProfile(): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/profile`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send a test email via MS Graph. */
export async function graphTestEmail(): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/test-email`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send a test Teams message via MS Graph. */
export async function graphTestTeams(): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/test-teams`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send an email alert for a specific event via MS Graph. */
export async function graphSendEventEmail(eventId: string): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/events/${encodeURIComponent(eventId)}/email`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send a Teams message for a specific event via MS Graph. */
export async function graphSendEventTeams(eventId: string): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/events/${encodeURIComponent(eventId)}/teams`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Create a calendar meeting for a specific event via MS Graph. */
export async function graphCreateEventMeeting(eventId: string): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders({ "Content-Type": "application/json" });
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/events/${encodeURIComponent(eventId)}/meeting`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Get the status of Graph API integration (permissions, connectivity). */
export async function graphGetStatus(): Promise<GraphResponse | null> {
  try {
    const headers = await graphHeaders();
    const resp = await fetch(`${BASE_URL}${API_PREFIX}/graph/status`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
