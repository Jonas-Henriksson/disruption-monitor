import { useState, useCallback } from 'react';
import type { Severity } from '../types';
import { SEV, FM, F } from '../data';
import { S, T, B, ACCENT, TYP } from '../tokens';

interface ExecBrief {
  sevCounts: Record<string, number>;
  regions: Record<string, number>;
  topRegion: [string, number] | undefined;
  totalSites: number;
  escalating: string[];
  actions: string[];
  total: number;
}

interface TalkingPointsTabProps {
  execBrief: ExecBrief | null;
  modeLabel: string;
  rsc: Record<string, number>;
  loading: boolean;
  hasItems: boolean;
  /** Embedded mode renders a simpler variant for mobile bottom sheet */
  embedded?: boolean;
}

export function TalkingPointsTab({ execBrief, modeLabel, rsc, loading, hasItems, embedded = false }: TalkingPointsTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLine = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId('brief-' + text.slice(0, 20));
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  if (embedded) {
    return (
      <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '12px 16px', WebkitOverflowScrolling: 'touch' }}>
        {execBrief && (() => {
          const worstSev = execBrief.sevCounts.Critical > 0 ? 'Critical' : execBrief.sevCounts.High > 0 ? 'High' : execBrief.sevCounts.Medium > 0 ? 'Medium' : 'Low';
          const worstColor = SEV[worstSev as Severity];
          const headlineLine = `${execBrief.total} active ${modeLabel}, ${execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical + ' critical' : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High + ' high severity' : 'none critical'}`;
          const exposureLine = execBrief.topRegion ? `Highest exposure: ${execBrief.topRegion[0]} \u2014 ${execBrief.topRegion[1]} events, ${execBrief.totalSites} sites at risk` : '';
          const escalatingLine = execBrief.escalating.length > 0 ? `${execBrief.escalating.length} escalating: ${execBrief.escalating.join(', ')}` : '';
          const actionLine = execBrief.actions.length > 0 ? `Priority action: ${execBrief.actions[0]}` : '';
          const bullets: { text: string; borderColor: string; label: string; items?: string[] }[] = [
            { text: headlineLine, borderColor: worstColor, label: 'HEADLINE' },
          ];
          if (exposureLine) bullets.push({ text: exposureLine, borderColor: ACCENT.blueFactory, label: 'EXPOSURE' });
          if (execBrief.escalating.length > 0) bullets.push({ text: escalatingLine, borderColor: ACCENT.red, label: 'ESCALATING', items: execBrief.escalating });
          if (execBrief.actions.length > 0) bullets.push({ text: actionLine, borderColor: ACCENT.green, label: 'ACTION', items: execBrief.actions });

          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ ...TYP.label, color: T.primary, fontFamily: FM }}>Executive Summary</span>
              </div>
              {/* Severity distribution bar */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 16, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                {execBrief.sevCounts.Critical > 0 && <div style={{ flex: execBrief.sevCounts.Critical, background: SEV.Critical, borderRadius: 2 }} />}
                {execBrief.sevCounts.High > 0 && <div style={{ flex: execBrief.sevCounts.High, background: SEV.High, borderRadius: 2 }} />}
                {execBrief.sevCounts.Medium > 0 && <div style={{ flex: execBrief.sevCounts.Medium, background: SEV.Medium, borderRadius: 2 }} />}
                {execBrief.sevCounts.Low > 0 && <div style={{ flex: execBrief.sevCounts.Low, background: SEV.Low, borderRadius: 2 }} />}
              </div>
              {/* Severity counts row */}
              <div style={{ display: 'flex', gap: 1, marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: `1px solid ${B.subtle}` }}>
                {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
                  const count = execBrief.sevCounts[sev] || 0;
                  if (count === 0) return null;
                  const color = SEV[sev];
                  return (
                    <div key={sev} style={{ flex: 1, background: `${color}0d`, padding: '8px 6px', textAlign: 'center', borderRight: `1px solid ${B.subtle}` }}>
                      <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color, lineHeight: 1.2 }}>{count}</div>
                      <div style={{ fontSize: 8, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2, fontWeight: 600 }}>{sev}</div>
                    </div>
                  );
                })}
              </div>
              {/* Talking points */}
              <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {bullets.map((b, i) => (
                    <div key={i}>
                      {i > 0 && <div style={{ height: 1, background: B.subtle, margin: '6px 0', opacity: 0.5 }} />}
                      <div style={{ borderLeft: `3px solid ${b.borderColor}`, paddingLeft: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 2 }}>
                        <div style={{ ...TYP.label, color: `${b.borderColor}88`, fontFamily: FM, marginBottom: 3 }}>{b.label}</div>
                        {i === 0 ? (
                          <div style={{ fontSize: 13, fontWeight: 700, color: worstColor, lineHeight: 1.5 }}>
                            <span style={{ fontFamily: FM, fontWeight: 700 }}>{execBrief.total}</span>{' active ' + modeLabel}
                          </div>
                        ) : (b.items && b.items.length > 0) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                            {b.items.map((item, ii) => (
                              <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: T.body, lineHeight: 1.4 }}>
                                <span style={{ color: b.borderColor, fontSize: 8, marginTop: 3, flexShrink: 0, opacity: 0.7 }}>{'\u25b8'}</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, fontWeight: 400, color: T.body, lineHeight: 1.5 }}>{b.text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        {!execBrief && !loading && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: T.dim }}>
            <div style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>No data loaded</div>
          </div>
        )}
      </div>
    );
  }

  // Desktop variant
  return (
    <div className="sc-s" style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
      {execBrief && (() => {
        const worstSev = execBrief.sevCounts.Critical > 0 ? 'Critical' : execBrief.sevCounts.High > 0 ? 'High' : execBrief.sevCounts.Medium > 0 ? 'Medium' : 'Low';
        const worstColor = SEV[worstSev as Severity];
        const headlineLine = `${execBrief.total} active ${modeLabel}, ${execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical + ' critical' : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High + ' high severity' : 'none critical'}`;
        const exposureLine = execBrief.topRegion ? `Highest exposure: ${execBrief.topRegion[0]} \u2014 ${execBrief.topRegion[1]} events, ${execBrief.totalSites} sites at risk` : '';
        const escalatingLine = execBrief.escalating.length > 0 ? `${execBrief.escalating.length} escalating: ${execBrief.escalating.join(', ')}` : '';
        const actionLine = execBrief.actions.length > 0 ? `Priority action: ${execBrief.actions[0]}` : '';
        const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const fullBriefText = [
          `SC Hub Disruption Monitor \u2014 ${dateStr}`,
          `\u2022 ${headlineLine}`,
          exposureLine ? `\u2022 ${exposureLine}` : '',
          escalatingLine ? `\u2022 ${escalatingLine}` : '',
          actionLine ? `\u2022 ${actionLine}` : '',
        ].filter(Boolean).join('\n');

        const bullets: { text: string; borderColor: string; label: string; items?: string[] }[] = [
          { text: headlineLine, borderColor: worstColor, label: 'HEADLINE' },
        ];
        if (exposureLine) bullets.push({ text: exposureLine, borderColor: ACCENT.blueFactory, label: 'EXPOSURE' });
        if (execBrief.escalating.length > 0) bullets.push({ text: escalatingLine, borderColor: ACCENT.red, label: 'ESCALATING', items: execBrief.escalating });
        if (execBrief.actions.length > 0) bullets.push({ text: actionLine, borderColor: ACCENT.green, label: 'ACTION', items: execBrief.actions });

        return (
          <div>
            {/* Brief header with copy */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...TYP.label, color: T.primary, fontFamily: FM }}>Executive Summary</span>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(fullBriefText); setCopiedId('brief-all'); setTimeout(() => setCopiedId(null), 1500); }}
                style={{ background: S[1], border: `1px solid ${B.subtle}`, borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, fontFamily: FM, color: copiedId === 'brief-all' ? ACCENT.green : T.tertiary, cursor: 'pointer', transition: 'color .15s' }}
              >
                {copiedId === 'brief-all' ? 'Copied' : 'Copy Brief'}
              </button>
            </div>

            {/* Severity distribution bar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, height: 4, borderRadius: 2, overflow: 'hidden' }}>
              {execBrief.sevCounts.Critical > 0 && <div style={{ flex: execBrief.sevCounts.Critical, background: SEV.Critical, borderRadius: 2 }} />}
              {execBrief.sevCounts.High > 0 && <div style={{ flex: execBrief.sevCounts.High, background: SEV.High, borderRadius: 2 }} />}
              {execBrief.sevCounts.Medium > 0 && <div style={{ flex: execBrief.sevCounts.Medium, background: SEV.Medium, borderRadius: 2 }} />}
              {execBrief.sevCounts.Low > 0 && <div style={{ flex: execBrief.sevCounts.Low, background: SEV.Low, borderRadius: 2 }} />}
            </div>

            {/* Severity counts row */}
            <div style={{ display: 'flex', gap: 1, marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: `1px solid ${B.subtle}` }}>
              {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
                const count = execBrief.sevCounts[sev] || 0;
                if (count === 0) return null;
                const color = SEV[sev];
                return (
                  <div key={sev} style={{ flex: 1, background: `${color}0d`, padding: '8px 6px', textAlign: 'center', borderRight: `1px solid ${B.subtle}` }}>
                    <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color, lineHeight: 1.2 }}>{count}</div>
                    <div style={{ fontFamily: F, fontSize: 8, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2, fontWeight: 600 }}>{sev}</div>
                  </div>
                );
              })}
            </div>

            {/* Talking points bullets */}
            <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {bullets.map((b, i) => {
                  const isCopied = copiedId === 'brief-' + b.text.slice(0, 20);
                  const isListSection = (b.label === 'ESCALATING' || b.label === 'ACTION') && b.items && b.items.length > 0;
                  return (
                    <div key={i}>
                      {i > 0 && <div style={{ height: 1, background: B.subtle, margin: '6px 0', opacity: 0.5 }} />}
                      <div
                        onClick={() => copyLine(b.text)}
                        title="Click to copy"
                        style={{ borderLeft: `3px solid ${b.borderColor}`, paddingLeft: 10, paddingTop: 5, paddingBottom: 5, cursor: 'pointer', borderRadius: 2, transition: 'background .15s', background: isCopied ? `${b.borderColor}0d` : 'transparent' }}
                      >
                        <div style={{ ...TYP.label, color: `${b.borderColor}88`, fontFamily: FM, marginBottom: 3 }}>{b.label}</div>
                        {i === 0 ? (
                          <div style={{ fontSize: 13, fontWeight: 700, color: worstColor, lineHeight: 1.5 }}>
                            <span style={{ fontFamily: FM, fontWeight: 700 }}>{execBrief.total}</span>{' active ' + modeLabel + ', '}<span style={{ fontFamily: FM, fontWeight: 700, color: worstColor }}>{execBrief.sevCounts.Critical > 0 ? execBrief.sevCounts.Critical : execBrief.sevCounts.High > 0 ? execBrief.sevCounts.High : 0}</span>{execBrief.sevCounts.Critical > 0 ? ' critical' : execBrief.sevCounts.High > 0 ? ' high severity' : ' — none critical'}
                          </div>
                        ) : isListSection ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                            {b.items!.map((item, ii) => (
                              <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: T.body, lineHeight: 1.4 }}>
                                <span style={{ color: b.borderColor, fontSize: 8, marginTop: 3, flexShrink: 0, opacity: 0.7 }}>{b.label === 'ESCALATING' ? '\u25b8' : '\u2014'}</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, fontWeight: 400, color: T.body, lineHeight: 1.5 }}>{b.text}</div>
                        )}
                        {isCopied && <div style={{ fontSize: 8, color: ACCENT.green, fontFamily: FM, marginTop: 2 }}>Copied</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Regional breakdown */}
            {Object.keys(execBrief.regions).length > 1 && (
              <div style={{ background: S.base, border: `1px solid ${B.subtle}`, borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
                <div style={{ ...TYP.label, color: T.ghost, fontFamily: FM, marginBottom: 10 }}>Regional Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(execBrief.regions).sort((a, b) => b[1] - a[1]).map(([region, count]) => {
                    const pct = Math.round((count / execBrief.total) * 100);
                    const siteCount = rsc[region] || 0;
                    return (
                      <div key={region}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.body }}>{region}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 9, fontFamily: FM, color: T.muted }}>{siteCount} sites</span>
                            <span style={{ fontSize: 9, fontFamily: FM, color: T.tertiary, fontWeight: 600 }}>{count} events</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: S[2], borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: ACCENT.blueFactory, borderRadius: 2, opacity: 0.6, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {!execBrief && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: T.dim }}>
          <div style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>No data loaded</div>
          <div style={{ fontSize: 9, color: B.subtle, marginTop: 4, fontFamily: FM }}>Run a scan to generate talking points</div>
        </div>
      )}

      {/* Loading state */}
      {loading && !hasItems && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="sc-skel" style={{ height: 24, borderRadius: 4 }} />
          ))}
        </div>
      )}
    </div>
  );
}
