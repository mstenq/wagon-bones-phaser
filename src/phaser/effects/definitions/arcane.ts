import type { GameObjects } from 'phaser';
import { UI } from '../../../game/Constants';
import { addGlowLayer, artBoundsFromMount, makeRuntime, noopDestroy, pulse01 } from '../effectHelpers';
import { isDieMount, tightDieBounds } from '../dieTuning';
import { createImageEdgeLoop, createOutwardNormals } from '../shared/imageEdgeLoop';
import { applyArcaneLayerBlur } from '../shared/glow';
import { hash } from '../shared/pseudoRandom';
import type { EffectDefinition, EffectFrameContext } from '../types';

type Point = { x: number; y: number };

type Strike = {
  life: number;
  maxLife: number;
  path: Point[];
  impact: Point;
};

const TAU = Math.PI * 2;
const ARCANE_CORE = 0xe8f8ff;
const ARCANE_OUTER = 0x8fd6ff;
const ARCANE_HALO = 0x4db8ff;

const ARCANE_TUNE = {
  ringInsetScale: 1.02,
  sampleCount: { die: 80, card: 108 },
  laneCount: 2,
  baseAmplitude: 1.85,
  hoverBoost: 1.12,
  activeBoost: 1.2,
  pulse: {
    base: 0.72,
    layer1PeriodBase: 1.15,
    layer1PeriodSeedScale: 0.2,
    layer1Weight: 0.34,
    layer2PeriodBase: 2.9,
    layer2PeriodSeedScale: 0.35,
    layer2Phase: 1.4,
    layer2Weight: 0.1,
  },
  lane: {
    phaseStep: 0.9,
    phaseSeedScale: 4.0,
    speedBase: 6.4,
    speedStep: 1.5,
    freqBase: 0.38,
    freqStep: 0.07,
    thresholdBase: 0.54,
    thresholdStep: 0.1,
    microDriftBase: 0.48,
    microDriftStep: 0.1,
    gateCadenceBase: 9.5,
    gateCadenceStep: 1.5,
  },
  stochastic: {
    phaseKick: 7.5,
    phaseDamping: 2.1,
    gateKick: 3.2,
    gateDamping: 1.8,
    initialGateNudgeMax: 20,
  },
  shape: {
    driftIndexScale: 0.07,
    driftPhaseScale: 1.7,
    driftSeedScale: 4.0,
    driftPhaseNudgeScale: 0.22,
    driftAmplitude: 1.4,
    tangentWiggleScale: 0.53,
    tangentIndexScale: 0.33,
    tangentSeedScale: 3.0,
    tangentDriftScale: 0.6,
    normalOffsetBase: 1.1,
    normalOffsetJitterScale: 1.8,
    tangentOffset: 1.15,
  },
  gate: {
    waveFrequencyBase: 7.2,
    waveFrequencyStep: 0.65,
    waveIndexScale: 0.5,
    wavePhaseNudgeScale: 0.35,
    waveWeight: 0.72,
    noiseWeight: 0.28,
    breakNoiseThreshold: 0.11,
  },
  stroke: {
    haloBlur: { strength: 14, quality: 3 },
    auraBlur: { strength: 12, quality: 3 },
    strandsBlur: { strength: 5, quality: 2 },
    halo: { width: 11, alpha: 0.14 },
    aura: { width: 4, alpha: 0.26 },
    strands: { width: 5, alpha: 0.4 },
    core: { width: 2.8, alpha: 0.95 },
  },
  hoverStrike: {
    spawnPerSecond: 1.35,
    maxConcurrent: 1,
    lifeMin: 0.07,
    lifeMax: 0.14,
    kinks: 3,
    jitterBase: 1.2,
    jitterSeedScale: 0.9,
    glowBlur: { strength: 10, quality: 3 },
    glowWidth: 10,
    glowAlpha: 0.38,
    auraBlur: { strength: 8, quality: 2 },
    auraWidth: 7,
    auraAlpha: 0.5,
    coreWidth: 2.2,
    coreAlpha: 0.95,
    impactRadius: 9,
    impactAlpha: 0.32,
  },
} as const;

function nearestRingPointIndex(points: Point[], target: Point): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best = i;
    }
  }
  return best;
}

