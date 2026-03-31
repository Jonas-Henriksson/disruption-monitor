interface SiteShapeProps {
  shape: string;
  x: number;
  y: number;
  r: number;
  sr: number;
  color: string;
  ih: boolean;
  bo: number;
  inv: number;
}

export function SiteShape({ shape, x, y, r, sr, color, ih, bo, inv }: SiteShapeProps) {
  const sw = Math.max(.3, (ih ? 1.5 : .8) * inv);
  const fl = ih ? "url(#gl)" : "";
  const op = ih ? 1 : bo;

  if (shape === 'tri') {
    return (
      <polygon
        points={`${x},${y - r} ${x + r * .87},${y + r * .5} ${x - r * .87},${y + r * .5}`}
        fill={color} stroke={ih ? '#fff' : color} strokeWidth={sw} filter={fl} opacity={op}
      />
    );
  }

  if (shape === 'star') {
    return (
      <g>
        <circle cx={x} cy={y} r={r * .7} fill={color} stroke={ih ? '#fff' : color + 'aa'}
          strokeWidth={Math.max(.3, .8 * inv)} filter={fl} opacity={op} />
        <circle cx={x} cy={y} r={r * 1.2} fill="none" stroke={color}
          strokeWidth={Math.max(.2, .4 * inv)} strokeDasharray={`${Math.max(1, 2 * inv)},${Math.max(1, 2 * inv)}`} opacity={.4} />
      </g>
    );
  }

  if (shape === 'dia') {
    return (
      <rect x={x - r * .6} y={y - r * .6} width={r * 1.2} height={r * 1.2}
        rx={Math.max(.3, inv)} fill={color} stroke={ih ? '#fff' : color + 'aa'}
        strokeWidth={Math.max(.2, .5 * inv)} transform={`rotate(45,${x},${y})`} filter={fl} opacity={op}
      />
    );
  }

  if (shape === 'sq') {
    return (
      <rect x={x - sr * 1.1} y={y - sr * 1.1} width={sr * 2.2} height={sr * 2.2}
        rx={Math.max(.3, inv)} fill={color} stroke={ih ? '#fff' : color + '88'}
        strokeWidth={Math.max(.2, .5 * inv)} filter={fl} opacity={op}
      />
    );
  }

  // Default: circle (dot)
  return (
    <circle cx={x} cy={y} r={ih ? sr * 1.3 : sr}
      fill={color} stroke={ih ? '#fff' : ''} strokeWidth={ih ? Math.max(.3, inv) : 0} opacity={op}
    />
  );
}
