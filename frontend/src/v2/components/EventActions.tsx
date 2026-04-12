/**
 * EventActions — Quick action bar + lifecycle + M365 + assignment + status.
 * Shown at the top of the expanded card in the v2 Event Panel.
 */

import { useState } from 'react';
import type { ScanItem, Ticket, TicketStatus } from '../../types';
import { useTheme, V2_TYP, V2_SP, V2_BR, V2_FONT_MONO } from '../theme';
import {
  sendEventAlert, createEventTicket, fetchNarrative,
  assignTicket, updateTicketStatus,
  graphSendEventEmail, graphSendEventTeams, graphCreateEventMeeting,
} from '../../services/api';
import type { NarrativeResponse } from '../../services/api';
import { eventId } from '../../utils/format';
import { getEvent, getRegion, getTrend } from '../../utils/scan';
import type { useDisruptionState } from '../../hooks/useDisruptionState';

type DisruptionState = ReturnType<typeof useDisruptionState>;

const TEAM = [
  { id: 'SB', name: 'Steffen Brandt', role: 'VP Supply Chain', color: '#3b82f6' },
  { id: 'ML', name: 'Maria Lindgren', role: 'Risk Analyst', color: '#22c55e' },
  { id: 'AK', name: 'Anders Karlsson', role: 'Procurement Lead', color: '#f59e0b' },
  { id: 'EN', name: 'Elena Novak', role: 'Logistics Manager', color: '#a78bfa' },
];

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: '#64748b', icon: '\u25CB' },
  assigned: { label: 'Assigned', color: '#3b82f6', icon: '\uD83D\uDC64' },
  in_progress: { label: 'In Progress', color: '#eab308', icon: '\u23F3' },
  blocked: { label: 'Blocked', color: '#ef4444', icon: '\u26D4' },
  done: { label: 'Done', color: '#22c55e', icon: '\u2713' },
};

export interface EventActionsProps {
  item: ScanItem;
  mode: string;
  dis: DisruptionState;
  eventId: string;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

export function EventActions({ item, mode, dis, eventId: eid }: EventActionsProps) {
  const { theme } = useTheme();
  const [alertState, setAlertState] = useState<ActionState>('idle');
  const [ticketState, setTicketState] = useState<ActionState>('idle');
  const [briefState, setBriefState] = useState<ActionState>('idle');
  const [graphAction, setGraphAction] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [showAssign, setShowAssign] = useState(false);
  const [selectedSla, setSelectedSla] = useState<string | null>(null);

  const backendId = (item as unknown as Record<string, unknown>).id as string | undefined;
  const recId = backendId || eid;
  const reg = dis.registry[eid] || { status: 'active', firstSeen: '', lastSeen: '', scanCount: 0, lastSev: '' };
  const tk = dis.tickets[eid] || {};

  // ── Quick Actions ──

  const handleAlert = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAlertState('loading');
    const res = await sendEventAlert(recId);
    if (res?.success) setAlertState('done');
    else { setAlertState('error'); setTimeout(() => setAlertState('idle'), 3000); }
  };