function clampNudge(value: number): number {
  return Math.max(-48, Math.min(48, value));
}

function directionalRingPointIndex(points: Point[], target: Point): number {
  const dist2 = target.x * target.x + target.y * target.y;
  if (dist2 < 28 * 28) {
    return -1;
  }
  const angle = Math.atan2(target.y, target.x);
  const normalized = (angle + Math.PI) / TAU;
  const idx = Math.round(normalized * points.length) % points.length;
  return (idx + points.length) % points.length;
}

/** Few sharp kinks along a single bolt toward the pointer (not a wide jitter fan). */
function createStrikePath(start: Point, end: Point, seed: number): Point[] {
  const points: Point[] = [start];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(0.0001, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const kinks = ARCANE_TUNE.hoverStrike.kinks;
  const jitter = ARCANE_TUNE.hoverStrike.jitterBase + seed * ARCANE_TUNE.hoverStrike.jitterSeedScale;

  for (let i = 1; i <= kinks; i++) {
    const t = i / (kinks + 1);
    const taper = Math.sin(Math.PI * t);
    const lateral = (hash(seed * 191 + i * 71.3) - 0.5) * jitter * taper;
    points.push({
      x: start.x + dx * t + nx * lateral,
      y: start.y + dy * t + ny * lateral,
    });
  }
  points.push(end);
  return points;
}

/** Phaser 4 bakes line width into each path point at moveTo/lineTo time — lineStyle must come first. */
function setStrokeStyle(gfx: GameObjects.Graphics, width: number, color: number, alpha: number): void {
  gfx.lineStyle(width, color, alpha);
}

function drawStrikeBolt(
  glow: GameObjects.Graphics,
  aura: GameObjects.Graphics,
  core: GameObjects.Graphics,
  path: Point[],
  impact: Point,
  alphaT: number,
): void {
  if (path.length < 2) {
    return;
  }

  const start = path[0]!;

  setStrokeStyle(glow, ARCANE_TUNE.hoverStrike.glowWidth, ARCANE_HALO, ARCANE_TUNE.hoverStrike.glowAlpha * alphaT);
  glow.beginPath();
  glow.moveTo(start.x, start.y);
  for (let j = 1; j < path.length; j++) {
    const pt = path[j]!;
    glow.lineTo(pt.x, pt.y);
  }
  glow.strokePath();

  setStrokeStyle(aura, ARCANE_TUNE.hoverStrike.auraWidth, ARCANE_OUTER, ARCANE_TUNE.hoverStrike.auraAlpha * alphaT);
  aura.beginPath();
  aura.moveTo(start.x, start.y);
  for (let j = 1; j < path.length; j++) {
    const pt = path[j]!;
    aura.lineTo(pt.x, pt.y);
  }
  aura.strokePath();

  setStrokeStyle(core, ARCANE_TUNE.hoverStrike.coreWidth, ARCANE_CORE, ARCANE_TUNE.hoverStrike.coreAlpha * alphaT);
  core.beginPath();
  core.moveTo(start.x, start.y);
  for (let j = 1; j < path.length; j++) {
    const pt = path[j]!;
    core.lineTo(pt.x, pt.y);
  }
  core.strokePath();

  glow.fillStyle(ARCANE_HALO, ARCANE_TUNE.hoverStrike.impactAlpha * alphaT * 0.85);
  glow.fillCircle(impact.x, impact.y, ARCANE_TUNE.hoverStrike.impactRadius * alphaT * 1.15);
  aura.fillStyle(ARCANE_OUTER, ARCANE_TUNE.hoverStrike.impactAlpha * alphaT);
  aura.fillCircle(impact.x, impact.y, ARCANE_TUNE.hoverStrike.impactRadius * alphaT);
}

export const arcaneEffect: EffectDefinition = {
  id: 'arcane',
  label: 'Arcane',
  create(layers, mount, art) {
    const isDie = isDieMount(mount);
    const cardCornerRadius = UI.CARD_RADIUS * (mount.width / UI.CARD_W);
    const artBounds = artBoundsFromMount(mount, cardCornerRadius);
    const edgeBounds = isDie ? tightDieBounds(mount) : artBounds;
    const sampleCount = isDie ? ARCANE_TUNE.sampleCount.die : ARCANE_TUNE.sampleCount.card;
    const ringPoints = createImageEdgeLoop(art.getImage(), sampleCount, ARCANE_TUNE.ringInsetScale, {
      halfW: edgeBounds.halfW,
      halfH: edgeBounds.halfH,
      useDieOutline: isDie,
    });
    const ringNormals = createOutwardNormals(ringPoints);

    const halo = addGlowLayer(layers.front, 0);
    applyArcaneLayerBlur(halo, ARCANE_TUNE.stroke.haloBlur.strength, ARCANE_TUNE.stroke.haloBlur.quality, ARCANE_HALO);
    const aura = addGlowLayer(layers.front, 1);
    applyArcaneLayerBlur(aura, ARCANE_TUNE.stroke.auraBlur.strength, ARCANE_TUNE.stroke.auraBlur.quality, ARCANE_OUTER);
    const strands = addGlowLayer(layers.front, 2);
    applyArcaneLayerBlur(
      strands,
      ARCANE_TUNE.stroke.strandsBlur.strength,
      ARCANE_TUNE.stroke.strandsBlur.quality,
      ARCANE_OUTER,
    );
    const core = addGlowLayer(layers.front, 3);
    const strikeGlow = addGlowLayer(layers.front, 4);
    applyArcaneLayerBlur(
      strikeGlow,
      ARCANE_TUNE.hoverStrike.glowBlur.strength,
      ARCANE_TUNE.hoverStrike.glowBlur.quality,
      ARCANE_HALO,
    );
    const strikeAura = addGlowLayer(layers.front, 5);
    applyArcaneLayerBlur(
      strikeAura,
      ARCANE_TUNE.hoverStrike.auraBlur.strength,
      ARCANE_TUNE.hoverStrike.auraBlur.quality,
      ARCANE_OUTER,
    );
    const strikeCore = addGlowLayer(layers.front, 6);

    const seed = Math.random();
    const timeOffset = seed * 91.7;
    const lanePhaseNudge = Array.from({ length: ARCANE_TUNE.laneCount }, () => (Math.random() - 0.5) * TAU);
    const lanePhaseVelocity = Array.from({ length: ARCANE_TUNE.laneCount }, () => 0);
    const laneGateNudge = Array.from(
      { length: ARCANE_TUNE.laneCount },
      () => Math.random() * ARCANE_TUNE.stochastic.initialGateNudgeMax,
    );
    const laneGateVelocity = Array.from({ length: ARCANE_TUNE.laneCount }, () => 0);
    const strikes: Strike[] = [];
    let elapsed = 0;

    const step = (frame: EffectFrameContext) => {
      // Wrap local elapsed time (like fire/ghost) — absolute frame.time loses sin/hash precision over a long session.
      elapsed = (elapsed + frame.dt) % 240;
      const t = (elapsed + timeOffset + frame.phase * 0.13) % 240;
      const pulse =
        ARCANE_TUNE.pulse.base +
        pulse01(t, ARCANE_TUNE.pulse.layer1PeriodBase + seed * ARCANE_TUNE.pulse.layer1PeriodSeedScale) *
          ARCANE_TUNE.pulse.layer1Weight +
        pulse01(
          t,
          ARCANE_TUNE.pulse.layer2PeriodBase + seed * ARCANE_TUNE.pulse.layer2PeriodSeedScale,
          ARCANE_TUNE.pulse.layer2Phase,
        ) *
          ARCANE_TUNE.pulse.layer2Weight;
      const hoverBoost = frame.hovered ? ARCANE_TUNE.hoverBoost : 1.0;
      const activeBoost = frame.activated ? ARCANE_TUNE.activeBoost : 1.0;
      const amp = ARCANE_TUNE.baseAmplitude * pulse * hoverBoost * activeBoost;

      halo.clear();
      aura.clear();
      strands.clear();
      core.clear();
      strikeGlow.clear();
      strikeAura.clear();
      strikeCore.clear();

      const pointer = {
        x: (frame.pointerNormX - 0.5) * frame.width,
        y: (frame.pointerNormY - 0.5) * frame.height,
      };
      const canStrike =
        frame.hovered &&
        !frame.dragging &&
        Number.isFinite(pointer.x) &&
        Number.isFinite(pointer.y) &&
        frame.width > 0 &&
        frame.height > 0;
      if (!canStrike) {
        strikes.length = 0;
      }
      if (
        canStrike &&
        strikes.length < ARCANE_TUNE.hoverStrike.maxConcurrent &&
        Math.random() < frame.dt * ARCANE_TUNE.hoverStrike.spawnPerSecond
      ) {
        const seedJitter = hash(t * 3.11 + strikes.length * 17.9 + seed * 10);
        const directionalIdx = directionalRingPointIndex(ringPoints, pointer);
        const anchorIndex = directionalIdx >= 0 ? directionalIdx : nearestRingPointIndex(ringPoints, pointer);
        const anchor = ringPoints[anchorIndex]!;
        const normal = ringNormals[anchorIndex]!;
        const start: Point = {
          x: anchor.x + normal.x * (3 + seedJitter * 4),
          y: anchor.y + normal.y * (3 + seedJitter * 4),
        };
        const life =
          ARCANE_TUNE.hoverStrike.lifeMin +
          seedJitter * (ARCANE_TUNE.hoverStrike.lifeMax - ARCANE_TUNE.hoverStrike.lifeMin);
        strikes.push({
          life,
          maxLife: life,
          path: createStrikePath(start, pointer, seedJitter + t * 0.1),
          impact: pointer,
        });
      }

      setStrokeStyle(halo, ARCANE_TUNE.stroke.halo.width, ARCANE_HALO, ARCANE_TUNE.stroke.halo.alpha * hoverBoost);
      setStrokeStyle(aura, ARCANE_TUNE.stroke.aura.width, ARCANE_OUTER, ARCANE_TUNE.stroke.aura.alpha * hoverBoost);
      setStrokeStyle(strands, ARCANE_TUNE.stroke.strands.width, ARCANE_OUTER, ARCANE_TUNE.stroke.strands.alpha * pulse);
      setStrokeStyle(core, ARCANE_TUNE.stroke.core.width, ARCANE_CORE, ARCANE_TUNE.stroke.core.alpha * pulse);

      halo.beginPath();
      aura.beginPath();
      strands.beginPath();
      core.beginPath();

      for (let lane = 0; lane < ARCANE_TUNE.laneCount; lane++) {
        const phaseVelocity =
          (lanePhaseVelocity[lane] ?? 0) + (Math.random() - 0.5) * frame.dt * ARCANE_TUNE.stochastic.phaseKick;
        const dampedPhaseVelocity = phaseVelocity * Math.max(0, 1 - frame.dt * ARCANE_TUNE.stochastic.phaseDamping);
        lanePhaseVelocity[lane] = dampedPhaseVelocity;
        lanePhaseNudge[lane] = clampNudge((lanePhaseNudge[lane] ?? 0) + dampedPhaseVelocity * frame.dt);
        const phaseNudge = lanePhaseNudge[lane] ?? 0;

        const gateVelocity =
          (laneGateVelocity[lane] ?? 0) + (Math.random() - 0.5) * frame.dt * ARCANE_TUNE.stochastic.gateKick;
        const dampedGateVelocity = gateVelocity * Math.max(0, 1 - frame.dt * ARCANE_TUNE.stochastic.gateDamping);
        laneGateVelocity[lane] = dampedGateVelocity;
        laneGateNudge[lane] = clampNudge((laneGateNudge[lane] ?? 0) + dampedGateVelocity * frame.dt);
        const gateNudge = laneGateNudge[lane] ?? 0;

        const lanePhase = lane * ARCANE_TUNE.lane.phaseStep + seed * ARCANE_TUNE.lane.phaseSeedScale;
        const laneSpeed = ARCANE_TUNE.lane.speedBase + lane * ARCANE_TUNE.lane.speedStep;
        const laneFreq = ARCANE_TUNE.lane.freqBase + lane * ARCANE_TUNE.lane.freqStep;
        const laneThreshold = ARCANE_TUNE.lane.thresholdBase + lane * ARCANE_TUNE.lane.thresholdStep;
        const microDriftSpeed = ARCANE_TUNE.lane.microDriftBase + lane * ARCANE_TUNE.lane.microDriftStep;
        const gateCadence = ARCANE_TUNE.lane.gateCadenceBase + lane * ARCANE_TUNE.lane.gateCadenceStep;

        let started = false;
        for (let i = 0; i <= ringPoints.length; i++) {
          const idx = i % ringPoints.length;
          const p = ringPoints[idx]!;
          const n = ringNormals[idx]!;
          const jitterSeed = hash(idx * 19.13 + lane * 71.7 + seed * 100);
          const drift =
            Math.sin(
              t * microDriftSpeed +
                idx * ARCANE_TUNE.shape.driftIndexScale +
                lanePhase * ARCANE_TUNE.shape.driftPhaseScale +
                jitterSeed * ARCANE_TUNE.shape.driftSeedScale +
                phaseNudge * ARCANE_TUNE.shape.driftPhaseNudgeScale,
            ) * ARCANE_TUNE.shape.driftAmplitude;
          const wobble = Math.sin(t * laneSpeed + idx * laneFreq + lanePhase + jitterSeed * TAU + drift + phaseNudge);
          const tangentWiggle = Math.cos(
            t * (laneSpeed * ARCANE_TUNE.shape.tangentWiggleScale) +
              idx * ARCANE_TUNE.shape.tangentIndexScale +
              jitterSeed * ARCANE_TUNE.shape.tangentSeedScale +
              drift * ARCANE_TUNE.shape.tangentDriftScale,
          );
          const offsetN =
            wobble *
            (ARCANE_TUNE.shape.normalOffsetBase + jitterSeed * ARCANE_TUNE.shape.normalOffsetJitterScale) *
            amp;
          const offsetT = tangentWiggle * ARCANE_TUNE.shape.tangentOffset;
          const x = p.x + n.x * offsetN + -n.y * offsetT;
          const y = p.y + n.y * offsetN + n.x * offsetT;

          const gateNoise = hash(idx * 13.1 + lane * 97.1 + Math.floor((t + gateNudge) * gateCadence));
          const gateWave =
            0.5 +
            0.5 *
              Math.sin(
                t * (ARCANE_TUNE.gate.waveFrequencyBase + lane * ARCANE_TUNE.gate.waveFrequencyStep) +
                  idx * ARCANE_TUNE.gate.waveIndexScale +
                  lanePhase +
                  drift +
                  phaseNudge * ARCANE_TUNE.gate.wavePhaseNudgeScale,
              );
          const gate = gateWave * ARCANE_TUNE.gate.waveWeight + gateNoise * ARCANE_TUNE.gate.noiseWeight;
          const lit = gate > laneThreshold;

          if (!lit || (i > 0 && i < ringPoints.length && gateNoise < ARCANE_TUNE.gate.breakNoiseThreshold)) {
            started = false;
            continue;
          }

          if (!started) {
            halo.moveTo(x, y);
            aura.moveTo(x, y);
            strands.moveTo(x, y);
            core.moveTo(x, y);
            started = true;
          } else {
            halo.lineTo(x, y);
            aura.lineTo(x, y);
            strands.lineTo(x, y);
            core.lineTo(x, y);
          }
        }
      }

      halo.strokePath();
      aura.strokePath();
      strands.strokePath();
      core.strokePath();

      for (let i = strikes.length - 1; i >= 0; i--) {
        const strike = strikes[i]!;
        strike.life -= frame.dt;
        if (strike.life <= 0) {
          strikes.splice(i, 1);
          continue;
        }
        const lifeT = strike.life / strike.maxLife;
        const alphaT = Math.min(1, lifeT * 1.8);
        drawStrikeBolt(strikeGlow, strikeAura, strikeCore, strike.path, strike.impact, alphaT);
      }
    };

    return makeRuntime(
      'arcane',
      step,
      noopDestroy(() => {
        halo.destroy();
        aura.destroy();
        strands.destroy();
        core.destroy();
        strikeGlow.destroy();
        strikeAura.destroy();
        strikeCore.destroy();
      }),
    );
  },
};
