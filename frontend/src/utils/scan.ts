import type { ScanItem, Severity } from '../types';

/** Map variant/nonstandard severity strings to canonical Severity values */
const SEVERITY_MAP: Record<string, Severity> = {
  'critical': 'Critical', 'high': 'High', 'medium': 'Medium', 'low': 'Low',
  'severe': 'Critical', 'extreme': 'Critical', 'elevated': 'High', 'moderate': 'Medium', 'minor': 'Low',
};

/** Normalize a raw severity value to a canonical Severity, defaulting to Medium */
export function normalizeSeverity(raw: unknown): Severity {
  if (typeof raw !== 'string' || !raw) return 'Medium';
  const mapped = SEVERITY_MAP[raw.toLowerCase().trim()];
  if (!mapped) {
    console.warn(`[SC Hub] Unknown severity value: "${raw}", defaulting to Medium`);
    return 'Medium';
  }
  return mapped;
}

/** Extract severity from any scan item type */
export const getSev = (d: ScanItem): Severity =>
  normalizeSeverity('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : 'Medium'));

/** Extract event/risk title from any scan item type */
export const getEvent = (d: ScanItem): string =>
  ('event' in d ? d.event : ('risk' in d ? d.risk : '')) as string;

/** Extract region from any scan item type */
export const getRegion = (d: ScanItem): string =>
  ('region' in d ? d.region : 'Global') as string;

/** Extract trend from any scan item type */
export const getTrend = (d: ScanItem): string =>
  ('trend' in d ? d.trend : '') as string;
