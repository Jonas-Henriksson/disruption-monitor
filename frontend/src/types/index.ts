// ── Core domain types for the SC Hub Disruption Monitor ──

export interface Site {
  name: string;
  lat: number;
  lng: number;
  type: SiteType;
  country: string;
  iso: string;
  region: Region;
  bu?: string;
}

export type SiteType = 'mfg' | 'log' | 'admin' | 'va' | 'service' | 'sales' | 'other';
export type Region = 'EU' | 'APAC' | 'AM' | 'MEA' | 'AF';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type Trend = 'Escalating' | 'Stable' | 'De-escalating' | 'New';
export type ScanMode = 'disruptions' | 'geopolitical' | 'trade';
export type FrictionLevel = 'Free' | 'Low' | 'Moderate' | 'High' | 'Prohibitive';
export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'blocked' | 'done';

export interface TypeConfig {
  label: string;
  color: string;
  shape: 'tri' | 'dia' | 'sq' | 'dot' | 'star';
  pri: number;
}

export interface RegionConfig {
  label: string;
  color: string;
}

export interface BUConfig {
  label: string;
  color: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
}

export interface StatusConfig {
  label: string;
  color: string;
  icon: string;
}

export interface Chokepoint {
  n: string;
  la: number;
  ln: number;
}

export interface Port {
  n: string;
  la: number;
  ln: number;
}

export interface Airport {
  n: string;
  la: number;
  ln: number;
}

export interface SeaRoute {
  pts: [number, number][];
  label: string;
  corridor: string;
  type: 'sea';
  origin: string;
}

export interface AirRoute {
  f: [number, number];
  t: [number, number];
  label: string;
  corridor: string;
  type: 'air';
  origin: string;
}

export type Route = SeaRoute | AirRoute;

export interface Disruption {
  event: string;
  description: string;
  category: string;
  severity: Severity;
  trend: Trend | string;
  region: string;
  lat: number;
  lng: number;
  skf_exposure: string;
  recommended_action: string;
  // Backend-enriched fields (optional — not present on local sample data)
  id?: string;
  status?: 'active' | 'watching' | 'archived';
  first_seen?: string;
  last_seen?: string;
  scan_count?: number;
  computed_severity?: ComputedSeverity;
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
  input_details?: SupplyGraphInput[];
  routing_context?: string[];
  possible_duplicate_of?: string;
  duplicate_reason?: string;
  duplicate_similarity?: number;
  confidence?: number;
  sources?: string[];
}

export interface GeopoliticalRisk {
  risk: string;
  trend: string;
  trend_arrow: string;
  this_week: string;
  skf_relevance: string;
  risk_level: Severity;
  region: string;
  lat: number;
  lng: number;
  watchpoint: string;
  // Backend-enriched fields (optional — not present on local sample data)
  id?: string;
  status?: 'active' | 'watching' | 'archived';
  first_seen?: string;
  last_seen?: string;
  scan_count?: number;
  computed_severity?: ComputedSeverity;
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
  input_details?: SupplyGraphInput[];
  routing_context?: string[];
  possible_duplicate_of?: string;
  duplicate_reason?: string;
  duplicate_similarity?: number;
  confidence?: number;
  sources?: string[];
}

export interface TradeEvent {
  event: string;
  description: string;
  category: string;
  severity: Severity;
  trend: string;
  region: string;
  lat: number;
  lng: number;
  corridor: string;
  friction_level: FrictionLevel;
  skf_cost_impact: string;
  recommended_action: string;
  // Backend-enriched fields (optional — not present on local sample data)
  id?: string;
  status?: 'active' | 'watching' | 'archived';
  first_seen?: string;
  last_seen?: string;
  scan_count?: number;
  computed_severity?: ComputedSeverity;
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
  input_details?: SupplyGraphInput[];
  routing_context?: string[];
  possible_duplicate_of?: string;
  duplicate_reason?: string;
  duplicate_similarity?: number;
  confidence?: number;
  sources?: string[];
}

export interface ComputedSeverity {
  score: number;
  label: string;
  components: Record<string, number>;
  affected_site_count: number;
  /** Practitioner severity dimensions */
  probability?: number;       // 0-1
  impact_magnitude?: number;  // 0-1
  velocity?: string;          // immediate, days, weeks, months
  recovery_estimate?: string; // hours, days, weeks, months
}

export type ScanItem = Disruption | GeopoliticalRisk | TradeEvent;

export interface SampleData {
  disruptions: Disruption[];
  geopolitical: GeopoliticalRisk[];
  trade: TradeEvent[];
}

export interface Supplier {
  country: string;
  lat: number;
  lng: number;
  n: number;
  rows: number;
  region: string;
  cats: string[];
}

export type SupplierTier = 1 | 2 | 3;
export type SupplierCriticality = 'critical' | 'important' | 'standard';

export interface SupplyGraphInput {
  name: string;
  tier: SupplierTier;
  sole_source: boolean;
  criticality: SupplierCriticality;
}

export interface SupplyGraphEntry {
  sup: string[];
  inputs: string[];
  bu: string;
  /** Tiered input details — parallel to inputs array */
  input_details?: SupplyGraphInput[];
}

export interface ImpactResult {
  routes: number[];
  factories: string[];
  suppliers: string[];
  region: string | undefined;
  corridors: string[];
}

export interface ExposureScore {
  score: number;
  level: Severity;
  threats: ExposureThreat[];
}

export interface ExposureThreat {
  event: string;
  severity: Severity;
  direct: boolean;
  route: boolean;
  supplier: boolean;
}

export interface BuExposure {
  bu: string;
  exposed_spend_pct: number;
  factory_count: number;
  sole_source_count: number;
  top_threats: Array<{ id: string; title: string; severity: string }>;
}

