/**
 * TalkingPoints — executive talking points tab content
 *
 * Sections: severity snapshot bar, key talking points (headline, exposure,
 * escalating, actions), regional breakdown (top 5), copy brief button.
 */

import { useMemo, useState, useCallback } from 'react';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import { getSev, getEvent } from '../../utils/scan';
import type { ScanItem, Severity } from '../../types';

interface TalkingPointsProps {
  items: ScanItem[] | null;
  mode: string;
}

interface ExecBrief {
  sevCounts: Record<Severity, number>;
  regions: [string, number][];
  topRegion: string;
  totalSites: number;
  escalating: string[];
  actions: string[];
  total: number;
}

function computeExecBrief(items: ScanItem[], mode: string): ExecBrief {
  const sevCounts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const regions: Record<string, number> = {};
  let totalSites = 0;
  const escalating: string[] = [];
  const actions: string[] = [];

  items.forEach(d => {
    const sev = getSev(d);
    sevCounts[sev]++;
    const region = ('region' in d ? d.region : 'Global') as string;
    regions[region] = (regions[region] || 0) + 1;
    if ('affected_sites' in d && d.affected_sites) {
      totalSites += Array.isArray(d.affected_sites) ? d.affected_sites.length : 0;
    }
    const trend = ('trend' in d ? d.trend : '') as string;
    if (trend === 'Escalating' || trend === 'escalating' || trend === 'worsening') {
      escalating.push(getEvent(d));
    }
    if ('recommended_action' in d && d.recommended_action) {
      actions.push(d.recommended_action as string);
    }
  });

  const sortedRegions = Object.entries(regions).sort((a, b) => b[1] - a[1]);
  const topRegion = sortedRegions[0]?.[0] || 'Global';

  return { sevCounts, regions: sortedRegions, topRegion, totalSites, escalating, actions, total: items.length };
}

const SEV_ORDER: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

function sevColorKey(sev: Severity): 'critical' | 'high' | 'medium' | 'low' {
  return sev.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
}

