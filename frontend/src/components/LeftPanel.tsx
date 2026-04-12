import { useState, useMemo, useEffect } from 'react';
import type { WeeklySummary } from '../types';
import { FM, SITES } from '../data';
import { S, T, B } from '../tokens';
import { getRegion, getTrend, getEvent } from '../utils/scan';
import { fetchWeeklySummary } from '../services/api';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import { TalkingPointsTab } from './TalkingPointsTab';
import { WeeklyBriefTab } from './WeeklyBriefTab';

type DisruptionState = ReturnType<typeof useDisruptionState>;

type TabId = 'talking-points' | 'weekly-brief';

interface LeftPanelProps {
  dis: DisruptionState;
  open: boolean;
  onToggle: () => void;
  /** When true, panel renders without outer shell (embedded in mobile bottom sheet) */
  embedded?: boolean;
}

export function LeftPanel({ dis, open, onToggle, embedded = false }: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('talking-points');
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Fetch weekly summary when tab is selected
  useEffect(() => {
    if (activeTab !== 'weekly-brief') return;
    if (weeklySummary) return; // already loaded
    setWeeklyLoading(true);
    fetchWeeklySummary(7).then(data => {
      setWeeklySummary(data);
      setWeeklyLoading(false);
    });
  }, [activeTab, weeklySummary]);

  const rsc = useMemo(() => {
    const m: Record<string, string> = { 'Europe': 'EU', 'Middle East': 'MEA', 'China': 'APAC', 'India': 'APAC', 'Americas': 'AM', 'Africa': 'AF' };
    const o: Record<string, number> = {};
    if (!dis.items) return o;
    const regions = new Set(dis.items.map(d => getRegion(d)));
    regions.forEach(r => {
      if (r === 'Global') {
        o[r] = SITES.length;
      } else {
        const k = m[r];
        if (k) {
          o[r] = SITES.filter(s => s.region === k).length;
        } else {
          o[r] = 0;
        }
      }
    });
    return o;
  }, [dis.items]);

  const execBrief = useMemo(() => {
    if (!dis.items?.length) return null;
    const sevCounts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const regions: Record<string, number> = {};
    const actions: string[] = [];
    const escalating: string[] = [];
    dis.items.forEach(d => {
      const sv = ('severity' in d ? d.severity : ('risk_level' in d ? d.risk_level : undefined)) as string | undefined;
      if (sv) sevCounts[sv] = (sevCounts[sv] || 0) + 1;
      const r = getRegion(d);
      regions[r] = (regions[r] || 0) + 1;
      const act = ('recommended_action' in d ? d.recommended_action : ('watchpoint' in d ? d.watchpoint : '')) as string;
      if (act) actions.push(act);
      if (getTrend(d) === 'Escalating') escalating.push(getEvent(d));
    });
    const topRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
    const totalSites = topRegion ? rsc[topRegion[0]] || 0 : 0;
    return { sevCounts, regions, topRegion, totalSites, escalating, actions: actions.slice(0, 3), total: dis.items.length };
  }, [dis.items, rsc]);

  const modeLabel = dis.mode === 'trade' ? 'trade policy events' : dis.mode === 'geopolitical' ? 'geopolitical risks' : 'disruptions';

  // Tab toggle buttons (shared between embedded and desktop)
  const tabToggle = (padding: string, fontSize: number, minHeight?: number) => (
    <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: S[2], borderRadius: 6, padding: 2 }}>
      {([['talking-points', 'Talking Points'], ['weekly-brief', 'Weekly Brief']] as const).map(([id, label]) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          style={{
            flex: 1,
            padding,
            fontSize,
            fontWeight: 700,
            fontFamily: FM,
            textTransform: 'uppercase',
            letterSpacing: 1,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all .15s',
            background: activeTab === id ? S[0] : 'transparent',
            color: activeTab === id ? T.primary : T.muted,
            boxShadow: activeTab === id ? `0 1px 3px ${S.base}` : 'none',
            ...(minHeight ? { minHeight } : {}),
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Embedded mode: render content directly without outer shell (for mobile bottom sheet)
  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
        {/* Header with tab toggle */}
        <div style={{ padding: '10px 16px 0', borderBottom: `1px solid ${B.subtle}`, flexShrink: 0 }}>
          {tabToggle('8px 8px', 11, 44)}
        </div>

        {activeTab === 'talking-points' && (
          <TalkingPointsTab
            execBrief={execBrief}
            modeLabel={modeLabel}
            rsc={rsc}
            loading={dis.loading}
            hasItems={!!dis.items}
            embedded
          />
        )}

        {activeTab === 'weekly-brief' && (
          <WeeklyBriefTab
            weeklySummary={weeklySummary}
            weeklyLoading={weeklyLoading}
            embedded
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="sc-left-panel"
      style={{
        width: open ? 360 : 32,
        minWidth: open ? 360 : 32,
        height: '100%',
        background: S[0],
        borderRight: `1px solid ${B.subtle}`,
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Panel content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transition: 'opacity 200ms ease',
        pointerEvents: open ? 'auto' : 'none',
        minWidth: 328,
      }}>
        {/* Header with tab toggle */}
        <div style={{ padding: '14px 16px 0', borderBottom: `1px solid ${B.subtle}`, flexShrink: 0 }}>
          {tabToggle('5px 8px', 10)}
          {activeTab === 'talking-points' && dis.sTime && (
            <div style={{ fontSize: 9, color: T.ghost, fontFamily: FM, paddingBottom: 10 }}>
              Scanned {dis.sTime.toLocaleTimeString()} {'\u00b7'} {dis.sTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
          )}
          {activeTab === 'weekly-brief' && weeklySummary && (
            <div style={{ fontSize: 9, color: T.ghost, fontFamily: FM, paddingBottom: 10 }}>
              {weeklySummary.period.from} to {weeklySummary.period.to}
            </div>
          )}
        </div>

        {/* Tab content */}
        {activeTab === 'talking-points' && (
          <TalkingPointsTab
            execBrief={execBrief}
            modeLabel={modeLabel}
            rsc={rsc}
            loading={dis.loading}
            hasItems={!!dis.items}
          />
        )}

        {activeTab === 'weekly-brief' && (
          <WeeklyBriefTab
            weeklySummary={weeklySummary}
            weeklyLoading={weeklyLoading}
          />
        )}
      </div>

      {/* Collapse/expand toggle */}
      <div
        onClick={onToggle}
        style={{
          position: 'absolute',
          top: '50%',
          right: 0,
          transform: 'translateY(-50%)',
          width: 32,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 20,
          height: 48,
          borderRadius: '0 6px 6px 0',
          background: S[1],
          border: `1px solid ${B.subtle}`,
          borderLeft: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.muted,
          fontSize: 10,
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.body; (e.currentTarget as HTMLElement).style.background = S[2]; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.muted; (e.currentTarget as HTMLElement).style.background = S[1]; }}
        >
          <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms ease', display: 'inline-block', lineHeight: 1 }}>{'\u25C0'}</span>
        </div>
      </div>

      {/* Collapsed label */}
      {!open && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 6,
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center center',
          whiteSpace: 'nowrap',
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: T.ghost,
          fontFamily: FM,
          pointerEvents: 'none',
        }}>
          {activeTab === 'talking-points' ? 'Talking Points' : 'Weekly Brief'}
        </div>
      )}
    </div>
  );
}