export interface WhatIfScenario {
  scenario_type: 'region_disruption' | 'chokepoint_closure';
  target: string;
  duration_weeks: number;
}

export interface WhatIfFactory {
  factory: string;
  bu: string;
  affected_countries: string[];
  affected_inputs: Array<{ name: string; tier: number; sole_source: boolean; criticality: string }>;
  t1_count: number;
  sole_source: boolean;
}

export interface WhatIfBuImpact {
  bu: string;
  factory_count: number;
  t1_inputs_at_risk: number;
  sole_source_count: number;
  exposed_spend_pct: number;
}

export interface WhatIfResult {
  scenario_type: string;
  target: string;
  duration_weeks: number;
  affected_factories: WhatIfFactory[];
  bu_impact: WhatIfBuImpact[];
  sole_source_risks: Array<{ factory: string; bu: string; input: string; supplier_country: string }>;
  total_factories_affected: number;
}

export interface DownstreamExposure {
  factory: string;
  bu: string;
  shared_country: string;
  shared_inputs: string[];
  hop: number;
}

export interface EventRegistryEntry {
  status: 'active' | 'watching' | 'archived';
  firstSeen: string;
  lastSeen: string;
  scanCount: number;
  lastSev: string;
  archivedSev?: string;
  archivedAt?: string;
  _new?: boolean;
  _returning?: boolean;
  _reEmerged?: boolean;
  _reEmergedFrom?: string | null;
  _notDetected?: boolean;
}

export interface ActionItem {
  text: string;
  owner: string | null;
  due: string;
  status: 'open' | 'done';
  created: string;
  id: number;
}

export type ActionStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'dismissed';
export type ActionSource = 'ai' | 'manual' | 'template';

export interface BackendAction {
  id: number;
  event_id: string;
  action_type: string;
  title: string;
  description: string | null;
  assignee_hint: string | null;
  priority: 'critical' | 'high' | 'normal' | 'low';
  status: ActionStatus;
  due_date: string | null;
  source: ActionSource;
  assignee_email: string | null;
  assignee_name: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  completion_note: string | null;
  evidence_url: string | null;
  completed_at: string | null;
  completed_by_email: string | null;
  completed_by_name: string | null;
  dismissed_reason: string | null;
  dismissed_at: string | null;
  dismissed_by_email: string | null;
  created_at: string;
  updated_at: string;
  // Enriched by /actions/mine
  event_title?: string;
  event_severity?: string;
}

export interface DirectoryUser {
  displayName: string;
  email: string;
}

export type TicketPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Ticket {
  owner?: string | null;
  ticketStatus?: TicketStatus;
  actions?: ActionItem[];
  notes?: string;
  due?: string;
  due_date?: string | null;
  priority?: TicketPriority | null;
  is_overdue?: boolean;
}

export interface EditEntry {
  text?: string;
  originalAI?: string;
  status?: 'approved' | null;
}

export interface DisruptedInfo {
  country?: string;
  region?: string;
  supplier_count: number;
  categories: string[];
}

export interface SupplierAlternative {
  country: string;
  region: string;
  supplier_count: number;
  distance_km: number;
  category_overlap: string[];
  overlap_pct: number;
}

export interface SupplierAlternativesResponse {
  disrupted: DisruptedInfo;
  alternatives: SupplierAlternative[];
  disclaimer?: string;
}

export interface SiteSupplier {
  supplier_name: string;
  country: string;
  category_l1: string;
  category_l2: string;
  spend_pct: number;  // percentage of site's total spend
}

export interface SiteSupplierCountry {
  country: string;
  supplier_count: number;
  spend_pct: number;
  categories: string[];
  has_active_disruption: boolean;
}

export interface SiteSuppliersResponse {
  site: { site_id: string; country: string; business_unit: string };
  summary: {
    total_suppliers: number;
    total_countries: number;
    concentration_score: number;
    top_country: string;
    top_country_spend_pct: number;
    active_disruptions_affecting: number;
  };
  suppliers: SiteSupplier[];
  by_country: SiteSupplierCountry[];
}

export interface WeeklySummary {
  period: { from: string; to: string };
  headline: string;
  severity_snapshot: Record<Severity, number>;
  new_events: ScanItem[];
  escalated_events: ScanItem[];
  resolved_events: ScanItem[];
  overdue_tickets: { id: number; event_id: string; owner: string | null; status: string; due_date: string; event_title?: string }[];
  top_regions: { region: string; event_count: number }[];
  week_over_week_delta: { new: string; resolved: string; active_total: string };
}

export interface ExecBriefData {
  sevCounts: Record<Severity, number>;
  regions: Record<string, number>;
  topRegion: [string, number] | undefined;
  totalSites: number;
  escalating: string[];
  actions: string[];
  total: number;
}

export interface ExecutiveSummary {
  risk_level: 'STABLE' | 'ELEVATED' | 'HIGH';
  one_liner: string;
  severity_counts: Record<Severity, number>;
  actively_bleeding: ScanItem[];
  escalating: ScanItem[];
  recently_resolved: ScanItem[];
  bu_exposure: Array<{
    bu: string;
    active_disruption_count: number;
    total_affected_sites: number;
    max_severity: string;
  }>;
  period: { from: string; to: string };
  generated_at: string;
}

export interface CorridorSummaryItem {
  corridor: string;
  label: string;
  friction_level: FrictionLevel;
  trend: string;
  event_count: number;
  top_event: string;
  top_event_id: string;
  max_severity: string;
  skf_sites_affected: number;
  skf_suppliers_affected: number;
  trajectory_text: string;
  last_updated: string;
}

export interface CorridorSummaryResponse {
  corridors: CorridorSummaryItem[];
  generated_at: string;
}