export function TalkingPoints({ items, mode }: TalkingPointsProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [hoveredCopy, setHoveredCopy] = useState(false);

  const brief = useMemo(() => {
    if (!items?.length) return null;
    return computeExecBrief(items, mode);
  }, [items, mode]);

  const modeLabel = mode === 'trade' ? 'trade events' : mode === 'geopolitical' ? 'geopolitical risks' : 'disruptions';

  const copyBrief = useCallback(() => {
    if (!brief) return;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const worstSev = brief.sevCounts.Critical > 0 ? 'Critical' : brief.sevCounts.High > 0 ? 'High' : brief.sevCounts.Medium > 0 ? 'Medium' : 'Low';
    const lines = [
      `SC Hub Disruption Monitor -- ${dateStr}`,
      '',
      `HEADLINE: ${brief.total} active ${modeLabel}, ${brief.sevCounts.Critical} critical, ${brief.sevCounts.High} high severity`,
      '',
      `EXPOSURE: ${brief.regions.length} regions with active ${modeLabel}, ${brief.topRegion} most affected (${brief.regions[0]?.[1] || 0} events). ${brief.totalSites} sites at risk.`,
    ];
    if (brief.escalating.length > 0) {
      lines.push('', `ESCALATING (${brief.escalating.length}):`);
      brief.escalating.forEach(e => lines.push(`  - ${e}`));
    }
    if (brief.actions.length > 0) {
      lines.push('', 'PRIORITY ACTIONS:');
      brief.actions.slice(0, 3).forEach(a => lines.push(`  - ${a}`));
    }
    lines.push('', 'SEVERITY BREAKDOWN:');
    SEV_ORDER.forEach(sev => {
      if (brief.sevCounts[sev] > 0) lines.push(`  ${sev}: ${brief.sevCounts[sev]}`);
    });
    if (brief.regions.length > 0) {
      lines.push('', 'TOP REGIONS:');
      brief.regions.slice(0, 5).forEach(([r, c]) => lines.push(`  ${r}: ${c} events`));
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [brief, modeLabel]);

  if (!brief) {
    return (
      <div style={{ padding: V2_SP['2xl'], textAlign: 'center' }}>
        <div style={{ ...V2_TYP.label, color: theme.text.muted, marginBottom: V2_SP.sm }}>
          No data loaded
        </div>
        <div style={{ ...V2_TYP.caption, color: theme.text.muted }}>
          Run a scan to generate talking points
        </div>
      </div>
    );
  }

  const worstSev: Severity = brief.sevCounts.Critical > 0 ? 'Critical' : brief.sevCounts.High > 0 ? 'High' : brief.sevCounts.Medium > 0 ? 'Medium' : 'Low';
  const worstColor = theme.severity[sevColorKey(worstSev)];
  const totalBars = SEV_ORDER.reduce((sum, s) => sum + brief.sevCounts[s], 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.lg, padding: V2_SP.xl }}>
      {/* Header + Copy */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...V2_TYP.h2, color: theme.text.primary }}>Executive Summary</span>
        <button
          aria-label={copied ? 'Brief copied to clipboard' : 'Copy brief to clipboard'}
          onClick={copyBrief}
          onMouseEnter={() => setHoveredCopy(true)}
          onMouseLeave={() => setHoveredCopy(false)}
          style={{
            padding: `${V2_SP.xs}px ${V2_SP.md}px`,
            borderRadius: V2_BR.sm,
            border: `1px solid ${theme.border.subtle}`,
            background: hoveredCopy ? theme.bg.tertiary : theme.bg.secondary,
            color: copied ? theme.accent.green : theme.text.tertiary,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {copied ? 'Copied' : 'Copy Brief'}
        </button>
      </div>

      {/* Severity snapshot bar */}
      <div>
        <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: V2_BR.sm, overflow: 'hidden', marginBottom: V2_SP.sm }}>
          {SEV_ORDER.map(sev => {
            const count = brief.sevCounts[sev];
            if (count === 0) return null;
            return (
              <div
                key={sev}
                style={{
                  flex: count,
                  background: theme.severity[sevColorKey(sev)],
                  borderRadius: V2_BR.sm,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 1, borderRadius: V2_BR.md, overflow: 'hidden', border: `1px solid ${theme.border.subtle}` }}>
          {SEV_ORDER.map(sev => {
            const count = brief.sevCounts[sev];
            const color = theme.severity[sevColorKey(sev)];
            const bgKey = `${sevColorKey(sev)}Bg` as keyof typeof theme.severity;
            return (
              <div
                key={sev}
                style={{
                  flex: 1,
                  background: count > 0 ? theme.severity[bgKey] : theme.bg.tertiary,
                  padding: `${V2_SP.sm}px ${V2_SP.xs}px`,
                  textAlign: 'center',
                  borderRight: `1px solid ${theme.border.subtle}`,
                }}
              >
                <div style={{ fontFamily: V2_FONT_MONO, fontSize: 15, fontWeight: 700, color: count > 0 ? color : theme.text.muted, lineHeight: 1.2 }}>
                  {count}
                </div>
                <div style={{ fontSize: 9, color: count > 0 ? theme.text.tertiary : theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2, fontWeight: 600 }}>
                  {sev}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key talking points */}
      <div style={{ background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: V2_BR.lg, padding: `${V2_SP.lg}px ${V2_SP.xl}px` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Headline */}
          <TalkingPoint
            label="HEADLINE"
            borderColor={worstColor}
          >
            <div style={{ ...V2_TYP.h3, color: worstColor, lineHeight: 1.5 }}>
              <span style={{ fontFamily: V2_FONT_MONO, fontWeight: 700 }}>{brief.total}</span>
              {' active ' + modeLabel + ', '}
              <span style={{ fontFamily: V2_FONT_MONO, fontWeight: 700, color: worstColor }}>
                {brief.sevCounts.Critical > 0 ? brief.sevCounts.Critical : brief.sevCounts.High > 0 ? brief.sevCounts.High : 0}
              </span>
              {brief.sevCounts.Critical > 0 ? ' critical' : brief.sevCounts.High > 0 ? ' high severity' : ' \u2014 none critical'}
            </div>
          </TalkingPoint>

          <PointDivider />

          {/* Exposure */}
          <TalkingPoint
            label="EXPOSURE"
            borderColor={theme.accent.blue}
          >
            <div style={{ ...V2_TYP.bodySm, color: theme.text.secondary, lineHeight: 1.5 }}>
              {brief.regions.length} region{brief.regions.length !== 1 ? 's' : ''} with active {modeLabel}, <strong style={{ color: theme.text.primary }}>{brief.topRegion}</strong> most affected
              {brief.totalSites > 0 && <> \u2014 {brief.totalSites} site{brief.totalSites !== 1 ? 's' : ''} at risk</>}
            </div>
          </TalkingPoint>

          {/* Escalating */}
          {brief.escalating.length > 0 && (
            <>
              <PointDivider />
              <TalkingPoint
                label="ESCALATING"
                borderColor={theme.severity.critical}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  {brief.escalating.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, ...V2_TYP.bodySm, color: theme.text.secondary, lineHeight: 1.4 }}>
                      <span style={{ color: theme.severity.critical, fontSize: 9, marginTop: 4, flexShrink: 0, opacity: 0.8 }}>{'\u25B8'}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </TalkingPoint>
            </>
          )}

          {/* Actions */}
          {brief.actions.length > 0 && (
            <>
              <PointDivider />
              <TalkingPoint
                label="ACTION"
                borderColor={theme.accent.green}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  {brief.actions.slice(0, 3).map((action, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, ...V2_TYP.bodySm, color: theme.text.secondary, lineHeight: 1.4 }}>
                      <span style={{ color: theme.accent.green, fontSize: 9, marginTop: 4, flexShrink: 0, opacity: 0.8 }}>{'\u2014'}</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </TalkingPoint>
            </>
          )}
        </div>
      </div>

      {/* Regional breakdown */}
      {brief.regions.length > 1 && (
        <div style={{ background: theme.bg.secondary, border: `1px solid ${theme.border.subtle}`, borderRadius: V2_BR.lg, padding: `${V2_SP.lg}px ${V2_SP.xl}px` }}>
          <div style={{ ...V2_TYP.label, color: theme.text.muted, marginBottom: V2_SP.md }}>Regional Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
            {brief.regions.slice(0, 5).map(([region, count]) => {
              const maxCount = brief.regions[0]?.[1] || 1;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={region}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ ...V2_TYP.bodySm, fontWeight: 600, color: theme.text.secondary }}>{region}</span>
                    <span style={{ fontFamily: V2_FONT_MONO, fontSize: 11, color: theme.text.tertiary, fontWeight: 600 }}>
                      {count} event{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ height: 4, background: theme.bg.tertiary, borderRadius: V2_BR.sm, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: theme.accent.blue,
                        borderRadius: V2_BR.sm,
                        opacity: 0.6,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function TalkingPoint({
  label,
  borderColor,
  children,
}: {
  label: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        paddingLeft: V2_SP.md,
        paddingTop: V2_SP.xs + 1,
        paddingBottom: V2_SP.xs + 1,
        borderRadius: 2,
      }}
    >
      <div style={{ ...V2_TYP.label, fontSize: 9, color: `${borderColor}88`, marginBottom: 3 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PointDivider() {
  const { theme } = useTheme();
  return (
    <div style={{ height: 1, background: theme.border.subtle, margin: `${V2_SP.xs}px 0`, opacity: 0.5 }} />
  );
}
