import { describe, it, expect } from 'vitest';
import { getSev, getEvent, getRegion, getTrend, normalizeSeverity } from './scan';
import { SEV } from '../data/config';
import type { Disruption, GeopoliticalRisk, TradeEvent, ScanItem, Severity } from '../types';

// ── Test fixtures ───────────────────────────────────────

const disruption: Disruption = {
  event: 'Red Sea Shipping Disruption',
  description: 'Houthi attacks on commercial shipping',
  category: 'Maritime',
  severity: 'Critical',
  trend: 'Escalating',
  region: 'Middle East',
  lat: 12.5,
  lng: 43.2,
  skf_exposure: 'High exposure to EU-Asia corridor',
  recommended_action: 'Activate alternative routing',
};

const geopolitical: GeopoliticalRisk = {
  risk: 'Taiwan Strait Tensions',
  trend: 'Stable',
  trend_arrow: '\u2192',
  this_week: 'No major developments',
  skf_relevance: 'APAC semiconductor supply chain',
  risk_level: 'High',
  region: 'China',
  lat: 25.0,
  lng: 121.5,
  watchpoint: 'Monitor PLA exercises',
};

const trade: TradeEvent = {
  event: 'EU Carbon Border Adjustment',
  description: 'CBAM implementation phase 2',
  category: 'Regulatory',
  severity: 'Medium',
  trend: 'New',
  region: 'Europe',
  lat: 50.8,
  lng: 4.3,
  corridor: 'EU-APAC',
  friction_level: 'Moderate',
  skf_cost_impact: '2-5% cost increase on imports',
  recommended_action: 'Review supplier carbon reporting',
};

// ── getSev ──────────────────────────────────────────────

describe('getSev', () => {
  it('returns severity from Disruption items', () => {
    expect(getSev(disruption)).toBe('Critical');
  });

  it('returns risk_level from GeopoliticalRisk items', () => {
    expect(getSev(geopolitical)).toBe('High');
  });

  it('returns severity from TradeEvent items', () => {
    expect(getSev(trade)).toBe('Medium');
  });

  it('returns severity over risk_level when both are present', () => {
    // Disruption has severity, so even if we somehow cast it, severity wins
    const hybrid = { ...disruption, risk_level: 'Low' } as unknown as ScanItem;
    expect(getSev(hybrid)).toBe('Critical');
  });

  it('defaults to Medium when neither severity nor risk_level exists', () => {
    // An item with neither field (adversarial / malformed data)
    const bare = { event: 'Unknown', region: 'Global' } as unknown as ScanItem;
    expect(getSev(bare)).toBe('Medium');
  });

  it('handles Low severity correctly', () => {
    const low: Disruption = { ...disruption, severity: 'Low' };
    expect(getSev(low)).toBe('Low');
  });
});

// ── normalizeSeverity ──────────────────────────────────

describe('normalizeSeverity', () => {
  it('normalizes uppercase CRITICAL', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('Critical');
  });

  it('normalizes lowercase critical', () => {
    expect(normalizeSeverity('critical')).toBe('Critical');
  });

  it('maps "severe" to Critical', () => {
    expect(normalizeSeverity('severe')).toBe('Critical');
  });

  it('maps "extreme" to Critical', () => {
    expect(normalizeSeverity('extreme')).toBe('Critical');
  });

  it('maps "elevated" to High', () => {
    expect(normalizeSeverity('elevated')).toBe('High');
  });

  it('maps "moderate" to Medium', () => {
    expect(normalizeSeverity('moderate')).toBe('Medium');
  });

  it('maps "minor" to Low', () => {
    expect(normalizeSeverity('minor')).toBe('Low');
  });

  it('returns Medium for null', () => {
    expect(normalizeSeverity(null)).toBe('Medium');
  });

  it('returns Medium for undefined', () => {
    expect(normalizeSeverity(undefined)).toBe('Medium');
  });

  it('returns Medium for numeric input', () => {
    expect(normalizeSeverity(42)).toBe('Medium');
  });

  it('returns Medium for empty string', () => {
    expect(normalizeSeverity('')).toBe('Medium');
  });

  it('returns Medium for whitespace-only string', () => {
    expect(normalizeSeverity('   ')).toBe('Medium');
  });

  it('returns Medium for unknown string with console.warn', () => {
    expect(normalizeSeverity('banana')).toBe('Medium');
  });

  it('handles leading/trailing whitespace', () => {
    expect(normalizeSeverity('  High  ')).toBe('High');
  });
});

// ── getEvent ────────────────────────────────────────────

describe('getEvent', () => {
  it('returns event from Disruption items', () => {
    expect(getEvent(disruption)).toBe('Red Sea Shipping Disruption');
  });

  it('returns risk from GeopoliticalRisk items', () => {
    expect(getEvent(geopolitical)).toBe('Taiwan Strait Tensions');
  });

  it('returns event from TradeEvent items', () => {
    expect(getEvent(trade)).toBe('EU Carbon Border Adjustment');
  });

  it('prefers event over risk when both are present', () => {
    const hybrid = { ...geopolitical, event: 'Override Title' } as unknown as ScanItem;
    expect(getEvent(hybrid)).toBe('Override Title');
  });

  it('returns empty string when neither event nor risk exists', () => {
    const bare = { region: 'Global' } as unknown as ScanItem;
    expect(getEvent(bare)).toBe('');
  });

  it('returns empty string event field correctly', () => {
    const empty = { event: '', region: 'Global' } as unknown as ScanItem;
    expect(getEvent(empty)).toBe('');
  });
});

