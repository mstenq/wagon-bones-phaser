import type { GameObjects } from 'phaser';
import { EFFECT_TEXTURE_KEYS } from '../assets';
import {
  addGlowLayer,
  addSpriteLayer,
  applyArtFilters,
  artBoundsFromMount,
  backdropBounds,
  boundsFromCtx,
  effectRadius,
  makeRuntime,
  noopDestroy,
  pulse01,
  randomInteriorPoint,
} from '../effectHelpers';
import { hostParticleScale, isDieMount, tightDieBounds } from '../dieTuning';
import { createHolyArtFilters, stepHolyArtMatrix, type HolyArtFilterState } from '../shared/artColor';
import { drawEffectBackdrop } from '../shared/cardEffect';
import { borderBoundsFromSize, perimeterPointEllipse, type BorderBounds } from '../shared/borderFrame';
import { createDieEdgeLoop } from '../shared/dieOutline';
import { applyBlurredGlowForMount, applyLayerBlur } from '../shared/glow';
import { createParticlePool, spawnParticle, stepParticles } from '../shared/particles';
import { hash } from '../shared/pseudoRandom';
import type { EffectDefinition, EffectFrameContext } from '../types';

type Point = { x: number; y: number };

type CardRing = {
  points: Point[];
  normals: Point[];
  arcT: number[];
};

const TAU = Math.PI * 2;
const GOLD = 0x6ff9f6;
const GOLD_BRIGHT = 0x6ff9f6;
const RAINBOW_SPEED = 0.22; // hue cycles per second along edge strokes
const RGB_INTENSITY = 0.5; // 0 = white-only strokes, 1 = full-saturation rainbow

/** Per-host knobs for holy aura (card vs die). See HOLY_TUNE below for values + inline notes. */
type HostHolyTune = {
  edgeRingSamples: number;
  ringInsetScale: number;
  thresholdBase: number;
  thresholdStep: number;
  waveFreqScale: number;
  phaseJitter: number;
  gapTolerance: number;
  outwardScale: number;
  shimmerScale: number;
  edgeGlowWidthBase: number;
  edgeGlowWidthLane: number;
  edgeCoreWidth: number;
  edgeGlowAlpha: number;
  edgeCoreAlpha: number;
  backdropInset: readonly [number, number];
  backdropAlpha: readonly [number, number];
  sparkleCount: number;
  particlePool: number;
  particleSpawnRate: number;
  particleClip: number;
  spawnOnPerimeterChance: number;
};

const HOLY_TUNE = {
  // ── Shared edge-light animation (both hosts) ──
  lanes: 12, // stacked rainbow stroke layers; higher = denser edge banding
  speedBase: 0.32, // how fast lit segments travel around the ring (revolutions/sec feel)
  speedStep: 0.2, // extra speed per lane (offsets lanes in time)
  waveFreqBase: 8.5, // lit/dark cycles along perimeter per lane; higher = shorter strokes
  waveFreqStep: 1.7, // extra perimeter frequency per lane
  edgeBlur: { die: 3, card: 6 }, // blur on the wide outer edge-light graphics layer

  die: {
    // ── Ring geometry ──
    edgeRingSamples: 68, // points around outline; lower = longer individual strokes
    ringInsetScale: 1.02, // 1 = art edge, >1 pushes ring slightly outward

    // ── Which segments are lit (stroke length & density) ──
    thresholdBase: 0.5, // lit gate for lane 0; lower = more segments on
    thresholdStep: 0.08, // added per lane (high lanes need stronger wave to light)
    waveFreqScale: 1, // multiplies waveFreqBase/Step along arc; lower = longer lit runs
    phaseJitter: 0, // random phase per point (radians); high = choppy micro-strokes
    gapTolerance: 0, // unlit points to skip before breaking a stroke chain

    // ── Edge stroke placement & look ──
    outwardScale: 1, // how far strokes sit past the ring (× lane offset + shimmer)
    shimmerScale: 1, // wobble amplitude along the outward normal
    edgeGlowWidthBase: 4, // wide blurred rainbow stroke width (lane 0)
    edgeGlowWidthLane: 1, // width added per lane for glow layer
    edgeCoreWidth: 1.2, // thin sharp inner stroke width
    edgeGlowAlpha: 0.1, // outer glow layer opacity (× pulse & hover)
    edgeCoreAlpha: 0.22, // inner core layer opacity

    // ── Teal backdrop behind art (layers.back) ──
    backdropInset: [6, 4], // [outer fill, inner sheen] shrink from card/die bounds (px)
    backdropAlpha: [0.1, 0.06], // [outer, inner] base opacity (+ pulse in step)

    // ── Rising sparkle sprites ──
    sparkleCount: 10, // recycled sprite pool size (visible at once ≤ this)
    particlePool: 14, // sim slots for rising motes
    particleSpawnRate: 7, // spawns per second (× hostParticleScale on die)
    particleClip: 1.2, // hide sparkles beyond radius × this
    spawnOnPerimeterChance: 1, // 1 = always spawn on ring edge; 0 = interior only
  },

  card: {
    // ── Ring geometry ──
    edgeRingSamples: 68, // points around superellipse; lower = longer strokes
    ringInsetScale: 1.04, // >1 expands ring past art bounds slightly

    // ── Which segments are lit (stroke length & density) ──
    thresholdBase: 0.36, // lower than die → more lit segments on cards
    thresholdStep: 0.05,
    waveFreqScale: 0.58, // slower arc wave → longer strokes (card flat sides)
    phaseJitter: 0.35, // breaks flat-side sync; keep < ~0.5 to avoid choppy bits
    gapTolerance: 2, // bridge 1–2 dark points so strokes stay connected

    // ── Edge stroke placement & look ──
    outwardScale: 1.1,
    shimmerScale: 1.4,
    edgeGlowWidthBase: 7,
    edgeGlowWidthLane: 1.5,
    edgeCoreWidth: 1.8,
    edgeGlowAlpha: 0.14,
    edgeCoreAlpha: 0.28,

    // ── Teal backdrop behind art ──
    backdropInset: [7, 5], // smaller inset than old 12/14 = glow hugs card face more
    backdropAlpha: [0.13, 0.09],

    // ── Rising sparkle sprites ──
    sparkleCount: 18,
    particlePool: 26,
    particleSpawnRate: 11,
    particleClip: 1.32, // how far from center sparkles stay visible (× half-size)
    spawnOnPerimeterChance: 0.72, // rest spawn on interior; perimeter gets outward velocity
  },
} as const;

