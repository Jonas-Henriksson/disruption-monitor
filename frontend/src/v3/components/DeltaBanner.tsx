/**
 * DeltaBanner — Shows changes since the user's last visit.
 * Reuses logic patterns from V2 WhatChanged component.
 */

import { useState, useMemo, useEffect } from 'react';
import { V3, TYPE, V3_FONT, sevColor } from '../theme';
import type { ScanItem, ScanMode, EventRegistryEntry } from '../../types';
import { eventId } from '../../utils/format';
import { getSev } from '../../utils/scan';

const LS_TIME_KEY = 'sc-hub-v3-last-visit';

export interface DeltaBannerProps {
  items: ScanItem[] | null;
  registry: Record<string, EventRegistryEntry>;
  mode: ScanMode | null;
  onOpenWeeklyBriefing: () => void;
}

interface DeltaSummary {
  newCritical: number;
  newHigh: number;
  resolved: number;
  newTotal: number;
  hoursSinceVisit: number;
}

function computeDelta(
  items: ScanItem[],
  registry: Record<string, EventRegistryEntry>,
  lastVisit: string | null,
): DeltaSummary {
  let newCritical = 0;
  let newHigh = 0;
  let newTotal = 0;
  let resolved = 0;

  const lastVisitMs = lastVisit ? new Date(lastVisit).getTime() : 0;
  const hoursSinceVisit = lastVisitMs
    ? (Date.now() - lastVisitMs) / (1000 * 60 * 60)
    : 0;

  items.forEach(d => {
    const eid = eventId(d as { event?: string; risk?: string; region?: string });
    const reg = registry[eid];
    if (reg?._new) {
      newTotal++;
      const sev = getSev(d);
      if (sev === 'Critical') newCritical++;
      if (sev === 'High') newHigh++;
    }
  });

  Object.values(registry).forEach(reg => {
    if (reg.status === 'archived' && reg.archivedAt) {
      if (lastVisitMs && new Date(reg.archivedAt).getTime() > lastVisitMs) {
        resolved++;
      }
    }
  });

  return { newCritical, newHigh, resolved, newTotal, hoursSinceVisit };
}

function formatTimeSince(hours: number): string {
  if (hours < 1) return 'less than 1h ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DeltaBanner({ items, registry, mode: _mode, onOpenWeeklyBriefing }: DeltaBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_TIME_KEY);
      if (stored) setLastVisit(stored);
    } catch { /* */ }
  }, []);

  // Save current visit time on unmount / when dismissing
  const saveVisitTime = () => {
    try {
      localStorage.setItem(LS_TIME_KEY, new Date().toISOString());
    } catch { /* */ }
  };

  const delta = useMemo(() => {
    if (!items || items.length === 0) return null;
    return computeDelta(items, registry, lastVisit);
  }, [items, registry, lastVisit]);

  if (dismissed || !delta) return null;

  const hasChanges = delta.newTotal > 0 || delta.resolved > 0;

  // Collapsed state: show a subtle dot
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Show change summary"
        style={{
          position: 'fixed',
          top: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 38,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: hasChanges ? V3.accent.blue : V3.text.muted,
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: V3.spacing.md,
      padding: `${V3.spacing.xs}px ${V3.spacing.lg}px`,
      background: hasChanges ? V3.accent.blueDim : V3.bg.card,
      borderBottom: `1px solid ${hasChanges ? V3.accent.blue + '33' : V3.border.subtle}`,
      fontFamily: V3_FONT,
      flexShrink: 0,
      fontSize: TYPE.body.fontSize,
      zIndex: 38,
    }}>
      {hasChanges ? (
        <span style={{ color: V3.text.secondary }}>
          {delta.newCritical > 0 && (
            <span style={{ color: sevColor('Critical'), fontWeight: 600 }}>
              +{delta.newCritical} Critical
            </span>
          )}
          {delta.newCritical > 0 && (delta.newHigh > 0 || delta.resolved > 0) && ', '}
          {delta.newHigh > 0 && (
            <span style={{ color: sevColor('High'), fontWeight: 600 }}>
              +{delta.newHigh} High
            </span>
          )}
          {delta.newHigh > 0 && delta.resolved > 0 && ', '}
          {delta.resolved > 0 && (
            <span style={{ color: V3.accent.green }}>
              {delta.resolved} resolved
            </span>
          )}
          {delta.newTotal > delta.newCritical + delta.newHigh && (
            <span style={{ color: V3.text.muted }}>
              , {delta.newTotal - delta.newCritical - delta.newHigh} new events
            </span>
          )}
          {delta.hoursSinceVisit > 0 && (
            <span style={{ color: V3.text.muted }}> since {formatTimeSince(delta.hoursSinceVisit)}</span>
          )}
        </span>
      ) : (
        <span style={{ color: V3.text.muted }}>
          No changes since your last visit{' '}
          <button
            onClick={onOpenWeeklyBriefing}
            style={{
              background: 'none',
              border: 'none',
              color: V3.text.accent,
              cursor: 'pointer',
              fontSize: TYPE.body.fontSize,
              fontFamily: V3_FONT,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            -- Weekly briefing available
          </button>
        </span>
      )}

      {/* Dismiss button */}
      <button
        onClick={() => {
          setDismissed(true);
          setCollapsed(true);
          saveVisitTime();
        }}
        style={{
          background: 'none',
          border: 'none',
          color: V3.text.muted,
          cursor: 'pointer',
          fontSize: 12,
          padding: 2,
          lineHeight: 1,
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        {'\u2715'}
      </button>
    </div>
  );
}
