import { relTime } from '../utils/format';
import { getSev } from '../utils/scan';
import { FM, F, countryCount } from '../data';
import type { ScanMode } from '../types';
import type { useDisruptionState } from '../hooks/useDisruptionState';
import type { useFilterState } from '../hooks/useFilterState';

type DisruptionState = ReturnType<typeof useDisruptionState>;
type FilterState = ReturnType<typeof useFilterState>;

interface HeaderBarProps {
  dis: DisruptionState;
  fil: FilterState;
  vis: { type: string; bu?: string }[];
  ha: boolean;
  cc: number;
}

export function HeaderBar({ dis, fil, vis, ha, cc }: HeaderBarProps) {
  void cc; // reserved for future badge use

  return (
    <div style={{ background: 'linear-gradient(90deg,#080e1c,#0d1830)', borderBottom: '1px solid #14243e', padding: '0 16px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e88' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>SC Hub</span>
        <span style={{ fontSize: 9, color: '#2a3d5c', letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 600, fontFamily: FM }}>DISRUPTION MONITOR</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0a1220', border: '1px solid #162040', borderRadius: 6, padding: '4px 10px', fontFamily: FM, fontSize: 10 }}>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{vis.length}</span><span style={{ color: '#2a3d5c' }}>sites</span>
          <span style={{ color: '#1e3050' }}>{'\u00b7'}</span>
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>{countryCount}</span><span style={{ color: '#2a3d5c' }}>countries</span>
          {fil.sSup && <span style={{ display: 'contents' }}><span style={{ color: '#1e3050' }}>{'\u00b7'}</span><span style={{ color: '#a78bfa', fontWeight: 600 }}>5,090</span><span style={{ color: '#2a3d5c' }}>suppliers</span></span>}
        </div>

        {/* Data source indicator */}
        {!dis.loading && dis.sTime && (() => {
          const isLive = dis.dataSource === 'live';
          const isApi = dis.dataSource === 'sample';
          const staleDelta = isLive ? Date.now() - dis.sTime : 0;
          const isStale24h = staleDelta > 24 * 60 * 60 * 1000;
          const isStale1h = staleDelta > 60 * 60 * 1000;
          const statusColor = isLive
            ? (isStale24h ? '#ef4444' : isStale1h ? '#f59e0b' : '#22c55e')
            : isApi ? '#3b82f6' : '#f59e0b';
          const statusBg = isLive
            ? (isStale24h ? '#1a0808' : isStale1h ? '#1a1508' : '#0a1a10')
            : isApi ? '#0a1220' : '#1a1508';
          const statusBorder = isLive
            ? (isStale24h ? '#4e131344' : isStale1h ? '#3d2e0644' : '#134e2544')
            : isApi ? '#16204044' : '#3d2e0644';
          const evtCount = dis.items?.length || 0;
          const statusLabel = isLive
            ? (isStale1h ? 'STALE' : 'LIVE')
            : isApi ? 'API' : 'OFFLINE';
          return <div className={isLive && !isStale1h ? 'sc-live-badge' : ''} style={{ display: 'flex', alignItems: 'center', gap: 6, background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: 6, padding: '4px 12px', fontFamily: FM, fontSize: 9 }}>
            <span className={isLive && !isStale1h ? 'sc-live-dot' : ''} style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 ${isLive && !isStale1h ? '8' : '3'}px ${statusColor}${isLive && !isStale1h ? '' : '66'}`, flexShrink: 0 }} />
            <span style={{ color: statusColor, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              {statusLabel}
            </span>
            <span style={{ width: 1, height: 12, background: '#1e3050' }} />
            <span style={{ color: '#64748b', fontSize: 9 }}>
              {isLive
                ? (isStale24h
                  ? `STALE \u2014 last scan ${relTime(dis.sTime)}`
                  : `${evtCount} events detected, last scan ${relTime(dis.sTime)}`)
                : isApi
                  ? `${evtCount} events via API, ${relTime(dis.sTime)}`
                  : `using cached data, ${relTime(dis.sTime)}`
              }
            </span>
          </div>;
        })()}

        <button onClick={() => fil.setFO(!fil.fO)} style={{ padding: '5px 10px', border: `1px solid ${fil.fO ? '#2563eb44' : '#1a2744'}`, borderRadius: 6, fontSize: 10, cursor: 'pointer', background: fil.fO ? '#1e3a5f18' : 'transparent', color: fil.fO ? '#60a5fa' : '#4a6080', fontWeight: 600 }}>{'\u2630'} Filters</button>

        {/* Scan mode tabs */}
        {(() => {
          const modes: { key: ScanMode; label: string; icon: string; color: string; loadingLabel: string }[] = [
            { key: 'disruptions', label: 'Disruptions', icon: '\ud83d\udd34', color: '#ef4444', loadingLabel: 'Scanning' },
            { key: 'geopolitical', label: 'Geopolitical', icon: '\ud83c\udf0d', color: '#3b82f6', loadingLabel: 'Analysing' },
            { key: 'trade', label: 'Trade & Tariffs', icon: '\ud83d\udcb0', color: '#f59e0b', loadingLabel: 'Scanning' },
          ];
          return <div style={{ display: 'flex', height: 34, borderRadius: 6, overflow: 'hidden', border: '1px solid #14243e', background: '#0a1220' }}>
            {modes.map(m => {
              const isActive = dis.mode === m.key;
              const isScanning = dis.loading && dis.mode === m.key;
              const modeCount = isActive ? (dis.items?.length || 0) : 0;
              return <button key={m.key} onClick={() => dis.scan(m.key)} disabled={dis.loading} style={{
                padding: '0 14px', border: 'none', fontWeight: 600, fontSize: 10, cursor: dis.loading ? 'wait' : 'pointer',
                background: isActive ? `${m.color}12` : 'transparent',
                color: isActive ? m.color : '#4a6080',
                fontFamily: FM, display: 'flex', alignItems: 'center', gap: 5,
                position: 'relative', transition: 'all .15s',
                borderRight: '1px solid #14243e',
                opacity: dis.loading && !isScanning ? 0.5 : 1,
              }}>
                {isScanning
                  ? <><span className="sc-spin" style={{ width: 10, height: 10, border: `2px solid ${m.color}33`, borderTop: `2px solid ${m.color}`, borderRadius: '50%', display: 'inline-block' }} />{m.loadingLabel} {dis.scanPct}%</>
                  : <><span style={{ fontSize: 11 }}>{m.icon}</span>{m.label}</>
                }
                {isActive && modeCount > 0 && !isScanning && <span style={{ background: m.color + '22', color: m.color, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 8, border: `1px solid ${m.color}33`, minWidth: 16, textAlign: 'center' }}>{modeCount}</span>}
                {isActive && <span style={{ position: 'absolute', bottom: 0, left: 4, right: 4, height: 2, background: m.color, borderRadius: '2px 2px 0 0' }} />}
              </button>;
            })}
          </div>;
        })()}

        {/* Rescan button */}
        {dis.mode && !dis.loading && <button onClick={() => dis.scan(dis.mode!)} title="Trigger a fresh scan" style={{
          padding: '5px 10px', border: '1px solid #14243e', borderRadius: 6, fontSize: 10, cursor: 'pointer',
          background: '#0a1220', color: '#64748b', fontWeight: 600, fontFamily: FM,
          display: 'flex', alignItems: 'center', gap: 4, transition: 'all .15s',
        }}>
          {'\u21BB'} Rescan
        </button>}
        {dis.loading && <div style={{
          padding: '5px 10px', border: '1px solid #14243e', borderRadius: 6, fontSize: 10,
          background: '#0a1220', color: '#4a6080', fontWeight: 600, fontFamily: FM,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span className="sc-spin" style={{ width: 10, height: 10, border: '2px solid #2563eb33', borderTop: '2px solid #2563eb', borderRadius: '50%', display: 'inline-block' }} />
          Scanning...
        </div>}

        {ha && <button title="Notifications" onClick={() => { if (dis.dOpen) dis.closeD(); else { dis.setDOpen(true); dis.setDClosing(false); } }} style={{ position: 'relative', padding: '5px 8px', border: '1px solid #1a2744', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1 }}>
          {'\ud83d\udd14'}<span style={{ position: 'absolute', top: -3, right: -3, background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 700, width: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM, border: '2px solid #060a12' }}>{dis.items!.length}</span>
        </button>}
      </div>
    </div>
  );
}
