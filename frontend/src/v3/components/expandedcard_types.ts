/**
 * DisruptionEvent — unified type for V3 ExpandedCard.
 * Combines fields from Disruption, GeopoliticalRisk, and TradeEvent
 * into a single shape the ExpandedCard can consume.
 */

import type { Severity, ComputedSeverity, SupplyGraphInput } from '../../types';

export type { Severity, ComputedSeverity };

export interface ActionItemShape {
  text: string;
  owner: string | null;
  due: string;
  status: 'open' | 'done';
  created: string;
  id: number;
}

export interface DisruptionEvent {
  // Identity
  id?: string;
  event?: string;
  risk?: string;
  region?: string;

  // Core fields
  description?: string;
  severity?: Severity | string;
  trend?: string;
  status?: 'active' | 'watching' | 'archived';
  resurfaced_at?: string;
  archived_severity?: number;

  // Enrichment
  computed_severity?: ComputedSeverity;
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
  scan_count?: number;
  first_seen?: string;
  last_seen?: string;
  confidence?: number;
  sources?: string[];

  // Supplier / routing context (may come from backend enrichment)
  input_details?: SupplyGraphInput[];
  routing_context?: Array<string | { description?: string; route?: string }>;
  affected_routes?: Array<string | { description?: string; route?: string }>;

  // Payload bucket for any nested backend data
  payload?: Record<string, unknown>;

  // Recommendations (inline or fetched)
  recommendations?: {
    actions?: ActionItemShape[];
    [key: string]: unknown;
  };

  // Allow additional fields
  [key: string]: unknown;
}

export interface EvolutionSummary {
  id: number;
  event_id: string;
  period_type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  severity_values: string; // JSON array of numbers
  phase_label: string;
  phase_number: number;
  key_developments: string; // JSON array of {date, description}
  exposure_delta: string;
  forward_outlook: string;
  narrative: string;
  generated_by: string;
  created_at: string;
}
