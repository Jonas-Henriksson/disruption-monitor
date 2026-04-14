/**
 * WhatIfPanel — Slide-out drawer for supply chain scenario modeling.
 *
 * Allows users to simulate region/country disruptions or chokepoint closures,
 * view affected factories, BU impact breakdown, and sole-source risks.
 */

import { useState } from 'react';
import { useV3Theme } from '../ThemeContext';
import { V3_FONT, V3_FONT_MONO } from '../theme';
import { fetchWhatIf } from '../../services/api';
import type { WhatIfResult } from '../../types';

const COUNTRIES = [
  'Germany', 'China', 'Japan', 'India', 'United States', 'Sweden',
  'Italy', 'France', 'South Korea', 'United Kingdom', 'Austria',
  'Czech Republic', 'Finland', 'Mexico', 'Canada', 'Poland',
  'Bulgaria', 'Morocco', 'Brazil',
];

const CHOKEPOINTS = [
  'Suez Canal', 'Panama Canal', 'Strait of Malacca',
  'Bosporus', 'Strait of Hormuz', 'Cape of Good Hope',
];

const DURATIONS = [
  { label: '1w', weeks: 1 },
  { label: '2w', weeks: 2 },
  { label: '4w', weeks: 4 },
  { label: '8w', weeks: 8 },
  { label: '12w', weeks: 12 },
];

interface WhatIfPanelProps {
  open: boolean;
  onClose: () => void;
}

