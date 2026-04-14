import type { ImpactResult, Route, ScanItem, Severity, ExposureScore, SupplyGraphInput } from '../types';
import { DISRUPTION_IMPACT } from '../data/config';
import { ROUTES } from '../data/logistics';
import { SUPPLY_GRAPH } from '../data/suppliers';
import { SITES } from '../data/sites';

export function computeImpact(
  disruption: ScanItem,
  routeData: Route[] = ROUTES,
  supplyGraph?: Record<string, { sup: string[] }>,
): ImpactResult {
  const region = ('region' in disruption ? disruption.region : undefined) || 'Global';
  const affectedCorridors = new Set(DISRUPTION_IMPACT[region] || []);

  // Find affected routes
  const affRoutes = routeData
    .map((r, i) => affectedCorridors.has(r.corridor) ? i : null)
    .filter((x): x is number => x !== null);

  // Find origin factories from affected routes
  const affFactories = new Set<string>();
  affRoutes.forEach(ri => {
    const origin = routeData[ri].origin;
    if (origin) affFactories.add(origin);
  });

  // Region mapping
  const regionMap: Record<string, string> = {
    'Europe': 'EU', 'Middle East': 'MEA', 'China': 'APAC',
    'India': 'APAC', 'Americas': 'AM', 'Africa': 'AF',
  };
  const affRegion = regionMap[region];

  // Find supplier countries feeding affected factories
  const affSuppliers = new Set<string>();
  if (supplyGraph) {
    affFactories.forEach(f => {
      const g = supplyGraph[f];
      if (g) g.sup.forEach(s => affSuppliers.add(s));
    });
  }

  return {
    routes: affRoutes,
    factories: [...affFactories],
    suppliers: [...affSuppliers],
    region: affRegion,
    corridors: [...affectedCorridors],
  };
}

// Convenience wrapper that always includes supply graph enrichment
export function computeImpactWithGraph(
  disruption: ScanItem,
  routeData: Route[],
  supplyGraph: Record<string, { sup: string[] }>,
): ImpactResult {
  return computeImpact(disruption, routeData, supplyGraph);
}

