import { describe, it, expect } from 'vitest';
import { SITES, BU_MAP, typeCounts, regionCounts } from './sites';

// ── Data integrity ───────────────────────────────────────

describe('SITES data integrity', () => {
  it('has exactly 245 sites', () => {
    expect(SITES).toHaveLength(245);
  });

  it('all sites have valid latitude (-90 to 90)', () => {
    SITES.forEach(s => {
      expect(s.lat).toBeGreaterThanOrEqual(-90);
      expect(s.lat).toBeLessThanOrEqual(90);
    });
  });

  it('all sites have valid longitude (-180 to 180)', () => {
    SITES.forEach(s => {
      expect(s.lng).toBeGreaterThanOrEqual(-180);
      expect(s.lng).toBeLessThanOrEqual(180);
    });
  });

  it('all sites have a non-empty name', () => {
    SITES.forEach(s => {
      expect(s.name.trim().length).toBeGreaterThan(0);
    });
  });

  it('all sites have a valid type', () => {
    const validTypes = ['mfg', 'log', 'admin', 'va', 'service', 'sales', 'other'];
    SITES.forEach(s => {
      expect(validTypes).toContain(s.type);
    });
  });

  it('all sites have a valid region', () => {
    const validRegions = ['EU', 'APAC', 'AM', 'MEA', 'AF'];
    SITES.forEach(s => {
      expect(validRegions).toContain(s.region);
    });
  });

  it('all sites have a non-empty country and ISO code', () => {
    SITES.forEach(s => {
      expect(s.country.trim().length).toBeGreaterThan(0);
      expect(s.iso.trim().length).toBeGreaterThan(0);
    });
  });

  it('no duplicate site names (all names are unique)', () => {
    const names = SITES.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ── Manufacturing sites ──────────────────────────────────

describe('Manufacturing sites', () => {
  const mfgSites = SITES.filter(s => s.type === 'mfg');

  it('has 20+ manufacturing sites', () => {
    expect(mfgSites.length).toBeGreaterThanOrEqual(20);
  });

  it('typeCounts tracks mfg count correctly', () => {
    expect(typeCounts['mfg']).toBe(mfgSites.length);
  });
});

// ── BU_MAP ───────────────────────────────────────────────

describe('BU_MAP', () => {
  it('all BU_MAP entries reference sites that exist in SITES', () => {
    const siteNames = new Set(SITES.map(s => s.name));
    Object.keys(BU_MAP).forEach(name => {
      expect(siteNames.has(name), `BU_MAP key "${name}" not found in SITES`).toBe(true);
    });
  });

  it('all BU_MAP values are valid BU codes', () => {
    const validBUs = ['ind', 'sis-seal', 'sis-lube', 'sis-aero', 'sis-mag'];
    Object.entries(BU_MAP).forEach(([name, bu]) => {
      expect(validBUs, `Invalid BU "${bu}" for site "${name}"`).toContain(bu);
    });
  });

  it('BU assignments are applied to SITES objects', () => {
    Object.entries(BU_MAP).forEach(([name, bu]) => {
      const site = SITES.find(s => s.name === name);
      expect(site?.bu).toBe(bu);
    });
  });
});

// ── Region counts ────────────────────────────────────────

describe('regionCounts', () => {
  it('all regions sum to total site count', () => {
    const total = Object.values(regionCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(SITES.length);
  });

  it('EU has the most sites', () => {
    expect(regionCounts['EU']).toBeGreaterThan(regionCounts['AM']);
    expect(regionCounts['EU']).toBeGreaterThan(regionCounts['APAC']);
  });
});