// ── getRegion ───────────────────────────────────────────

describe('getRegion', () => {
  it('returns region from Disruption items', () => {
    expect(getRegion(disruption)).toBe('Middle East');
  });

  it('returns region from GeopoliticalRisk items', () => {
    expect(getRegion(geopolitical)).toBe('China');
  });

  it('returns region from TradeEvent items', () => {
    expect(getRegion(trade)).toBe('Europe');
  });

  it('defaults to Global when region field is missing', () => {
    const noRegion = { event: 'Test' } as unknown as ScanItem;
    expect(getRegion(noRegion)).toBe('Global');
  });

  it('returns exact region string including unusual values', () => {
    const custom = { ...disruption, region: 'South America' };
    expect(getRegion(custom)).toBe('South America');
  });

  it('returns empty string region if explicitly set', () => {
    // region is present (so 'in' check passes), even though it is empty
    const emptyRegion = { ...disruption, region: '' };
    expect(getRegion(emptyRegion)).toBe('');
  });
});

// ── getTrend ────────────────────────────────────────────

describe('getTrend', () => {
  it('returns trend from Disruption items', () => {
    expect(getTrend(disruption)).toBe('Escalating');
  });

  it('returns trend from GeopoliticalRisk items', () => {
    expect(getTrend(geopolitical)).toBe('Stable');
  });

  it('returns trend from TradeEvent items with New trend', () => {
    expect(getTrend(trade)).toBe('New');
  });

  it('handles De-escalating trend', () => {
    const deesc = { ...disruption, trend: 'De-escalating' as const };
    expect(getTrend(deesc)).toBe('De-escalating');
  });

  it('returns empty string when trend field is missing', () => {
    const noTrend = { event: 'Test' } as unknown as ScanItem;
    expect(getTrend(noTrend)).toBe('');
  });

  it('returns empty string trend if explicitly set to empty', () => {
    const emptyTrend = { ...disruption, trend: '' };
    expect(getTrend(emptyTrend)).toBe('');
  });

  it('handles unexpected trend value strings', () => {
    const weird = { ...disruption, trend: 'Worsening' };
    expect(getTrend(weird)).toBe('Worsening');
  });
});

// ── normalizeSeverity → SEV integration ───────────────────

describe('normalizeSeverity → SEV color map integration', () => {
  const allCanonical: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

  allCanonical.forEach(sev => {
    it(`SEV[normalizeSeverity("${sev}")] returns a valid hex color`, () => {
      const normalized = normalizeSeverity(sev);
      expect(SEV[normalized]).toBeDefined();
      expect(SEV[normalized]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('SEV[normalizeSeverity("CRITICAL")] is the Critical color (#ef4444)', () => {
    expect(SEV[normalizeSeverity('CRITICAL')]).toBe('#ef4444');
  });

  it('SEV[normalizeSeverity("elevated")] is the High color (#f97316)', () => {
    expect(SEV[normalizeSeverity('elevated')]).toBe('#f97316');
  });

  it('SEV[normalizeSeverity("moderate")] is the Medium color (#eab308)', () => {
    expect(SEV[normalizeSeverity('moderate')]).toBe('#eab308');
  });

  it('SEV[normalizeSeverity("minor")] is the Low color (#22c55e)', () => {
    expect(SEV[normalizeSeverity('minor')]).toBe('#22c55e');
  });

  // Adversarial inputs still map to a valid SEV key
  const adversarialInputs = [null, undefined, 42, '', '   ', 'banana', 'SEVERE', { toString: () => 'High' }];
  adversarialInputs.forEach(input => {
    it(`adversarial input ${JSON.stringify(input)} produces a valid SEV key`, () => {
      const normalized = normalizeSeverity(input);
      expect(SEV[normalized]).toBeDefined();
    });
  });

  // Every alias in the SEVERITY_MAP must produce a valid SEV entry
  const allAliases = ['critical', 'high', 'medium', 'low', 'severe', 'extreme', 'elevated', 'moderate', 'minor'];
  allAliases.forEach(alias => {
    it(`alias "${alias}" maps to a valid SEV color`, () => {
      const normalized = normalizeSeverity(alias);
      expect(allCanonical).toContain(normalized);
      expect(SEV[normalized]).toBeDefined();
    });
  });
});

// ── getSev → SEV integration ──────────────────────────────

describe('getSev → SEV color map integration', () => {
  it('getSev(disruption) returns a key that exists in SEV', () => {
    expect(SEV[getSev(disruption)]).toBeDefined();
  });

  it('getSev(geopolitical) returns a key that exists in SEV', () => {
    expect(SEV[getSev(geopolitical)]).toBeDefined();
  });

  it('getSev(trade) returns a key that exists in SEV', () => {
    expect(SEV[getSev(trade)]).toBeDefined();
  });

  it('getSev on malformed item returns a key that exists in SEV', () => {
    const bare = {} as unknown as ScanItem;
    expect(SEV[getSev(bare)]).toBeDefined();
  });

  it('getSev with non-standard severity value still maps to valid SEV key', () => {
    const weird = { event: 'Test', severity: 'extreme', region: 'Global' } as unknown as ScanItem;
    expect(SEV[getSev(weird)]).toBeDefined();
  });
});