export function WhatIfPanel({ open, onClose }: WhatIfPanelProps) {
  const { theme: V3 } = useV3Theme();

  const [scenarioType, setScenarioType] = useState<'region' | 'chokepoint'>('region');
  const [target, setTarget] = useState<string | null>(null);
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = scenarioType === 'region' ? COUNTRIES : CHOKEPOINTS;

  const handleRun = async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchWhatIf({
        scenario_type: scenarioType === 'region' ? 'region_disruption' : 'chokepoint_closure',
        target,
        duration_weeks: durationWeeks,
      });
      if (res) {
        setResult(res);
      } else {
        setError('Simulation failed — backend unreachable or returned an error.');
      }
    } catch {
      setError('Simulation failed — unexpected error.');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeToggle = (type: 'region' | 'chokepoint') => {
    setScenarioType(type);
    setTarget(null);
    setResult(null);
    setError(null);
  };

  if (!open) return null;

  const pillStyle = (active: boolean, color?: string): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: V3.radius.full,
    border: `1px solid ${active ? (color || V3.accent.blue) + '55' : V3.border.subtle}`,
    background: active ? (color || V3.accent.blue) + '18' : 'transparent',
    color: active ? (color || V3.accent.blue) : V3.text.muted,
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    fontFamily: V3_FONT,
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: V3.text.muted,
    fontFamily: V3_FONT_MONO,
    marginBottom: 8,
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 420,
      background: V3.bg.sidebar,
      borderLeft: `1px solid ${V3.border.default}`,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: V3_FONT,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${V3.spacing.md}px ${V3.spacing.lg}px`,
        borderBottom: `1px solid ${V3.border.subtle}`,
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: V3.text.primary,
          letterSpacing: '-0.02em',
        }}>
          What-If Scenario
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: V3.radius.sm,
            border: `1px solid ${V3.border.subtle}`,
            background: 'transparent',
            color: V3.text.muted,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          X
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: 'auto', padding: V3.spacing.lg }}>
        {/* Scenario type toggle */}
        <div style={{ marginBottom: V3.spacing.lg }}>
          <div style={sectionLabel}>Scenario Type</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleTypeToggle('region')} style={pillStyle(scenarioType === 'region', V3.accent.blue)}>
              Region / Country
            </button>
            <button onClick={() => handleTypeToggle('chokepoint')} style={pillStyle(scenarioType === 'chokepoint', V3.accent.purple)}>
              Chokepoint
            </button>
          </div>
        </div>

        {/* Target selection */}
        <div style={{ marginBottom: V3.spacing.lg }}>
          <div style={sectionLabel}>
            {scenarioType === 'region' ? 'Country' : 'Chokepoint'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => setTarget(opt)}
                style={pillStyle(target === opt, scenarioType === 'region' ? V3.accent.blue : V3.accent.purple)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: V3.spacing.lg }}>
          <div style={sectionLabel}>Duration</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DURATIONS.map(d => (
              <button
                key={d.weeks}
                onClick={() => setDurationWeeks(d.weeks)}
                style={{
                  ...pillStyle(durationWeeks === d.weeks, V3.accent.amber),
                  fontFamily: V3_FONT_MONO,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={!target || loading}
          style={{
            width: '100%',
            padding: `${V3.spacing.sm}px ${V3.spacing.md}px`,
            borderRadius: V3.radius.md,
            border: 'none',
            background: !target ? V3.bg.badge : V3.accent.blue,
            color: !target ? V3.text.muted : '#fff',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: V3_FONT,
            cursor: !target || loading ? 'not-allowed' : 'pointer',
            marginBottom: V3.spacing.lg,
            transition: 'all 150ms',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Running simulation...' : 'Run Simulation'}
        </button>

        {/* Error */}
        {error && (
          <div style={{
            padding: V3.spacing.sm,
            borderRadius: V3.radius.md,
            background: V3.severity.criticalBg,
            border: `1px solid ${V3.severity.criticalBorder}`,
            color: V3.severity.critical,
            fontSize: 11,
            marginBottom: V3.spacing.lg,
          }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[120, 80, 160, 100].map((w, i) => (
              <div
                key={i}
                className="sc-skel"
                style={{
                  height: 16,
                  width: w,
                  borderRadius: V3.radius.sm,
                  background: V3.bg.badge,
                }}
              />
            ))}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: V3.spacing.lg }}>
            {/* Summary badges */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1,
                padding: V3.spacing.sm,
                borderRadius: V3.radius.md,
                background: V3.accent.blueDim,
                border: `1px solid ${V3.accent.blue}33`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: V3_FONT_MONO, color: V3.accent.blue }}>
                  {result.total_factories_affected}
                </div>
                <div style={{ fontSize: 9, color: V3.text.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Factories Affected
                </div>
              </div>
              <div style={{
                flex: 1,
                padding: V3.spacing.sm,
                borderRadius: V3.radius.md,
                background: V3.severity.criticalBg,
                border: `1px solid ${V3.severity.criticalBorder}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: V3_FONT_MONO, color: V3.severity.critical }}>
                  {result.sole_source_risks.length}
                </div>
                <div style={{ fontSize: 9, color: V3.text.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sole-Source Risks
                </div>
              </div>
            </div>

            {/* BU Impact breakdown */}
            {result.bu_impact.length > 0 && (
              <div>
                <div style={sectionLabel}>BU Impact</div>
                <div style={{
                  borderRadius: V3.radius.md,
                  border: `1px solid ${V3.border.subtle}`,
                  overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: V3_FONT }}>
                    <thead>
                      <tr style={{ background: V3.bg.card }}>
                        {['BU', 'Factories', 'T1 Inputs', 'Sole Src', 'Spend %'].map(h => (
                          <th key={h} style={{
                            padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
                            textAlign: 'left',
                            fontWeight: 600,
                            color: V3.text.muted,
                            fontSize: 9,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            borderBottom: `1px solid ${V3.border.subtle}`,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.bu_impact.map(bu => (
                        <tr key={bu.bu}>
                          <td style={{ padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`, color: V3.text.primary, fontWeight: 600 }}>{bu.bu}</td>
                          <td style={{ padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`, color: V3.text.secondary, fontFamily: V3_FONT_MONO }}>{bu.factory_count}</td>
                          <td style={{ padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`, color: V3.text.secondary, fontFamily: V3_FONT_MONO }}>{bu.t1_inputs_at_risk}</td>
                          <td style={{ padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`, color: bu.sole_source_count > 0 ? V3.severity.critical : V3.text.muted, fontFamily: V3_FONT_MONO, fontWeight: bu.sole_source_count > 0 ? 700 : 400 }}>{bu.sole_source_count}</td>
                          <td style={{ padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`, color: V3.accent.amber, fontFamily: V3_FONT_MONO }}>{bu.exposed_spend_pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sole-source detail list */}
            {result.sole_source_risks.length > 0 && (
              <div>
                <div style={sectionLabel}>Sole-Source Detail</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.sole_source_risks.map((risk, i) => (
                    <div key={i} style={{
                      padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
                      borderRadius: V3.radius.sm,
                      background: V3.severity.criticalBg,
                      border: `1px solid ${V3.severity.criticalBorder}`,
                      fontSize: 10,
                    }}>
                      <span style={{ color: V3.text.primary, fontWeight: 600 }}>{risk.factory}</span>
                      <span style={{ color: V3.text.muted }}> / {risk.bu}</span>
                      <span style={{ color: V3.text.muted }}> — </span>
                      <span style={{ color: V3.severity.critical, fontWeight: 600 }}>{risk.input}</span>
                      <span style={{ color: V3.text.muted }}> from {risk.supplier_country}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Affected factories list (max 12) */}
            {result.affected_factories.length > 0 && (
              <div>
                <div style={sectionLabel}>
                  Affected Factories
                  {result.affected_factories.length > 12 && (
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', marginLeft: 6 }}>
                      (showing 12 of {result.affected_factories.length})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.affected_factories.slice(0, 12).map((f, i) => (
                    <div key={i} style={{
                      padding: `${V3.spacing.xs}px ${V3.spacing.sm}px`,
                      borderRadius: V3.radius.sm,
                      background: V3.bg.card,
                      border: `1px solid ${V3.border.subtle}`,
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <span style={{ color: V3.text.primary, fontWeight: 600 }}>{f.factory}</span>
                        <span style={{ color: V3.text.muted, marginLeft: 6 }}>{f.bu}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontFamily: V3_FONT_MONO }}>
                        <span style={{ color: V3.text.secondary }}>{f.t1_count} T1</span>
                        {f.sole_source && (
                          <span style={{ color: V3.severity.critical, fontWeight: 700, fontSize: 9 }}>SOLE</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
