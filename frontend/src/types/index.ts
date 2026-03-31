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
  computed_severity?: { score: number; label: string; components: Record<string, number>; affected_site_count: number };
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
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
  computed_severity?: { score: number; label: string; components: Record<string, number>; affected_site_count: number };
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
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
  computed_severity?: { score: number; label: string; components: Record<string, number>; affected_site_count: number };
  affected_sites?: Array<{ name: string; type: string; distance_km: number }>;
  possible_duplicate_of?: string;
  duplicate_reason?: string;
  duplicate_similarity?: number;
  confidence?: number;
  sources?: string[];
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

export interface SupplyGraphEntry {
  sup: string[];
  inputs: string[];
  bu: string;
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

export interface Ticket {
  owner?: string | null;
  ticketStatus?: TicketStatus;
  actions?: ActionItem[];
  notes?: string;
  due?: string;
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

export interface ExecBriefData {
  sevCounts: Record<Severity, number>;
  regions: Record<string, number>;
  topRegion: [string, number] | undefined;
  totalSites: number;
  escalating: string[];
  actions: string[];
  total: number;
}
