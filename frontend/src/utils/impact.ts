import type { ImpactResult, Route, ScanItem, Severity, ExposureScore } from '../types';
import { DISRUPTION_IMPACT } from '../data/config';
import { ROUTES } from '../data/logistics';

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
