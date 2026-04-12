/**
 * RiskSummary — Sidebar component showing severity counts, top regions, and trend sparkline.
 */

import { useMemo, useEffect, useState } from 'react';
import { V3, TYPE, V3_FONT, V3_FONT_MONO, sevColor, sevBg } from '../theme';
import type { ScanItem, Severity } from '../../types';
import { getSev, getRegion } from '../../utils/scan';
import { fetchTimeline, type TimelineDataPoint } from '../../services/api';

export interface RiskSummaryProps {
  items: ScanItem[] | null;
  previousItems?: ScanItem[] | null;
}

interface SevCount {
  severity: Severity;
  count: number;
  delta: number;
}

function computeSeverityCounts(items: ScanItem[] | null, prevItems?: ScanItem[] | null): SevCount[] {
  const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const prevCounts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };

  if (items) {
    items.forEach(d => { counts[getSev(d)]++; });
  }
  if (prevItems) {
    prevItems.forEach(d => { prevCounts[getSev(d)]++; });
  }

  return (['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(s => ({
    severity: s,
    count: counts[s],
    delta: prevItems ? counts[s] - prevCounts[s] : 0,
  }));
}

function computeTopRegions(items: ScanItem[] | null): { region: string; count: number; severity: Severity }[] {
  if (!items) return [];
  const regionMap: Record<string, { count: number; maxSev: number }> = {};
  const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const RANK_SEV: Record<number, Severity> = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low' };

  items.forEach(d => {
    const region = getRegion(d);
    if (!regionMap[region]) regionMap[region] = { count: 0, maxSev: 0 };
    regionMap[region].count++;
    const rank = SEV_RANK[getSev(d)] || 1;
    if (rank > regionMap[region].maxSev) regionMap[region].maxSev = rank;
  });

  return Object.entries(regionMap)
    .map(([region, data]) => ({
      region,
      count: data.count,
      severity: RANK_SEV[data.maxSev] || 'Low' as Severity,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/** Tiny inline sparkline component */
function Sparkline({ data }: { data: TimelineDataPoint[] }) {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map(d => d.event_count), 1);
  const w = 200;
  const h = 40;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.event_count / maxVal) * (h - 4);
    return `${x},${y}`;
  });
  const critPoints = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.critical_count / maxVal) * (h - 4);
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={V3.accent.blue}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />
      <polyline
        points={critPoints.join(' ')}
        fill="none"
        stroke={V3.severity.critical}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.4}
        strokeDasharray="3,2"
      />
    </svg>
  );
}

export function RiskSummary({ items, previousItems }: RiskSummaryProps) {
  const [timeline, setTimeline] = useState<TimelineDataPoint[] | null>(null);

  useEffect(() => {
    fetchTimeline(30).then(data => { if (data) setTimeline(data); });
  }, []);

  const sevCounts = useMemo(() => computeSeverityCounts(items, previousItems), [items, previousItems]);
  const topRegions = useMemo(() => computeTopRegions(items), [items]);
  const maxRegionCount = useMemo(() => Math.max(...topRegions.map(r => r.count), 1), [topRegions]);
  const hasCritical = sevCounts[0].count > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: V3.spacing.lg,
      padding: V3.spacing.lg,
      fontFamily: V3_FONT,
    }}>
      {/* Severity counts */}
      <div>
        <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
          SEVERITY BREAKDOWN
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: V3.spacing.sm }}>
          {sevCounts.map(s => (
            <div
              key={s.severity}
              style={{
                padding: V3.spacing.md,
                borderRadius: V3.radius.md,
                background: sevBg(s.severity),
                border: `1px solid ${sevColor(s.severity)}22`,
                display: 'flex',
                alignItems: 'baseline',
                gap: V3.spacing.xs,
              }}
            >
              <span style={{
                ...(hasCritical && s.severity === 'Critical' ? TYPE.hero : TYPE.heroSm),
                color: sevColor(s.severity),
              }}>
                {s.count}
              </span>
              <div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: sevColor(s.severity),
                  textTransform: 'uppercase',
                }}>
                  {s.severity}
                </div>
                {s.delta !== 0 && (
                  <div style={{
                    ...TYPE.mono,
                    fontFamily: V3_FONT_MONO,
                    fontSize: 9,
                    color: s.delta > 0 ? V3.severity.critical : V3.accent.green,
                  }}>
                    {s.delta > 0 ? '+' : ''}{s.delta}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Affected Regions */}
      {topRegions.length > 0 && (
        <div>
          <div style={{ ...TYPE.sectionHeader, color: V3.text.muted, marginBottom: V3.spacing.sm }}>
            TOP AFFECTED REGIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: V3.spacing.xs }}>
            {topRegions.map(r => (
              <div key={r.region}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 2,
                }}>
                  <span style={{ ...TYPE.body, color: V3.text.secondary, fontSize: 11 }}>
                    {r.region}
                  </span>
                  <span style={{ ...TYPE.mono, fontFamily: V3_FONT_MONO, color: V3.text.muted, fontSize: 10 }}>
                    {r.count}
                  </span>
                </div>
                <div style={{
                  height: 4,
                  borderRadius: 2,
                  background: V3.bg.card,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(r.count / maxRegionCount) * 100}%`,
                    background: sevColor(r.severity),
                    borderRadius: 2,
                    transition: 'width 300ms ease',
                    opacity: 0.7,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 30-day trend sparkline */}
      {timeline && timeline.length > 1 && (
        <div>
          <div style={{
            ...TYPE.sectionHeader,
            color: V3.text.muted,
            marginBottom: V3.spacing.sm,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>30-DAY TREND</span>
            <span style={{ fontSize: 9, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              <span style={{ color: V3.accent.blue }}>Total</span>
              {' / '}
              <span style={{ color: V3.severity.critical }}>Critical</span>
            </span>
          </div>
          <div style={{
            padding: V3.spacing.sm,
            background: V3.bg.card,
            borderRadius: V3.radius.md,
            border: `1px solid ${V3.border.subtle}`,
          }}>
            <Sparkline data={timeline} />
          </div>
        </div>
      )}
    </div>
  );
}
