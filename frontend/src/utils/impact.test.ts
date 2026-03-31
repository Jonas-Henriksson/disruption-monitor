import { describe, it, expect } from 'vitest';
import { computeImpact, computeImpactWithGraph } from './impact';
import { ROUTES } from '../data/logistics';
import type { ScanItem, ImpactResult } from '../types';

// Helper to create a minimal disruption for testing
function mkDisruption(region: string): ScanItem {
  return {
    event: `Test event in ${region}`,
    description: 'Test',
    category: 'Geopolitical',
    severity: 'High',
    region,
    coordinates: { lat: 0, lng: 0 },
    affected_sites: [],
    trend: 'Stable',
  } as ScanItem;
}

// ── Result shape ─────────────────────────────────────────

describe('computeImpact result shape', () => {
  it('returns object with expected keys', () => {
    const result = computeImpact(mkDisruption('Europe'));
    expect(result).toHaveProperty('routes');
    expect(result).toHaveProperty('factories');
    expect(result).toHaveProperty('suppliers');
    expect(result).toHaveProperty('region');
    expect(result).toHaveProperty('corridors');
  });

  it('routes is an array of numbers', () => {
    const result = computeImpact(mkDisruption('Europe'));
    expect(Array.isArray(result.routes)).toBe(true);
    result.routes.forEach(r => expect(typeof r).toBe('number'));
  });

  it('factories is an array of strings', () => {
    const result = computeImpact(mkDisruption('Europe'));
    expect(Array.isArray(result.factories)).toBe(true);
    result.factories.forEach(f => expect(typeof f).toBe('string'));
  });
});

// ── Europe disruption ────────────────────────────────────

describe('computeImpact — Europe disruption', () => {
  const result = computeImpact(mkDisruption('Europe'));

  it('finds European corridors', () => {
    expect(result.corridors.length).toBeGreaterThan(0);
    // EU-CN, EU-US, EU-ASEAN etc. should be present
    expect(result.corridors).toContain('EU-CN');
    expect(result.corridors).toContain('EU-US');
  });

  it('finds affected routes', () => {
    expect(result.routes.length).toBeGreaterThan(0);
  });

  it('finds affected factories', () => {
    expect(result.factories.length).toBeGreaterThan(0);
  });

  it('maps to EU region', () => {
    expect(result.region).toBe('EU');
  });
});

// ── China disruption ─────────────────────────────────────

describe('computeImpact — China disruption', () => {
  const result = computeImpact(mkDisruption('China'));

  it('finds APAC corridors', () => {
    expect(result.corridors).toContain('EU-CN');
    expect(result.corridors).toContain('CN-US');
    expect(result.corridors).toContain('CN-ASEAN');
  });

  it('maps to APAC region', () => {
    expect(result.region).toBe('APAC');
  });

  it('finds affected routes', () => {
    expect(result.routes.length).toBeGreaterThan(0);
  });
});

// ── Middle East disruption ───────────────────────────────

describe('computeImpact — Middle East disruption', () => {
  const result = computeImpact(mkDisruption('Middle East'));

  it('finds Suez-dependent corridors', () => {
    expect(result.corridors).toContain('EU-CN');
    expect(result.corridors).toContain('EU-ME');
  });

  it('maps to MEA region', () => {
    expect(result.region).toBe('MEA');
  });
});

// ── Empty / edge cases ──────────────────────────────────

describe('computeImpact — edge cases', () => {
  it('handles unknown region without crashing', () => {
    const result = computeImpact(mkDisruption('Antarctica'));
    expect(result.routes).toEqual([]);
    expect(result.factories).toEqual([]);
    expect(result.suppliers).toEqual([]);
    expect(result.corridors).toEqual([]);
  });

  it('handles empty route data', () => {
    const result = computeImpact(mkDisruption('Europe'), []);
    expect(result.routes).toEqual([]);
    expect(result.factories).toEqual([]);
  });

  it('handles missing region field', () => {
    const disruption = {
      event: 'Test',
      description: '',
      category: '',
      severity: 'Low',
      coordinates: { lat: 0, lng: 0 },
      affected_sites: [],
      trend: 'Stable',
    } as unknown as ScanItem;
    const result = computeImpact(disruption);
    // Falls back to 'Global'
    expect(result.corridors.length).toBeGreaterThan(0);
  });
});

// ── computeImpactWithGraph ───────────────────────────────

describe('computeImpactWithGraph', () => {
  it('enriches result with supplier data', () => {
    const supplyGraph: Record<string, { sup: string[] }> = {
      'Schweinfurt': { sup: ['Germany-Steel', 'China-Casting'] },
      'Gothenburg': { sup: ['Sweden-Iron'] },
    };
    const result = computeImpactWithGraph(mkDisruption('Europe'), ROUTES, supplyGraph);

    // Should have suppliers from factories hit by Europe disruption
    expect(result.suppliers.length).toBeGreaterThan(0);
  });

  it('returns empty suppliers when graph has no matching factories', () => {
    const supplyGraph: Record<string, { sup: string[] }> = {
      'NonExistentFactory': { sup: ['X', 'Y'] },
    };
    const result = computeImpactWithGraph(mkDisruption('Europe'), ROUTES, supplyGraph);
    expect(result.suppliers).toEqual([]);
  });
});