  const handleTicket = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTicketState('loading');
    const res = await createEventTicket(recId);
    if (res) setTicketState('done');
    else { setTicketState('error'); setTimeout(() => setTicketState('idle'), 3000); }
  };

  const handleBrief = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBriefState('loading');
    const res = await fetchNarrative(recId);
    if (res) {
      dis.setNarratives((prev: Record<string, NarrativeResponse>) => ({ ...prev, [recId]: res }));
      setBriefState('done');
    } else { setBriefState('error'); setTimeout(() => setBriefState('idle'), 3000); }
  };

  const quickActions: Array<{
    key: string;
    label: string;
    icon: string;
    state: ActionState;
    handler: (e: React.MouseEvent) => void;
    color: string;
    doneLabel: string;
  }> = [
    { key: 'alert', label: 'Send Alert', icon: '\uD83D\uDD14', state: alertState, handler: handleAlert, color: theme.accent.cyan, doneLabel: 'Sent' },
    { key: 'ticket', label: 'Create Ticket', icon: '\uD83C\uDFAB', state: ticketState, handler: handleTicket, color: theme.accent.amber, doneLabel: 'Created' },
    { key: 'brief', label: 'Generate Brief', icon: '\u2728', state: briefState, handler: handleBrief, color: theme.accent.green, doneLabel: 'Generated' },
  ];

  const pillStyle = (color: string, active: boolean, disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : theme.text.tertiary,
    border: `1px solid ${active ? color + '44' : theme.border.subtle}`,
    borderRadius: V2_BR.full,
    padding: `${V2_SP.xs}px ${V2_SP.sm + 4}px`,
    fontSize: 11, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: V2_FONT_MONO,
    transition: 'all 200ms ease',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  });

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: V2_SP.sm }}>

      {/* ── Quick Actions Row ── */}
      <div style={{
        display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', alignItems: 'center',
        padding: `${V2_SP.sm}px ${V2_SP.md}px`,
        background: theme.bg.secondary,
        borderRadius: V2_BR.md, border: `1px solid ${theme.border.subtle}`,
      }}>
        <span style={{ ...V2_TYP.label, color: theme.text.muted, marginRight: V2_SP.xs }}>ACTIONS</span>
        {quickActions.map(act => {
          const isDone = act.state === 'done';
          const isLoading = act.state === 'loading';
          const isError = act.state === 'error';
          return (
            <button
              key={act.key}
              disabled={isLoading || isDone}
              onClick={act.handler}
              aria-label={act.label}
              style={pillStyle(
                isDone ? theme.accent.green : isError ? theme.accent.red : act.color,
                isDone || isError || isLoading,
                isLoading || isDone,
              )}
              onMouseEnter={e => { if (!isLoading && !isDone) { (e.currentTarget as HTMLElement).style.background = act.color + '18'; (e.currentTarget as HTMLElement).style.color = act.color; (e.currentTarget as HTMLElement).style.borderColor = act.color + '44'; } }}
              onMouseLeave={e => { if (!isLoading && !isDone && !isError) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.tertiary; (e.currentTarget as HTMLElement).style.borderColor = theme.border.subtle; } }}
            >
              {isLoading ? (
                <span style={{
                  width: 12, height: 12,
                  border: `2px solid ${act.color}33`, borderTop: `2px solid ${act.color}`,
                  borderRadius: '50%', display: 'inline-block',
                  animation: 'v2spin 1s linear infinite',
                }} />
              ) : (
                <span style={{ fontSize: 12 }}>{isDone ? '\u2713' : act.icon}</span>
              )}
              {isDone ? act.doneLabel : isError ? 'Failed' : act.label}
            </button>
          );
        })}
      </div>

      {/* ── Lifecycle Row ── */}
      <div style={{ display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', alignItems: 'center' }}>
        {reg.status !== 'watching' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'watching' } }));
              dis.syncStatus(recId, 'watching');
            }}
            aria-label="Watch event"
            style={pillStyle(theme.accent.blue, false, false)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.accent.blue + '18'; (e.currentTarget as HTMLElement).style.color = theme.accent.blue; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.tertiary; }}
          >
            {'\uD83D\uDD0D'} Watch
          </button>
        )}
        {reg.status === 'watching' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'active' } }));
              dis.syncStatus(recId, 'active');
            }}
            aria-label="Stop watching event"
            style={pillStyle(theme.text.secondary, true, false)}
          >
            Stop watching
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            dis.setRegistry(p => ({
              ...p,
              [eid]: { ...p[eid], status: 'archived', archivedSev: dis.registry[eid]?.lastSev, archivedAt: new Date().toISOString() },
            }));
            dis.syncStatus(recId, 'archived');
          }}
          aria-label="Archive event"
          style={pillStyle(theme.text.tertiary, false, false)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          Archive
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAssign(!showAssign); }}
          aria-label="Assign event"
          style={pillStyle(
            tk.owner ? (TEAM.find(t => t.id === tk.owner)?.color || theme.accent.blue) : theme.text.tertiary,
            !!tk.owner || showAssign,
            false,
          )}
        >
          {tk.owner ? TEAM.find(t => t.id === tk.owner)?.name.split(' ')[0] || 'Assigned' : 'Assign'}
        </button>
      </div>

      {/* ── M365 Actions ── */}
      <div style={{ display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...V2_TYP.label, color: theme.text.muted, marginRight: V2_SP.xs }}>M365</span>
        {([
          { key: 'email', label: 'Email', icon: '\u2709\uFE0F', fn: graphSendEventEmail, sent: 'Sent!' },
          { key: 'teams', label: 'Teams', icon: '\uD83D\uDCAC', fn: graphSendEventTeams, sent: 'Posted!' },
          { key: 'meeting', label: 'Meeting', icon: '\uD83D\uDCC5', fn: graphCreateEventMeeting, sent: 'Created!' },
        ] as const).map(act => {
          const st = graphAction[act.key];
          const isSending = st === 'sending';
          const isSent = st === 'sent';
          const isError = st === 'error';
          return (
            <button
              key={act.key}
              disabled={isSending}
              aria-label={`${act.label} action`}
              onClick={async (e) => {
                e.stopPropagation();
                setGraphAction(p => ({ ...p, [act.key]: 'sending' }));
                const res = await act.fn(recId);
                const ok = res && (res as { success?: boolean }).success;
                setGraphAction(p => ({ ...p, [act.key]: ok ? 'sent' : 'error' }));
                setTimeout(() => setGraphAction(p => { const n = { ...p }; delete n[act.key]; return n; }), 2000);
              }}
              style={pillStyle(
                isSent ? theme.accent.green : isError ? theme.accent.red : theme.text.tertiary,
                isSent || isError,
                isSending,
              )}
              onMouseEnter={e => { if (!isSending) { (e.currentTarget as HTMLElement).style.background = theme.bg.elevated; (e.currentTarget as HTMLElement).style.color = theme.text.secondary; } }}
              onMouseLeave={e => { if (!isSending && !isSent && !isError) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.tertiary; } }}
            >
              {act.icon} {isSending ? '...' : isSent ? act.sent : isError ? 'Failed' : act.label}
            </button>
          );
        })}
      </div>

      {/* ── Assignment Dropdown ── */}
      {showAssign && (
        <div style={{
          background: theme.bg.secondary, border: `1px solid ${theme.border.default}`,
          borderRadius: V2_BR.md, padding: V2_SP.md, transition: 'opacity 150ms',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: V2_SP.sm }}>
            <span style={{ ...V2_TYP.label, color: theme.text.muted }}>Assign to</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ ...V2_TYP.label, color: theme.text.muted }}>SLA</span>
              {(['24h', '48h', '1w'] as const).map(sla => {
                const isActive = selectedSla === sla;
                return (
                  <button
                    key={sla}
                    onClick={(e) => { e.stopPropagation(); setSelectedSla(isActive ? null : sla); }}
                    style={{
                      background: isActive ? theme.accent.blue + '22' : 'transparent',
                      color: isActive ? theme.accent.blue : theme.text.muted,
                      border: `1px solid ${isActive ? theme.accent.blue + '44' : theme.border.subtle}`,
                      borderRadius: V2_BR.sm, padding: '3px 8px',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      fontFamily: V2_FONT_MONO, transition: 'all 150ms',
                    }}
                  >
                    {sla}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedSla && (
            <div style={{ ...V2_TYP.caption, color: theme.text.muted, marginBottom: V2_SP.xs, fontStyle: 'italic' }}>
              Due: {new Date(Date.now() + ({ '24h': 24, '48h': 48, '1w': 168 }[selectedSla] || 24) * 3600000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEAM.map(t => {
              const isSelected = tk.owner === t.id;
              return (
                <button
                  key={t.id}
                  aria-label={`Assign to ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const slaHours = selectedSla ? ({ '24h': 24, '48h': 48, '1w': 168 }[selectedSla] || null) : null;
                    const dueDate = slaHours ? new Date(Date.now() + slaHours * 3600000).toISOString() : undefined;
                    assignTicket(recId, t.id, dueDate ? { due_date: dueDate } : undefined);
                    dis.setTickets((prev: Record<string, Ticket>) => ({
                      ...prev,
                      [eid]: { ...prev[eid], owner: t.id, ticketStatus: prev[eid]?.ticketStatus || 'assigned', due_date: dueDate || prev[eid]?.due_date || null, is_overdue: false },
                    }));
                    setShowAssign(false);
                    setSelectedSla(null);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: V2_SP.sm,
                    padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
                    background: isSelected ? t.color + '18' : 'transparent',
                    border: isSelected ? `1px solid ${t.color}33` : '1px solid transparent',
                    borderRadius: V2_BR.sm, cursor: 'pointer',
                    transition: 'background 150ms', textAlign: 'left' as const, width: '100%',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.color + '12'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? t.color + '18' : 'transparent'; }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 12,
                    background: t.color + '33', border: `1.5px solid ${t.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: t.color, flexShrink: 0,
                  }}>
                    {t.id}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...V2_TYP.bodySm, fontWeight: 600, color: theme.text.primary }}>{t.name}</div>
                    <div style={{ ...V2_TYP.caption, color: theme.text.muted }}>{t.role}</div>
                  </div>
                  {isSelected && <span style={{ fontSize: 13, color: t.color }}>{'\u2713'}</span>}
                </button>
              );
            })}
            {tk.owner && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  assignTicket(recId, '');
                  dis.setTickets((prev: Record<string, Ticket>) => {
                    const updated = { ...prev };
                    if (updated[eid]) updated[eid] = { ...updated[eid], owner: null, ticketStatus: 'open', due_date: null, is_overdue: false };
                    return updated;
                  });
                  setShowAssign(false);
                  setSelectedSla(null);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: V2_SP.sm,
                  padding: `${V2_SP.xs}px ${V2_SP.sm}px`,
                  background: 'transparent', border: `1px solid ${theme.accent.red}22`,
                  borderRadius: V2_BR.sm, cursor: 'pointer', marginTop: V2_SP.xs,
                  width: '100%', textAlign: 'left' as const,
                }}
              >
                <span style={{ fontSize: 12, color: theme.accent.red }}>{'\u2715'}</span>
                <span style={{ ...V2_TYP.bodySm, color: theme.accent.red }}>Unassign</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Status Selector (when ticket exists) ── */}
      {tk.owner && (
        <div style={{ display: 'flex', gap: V2_SP.xs, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...V2_TYP.label, color: theme.text.muted, marginRight: V2_SP.xs }}>STATUS</span>
          {Object.entries(STATUS_CFG).map(([st, cfg]) => {
            const isCurrent = (tk.ticketStatus || 'open') === st;
            return (
              <button
                key={st}
                aria-label={`Set status to ${cfg.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTicketStatus(recId, st as TicketStatus);
                  dis.setTickets((prev: Record<string, Ticket>) => ({ ...prev, [eid]: { ...prev[eid], ticketStatus: st as TicketStatus } }));
                }}
                style={pillStyle(cfg.color, isCurrent, false)}
                onMouseEnter={e => { if (!isCurrent) { (e.currentTarget as HTMLElement).style.background = cfg.color + '12'; (e.currentTarget as HTMLElement).style.color = cfg.color; } }}
                onMouseLeave={e => { if (!isCurrent) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = theme.text.tertiary; } }}
              >
                <span style={{ fontSize: 11, lineHeight: 1 }}>{cfg.icon}</span>
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Due Date ── */}
      {tk.due_date && (
        <div style={{ display: 'flex', alignItems: 'center', gap: V2_SP.sm }}>
          <span style={{ ...V2_TYP.label, color: theme.text.muted }}>DUE</span>
          <span style={{
            ...V2_TYP.monoSm, fontWeight: 600,
            color: tk.is_overdue ? theme.accent.red : (tk.ticketStatus === 'done' ? theme.accent.green : theme.text.secondary),
          }}>
            {new Date(tk.due_date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {tk.is_overdue && (
            <span style={{
              background: theme.severity.criticalBg, color: theme.accent.red,
              padding: '2px 8px', borderRadius: V2_BR.sm,
              fontSize: 9, fontWeight: 700, fontFamily: V2_FONT_MONO,
              border: `1px solid ${theme.accent.red}44`,
            }}>
              OVERDUE
            </span>
          )}
          {tk.ticketStatus === 'done' && (
            <span style={{ ...V2_TYP.caption, color: theme.accent.green }}>{'\u2713'} Completed</span>
          )}
        </div>
      )}

    </div>
  );
}
