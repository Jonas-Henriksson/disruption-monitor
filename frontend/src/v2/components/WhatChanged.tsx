/**
 * WhatChanged — Delta banner showing new/escalated/de-escalated/re-emerged
 * events since the last scan. Sits at the top of the EventPanel.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ScanItem, EventRegistryEntry } from '../../types';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import { eventId } from '../../utils/format';
import { getSev } from '../../utils/scan';

const LS_KEY = 'sc-hub-v2-last-seen-time';
const LS_SEV_KEY = 'sc-hub-v2-last-seen-sevs';

interface ChangeEntry {
  eid: string;
  label: string;
  idx: number;
}

interface ChangeSet {
  newEvents: ChangeEntry[];
  escalated: ChangeEntry[];
  deescalated: ChangeEntry[];
  reEmerged: ChangeEntry[];
}

export interface WhatChangedProps {
  items: ScanItem[];
  registry: Record<string, EventRegistryEntry>;
  sTime: Date | null;
  onSelect: (idx: number) => void;
  onDismiss: () => void;
}

function computeChanges(
  items: ScanItem[],
  registry: Record<string, EventRegistryEntry>,
  _lastSeenTime: string | null,
  lastSeenSevs: Record<string, string>,
): ChangeSet {
  const result: ChangeSet = { newEvents: [], escalated: [], deescalated: [], reEmerged: [] };
  const sevRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  items.forEach((d, idx) => {
    const eid = eventId(d as { event?: string; risk?: string; region?: string });
    const reg = registry[eid];
    const label = ('event' in d ? d.event : ('risk' in d ? (d as { risk: string }).risk : '')) as string;
    const currentSev = getSev(d);

    if (reg?._reEmerged) { result.reEmerged.push({ eid, label, idx }); return; }
    if (reg?._new) { result.newEvents.push({ eid, label, idx }); return; }

    const prevSev = lastSeenSevs[eid];
    if (prevSev && prevSev !== currentSev) {
      const prevRank = sevRank[prevSev] || 0;
      const currRank = sevRank[currentSev] || 0;
      if (currRank > prevRank) result.escalated.push({ eid, label, idx });
      else if (currRank < prevRank) result.deescalated.push({ eid, label, idx });
    }
  });

  return result;
}

export function WhatChanged({ items, registry, sTime, onSelect, onDismiss }: WhatChangedProps) {
  const { theme } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [viewedEids, setViewedEids] = useState<Set<string>>(new Set());
  const [lastSeenTime, setLastSeenTime] = useState<string | null>(null);
  const [lastSeenSevs, setLastSeenSevs] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);

  // Load last-seen state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setLastSeenTime(stored);
      const storedSevs = localStorage.getItem(LS_SEV_KEY);
      if (storedSevs) setLastSeenSevs(JSON.parse(storedSevs));
    } catch { /* */ }
  }, []);

  const changes = useMemo(() => {
    if (!items || items.length === 0) return null;
    return computeChanges(items, registry, lastSeenTime, lastSeenSevs);
  }, [items, registry, lastSeenTime, lastSeenSevs]);

  const totalChanges = useMemo(() => {
    if (!changes) return 0;
    return changes.newEvents.length + changes.escalated.length +
           changes.deescalated.length + changes.reEmerged.length;
  }, [changes]);

  // Auto-dismiss when all viewed
  useEffect(() => {
    if (!changes || totalChanges === 0) return;
    const allEids = [
      ...changes.newEvents, ...changes.escalated,
      ...changes.deescalated, ...changes.reEmerged,
    ].map(e => e.eid);
    if (allEids.length > 0 && allEids.every(eid => viewedEids.has(eid))) {
      const t = setTimeout(() => handleDismiss(), 1200);
      return () => clearTimeout(t);
    }
  }, [viewedEids, changes, totalChanges]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    setClosing(true);
    try {
      if (sTime) localStorage.setItem(LS_KEY, sTime.toISOString());
      if (items) {
        const sevMap: Record<string, string> = {};
        items.forEach(d => {
          const eid = eventId(d as { event?: string; risk?: string; region?: string });
          sevMap[eid] = getSev(d);
        });
        localStorage.setItem(LS_SEV_KEY, JSON.stringify(sevMap));
      }
    } catch { /* */ }
    setTimeout(() => { setDismissed(true); onDismiss(); }, 250);
  }, [sTime, items, onDismiss]);

  const handleClickEntry = useCallback((entry: ChangeEntry) => {
    setViewedEids(prev => new Set(prev).add(entry.eid));
    onSelect(entry.idx);
  }, [onSelect]);

  if (dismissed || !changes || totalChanges === 0) return null;

  const sections: Array<{
    entries: ChangeEntry[];
    color: string;
    icon: string;
    labelSingle: string;
    labelPlural: string;
  }> = [
    { entries: changes.newEvents, color: theme.accent.blue, icon: '\u26A1', labelSingle: 'new event detected', labelPlural: 'new events detected' },
    { entries: changes.escalated, color: theme.accent.red, icon: '\u2191', labelSingle: 'event escalated', labelPlural: 'events escalated' },
    { entries: changes.deescalated, color: theme.accent.green, icon: '\u2193', labelSingle: 'event de-escalated', labelPlural: 'events de-escalated' },
    { entries: changes.reEmerged, color: theme.accent.amber, icon: '\u26A0', labelSingle: 'event re-emerged', labelPlural: 'events re-emerged' },
  ];

  return (
    <div
      role="status"
      aria-label="What changed since last scan"
      style={{
        margin: `0 0 ${V2_SP.md}px`,
        background: theme.bg.tertiary,
        border: `1px solid ${theme.border.default}`,
        borderRadius: V2_BR.lg,
        padding: V2_SP.lg,
        position: 'relative',
        opacity: closing ? 0 : 1,
        transform: closing ? 'translateY(-8px)' : 'translateY(0)',
        transition: 'opacity 250ms ease, transform 250ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${theme.accent.blue}, ${theme.accent.cyan}, ${theme.accent.blue})`,
        opacity: 0.6, borderRadius: `${V2_BR.lg}px ${V2_BR.lg}px 0 0`,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: V2_SP.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm }}>
          <span style={{ ...V2_TYP.h3, color: theme.text.primary }}>What Changed</span>
          <span style={{
            ...V2_TYP.monoSm, color: theme.accent.blue,
            background: theme.accent.blue + '18', padding: '2px 8px',
            borderRadius: V2_BR.sm, border: `1px solid ${theme.accent.blue}33`,
          }}>
            {totalChanges}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          aria-label="Dismiss what changed banner"
          style={{
            background: 'transparent', border: 'none', color: theme.text.muted,
            fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1,
            borderRadius: V2_BR.sm, transition: 'color 150ms, background 150ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = theme.text.primary; (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = theme.text.muted; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Change sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>
        {sections.map(section => {
          if (section.entries.length === 0) return null;
          return (
            <div key={section.labelSingle}>
              <div
                role="button"
                aria-label={`${section.entries.length} ${section.entries.length === 1 ? section.labelSingle : section.labelPlural}`}
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: V2_SP.sm,
                  cursor: 'pointer', padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
                  borderRadius: V2_BR.sm,
                  background: section.color + '12',
                  border: `1px solid ${section.color}22`,
                  transition: 'background 150ms',
                }}
                onClick={() => handleClickEntry(section.entries[0])}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClickEntry(section.entries[0]); }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = section.color + '22'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = section.color + '12'; }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{section.icon}</span>
                <span style={{ ...V2_TYP.mono, color: section.color }}>{section.entries.length}</span>
                <span style={{ ...V2_TYP.bodySm, color: section.color, opacity: 0.85 }}>
                  {section.entries.length === 1 ? section.labelSingle : section.labelPlural}
                </span>
              </div>

              {/* Individual entries for small counts */}
              {section.entries.length <= 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: V2_SP.xs, paddingLeft: V2_SP.md }}>
                  {section.entries.map(entry => {
                    const isViewed = viewedEids.has(entry.eid);
                    return (
                      <div
                        key={entry.eid}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleClickEntry(entry); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClickEntry(entry); }}
                        style={{
                          ...V2_TYP.bodySm,
                          color: isViewed ? theme.text.muted : theme.text.secondary,
                          cursor: 'pointer', padding: `3px ${V2_SP.xs}px`,
                          borderRadius: V2_BR.sm, transition: 'color 150ms, background 150ms',
                          display: 'flex', alignItems: 'center', gap: V2_SP.xs,
                          textDecoration: isViewed ? 'line-through' : 'none',
                          textDecorationColor: theme.text.muted,
                        }}
                        onMouseEnter={e => { if (!isViewed) { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; (e.currentTarget as HTMLElement).style.color = theme.text.primary; } }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = isViewed ? theme.text.muted : theme.text.secondary; }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: isViewed ? theme.border.default : section.color,
                          flexShrink: 0, transition: 'background 150ms',
                        }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {entry.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
