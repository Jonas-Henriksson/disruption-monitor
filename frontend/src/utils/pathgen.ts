/**
 * Lightweight SVG path generators to replace d3-shape.
 * Saves ~20KB minified by avoiding the full d3-shape + d3-path dependency chain.
 */

/** Generate an SVG path string from points using cardinal spline interpolation. */
export function cardinalLine(points: [number, number][], tension = 0.7): string | null {
  if (!points || points.length < 2) return null;
  if (points.length === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;

  const t = Math.min(1, Math.max(0, tension));
  const s = (1 - t) / 2;
  const n = points.length;
  let d = `M${points[0][0]},${points[0][1]}`;

  for (let i = 1; i < n; i++) {
    const p0 = points[Math.max(0, i - 2)];
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[Math.min(n - 1, i + 1)];

    // Catmull-Rom to cubic bezier control points
    const cp1x = p1[0] + s * (p2[0] - p0[0]) / 3;
    const cp1y = p1[1] + s * (p2[1] - p0[1]) / 3;
    const cp2x = p2[0] - s * (p3[0] - p1[0]) / 3;
    const cp2y = p2[1] - s * (p3[1] - p1[1]) / 3;

    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2[0]},${p2[1]}`;
  }

  return d;
}

/** Generate an SVG path string from points using basis spline (B-spline) interpolation. */
export function basisLine(points: [number, number][]): string | null {
  if (!points || points.length < 2) return null;
  if (points.length === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;

  const n = points.length;

  // Start at the first point
  let d = `M${points[0][0]},${points[0][1]}`;

  if (n === 3) {
    // Quadratic approximation for 3 points
    const mx = (points[0][0] + 4 * points[1][0] + points[2][0]) / 6;
    const my = (points[0][1] + 4 * points[1][1] + points[2][1]) / 6;
    d += `Q${points[1][0]},${points[1][1]},${mx},${my}`;
    d += `Q${points[1][0]},${points[1][1]},${points[2][0]},${points[2][1]}`;
    return d;
  }

  // B-spline: for each segment, compute cubic Bezier approximation
  for (let i = 1; i < n - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[Math.min(i + 1, n - 1)];

    const x1 = (2 * p0[0] + p1[0]) / 3;
    const y1 = (2 * p0[1] + p1[1]) / 3;
    const x2 = (p0[0] + 2 * p1[0]) / 3;
    const y2 = (p0[1] + 2 * p1[1]) / 3;
    const x3 = (p0[0] + 4 * p1[0] + p2[0]) / 6;
    const y3 = (p0[1] + 4 * p1[1] + p2[1]) / 6;

    if (i === 1) {
      d += `C${x1},${y1},${x2},${y2},${x3},${y3}`;
    } else {
      d += `S${x2},${y2},${x3},${y3}`;
    }
  }

  // End segment to last point
  const pn2 = points[n - 2];
  const pn1 = points[n - 1];
  const ex = (pn2[0] + 2 * pn1[0]) / 3;
  const ey = (pn2[1] + 2 * pn1[1]) / 3;
  d += `S${ex},${ey},${pn1[0]},${pn1[1]}`;

  return d;
}
