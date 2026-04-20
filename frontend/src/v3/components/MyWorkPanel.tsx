/**
 * MyWorkPanel — Slide-out panel showing actions assigned to the current user.
 * Groups by urgency: Overdue, Due Today, This Week, Later/No Due Date.
 */

import { useState, useEffect, useCallback } from 'react';
import { useV3Theme } from '../ThemeContext';
import { V3_FONT, V3_FONT_MONO, sevColor } from '../theme';
import { fetchMyActions, completeAction, dismissAction } from '../../services/api';
import { actionsCache as _actionsCache } from '../../services/preloader';
import type { BackendAction } from '../../types';

interface MyWorkPanelProps {
  open: boolean;
  onClose: () => void;
  onNavigateToEvent: (eventId: string) => void;
}

type UrgencyGroup = 'overdue' | 'today' | 'this_week' | 'later';

const GROUP_LABELS: Record<UrgencyGroup, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  later: 'Later / No Due Date',
};

function classifyAction(action: BackendAction): UrgencyGroup {
  if (!action.due_date) return 'later';
  const now = new Date();
  const due = new Date(action.due_date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

  if (due < today) return 'overdue';
  if (due < tomorrow) return 'today';
  if (due < weekEnd) return 'this_week';
  return 'later';
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#22c55e',
};

export function MyWorkPanel({ open, onClose, onNavigateToEvent }: MyWorkPanelProps) {
  const { theme: V3 } = useV3Theme();
  const [actions, setActions] = useState<BackendAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchMyActions().then(result => {
      if (result) setActions(result);
      setLoading(false);
    });
  }, [open]);

  const openActions = actions.filter(a => a.status !== 'completed' && a.status !== 'dismissed');
  const completedCount = actions.filter(a => a.status === 'completed').length;
  const overdueCount = openActions.filter(a => classifyAction(a) === 'overdue').length;

  const handleQuickComplete = useCallback(async (actionId: number) => {
    if (!completionNote.trim()) return;
    const result = await completeAction(actionId, completionNote.trim());
    if (result) {
      setActions(prev => prev.map(a => {
        if (a.id === actionId) {
          // Invalidate preloader cache so ExpandedCard sees the update
          _actionsCache.delete(a.event_id);
          return { ...a, status: 'completed' as const, completed_at: new Date().toISOString(), completion_note: completionNote.trim() };
        }
        return a;
      }));
    }
    setCompletingId(null);
    setCompletionNote('');
  }, [completionNote]);

  const handleQuickDismiss = useCallback(async (actionId: number) => {
    const result = await dismissAction(actionId);
    if (result) {
      setActions(prev => prev.map(a => {
        if (a.id === actionId) {
          _actionsCache.delete(a.event_id);
          return { ...a, status: 'dismissed' as const, dismissed_at: new Date().toISOString() };
        }
        return a;
      }));
    }
  }, []);

  // Group actions by urgency
  const groups: Record<UrgencyGroup, BackendAction[]> = { overdue: [], today: [], this_week: [], later: [] };
  for (const a of openActions) {
    groups[classifyAction(a)].push(a);
  }

  const groupColors: Record<UrgencyGroup, string> = {
    overdue: V3.accent.red,
    today: V3.accent.amber,
    this_week: V3.accent.blue,
    later: V3.text.muted,
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: V3.bg.overlay, zIndex: 90,
          }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: '90vw',
        background: V3.bg.card, borderLeft: `1px solid ${V3.border.default}`,
        zIndex: 91, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 300ms ease',
        boxShadow: open ? '-8px 0 24px rgba(0,0,0,0.3)' : 'none',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px', borderBottom: `1px solid ${V3.border.subtle}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: V3.text.primary, fontFamily: V3_FONT }}>
              My Work
            </div>
            <div style={{ fontSize: 10, color: V3.text.muted, fontFamily: V3_FONT_MONO, marginTop: 2 }}>
              {completedCount} of {actions.length} complete
              {overdueCount > 0 && <span style={{ color: V3.accent.red }}> \u00B7 {overdueCount} overdue</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: V3.text.muted, fontSize: 18, padding: 4,
            }}
          >{'\u2715'}</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {loading && (
            <div style={{ textAlign: 'center', color: V3.text.muted, fontSize: 11, padding: 20 }}>
              Loading actions...
            </div>
          )}

          {!loading && openActions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u2705'}</div>
              <div style={{ fontSize: 12, color: V3.text.secondary, fontFamily: V3_FONT }}>
                All caught up!
              </div>
              <div style={{ fontSize: 10, color: V3.text.muted, marginTop: 4 }}>
                No open actions assigned to you.
              </div>
            </div>
          )}

          {!loading && (['overdue', 'today', 'this_week', 'later'] as UrgencyGroup[]).map(group => {
            const items = groups[group];
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em', color: groupColors[group],
                  fontFamily: V3_FONT_MONO, marginBottom: 6,
                }}>
                  {GROUP_LABELS[group]} ({items.length})
                </div>
                {items.map(action => (
                  <div key={action.id} style={{
                    padding: '8px 10px', marginBottom: 4,
                    background: V3.bg.base, borderRadius: 6,
                    border: `1px solid ${group === 'overdue' ? V3.accent.red + '44' : V3.border.subtle}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      {/* Priority dot */}
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                        background: PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.normal,
                      }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Action title — clickable */}
                        <div
                          onClick={() => onNavigateToEvent(action.event_id)}
                          style={{
                            fontSize: 11, fontWeight: 500, color: V3.text.primary, cursor: 'pointer',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                          title={action.title}
                        >
                          {action.title}
                        </div>

                        {/* Event context */}
                        <div style={{ fontSize: 9, color: V3.text.muted, display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                          {action.event_title && (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                              {action.event_title}
                            </span>
                          )}
                          {action.event_severity && (
                            <span style={{
                              fontSize: 8, fontWeight: 700, padding: '0 4px', borderRadius: 2,
                              fontFamily: V3_FONT_MONO,
                              background: sevColor(action.event_severity, V3) + '22',
                              color: sevColor(action.event_severity, V3),
                            }}>
                              {action.event_severity}
                            </span>
                          )}
                          {action.due_date && (
                            <span>{action.due_date.slice(0, 10)}</span>
                          )}
                        </div>
                      </div>

                      {/* Quick action buttons */}
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setCompletingId(completingId === action.id ? null : action.id); }}
                          title="Complete"
                          style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                            background: V3.accent.green + '18', color: V3.accent.green,
                            border: `1px solid ${V3.accent.green}44`, fontFamily: V3_FONT,
                          }}
                        >{'\u2713'}</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleQuickDismiss(action.id); }}
                          title="Dismiss"
                          style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                            background: V3.bg.badge, color: V3.text.muted,
                            border: `1px solid ${V3.border.subtle}`, fontFamily: V3_FONT,
                          }}
                        >{'\u2715'}</button>
                      </div>
                    </div>

                    {/* Inline completion form */}
                    {completingId === action.id && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input
                          value={completionNote}
                          onChange={e => setCompletionNote(e.target.value)}
                          placeholder="Completion note..."
                          autoFocus
                          style={{
                            flex: 1, padding: '4px 8px', fontSize: 10,
                            background: V3.bg.card, color: V3.text.primary,
                            border: `1px solid ${V3.border.default}`, borderRadius: 4,
                            fontFamily: V3_FONT, outline: 'none',
                          }}
                          onKeyDown={e => { if (e.key === 'Enter' && completionNote.trim()) handleQuickComplete(action.id); }}
                        />
                        <button
                          onClick={() => handleQuickComplete(action.id)}
                          disabled={!completionNote.trim()}
                          style={{
                            padding: '4px 8px', fontSize: 10, fontWeight: 600,
                            background: completionNote.trim() ? V3.accent.green + '22' : V3.bg.badge,
                            color: completionNote.trim() ? V3.accent.green : V3.text.muted,
                            border: `1px solid ${completionNote.trim() ? V3.accent.green + '44' : V3.border.subtle}`,
                            borderRadius: 4, cursor: completionNote.trim() ? 'pointer' : 'default',
                            fontFamily: V3_FONT,
                          }}
                        >Done</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
