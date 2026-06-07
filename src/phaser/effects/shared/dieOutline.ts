export type DieOutlinePoint = { x: number; y: number };

export const DIE_EDGE_POINTS: DieOutlinePoint[] = [
  { x: 0.0, y: -1.0 },
  { x: 0.6, y: -0.8 },
  { x: 0.95, y: -0.2 },
  { x: 1, y: 0.12 },
  { x: 0.6, y: 0.8 },
  { x: 0.0, y: 1.0 },
  { x: -0.6, y: 0.8 },
  { x: -0.95, y: 0.25 },
  { x: -0.95, y: -0.12 },
  { x: -0.6, y: -0.78 },
];

export function createDieEdgeLoop(halfW: number, halfH: number, samples: number, insetScale = 1): DieOutlinePoint[] {
  const points: DieOutlinePoint[] = [];
  const vertices = DIE_EDGE_POINTS.map((p) => ({
    x: p.x * halfW * insetScale,
    y: p.y * halfH * insetScale,
  }));
  const lengths = vertices.map((p, i) => {
    const next = vertices[(i + 1) % vertices.length]!;
    return Math.hypot(next.x - p.x, next.y - p.y);
  });
  const perimeter = lengths.reduce((sum, len) => sum + len, 0);

  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * perimeter;
    for (let segment = 0; segment < vertices.length; segment++) {
      const len = lengths[segment]!;
      if (d > len) {
        d -= len;
        continue;
      }
      const a = vertices[segment]!;
      const b = vertices[(segment + 1) % vertices.length]!;
      const t = len > 0 ? d / len : 0;
      points.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      break;
    }
  }

  return points;
}
