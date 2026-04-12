import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ScanItem, Severity } from '../types';
import { FM, SO, SEV } from '../data';
import { S, T, B, ACCENT } from '../tokens';
import { SectionHeader, Badge } from './ui';
import { eventId } from '../utils/format';
import { getSev, getEvent, getTrend } from '../utils/scan';

const LS_KEY = 'sc-hub-last-seen-time';
const LS_SEV_KEY = 'sc-hub-last-seen-sevs';

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

interface WhatChangedBannerProps {
  items: ScanItem[] | null;
  registry: Record<string, Record<string, unknown>>;
  sTime: Date | null;
  onScrollTo: (idx: number) => void;
}

/** Compute what changed since the user last dismissed the banner */
function computeChanges(
  items: ScanItem[],
  registry: Record<string, Record<string, unknown>>,
  lastSeenTime: string | null,
  lastSeenSevs: Record<string, string>,
): ChangeSet {
  const result: ChangeSet = {
    newEvents: [],
    escalated: [],
    deescalated: [],
    reEmerged: [],
  };

  const sevRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  items.forEach((d, idx) => {
    const eid = eventId(d as { event?: string; risk?: string; region?: string });
    const reg = registry[eid];
    const label = ('event' in d ? d.event : ('risk' in d ? (d as { risk: string }).risk : '')) as string;
    const currentSev = getSev(d);

    if (reg?._reEmerged) {
      result.reEmerged.push({ eid, label, idx });
      return;
    }

    if (reg?._new) {
      result.newEvents.push({ eid, label, idx });
      return;
    }

    // Check severity changes against last-seen severities
    const prevSev = lastSeenSevs[eid];
    if (prevSev && prevSev !== currentSev) {
      const prevRank = sevRank[prevSev] || 0;
      const currRank = sevRank[currentSev] || 0;
      if (currRank > prevRank) {
        result.escalated.push({ eid, label, idx });
      } else if (currRank < prevRank) {
        result.deescalated.push({ eid, label, idx });
      }
    }
  });

  return result;
}

