import { FM } from '../data';
import type { KpiData } from './KPIStrip';
import type { useDisruptionState } from '../hooks/useDisruptionState';

type DisruptionState = ReturnType<typeof useDisruptionState>;

interface TimelineStripProps {
  dis: DisruptionState;
  kpi: KpiData;
  mapWidth: number;
}

export function TimelineStrip({ dis, mapWidth }: TimelineStripProps) {
  const isOpen = dis.timelineOpen;
  // Use backend timeline data if available, otherwise show empty state
  const hasBackendTimeline = !!dis.timelineData && dis.timelineData.length > 0;
  const timelineData = hasBackendTimeline
    ? dis.timelineData!.map(dp => {
        const total = dp.event_count || 1;
        const weighted = (dp.critical_count * 4 + dp.high_count * 3 + (total - dp.critical_count - dp.high_count) * 1.5) / total;
        return { day: new Date(dp.date), value: Math.max(0.5, Math.min(4, weighted)) };
      })
    : [];
  const maxVal = timelineData.length > 0 ? Math.max(...timelineData.map(d => d.value)) : 0;
  const minVal = timelineData.length > 0 ? Math.min(...timelineData.map(d => d.value)) : 0;

  const chartWidth = Math.max(400, mapWidth - 32);

  return (
    <div
      style={{
        background: '#080e1c', borderBottom: '1px solid #14243e', flexShrink: 0, zIndex: 25,
        overflow: 'hidden', cursor: 'pointer', transition: 'max-height .3s ease',
        maxHeight: isOpen ? 200 : 40,
      }}
      onClick={() => dis.setTimelineOpen(!isOpen)}
    >
      {/* Collapsed header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 40 }}>
        <span style={{ fontSize: 10, color: '#2a3d5c', transform: isOpen ? 'rotate(90deg)' : '', transition: 'transform .2s', flexShrink: 0 }}>{'\u25B6'}</span>
        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#2a3d5c', fontFamily: FM }}>Risk Timeline</span>
        {hasBackendTimeline
          ? <span style={{ fontSize: 8, color: '#1e3050', fontFamily: FM }}>{timelineData.length} days</span>
          : <span style={{ fontSize: 8, color: '#1e3050', fontFamily: FM, fontStyle: 'italic' }}>No data yet {'\u2014'} accumulates from scans</span>
        }
        {hasBackendTimeline && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} className="sc-live-dot" />}
        {/* Mini inline sparkline when collapsed — only shown with real data */}
        {!isOpen && hasBackendTimeline && <svg width={120} height={20} style={{ flexShrink: 0 }}>
          {timelineData.map((d, i) => {
            const x = (i / (timelineData.length - 1 || 1)) * 118 + 1;
            const y = 18 - ((d.value - minVal) / (maxVal - minVal || 1)) * 14;
            const color = d.value >= 3.5 ? '#ef4444' : d.value >= 2.5 ? '#f97316' : d.value >= 1.5 ? '#eab308' : '#22c55e';
            return <circle key={i} cx={x} cy={y} r={1.2} fill={color} opacity={.7} />;
          })}
        </svg>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: '#1e3050', fontFamily: FM }}>{isOpen ? 'Click to collapse' : 'Click to expand'}</span>
      </div>

      {/* Expanded timeline view */}
      {isOpen && <div style={{ padding: '0 16px 12px' }} onClick={e => e.stopPropagation()}>
        {hasBackendTimeline ? <>
          <svg width="100%" height={140} viewBox={`0 0 ${chartWidth} 140`} preserveAspectRatio="none">
            {/* Grid lines */}
            {[0, 1, 2, 3, 4].map(v => {
              const y = 120 - (v / 4) * 110 + 5;
              const labels = ['Low', '', 'Medium', 'High', 'Critical'];
              return <g key={v}>
                <line x1={40} y1={y} x2={chartWidth - 10} y2={y} stroke="#14243e" strokeWidth={.5} />
                <text x={36} y={y + 3} textAnchor="end" fontSize={7} fill="#1e3050" fontFamily="JetBrains Mono,monospace">{labels[v]}</text>
              </g>;
            })}
            {/* Area fill */}
            <path
              d={`M ${40} ${120 - ((timelineData[0].value - minVal) / (maxVal - minVal || 1)) * 110 + 5} ` +
                timelineData.map((d, i) => {
                  const x = 40 + (i / (timelineData.length - 1 || 1)) * (chartWidth - 60);
                  const y = 120 - ((d.value - minVal) / (maxVal - minVal || 1)) * 110 + 5;
                  return `L ${x} ${y}`;
                }).join(' ') +
                ` L ${40 + ((timelineData.length - 1) / (timelineData.length - 1 || 1)) * (chartWidth - 60)} 125 L 40 125 Z`}
              fill="url(#tl-gradient)" opacity={.3}
            />
            <defs>
              <linearGradient id="tl-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Line */}
            <path
              d={timelineData.map((d, i) => {
                const x = 40 + (i / (timelineData.length - 1 || 1)) * (chartWidth - 60);
                const y = 120 - ((d.value - minVal) / (maxVal - minVal || 1)) * 110 + 5;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={.8}
            />
            {/* Data points */}
            {timelineData.map((d, i) => {
              const x = 40 + (i / (timelineData.length - 1 || 1)) * (chartWidth - 60);
              const y = 120 - ((d.value - minVal) / (maxVal - minVal || 1)) * 110 + 5;
              const color = d.value >= 3.5 ? '#ef4444' : d.value >= 2.5 ? '#f97316' : d.value >= 1.5 ? '#eab308' : '#22c55e';
              return <g key={i}>
                <circle cx={x} cy={y} r={2.5} fill={color} stroke="#080e1c" strokeWidth={1} opacity={.9} />
                {i % 5 === 0 && <text x={x} y={135} textAnchor="middle" fontSize={7} fill="#1e3050" fontFamily="JetBrains Mono,monospace">
                  {d.day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </text>}
              </g>;
            })}
            {/* Today marker */}
            {(() => {
              const x = 40 + ((timelineData.length - 1) / (timelineData.length - 1 || 1)) * (chartWidth - 60);
              return <g>
                <line x1={x} y1={5} x2={x} y2={125} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,2" opacity={.5} />
                <text x={x} y={0} textAnchor="middle" fontSize={7} fill="#3b82f6" fontFamily="JetBrains Mono,monospace" fontWeight={600}>Today</text>
              </g>;
            })()}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 8, color: '#1e3050', fontFamily: FM, fontStyle: 'italic' }}>{`Live data \u2014 ${dis.timelineData!.length} days from event_snapshots`}</span>
          </div>
        </> : <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 120, margin: '0 40px',
          border: '1px dashed #14243e', borderRadius: 8, background: '#060a1280',
        }}>
          <svg width={120} height={24} style={{ opacity: 0.2, marginBottom: 8 }}>
            {/* Placeholder chart silhouette */}
            <path d="M 2 20 L 15 14 L 30 16 L 45 8 L 60 12 L 75 6 L 90 10 L 105 4 L 118 8" fill="none" stroke="#2a3d5c" strokeWidth={1.5} strokeLinecap="round" />
            <path d="M 2 20 L 15 14 L 30 16 L 45 8 L 60 12 L 75 6 L 90 10 L 105 4 L 118 8 L 118 24 L 2 24 Z" fill="#14243e" opacity={0.3} />
          </svg>
          <span style={{ fontSize: 10, color: '#2a3d5c', fontFamily: FM, fontWeight: 500 }}>
            No timeline data yet
          </span>
          <span style={{ fontSize: 9, color: '#1e3050', fontFamily: FM, marginTop: 3 }}>
            Run a scan to begin building the risk timeline
          </span>
        </div>}
      </div>}
    </div>
  );
}
