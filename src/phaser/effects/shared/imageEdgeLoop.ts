import type { GameObjects } from 'phaser';
import { createDieEdgeLoop } from './dieOutline';

export type EdgePoint = { x: number; y: number };

const ALPHA_THRESHOLD = 24;
const edgeLoopCache = new Map<string, EdgePoint[]>();

const TRACE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function isOpaque(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) {
    return false;
  }
  return data[(y * w + x) * 4 + 3]! >= ALPHA_THRESHOLD;
}

function readFrameAlpha(image: GameObjects.Image): { data: Uint8ClampedArray; width: number; height: number } | null {
  const frame = image.frame;
  const source = image.texture.getSourceImage() as CanvasImageSource | null;
  const w = frame.cutWidth;
  const h = frame.cutHeight;
  if (!source || w <= 0 || h <= 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(source, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

function findBoundaryStart(data: Uint8ClampedArray, w: number, h: number): EdgePoint | null {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOpaque(data, w, h, x, y)) {
        continue;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          if (!isOpaque(data, w, h, x + dx, y + dy)) {
            return { x, y };
          }
        }
      }
    }
  }
  return null;
}

function traceOuterBoundary(data: Uint8ClampedArray, w: number, h: number): EdgePoint[] {
  const start = findBoundaryStart(data, w, h);
  if (!start) {
    return [];
  }

  const contour: EdgePoint[] = [];
  let x = start.x;
  let y = start.y;
  let dir = 0;
  const maxSteps = w * h * 4;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x, y });

    let moved = false;
    for (let offset = 0; offset < 8; offset++) {
      const nd = (dir + offset) % 8;
      const [dx, dy] = TRACE_DIRS[nd]!;
      const nx = x + dx;
      const ny = y + dy;
      if (!isOpaque(data, w, h, nx, ny)) {
        continue;
      }
      x = nx;
      y = ny;
      dir = (nd + 6) % 8;
      moved = true;
      break;
    }

    if (!moved) {
      break;
    }
    if (x === start.x && y === start.y && contour.length > 3) {
      break;
    }
  }

  return contour;
}

function resampleClosedLoop(contour: EdgePoint[], samples: number): EdgePoint[] {
  if (contour.length < 3) {
    return contour;
  }

  const segLengths: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % contour.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLengths.push(len);
    perimeter += len;
  }
  if (perimeter <= 0) {
    return contour.slice(0, samples);
  }

  const result: EdgePoint[] = [];
  let walked = 0;
  let seg = 0;
  for (let i = 0; i < samples; i++) {
    const target = (i / samples) * perimeter;
    while (walked + segLengths[seg]! < target && seg < contour.length - 1) {
      walked += segLengths[seg]!;
      seg++;
    }
    const a = contour[seg]!;
    const b = contour[(seg + 1) % contour.length]!;
    const segLen = segLengths[seg]!;
    const t = segLen > 0 ? (target - walked) / segLen : 0;
    result.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }
  return result;
}

function pixelToLocal(px: number, py: number, image: GameObjects.Image): EdgePoint {
  const frame = image.frame;
  const sourceW = image.width;
  const sourceH = image.height;
  const sx = frame.x + px;
  const sy = frame.y + py;
  const dw = image.displayWidth;
  const dh = image.displayHeight;
  return {
    x: (sx / sourceW) * dw - dw * image.originX,
    y: (sy / sourceH) * dh - dh * image.originY,
  };
}

function scaleLoop(points: EdgePoint[], insetScale: number): EdgePoint[] {
  if (insetScale === 1) {
    return points;
  }
  return points.map((p) => ({ x: p.x * insetScale, y: p.y * insetScale }));
}

function cacheKey(image: GameObjects.Image, samples: number, insetScale: number): string {
  const frame = image.frame;
  return [
    image.texture.key,
    frame.name,
    image.width,
    image.height,
    frame.x,
    frame.y,
    frame.cutWidth,
    frame.cutHeight,
    image.displayWidth,
    image.displayHeight,
    image.originX,
    image.originY,
    samples,
    insetScale,
  ].join('|');
}

function traceImageEdgeLoop(image: GameObjects.Image, samples: number, insetScale: number): EdgePoint[] | null {
  const key = cacheKey(image, samples, insetScale);
  const cached = edgeLoopCache.get(key);
  if (cached) {
    return cached;
  }

  const frameAlpha = readFrameAlpha(image);
  if (!frameAlpha) {
    return null;
  }

  const contour = traceOuterBoundary(frameAlpha.data, frameAlpha.width, frameAlpha.height);
  if (contour.length < 8) {
    return null;
  }

  const resampled = resampleClosedLoop(contour, samples);
  const local = scaleLoop(
    resampled.map((p) => pixelToLocal(p.x, p.y, image)),
    insetScale,
  );
  edgeLoopCache.set(key, local);
  return local;
}

export type ImageEdgeLoopFallback = {
  halfW: number;
  halfH: number;
  useDieOutline?: boolean;
};

export function createImageEdgeLoop(
  image: GameObjects.Image | null,
  samples: number,
  insetScale: number,
  fallback: ImageEdgeLoopFallback,
): EdgePoint[] {
  if (image) {
    const traced = traceImageEdgeLoop(image, samples, insetScale);
    if (traced) {
      return traced;
    }
  }

  if (fallback.useDieOutline) {
    return createDieEdgeLoop(fallback.halfW, fallback.halfH, samples, insetScale);
  }

  const points: EdgePoint[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * fallback.halfW * insetScale,
      y: Math.sin(angle) * fallback.halfH * insetScale,
    });
  }
  return points;
}

export function createOutwardNormals(points: EdgePoint[]): EdgePoint[] {
  const normals: EdgePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.max(0.0001, Math.hypot(tx, ty));
    normals.push({ x: ty / len, y: -tx / len });
  }
  return normals;
}
