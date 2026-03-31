import type { TypeConfig, RegionConfig, BUConfig, TeamMember, StatusConfig, Severity, FrictionLevel, TicketStatus } from '../types';

export const TYPE_CFG: Record<string, TypeConfig> = {
  mfg: { label: 'Manufacturing', color: '#3b82f6', shape: 'tri', pri: 1 },
  log: { label: 'Logistics', color: '#f59e0b', shape: 'dia', pri: 3 },
  admin: { label: 'Admin/HQ', color: '#6366f1', shape: 'sq', pri: 4 },
  va: { label: 'Vehicle AM', color: '#0ea5e9', shape: 'dot', pri: 5 },
  service: { label: 'Service', color: '#14b8a6', shape: 'dot', pri: 5 },
  sales: { label: 'Sales', color: '#64748b', shape: 'dot', pri: 6 },
  other: { label: 'Other', color: '#475569', shape: 'dot', pri: 7 },
};

export const REGION_CFG: Record<string, RegionConfig> = {
  EU: { label: 'Europe', color: '#60a5fa' },
  APAC: { label: 'Asia Pacific', color: '#f43f5e' },
  AM: { label: 'Americas', color: '#34d399' },
  MEA: { label: 'Middle East & Africa', color: '#f97316' },
  AF: { label: 'Africa', color: '#fbbf24' },
};

export const BU_CFG: Record<string, BUConfig> = {
  'ind': { label: 'Industrial', color: '#3b82f6' },
  'sis-seal': { label: 'SIS Seals', color: '#a78bfa' },
  'sis-lube': { label: 'SIS Lubrication', color: '#06b6d4' },
  'sis-aero': { label: 'SIS Aerospace', color: '#f97316' },
  'sis-mag': { label: 'SIS Magnetics', color: '#f43f5e' },
};

export const TEAM: TeamMember[] = [
  { id: 'jh', name: 'Jonas Henriksson', role: 'Head of Strategic Planning', initials: 'JH', color: '#3b82f6' },
  { id: 'ub', name: 'Ulf Bergqvist', role: 'S&OP Lead', initials: 'UB', color: '#8b5cf6' },
  { id: 'hn', name: 'Harald Nilsson', role: 'S&OE Lead', initials: 'HN', color: '#06b6d4' },
  { id: 'sk', name: 'Steffen Krause', role: 'Senior SC Leadership', initials: 'SK', color: '#f97316' },
  { id: 'gp', name: 'Ganesh Patel', role: 'Senior SC Leadership', initials: 'GP', color: '#22c55e' },
  { id: 'tm', name: 'Tim Moermans', role: 'MSP Exception Narratives', initials: 'TM', color: '#eab308' },
  { id: 'rd', name: 'Rodrigo', role: 'MSP Exception Narratives', initials: 'RD', color: '#ef4444' },
  { id: 'sj', name: 'Sourabh Joshi', role: 'Landed Cost Model AI', initials: 'SJ', color: '#a78bfa' },
  { id: 'ss', name: 'Subhadarshi Sengupta', role: 'IT Infrastructure', initials: 'SS', color: '#14b8a6' },
];

export const TEAM_MAP: Record<string, TeamMember> = Object.fromEntries(TEAM.map(t => [t.id, t]));

export const STATUS_CFG: Record<TicketStatus, StatusConfig> = {
  open: { label: 'Open', color: '#64748b', icon: '\u25CB' },
  assigned: { label: 'Assigned', color: '#3b82f6', icon: '\uD83D\uDC64' },
  in_progress: { label: 'In Progress', color: '#eab308', icon: '\u23F3' },
  blocked: { label: 'Blocked', color: '#ef4444', icon: '\u26D4' },
  done: { label: 'Done', color: '#22c55e', icon: '\u2713' },
};

export const SEV: Record<Severity, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

export const SO: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export const SBG: Record<Severity, string> = {
  Critical: '#7f1d1d',
  High: '#7c2d12',
  Medium: '#713f12',
  Low: '#14532d',
};

export const CAT: Record<string, string> = {
  Geopolitical: '\u{1F30D}',
  'Natural Disaster': '\u{1F30A}',
  'Labour/Strike': '\u270A',
  'Logistics/Port': '\u{1F6A2}',
  'Trade Policy': '\u{1F4CB}',
  Cyber: '\u{1F4BB}',
  Other: '\u26A0\uFE0F',
  Tariffs: '\u{1F4B0}',
  'Anti-Dumping': '\u{1F6AB}',
  'Export Controls': '\u{1F512}',
  Sanctions: '\u26D4',
  FTA: '\u{1F91D}',
  Currency: '\u{1F4B1}',
  'Freight Costs': '\u{1F4E6}',
};

export const FRIC: Record<FrictionLevel, string> = {
  Free: '#22c55e',
  Low: '#34d399',
  Moderate: '#eab308',
  High: '#f97316',
  Prohibitive: '#ef4444',
};

export const RMC: Record<string, string> = {
  'Europe': '#60a5fa',
  'Middle East': '#f97316',
  'China': '#f43f5e',
  'India': '#a78bfa',
  'Americas': '#34d399',
  'Africa': '#fbbf24',
  'Global': '#94a3b8',
};

export const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Conflict/tension zones — ISO 3166-1 numeric codes
export const CONFLICT_ZONES = new Set([
  '804', '643', '364', '376', '275', '887', '760', '368', '422', '729', '736',
]);

// Fonts
export const F = "'DM Sans',-apple-system,sans-serif";
export const FM = "'JetBrains Mono',monospace";

// Disruption region → affected route corridors mapping
export const DISRUPTION_IMPACT: Record<string, string[]> = {
  'Europe': ['EU-CN', 'EU-US', 'EU-ASEAN', 'EU-ME', 'EU-IN', 'EU-BR', 'CN-EU'],
  'Middle East': ['EU-CN', 'EU-ASEAN', 'EU-ME', 'EU-IN', 'CN-EU'],
  'China': ['EU-CN', 'CN-US', 'CN-ASEAN', 'CN-EU', 'JP-CN'],
  'India': ['EU-IN'],
  'Americas': ['EU-US', 'CN-US', 'EU-BR'],
  'Africa': ['EU-CN', 'EU-IN', 'EU-ASEAN'],
  'Global': ['EU-CN', 'EU-US', 'CN-US', 'EU-IN', 'EU-ASEAN', 'EU-ME', 'EU-BR', 'CN-EU'],
};