export function WhatChangedBanner({ items, registry, sTime, onScrollTo }: WhatChangedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [viewedEids, setViewedEids] = useState<Set<string>>(new Set());
  const [lastSeenTime, setLastSeenTime] = useState<string | null>(null);
  const [lastSeenSevs, setLastSeenSevs] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);

  // Load last-seen state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setLastSeenTime(stored);
      const storedSevs = localStorage.getItem(LS_SEV_KEY);
      if (storedSevs) setLastSeenSevs(JSON.parse(storedSevs));
    } catch { /* localStorage unavailable */ }
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

  // Auto-dismiss once user has viewed all changed events
  useEffect(() => {
    if (!changes || totalChanges === 0) return;
    const allEids = [
      ...changes.newEvents,
      ...changes.escalated,
      ...changes.deescalated,
      ...changes.reEmerged,
    ].map(e => e.eid);
    if (allEids.length > 0 && allEids.every(eid => viewedEids.has(eid))) {
      // Small delay so user sees the last highlight before banner fades
      const t = setTimeout(() => handleDismiss(), 1200);
      return () => clearTimeout(t);
    }
  }, [viewedEids, changes, totalChanges]);

  const handleDismiss = useCallback(() => {
    setClosing(true);
    // Save current state as "last seen"
    try {
      if (sTime) {
        localStorage.setItem(LS_KEY, sTime.toISOString());
      }
      // Save current severities for all items
      if (items) {
        const sevMap: Record<string, string> = {};
        items.forEach(d => {
          const eid = eventId(d as { event?: string; risk?: string; region?: string });
          sevMap[eid] = getSev(d);
        });
        localStorage.setItem(LS_SEV_KEY, JSON.stringify(sevMap));
      }
    } catch { /* localStorage unavailable */ }
    setTimeout(() => setDismissed(true), 250);
  }, [sTime, items]);

  const handleClickEntry = useCallback((entry: ChangeEntry) => {
    setViewedEids(prev => new Set(prev).add(entry.eid));
    onScrollTo(entry.idx);
  }, [onScrollTo]);

  // Don't render if dismissed, no changes, or still loading
  if (dismissed || !changes || totalChanges === 0) return null;

  const sections: Array<{
    entries: ChangeEntry[];
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
    labelSingle: string;
    labelPlural: string;
  }> = [
    {
      entries: changes.newEvents,
      color: ACCENT.blueLight,
      bgColor: `${ACCENT.blue}22`,
      borderColor: `${ACCENT.blue}44`,
      icon: '\u26A1',
      labelSingle: 'new event detected',
      labelPlural: 'new events detected',
    },
    {
      entries: changes.escalated,
      color: ACCENT.red,
      bgColor: `${ACCENT.red}22`,
      borderColor: `${ACCENT.red}44`,
      icon: '\u2197',
      labelSingle: 'event escalated',
      labelPlural: 'events escalated',
    },
    {
      entries: changes.deescalated,
      color: ACCENT.green,
      bgColor: `${ACCENT.green}22`,
      borderColor: `${ACCENT.green}44`,
      icon: '\u2198',
      labelSingle: 'event de-escalated',
      labelPlural: 'events de-escalated',
    },
    {
      entries: changes.reEmerged,
      color: '#f59e0b',
      bgColor: '#f59e0b22',
      borderColor: '#f59e0b44',
      icon: '\u26A0',
      labelSingle: 'event re-emerged',
      labelPlural: 'events re-emerged',
    },
  ];

  return (
    <div style={{
      margin: '8px 16px 4px',
      background: S[3],
      border: `1px solid ${B.popup}`,
      borderRadius: 8,
      padding: '10px 12px',
      position: 'relative',
      opacity: closing ? 0 : 1,
      transform: closing ? 'translateY(-8px)' : 'translateY(0)',
      transition: 'opacity 250ms ease, transform 250ms ease',
      overflow: 'hidden',
    }}>
      {/* Subtle top accent line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg, ${ACCENT.blue}, ${ACCENT.blueLight}, ${ACCENT.blue})`,
        opacity: 0.6,
        borderRadius: '8px 8px 0 0',
      }} />

      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <SectionHeader color={ACCENT.blueLight}>What Changed</SectionHeader>
          <Badge label={String(totalChanges)} color={ACCENT.blueLight} bg={`${ACCENT.blue}33`} border={`${ACCENT.blue}44`} size="sm" style={{ fontSize: 9, fontWeight: 600 }} />
        </div>

        {/* Dismiss button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: T.muted,
            fontSize: 14,
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            transition: 'color 150ms',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 4,
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.primary; (e.currentTarget as HTMLElement).style.background = B.default; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.muted; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title="Dismiss"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Change sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sections.map(section => {
          if (section.entries.length === 0) return null;
          return (
            <div key={section.labelSingle}>
              {/* Summary line */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 5,
                  background: section.bgColor,
                  border: `1px solid ${section.borderColor}`,
                  transition: 'background 150ms',
                }}
                onClick={() => handleClickEntry(section.entries[0])}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = section.bgColor.replace('22', '33'); }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = section.bgColor; }}
              >
                <span style={{ fontSize: 11, lineHeight: 1 }}>{section.icon}</span>
                <span style={{
                  fontFamily: FM,
                  fontSize: 11,
                  fontWeight: 700,
                  color: section.color,
                  lineHeight: 1,
                }}>
                  {section.entries.length}
                </span>
                <span style={{
                  fontSize: 10,
                  color: section.color,
                  opacity: 0.85,
                  fontWeight: 500,
                }}>
                  {section.entries.length === 1 ? section.labelSingle : section.labelPlural}
                </span>
              </div>

              {/* Individual entries (shown inline for small counts) */}
              {section.entries.length <= 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, paddingLeft: 12 }}>
                  {section.entries.map(entry => {
                    const isViewed = viewedEids.has(entry.eid);
                    return (
                      <div
                        key={entry.eid}
                        onClick={(e) => { e.stopPropagation(); handleClickEntry(entry); }}
                        style={{
                          fontSize: 10,
                          color: isViewed ? T.ghost : T.secondary,
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: 3,
                          transition: 'color 150ms, background 150ms',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          textDecoration: isViewed ? 'line-through' : 'none',
                          textDecorationColor: T.ghost,
                        }}
                        onMouseEnter={e => {
                          if (!isViewed) {
                            (e.currentTarget as HTMLElement).style.background = `${B.default}44`;
                            (e.currentTarget as HTMLElement).style.color = T.primary;
                          }
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = isViewed ? T.ghost : T.secondary;
                        }}
                      >
                        <span style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          background: isViewed ? B.default : section.color,
                          flexShrink: 0,
                          transition: 'background 150ms',
                        }} />
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}>
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