// Compute exposure scores for manufacturing sites
export function computeExposureScores(
  items: ScanItem[],
  routeData: Route[],
  supplyGraph: Record<string, { sup: string[]; inputs: string[]; bu: string }>,
): Record<string, ExposureScore> {
  const scores: Record<string, ExposureScore> = {};
  const sevW: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  Object.entries(supplyGraph).forEach(([site, graph]) => {
    let score = 0;
    const threats: ExposureScore['threats'] = [];

    items.forEach(d => {
      const impact = computeImpactWithGraph(d, routeData, supplyGraph);
      const hitFactory = impact.factories.includes(site);
      const hitSupplier = graph.sup.some(s => impact.suppliers.includes(s));
      const hitRoute = impact.routes.some(ri => routeData[ri]?.origin === site);

      if (hitFactory || hitSupplier || hitRoute) {
        const sev = ('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : 'Medium')) as string;
        const w = sevW[sev] || 2;
        const directness = hitFactory ? 1.0 : hitRoute ? 0.7 : 0.4;
        score += w * directness;
        threats.push({
          event: ('event' in d ? d.event : ('risk' in d ? d.risk : '')),
          severity: sev as Severity,
          direct: hitFactory,
          route: hitRoute,
          supplier: hitSupplier,
        });
      }
    });

    if (score > 0) {
      scores[site] = {
        score: Math.round(score * 10) / 10,
        level: score >= 8 ? 'Critical' : score >= 5 ? 'High' : score >= 2 ? 'Medium' : 'Low',
        threats,
      };
    }
  });

  return scores;
}

/**
 * Client-side enrichment: compute affected_sites, input_details, and routing_context
 * from SUPPLY_GRAPH when they're missing from the event data.
 * Mirrors the backend's _enrich_supply_chain_data logic.
 */
export interface EnrichedExposure {
  affected_sites: Array<{ name: string; type: string; distance_km: number }>;
  input_details: SupplyGraphInput[];
  routing_context: string[];
}

export function enrichExposureData(item: ScanItem): EnrichedExposure {
  // If already fully enriched by backend, return existing (but still cap)
  const rec = item as Record<string, unknown>;
  if (
    Array.isArray(rec.input_details) && (rec.input_details as unknown[]).length > 0 &&
    Array.isArray(rec.affected_sites) && (rec.affected_sites as unknown[]).length > 0
  ) {
    return {
      affected_sites: (rec.affected_sites as EnrichedExposure['affected_sites']).slice(0, 8),
      input_details: (rec.input_details as SupplyGraphInput[]).slice(0, 15),
      routing_context: Array.isArray(rec.routing_context) ? (rec.routing_context as string[]).slice(0, 10) : [],
    };
  }

  const impact = computeImpactWithGraph(item, ROUTES, SUPPLY_GRAPH);
  const region = ('region' in item ? item.region : 'Global') as string;

  // Broad regions should NOT trigger supplier-country matching
  const BROAD_REGIONS = new Set(['Europe', 'Americas', 'Global', 'Middle East', 'Africa', 'Asia', 'APAC']);
  const isSpecificCountry = !BROAD_REGIONS.has(region);

  // Use existing affected_sites if present
  let affectedSites: EnrichedExposure['affected_sites'] =
    Array.isArray(rec.affected_sites) && (rec.affected_sites as unknown[]).length > 0
      ? (rec.affected_sites as EnrichedExposure['affected_sites'])
      : [];

  if (affectedSites.length === 0) {
    // 1. Direct: factories on affected routes
    for (const factoryName of impact.factories) {
      const site = SITES.find(s => s.name === factoryName);
      if (site) affectedSites.push({ name: site.name, type: site.type, distance_km: 0 });
    }
    // 2. Supplier exposure: only for specific countries
    if (isSpecificCountry) {
      for (const [siteName, graph] of Object.entries(SUPPLY_GRAPH)) {
        if (affectedSites.some(s => s.name === siteName)) continue;
        if (affectedSites.length >= 8) break;
        if (graph.sup.includes(region)) {
          const site = SITES.find(s => s.name === siteName);
          if (site && site.type === 'mfg') {
            affectedSites.push({ name: site.name, type: site.type, distance_km: -1 });
          }
        }
      }
    }
  }
  // Cap at 8
  affectedSites = affectedSites.slice(0, 8);

  // Build input_details — only for affected MFG sites
  let inputDetails: SupplyGraphInput[] =
    Array.isArray(rec.input_details) && (rec.input_details as unknown[]).length > 0
      ? (rec.input_details as SupplyGraphInput[])
      : [];
  const routingContext: string[] =
    Array.isArray(rec.routing_context) && (rec.routing_context as unknown[]).length > 0
      ? (rec.routing_context as string[])
      : [];

  if (inputDetails.length === 0) {
    const seen = new Set<string>();
    for (const site of affectedSites) {
      const graph = SUPPLY_GRAPH[site.name];
      if (!graph?.input_details) continue;
      for (const inp of graph.input_details) {
        const key = `${site.name}|${inp.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          inputDetails.push(inp);
        }
      }
      if (graph.sup.length > 0) {
        routingContext.push(
          `${site.name} (${graph.bu}) sources from ${graph.sup.slice(0, 4).join(', ')}${graph.sup.length > 4 ? ` +${graph.sup.length - 4} more` : ''}`,
        );
      }
    }
    inputDetails.sort((a, b) => (a.tier - b.tier) || ((b.sole_source ? 1 : 0) - (a.sole_source ? 1 : 0)));
  }

  return {
    affected_sites: affectedSites,
    input_details: inputDetails.slice(0, 15),
    routing_context: routingContext.slice(0, 10),
  };
}