function fract01(n: number): number {
  return n - Math.floor(n);
}

function rainbowColor(hue: number): number {
  const h = fract01(hue) * 6;
  const i = Math.floor(h);
  const f = h - i;
  const q = 1 - f;
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = 1;
      g = f;
      break;
    case 1:
      r = q;
      g = 1;
      break;
    case 2:
      g = 1;
      b = f;
      break;
    case 3:
      g = q;
      b = 1;
      break;
    case 4:
      r = f;
      b = 1;
      break;
    default:
      r = 1;
      b = q;
      break;
  }
  const mix = (c: number) => c * RGB_INTENSITY + (1 - RGB_INTENSITY);
  return (Math.round(mix(r) * 255) << 16) | (Math.round(mix(g) * 255) << 8) | Math.round(mix(b) * 255);
}

/** Superellipse ring; startAngle offsets the loop seam away from the card's right flat edge. */
function createCardLoopRaw(bounds: BorderBounds, samples: number, insetScale: number, startAngle: number): Point[] {
  const points: Point[] = [];
  const halfW = bounds.halfW * insetScale;
  const halfH = bounds.halfH * insetScale;
  const exponent = 5.5;
  for (let i = 0; i < samples; i++) {
    const a = startAngle + (i / samples) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    points.push({
      x: halfW * Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent),
      y: halfH * Math.sign(s) * Math.pow(Math.abs(s), 2 / exponent),
    });
  }
  return points;
}

/** Evenly space samples by arc length so flat sides don't share synchronized index bands. */
function resampleClosedLoopByArc(points: Point[], samples: number): CardRing {
  if (points.length < 3) {
    return { points, normals: createOutwardNormals(points), arcT: points.map((_, i) => i / points.length) };
  }

  const segLens: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]!;
    const len = Math.hypot(next.x - points[i]!.x, next.y - points[i]!.y);
    segLens.push(len);
    perimeter += len;
  }

  const resampled: Point[] = [];
  const arcT: number[] = [];
  for (let i = 0; i < samples; i++) {
    const target = (i / samples) * perimeter;
    let walked = 0;
    for (let seg = 0; seg < points.length; seg++) {
      const segLen = segLens[seg]!;
      if (walked + segLen >= target || seg === points.length - 1) {
        const a = points[seg]!;
        const b = points[(seg + 1) % points.length]!;
        const t = segLen > 0 ? Math.min(1, (target - walked) / segLen) : 0;
        resampled.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        arcT.push(perimeter > 0 ? target / perimeter : 0);
        break;
      }
      walked += segLen;
    }
  }

  return { points: resampled, normals: createOutwardNormals(resampled), arcT };
}

function buildCardRing(bounds: BorderBounds, samples: number, insetScale: number, phase: number): CardRing {
  const seamAngle = Math.PI * 0.25 + hash(phase * 3.17) * 0.4;
  const raw = createCardLoopRaw(bounds, samples * 2, insetScale, seamAngle);
  return resampleClosedLoopByArc(raw, samples);
}

