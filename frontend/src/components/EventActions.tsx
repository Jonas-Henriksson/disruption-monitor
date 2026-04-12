import { useState } from 'react';
import type { ScanItem, Severity, ImpactResult } from '../types';
import { assignTicket, updateTicketStatus, graphSendEventEmail, graphSendEventTeams, graphCreateEventMeeting } from '../services/api';
import { FM, STATUS_CFG, TEAM, TEAM_MAP, SUPPLIERS } from '../data';
import { TYP } from '../tokens';
import { getEvent, getRegion, getSev, getTrend } from '../utils/scan';
import type { useDisruptionState } from '../hooks/useDisruptionState';

type DisruptionState = ReturnType<typeof useDisruptionState>;

export interface EventActionsProps {
  d: ScanItem & { _i: number };
  dis: DisruptionState;
  impact: ImpactResult | null;
  eid: string;
  sv: Severity;
  co: string;
  reg: Record<string, unknown>;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
}

export function EventActions({ d, dis, impact, eid, sv, co, reg, copiedId, setCopiedId }: EventActionsProps) {
  // MS Graph action button feedback
  const [graphAction, setGraphAction] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});

  // SLA quick-set state for assignment
  const [selectedSla, setSelectedSla] = useState<string | null>(null);

  const backendId = (d as unknown as Record<string, unknown>).id as string | undefined;

  return (
    <>
      {/* Event lifecycle buttons */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #14243e', flexWrap: 'wrap', position: 'relative' }}>
        {reg.status !== 'watching' && <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'watching' } })); dis.syncStatus((backendId || eid), 'watching'); }} style={{ background: '#1e3b5c', color: '#60a5fa', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>{'\ud83d\udd0d'} Watch</button>}
        {reg.status === 'watching' && <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'active' } })); dis.syncStatus((backendId || eid), 'active'); }} style={{ background: '#0d1525', color: '#94a3b8', border: '1px solid #1a2744', borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer' }}>Stop watching</button>}
        <button onClick={(e) => { e.stopPropagation(); dis.setRegistry(p => ({ ...p, [eid]: { ...p[eid], status: 'archived', archivedSev: sv, archivedAt: new Date().toISOString() } })); dis.syncStatus((backendId || eid), 'archived'); }} style={{ background: '#0d1525', color: '#64748b', border: '1px solid #1e3050', borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer' }}>Archive</button>
        <button onClick={(e) => { e.stopPropagation(); dis.setShowAssign(dis.showAssign === eid ? null : eid); }} style={{
          background: dis.showAssign === eid ? '#1e3a5c' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color + '22' : '#0d1525'),
          color: dis.showAssign === eid ? '#60a5fa' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color : '#94a3b8'),
          border: `1px solid ${dis.showAssign === eid ? '#2563eb44' : (dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.color + '44' : '#1e3050')}`,
          borderRadius: 4, padding: '5px 10px', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: FM,
        }}>
          {dis.tickets[eid]?.owner ? TEAM_MAP[dis.tickets[eid].owner]?.initials || 'Assign' : 'Assign'}
        </button>
        <button onClick={(e) => {
          e.stopPropagation();
          const title = getEvent(d);
          const region = getRegion(d);
          const trend = getTrend(d);
          const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          const cs = ('computed_severity' in d) ? (d as unknown as Record<string, unknown>).computed_severity as { score: number } | undefined : undefined;
          const recData = dis.recs[backendId || eid];
          const hasBackendImpact = recData?.impact;
          const mfgCount = hasBackendImpact ? recData.impact.affected_sites.filter((s: { type: string }) => s.type === 'mfg').length : (impact ? impact.factories.length : 0);
          const supCount = hasBackendImpact ? recData.impact.affected_suppliers.count : (impact ? SUPPLIERS.filter(s => impact.suppliers.includes(s.country)).reduce((sum, s) => sum + s.n, 0) : 0);

          const lines: string[] = [
            'SC Hub Disruption Monitor \u2014 Event Report',
            `Date: ${dateStr}`,
            '',
            `EVENT: ${title}`,
            `SEVERITY: ${sv}${cs ? ` | Algorithm: ${Math.round(cs.score)}/100` : ''}`,
            `REGION: ${region}`,
          ];
          if (trend) lines.push(`TREND: ${trend}`);

          if (mfgCount > 0 || supCount > 0) {
            lines.push('', 'IMPACT:');
            if (mfgCount > 0) lines.push(`\u2022 ${mfgCount} manufacturing sites affected`);
            if (supCount > 0) lines.push(`\u2022 ${supCount} suppliers exposed`);
          }

          if (recData?.actions?.length) {
            lines.push('', 'RECOMMENDED ACTIONS:');
            recData.actions.forEach((act: { priority: number; action: string; owner: string; urgency: string }, ai: number) => {
              lines.push(`${ai + 1}. ${act.action} \u2014 Owner: ${act.owner}, Urgency: ${act.urgency}`);
            });
          }

          if (recData?.confidence) {
            lines.push('', `CONFIDENCE: ${Math.round(recData.confidence * 100)}%`);
          }
          if (recData?.sources?.length) {
            lines.push(`SOURCES: ${recData.sources.join(', ')}`);
          }

          lines.push('', '---', 'Generated by SC Hub Disruption Monitor');

          navigator.clipboard.writeText(lines.join('\n')).then(() => {
            setCopiedId('copy-event-' + eid);
            setTimeout(() => setCopiedId(null), 1500);
          }).catch(() => {});
        }} style={{
          background: '#0d1525', color: copiedId === 'copy-event-' + eid ? '#22c55e' : '#94a3b8',
          border: `1px solid ${copiedId === 'copy-event-' + eid ? '#22c55e44' : '#1e3050'}`,
          borderRadius: 4, padding: '5px 10px', fontSize: 9, cursor: 'pointer', fontWeight: 600,
          fontFamily: FM, transition: 'color .15s, border-color .15s',
        }}>
          {copiedId === 'copy-event-' + eid ? 'Copied!' : 'Copy Event'}
        </button>
      </div>

      {/* MS 365 actions — Email, Teams, Meeting (sandbox: Jonas only) */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM, marginRight: 2 }}>M365</span>
        {([
          { key: 'email', label: 'Email', icon: '\u2709\uFE0F', fn: graphSendEventEmail, sent: 'Sent!' },
          { key: 'teams', label: 'Teams', icon: '\uD83D\uDCAC', fn: graphSendEventTeams, sent: 'Posted!' },
          { key: 'meeting', label: 'Meeting', icon: '\uD83D\uDCC5', fn: graphCreateEventMeeting, sent: 'Created!' },
        ] as const).map(act => {
          const st = graphAction[act.key];
          const isSending = st === 'sending';
          const isSent = st === 'sent';
          const isError = st === 'error';
          const eventIdForGraph = backendId || eid;
          return <button key={act.key} disabled={isSending} onClick={async (e) => {
            e.stopPropagation();
            setGraphAction(p => ({ ...p, [act.key]: 'sending' }));
            const res = await act.fn(eventIdForGraph);
            const ok = res && res.success;
            setGraphAction(p => ({ ...p, [act.key]: ok ? 'sent' : 'error' }));
            setTimeout(() => setGraphAction(p => { const n = { ...p }; delete n[act.key]; return n; }), 2000);
          }} style={{
            background: isSent ? '#22c55e18' : isError ? '#ef444418' : '#0d1525',
            color: isSent ? '#22c55e' : isError ? '#ef4444' : isSending ? '#475569' : '#8b9ec7',
            border: `1px solid ${isSent ? '#22c55e44' : isError ? '#ef444444' : '#1a2744'}`,
            borderRadius: 4, padding: '2px 8px', fontSize: 8, fontWeight: 600,
            cursor: isSending ? 'wait' : 'pointer', fontFamily: FM,
            transition: 'all .15s', opacity: isSending ? 0.6 : 1,
          }}>
            {act.icon} {isSending ? '...' : isSent ? act.sent : isError ? 'Failed' : act.label}
          </button>;
        })}
      </div>

      {/* Assignment dropdown — inline below lifecycle buttons */}
      {dis.showAssign === eid && <div onClick={(e) => e.stopPropagation()} style={{
        background: '#0d1525', border: '1px solid #14243e', borderRadius: 6,
        padding: 8, marginTop: 6, transition: 'opacity 150ms, transform 150ms',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ ...TYP.label, color: '#2a3d5c', fontFamily: FM }}>Assign to</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#2a3d5c', fontFamily: FM }}>SLA</span>
            {([
              { label: '24h', hours: 24 },
              { label: '48h', hours: 48 },
              { label: '1w', hours: 168 },
            ] as const).map(sla => {
              const isActive = selectedSla === sla.label;
              return <button key={sla.label} onClick={(e) => {
                e.stopPropagation();
                setSelectedSla(isActive ? null : sla.label);
              }} style={{
                background: isActive ? '#1e3a5c' : '#0a1220',
                color: isActive ? '#60a5fa' : '#4a6080',
                border: `1px solid ${isActive ? '#2563eb44' : '#14243e'}`,
                borderRadius: 3, padding: '2px 6px', fontSize: 8, fontWeight: 600,
                cursor: 'pointer', fontFamily: FM, transition: 'all 150ms',
              }}>{sla.label}</button>;
            })}
          </div>
        </div>
        {selectedSla && <div style={{ fontSize: 8, color: '#4a6080', fontFamily: FM, marginBottom: 4, fontStyle: 'italic' }}>
          Due: {new Date(Date.now() + ({ '24h': 24, '48h': 48, '1w': 168 }[selectedSla] || 24) * 3600000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TEAM.map(t => {
            const isSelected = dis.tickets[eid]?.owner === t.id;
            return <button key={t.id} onClick={(e) => {
              e.stopPropagation();
              const bId = backendId || eid;
              const slaHours = selectedSla ? ({ '24h': 24, '48h': 48, '1w': 168 }[selectedSla] || null) : null;
              const dueDate = slaHours ? new Date(Date.now() + slaHours * 3600000).toISOString() : undefined;
              assignTicket(bId, t.id, dueDate ? { due_date: dueDate } : undefined);
              dis.setTickets((prev: Record<string, Record<string, unknown>>) => ({
                ...prev,
                [eid]: {
                  ...prev[eid],
                  owner: t.id,
                  ticketStatus: prev[eid]?.ticketStatus || 'assigned',
                  due_date: dueDate || prev[eid]?.due_date || null,
                  is_overdue: false,
                },
              }));
              dis.setShowAssign(null);
              setSelectedSla(null);
            }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
              background: isSelected ? t.color + '18' : 'transparent',
              border: isSelected ? `1px solid ${t.color}33` : '1px solid transparent',
              borderRadius: 4, cursor: 'pointer', transition: 'background 150ms',
              textAlign: 'left', width: '100%',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                background: t.color + '33', border: `1px solid ${t.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 700, color: t.color, flexShrink: 0,
              }}>{t.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>{t.name}</div>
                <div style={{ fontSize: 8, color: '#4a6080', lineHeight: 1.2 }}>{t.role}</div>
              </div>
              {isSelected && <span style={{ fontSize: 10, color: t.color }}>{'✓'}</span>}
            </button>;
          })}
          {dis.tickets[eid]?.owner && <button onClick={(e) => {
            e.stopPropagation();
            const bId = backendId || eid;
            assignTicket(bId, '');
            dis.setTickets((prev: Record<string, Record<string, unknown>>) => {
              const updated = { ...prev };
              if (updated[eid]) {
                updated[eid] = { ...updated[eid], owner: null, ticketStatus: 'open', due_date: null, is_overdue: false };
              }
              return updated;
            });
            dis.setShowAssign(null);
            setSelectedSla(null);
          }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
            background: 'transparent', border: '1px solid #ef444422',
            borderRadius: 4, cursor: 'pointer', marginTop: 4, width: '100%', textAlign: 'left',
          }}>
            <span style={{ fontSize: 10, color: '#ef4444' }}>{'✕'}</span>
            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>Unassign</span>
          </button>}
        </div>
      </div>}

      {/* Status selector — only visible when ticket exists */}
      {dis.tickets[eid]?.owner && <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...TYP.label, color: '#2a3d5c', fontFamily: FM, marginRight: 2 }}>Status</span>
        {(Object.keys(STATUS_CFG) as Array<keyof typeof STATUS_CFG>).map(st => {
          const cfg = STATUS_CFG[st];
          const isCurrent = (dis.tickets[eid]?.ticketStatus || 'open') === st;
          return <button key={st} onClick={(e) => {
            e.stopPropagation();
            const bId = backendId || eid;
            updateTicketStatus(bId, st);
            dis.setTickets((prev: Record<string, Record<string, unknown>>) => ({ ...prev, [eid]: { ...prev[eid], ticketStatus: st } }));
          }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: isCurrent ? cfg.color + '22' : 'transparent',
            color: isCurrent ? cfg.color : '#2a3d5c',
            border: `1px solid ${isCurrent ? cfg.color + '44' : '#14243e'}`,
            borderRadius: 4, padding: '2px 6px', fontSize: 8, fontWeight: isCurrent ? 700 : 500,
            cursor: 'pointer', fontFamily: FM, transition: 'all 150ms',
          }}>
            <span style={{ fontSize: 9, lineHeight: 1 }}>{cfg.icon}</span>
            {cfg.label}
          </button>;
        })}
      </div>}

      {/* Due date display — shown when ticket has a due date */}
      {dis.tickets[eid]?.due_date && <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '3px 0' }}>
        <span style={{ ...TYP.label, color: '#2a3d5c', fontFamily: FM }}>Due</span>
        <span style={{
          fontSize: 9, fontFamily: FM, fontWeight: 600,
          color: dis.tickets[eid]?.is_overdue ? '#ef4444' : (dis.tickets[eid]?.ticketStatus === 'done' ? '#22c55e' : '#94a3b8'),
        }}>
          {new Date(dis.tickets[eid].due_date as string).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        {dis.tickets[eid]?.is_overdue && <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: FM, border: '1px solid #ef444466' }}>OVERDUE</span>}
        {dis.tickets[eid]?.ticketStatus === 'done' && dis.tickets[eid]?.due_date && <span style={{ fontSize: 8, color: '#22c55e', fontFamily: FM }}>{'✓'} Completed</span>}
      </div>}
    </>
  );
}
