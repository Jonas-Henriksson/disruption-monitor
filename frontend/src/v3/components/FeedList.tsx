/**
 * FeedList — Scrollable list of FeedCard components with accordion behavior.
 */

import { useMemo, useState } from 'react';
import { TYPE, V3_FONT, V3_FONT_MONO } from '../theme';
import { useV3Theme } from '../ThemeContext';
import type { ScanItem, Severity } from '../../types';
import { getSev } from '../../utils/scan';
import { FeedCard } from './FeedCard';

export interface FeedListProps {
  items: ScanItem[] | null;
  loading: boolean;
  error: string | null;
  severityFilter: Severity | null;
  searchQuery: string;
  selectedIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onHoverIndex: (idx: number | null) => void;
  onStatusChange?: (eventId: string, newStatus: string) => void;
}

const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function FeedList({
  items,
  loading,
  error,
  severityFilter,
  searchQuery,
  selectedIndex,
  onSelectIndex,
  onHoverIndex,
  onStatusChange,
}: FeedListProps) {
  const { theme: V3 } = useV3Theme();
  const [showMyItems, setShowMyItems] = useState(false);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = [...items];

    // Severity filter
    if (severityFilter) {
      list = list.filter(d => getSev(d) === severityFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d => {
        const title = 'event' in d ? d.event : ('risk' in d ? (d as { risk: string }).risk : '');
        const region = 'region' in d ? (d as { region: string }).region : '';
        return title.toLowerCase().includes(q) || region.toLowerCase().includes(q);
      });
    }

    // My items filter (events with tickets/actions assigned)
    if (showMyItems) {
      list = list.filter(d => {
        return 'status' in d && d.status === 'active';
      });
    }

    // Sort: severity first, then by last_seen time
    list.sort((a, b) => {
      const sa = SEV_ORDER[getSev(a)] ?? 3;
      const sb = SEV_ORDER[getSev(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      const ta = 'last_seen' in a && a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const tb = 'last_seen' in b && b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return tb - ta;
    });

    return list;
  }, [items, severityFilter, searchQuery, showMyItems]);

  // Loading skeleton
  if (loading && (!items || items.length === 0)) {
    return (
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: V3.spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: V3.spacing.sm,
      }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 68,
              borderRadius: V3.radius.md,
              background: V3.bg.card,
              borderLeft: `3px solid ${V3.border.subtle}`,
              animation: 'sc-skeleton 1.5s ease-in-out infinite',
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: V3.spacing['2xl'],
        fontFamily: V3_FONT,
      }}>
        <div style={{
          textAlign: 'center',
          padding: V3.spacing['2xl'],
          background: V3.severity.criticalBg,
          borderRadius: V3.radius.lg,
          border: `1px solid ${V3.severity.criticalBorder}`,
        }}>
          <div style={{ ...TYPE.title, color: V3.severity.critical, marginBottom: V3.spacing.sm }}>
            Scan Error
          </div>
          <div style={{ ...TYPE.body, color: V3.text.muted }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!items || filtered.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: V3.spacing['2xl'],
        fontFamily: V3_FONT,
      }}>
        <div style={{ textAlign: 'center', color: V3.text.muted }}>
          <div style={{ fontSize: 28, marginBottom: V3.spacing.sm, opacity: 0.4 }}>{'\u{1F50D}'}</div>
          <div style={{ ...TYPE.title, color: V3.text.muted, marginBottom: V3.spacing.xs }}>
            No active events matching filters
          </div>
          <div style={{ ...TYPE.body, color: V3.text.muted }}>
            Try broadening your search or changing severity filters.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: V3_FONT,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${V3.spacing.md}px ${V3.spacing.lg}px`,
        flexShrink: 0,
      }}>
        <div style={{
          ...TYPE.sectionHeader,
          color: V3.text.muted,
          display: 'flex',
          alignItems: 'center',
          gap: V3.spacing.sm,
        }}>
          LIVE FEED
          <span style={{
            ...TYPE.mono,
            fontFamily: V3_FONT_MONO,
            fontSize: 10,
            color: V3.text.accent,
            background: V3.accent.blueDim,
            padding: '1px 6px',
            borderRadius: V3.radius.sm,
          }}>
            {filtered.length}
          </span>
        </div>

        <button
          onClick={() => setShowMyItems(!showMyItems)}
          style={{
            padding: `3px ${V3.spacing.sm}px`,
            border: `1px solid ${showMyItems ? V3.accent.blue + '55' : V3.border.subtle}`,
            borderRadius: V3.radius.full,
            background: showMyItems ? V3.accent.blueDim : 'transparent',
            color: showMyItems ? V3.text.accent : V3.text.muted,
            fontSize: 10,
            fontWeight: 500,
            fontFamily: V3_FONT,
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
        >
          My Items
        </button>
      </div>

      {/* Scrollable feed */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: `0 ${V3.spacing.lg}px ${V3.spacing.lg}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: V3.spacing.xs,
      }}>
        {filtered.map((item) => {
          // Map back to original index for selection
          const origIdx = items!.indexOf(item);
          return (
            <FeedCard
              key={origIdx}
              item={item}
              index={origIdx}
              expanded={selectedIndex === origIdx}
              onSelect={onSelectIndex}
              onHover={onHoverIndex}
              onStatusChange={onStatusChange}
            />
          );
        })}
      </div>
    </div>
  );
}