function createOutwardNormals(points: Point[]): Point[] {
  const normals: Point[] = [];
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

function setStrokeStyle(gfx: GameObjects.Graphics, width: number, color: number, alpha: number): void {
  gfx.lineStyle(width, color, alpha);
}

function randomRingSpawnPoint(ringPoints: Point[], ringNormals: Point[], inward = 5): Point {
  const idx = Math.floor(Math.random() * ringPoints.length);
  const p = ringPoints[idx]!;
  const n = ringNormals[idx]!;
  return { x: p.x - n.x * inward, y: p.y - n.y * inward };
}

function drawEdgeLightLane(
  gfx: GameObjects.Graphics,
  ringPoints: Point[],
  ringNormals: Point[],
  arcT: number[],
  time: number,
  huePhase: number,
  lane: number,
  alpha: number,
  width: number,
  hostTune: HostHolyTune,
): void {
  let prev: Point | null = null;
  let gapCount = 0;
  for (let idx = 0; idx < ringPoints.length; idx++) {
    const p = ringPoints[idx]!;
    const n = ringNormals[idx]!;
    const tAlong = arcT[idx] ?? idx / ringPoints.length;
    const jitter = (hash(idx * 17.13 + lane * 53.7) - 0.5) * 2 * hostTune.phaseJitter;
    const waveFreq = (HOLY_TUNE.waveFreqBase + lane * HOLY_TUNE.waveFreqStep) * hostTune.waveFreqScale;
    const wave =
      0.5 +
      0.5 *
        Math.sin(
          time * (HOLY_TUNE.speedBase + lane * HOLY_TUNE.speedStep) * TAU +
            tAlong * waveFreq * TAU +
            lane * 1.7 +
            jitter,
        );
    const flicker = hash(Math.floor(time * (8 + lane * 2)) + idx * 19.31 + lane * 71.7);
    const lit = wave * 0.7 + flicker * 0.3 > hostTune.thresholdBase + lane * hostTune.thresholdStep;
    if (!lit) {
      gapCount += 1;
      if (gapCount > hostTune.gapTolerance) {
        prev = null;
      }
      continue;
    }
    gapCount = 0;

    const shimmer = Math.sin(time * 2.7 + tAlong * TAU * 3.1 + lane * 1.9) * (1.2 + lane * 0.5) * hostTune.shimmerScale;
    const outward = (lane * 1.8 + shimmer) * hostTune.outwardScale;
    const projected = {
      x: p.x + n.x * outward,
      y: p.y + n.y * outward,
    };
    if (prev) {
      const hue = huePhase + tAlong + lane * 0.07;
      setStrokeStyle(gfx, width, rainbowColor(hue), alpha);
      gfx.beginPath();
      gfx.moveTo(prev.x, prev.y);
      gfx.lineTo(projected.x, projected.y);
      gfx.strokePath();
    }
    prev = projected;
  }
}

export const holyEffect: EffectDefinition = {
  id: 'holy',
  label: 'Holy',
  create(layers, mount, art) {
    const bounds = boundsFromCtx(mount);
    const artBounds = artBoundsFromMount(mount);
    const backBounds = backdropBounds(mount);
    const hostKind = mount.hostKind;
    const isDie = isDieMount(mount);
    const hostTune = isDie ? HOLY_TUNE.die : HOLY_TUNE.card;
    const radius = effectRadius(mount, bounds);
    const pScale = hostParticleScale(mount);
    const tight = tightDieBounds(mount);
    const ringBounds = isDie ? tight : borderBoundsFromSize(mount.width, mount.height);
    let ringPoints: Point[];
    let ringNormals: Point[];
    let ringArcT: number[];
    if (isDie) {
      ringPoints = createDieEdgeLoop(
        ringBounds.halfW,
        ringBounds.halfH,
        hostTune.edgeRingSamples,
        hostTune.ringInsetScale,
      );
      ringNormals = createOutwardNormals(ringPoints);
      ringArcT = ringPoints.map((_, i) => i / ringPoints.length);
    } else {
      const ringSeed = ringBounds.halfW * 17.3 + ringBounds.halfH * 9.1;
      const cardRing = buildCardRing(ringBounds, hostTune.edgeRingSamples, hostTune.ringInsetScale, ringSeed);
      ringPoints = cardRing.points;
      ringNormals = cardRing.normals;
      ringArcT = cardRing.arcT;
    }

    const backdrop = addGlowLayer(layers.back, 0);
    applyBlurredGlowForMount(backdrop, mount, 16);

    const sheen = addGlowLayer(layers.back, 1);
    applyBlurredGlowForMount(sheen, mount, 10);

    const edgeGlow = addGlowLayer(layers.front, 0);
    applyLayerBlur(edgeGlow, isDie ? HOLY_TUNE.edgeBlur.die : HOLY_TUNE.edgeBlur.card, 3);
    const edgeCore = addGlowLayer(layers.front, 1);

    const sparkleTexKey = EFFECT_TEXTURE_KEYS.sparkle;
    const sparkles: GameObjects.Image[] = [];
    for (let i = 0; i < hostTune.sparkleCount; i++) {
      const s = addSpriteLayer(layers.front, sparkleTexKey, 10 + i);
      if (s) {
        sparkles.push(s);
        s.setVisible(false);
      }
    }

    const particles = createParticlePool(hostTune.particlePool);
    let artFilterState: HolyArtFilterState | null = null;

    applyArtFilters(art, (img) => {
      artFilterState = createHolyArtFilters(img);
      return () => {
        if (img.filters && artFilterState) {
          img.filters.internal.remove(artFilterState.cmController);
        }
      };
    });

    const step = (frame: EffectFrameContext) => {
      if (!artFilterState) {
        return;
      }
      const t = frame.time;
      const pulse = pulse01(t, 2);
      stepHolyArtMatrix(artFilterState, pulse);

      drawEffectBackdrop(
        backdrop,
        backBounds,
        hostKind,
        GOLD,
        hostTune.backdropAlpha[0] + pulse * 0.06,
        hostTune.backdropInset[0],
      );
      drawEffectBackdrop(
        sheen,
        backBounds,
        hostKind,
        GOLD_BRIGHT,
        hostTune.backdropAlpha[1] + pulse * 0.04,
        hostTune.backdropInset[1],
      );

      edgeGlow.clear();
      edgeCore.clear();

      const hoverBoost = frame.hovered ? 1.25 : 1;
      const rainbowPhase = t * RAINBOW_SPEED + frame.phase * 0.04;
      for (let lane = 0; lane < HOLY_TUNE.lanes; lane++) {
        drawEdgeLightLane(
          edgeGlow,
          ringPoints,
          ringNormals,
          ringArcT,
          t + frame.phase * 0.07,
          rainbowPhase,
          lane,
          (hostTune.edgeGlowAlpha + pulse * 0.04) * hoverBoost,
          hostTune.edgeGlowWidthBase + lane * hostTune.edgeGlowWidthLane,
          hostTune,
        );
        drawEdgeLightLane(
          edgeCore,
          ringPoints,
          ringNormals,
          ringArcT,
          t + frame.phase * 0.07 + 0.33,
          rainbowPhase + 0.18,
          lane,
          (hostTune.edgeCoreAlpha + pulse * 0.08) * hoverBoost,
          hostTune.edgeCoreWidth,
          hostTune,
        );
      }

      stepParticles(particles, frame.dt);
      if (Math.random() < frame.dt * hostTune.particleSpawnRate * pScale) {
        let p: Point;
        let spawnNormal: Point | null = null;
        if (isDie) {
          p = perimeterPointEllipse(tight, Math.random());
        } else if (Math.random() < hostTune.spawnOnPerimeterChance) {
          const idx = Math.floor(Math.random() * ringPoints.length);
          spawnNormal = ringNormals[idx]!;
          p = randomRingSpawnPoint(ringPoints, ringNormals, 4 + Math.random() * 8);
        } else {
          p = randomInteriorPoint(artBounds, 0.08);
        }
        const outwardSpeed = spawnNormal ? (10 + Math.random() * 16) * hostTune.outwardScale : 0;
        spawnParticle(particles, {
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 10 * pScale + (spawnNormal?.x ?? 0) * outwardSpeed,
          vy: (-16 - Math.random() * 20) * pScale + (spawnNormal?.y ?? 0) * outwardSpeed,
          maxLife: 0.55 + Math.random() * 0.45,
          size: 2,
          color: GOLD_BRIGHT,
          alpha: 1,
        });
      }

      const baseScale = isDie ? 0.22 : 0.3;
      let slot = 0;
      const maxDist = isDie
        ? radius * hostTune.particleClip
        : Math.max(artBounds.halfW, artBounds.halfH) * hostTune.particleClip;
      for (const p of particles) {
        if (p.life <= 0) continue;
        if (Math.hypot(p.x, p.y) > maxDist) continue;
        const s = sparkles[slot % sparkles.length];
        slot += 1;
        if (!s) continue;
        const lifeT = p.life / p.maxLife;
        s.setPosition(p.x, p.y);
        s.setAlpha(lifeT);
        s.setScale(baseScale + lifeT * baseScale);
        s.setRotation(t * 1.5 + slot);
        s.setVisible(true);
      }
      for (let i = slot; i < sparkles.length; i++) {
        sparkles[i]!.setVisible(false);
      }
    };

    return makeRuntime(
      'holy',
      step,
      noopDestroy(() => {
        backdrop.destroy();
        sheen.destroy();
        edgeGlow.destroy();
        edgeCore.destroy();
        for (const s of sparkles) {
          s.destroy();
        }
      }),
    );
  },
};
