// ─── AuraFX ───
// Shared aura visual effects for dice and equipment cards.
// Uses Phaser 4 Filters (glow) + particles for dramatic per-aura VFX.

import * as Phaser from 'phaser';
import { Scene, GameObjects } from 'phaser';

// ─── Shared Aura Color Palette ───
export const AURA_COLORS: Record<string, { primary: number; secondary: number; glow: number; tints: number[] }> = {
  holy: {
    primary: 0xff66cc,
    secondary: 0x66ddff,
    glow: 0xff66cc,
    tints: [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x0a84ff, 0x5856d6, 0xff2d55],
  },
  fire: {
    primary: 0xff4500,
    secondary: 0xff8800,
    glow: 0xff4500,
    tints: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
  },
  icy: {
    primary: 0x00bfff,
    secondary: 0x88ddff,
    glow: 0x00aaff,
    tints: [0x00bfff, 0x44ccff, 0x88ddff, 0xaaeeff, 0xffffff],
  },
  ghost: {
    primary: 0x44dd88,
    secondary: 0x88ffbb,
    glow: 0x33cc77,
    tints: [0x33cc77, 0x44dd88, 0x66eebb, 0x88ffbb, 0xaaffdd],
  },
};

export function getAuraPrimary(auraId: string): number {
  return AURA_COLORS[auraId]?.primary ?? 0xffffff;
}

// ─── Particle texture generation (shared) ───

export function ensureAuraTextures(scene: Scene): void {
  const tm = scene.textures;

  if (!tm.exists('aura_soft')) {
    const gfx = scene.add.graphics();
    // Larger soft glow circle with radial falloff
    gfx.fillStyle(0xffffff, 0.15);
    gfx.fillCircle(16, 16, 16);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(16, 16, 12);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(16, 16, 8);
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillCircle(16, 16, 4);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(16, 16, 2);
    gfx.generateTexture('aura_soft', 32, 32);
    gfx.destroy();
  }

  if (!tm.exists('aura_spark')) {
    const gfx = scene.add.graphics();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(4, 4, 6);
    gfx.generateTexture('aura_spark', 12, 12);
    gfx.destroy();
  }

  if (!tm.exists('aura_streak')) {
    const gfx = scene.add.graphics();
    // Elongated horizontal streak for fire wisps
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillRect(0, 2, 16, 4);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(2, 3, 12, 2);
    gfx.generateTexture('aura_streak', 16, 8);
    gfx.destroy();
  }
}

// ─── Glow filter helpers ───

/** Apply a pulsing glow filter to a game object. Returns cleanup function. */
export function applyAuraGlow(
  scene: Scene,
  target: GameObjects.GameObject & { enableFilters?: () => void; filters?: any },
  auraId: string,
  options?: {
    strength?: number;
    pulseDuration?: number;
    pulseMin?: number;
    pulseMax?: number;
    quality?: number;
    distance?: number;
  },
): { tweens: Phaser.Tweens.Tween[]; destroy: () => void } {
  const colors = AURA_COLORS[auraId];
  if (!colors || !target.enableFilters) return { tweens: [], destroy: () => {} };

  const strength = options?.strength ?? 4;
  const pulseDuration = options?.pulseDuration ?? (auraId === 'fire' ? 400 : auraId === 'icy' ? 2500 : 1500);
  const pulseMin = options?.pulseMin ?? 0.5;
  const pulseMax = options?.pulseMax ?? 1;
  const quality = options?.quality ?? 4;
  const distance = options?.distance ?? 10;

  target.enableFilters();
  const glow = target.filters.internal.addGlow(colors.glow, strength, 0, 1, false, quality, distance);

  const tweens: Phaser.Tweens.Tween[] = [];
  tweens.push(
    scene.tweens.add({
      targets: glow,
      outerStrength: { from: strength * pulseMin, to: strength * pulseMax },
      duration: pulseDuration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }),
  );

  return {
    tweens,
    destroy: () => {
      for (const tw of tweens) tw.destroy();
      if (target.filters) {
        target.filters.internal.remove(glow);
      }
    },
  };
}

// ─── Per-aura particle effects ───

export interface AuraParticleResult {
  emitters: GameObjects.Particles.ParticleEmitter[];
  tweens: Phaser.Tweens.Tween[];
}

/** Create aura particles sized for a given bounding box. */
export function createAuraParticles(scene: Scene, auraId: string, halfW: number, halfH: number): AuraParticleResult {
  ensureAuraTextures(scene);
  const colors = AURA_COLORS[auraId];
  if (!colors) return { emitters: [], tweens: [] };

  switch (auraId) {
    case 'fire':
      return createFireParticles(scene, halfW, halfH, colors);
    case 'icy':
      return createIcyParticles(scene, halfW, halfH, colors);
    case 'holy':
      return createHolyParticles(scene, halfW, halfH, colors);
    case 'ghost':
      return createGhostParticles(scene, halfW, halfH, colors);
    default:
      return { emitters: [], tweens: [] };
  }
}

function createFireParticles(
  scene: Scene,
  hw: number,
  hh: number,
  colors: (typeof AURA_COLORS)['fire'],
): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Intense rising flames from bottom
  emitters.push(
    scene.add.particles(0, 0, 'aura_soft', {
      speed: { min: 20, max: 60 },
      angle: { min: -110, max: -70 },
      scale: { start: 0.62, end: 0 },
      alpha: { start: 0.78, end: 0 },
      lifespan: { min: 500, max: 900 },
      frequency: 32,
      quantity: 1,
      tint: colors.tints,
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw + 4, hh - 6, w - 8, 6),
      } as any,
      maxAliveParticles: 20,
    }),
  );

  // Hot ember sparks shooting upward from edges
  emitters.push(
    scene.add.particles(0, 0, 'aura_spark', {
      speed: { min: 40, max: 100 },
      angle: { min: -130, max: -50 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 400, max: 700 },
      frequency: 65,
      quantity: 1,
      tint: [0xffdd00, 0xff8800, 0xff4400],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw - 2, hh - 12, w + 4, 12),
      } as any,
      maxAliveParticles: 8,
    }),
  );

  // Heat distortion wisps along sides
  emitters.push(
    scene.add.particles(0, 0, 'aura_streak', {
      speed: { min: 10, max: 30 },
      angle: { min: -100, max: -80 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: { min: 600, max: 1000 },
      frequency: 95,
      quantity: 1,
      tint: [0xff6600, 0xff4400],
      blendMode: 'ADD',
      rotate: { min: -30, max: 30 },
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw - 6, -hh, 6, h),
      } as any,
      maxAliveParticles: 4,
    }),
  );

  // Same on right side
  emitters.push(
    scene.add.particles(0, 0, 'aura_streak', {
      speed: { min: 10, max: 30 },
      angle: { min: -100, max: -80 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: { min: 600, max: 1000 },
      frequency: 95,
      quantity: 1,
      tint: [0xff6600, 0xff4400],
      blendMode: 'ADD',
      rotate: { min: -30, max: 30 },
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(hw, -hh, 6, h),
      } as any,
      maxAliveParticles: 4,
    }),
  );

  return { emitters, tweens };
}

function createIcyParticles(
  scene: Scene,
  hw: number,
  hh: number,
  colors: (typeof AURA_COLORS)['icy'],
): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Drifting ice crystals all around — slower, more serene
  emitters.push(
    scene.add.particles(0, 0, 'aura_spark', {
      speed: { min: 3, max: 12 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 2000, max: 3500 },
      frequency: 60,
      quantity: 1,
      tint: colors.tints,
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw - 8, -hh - 8, w + 16, h + 16),
      } as any,
      maxAliveParticles: 20,
    }),
  );

  // Frost mist falling gently downward
  emitters.push(
    scene.add.particles(0, 0, 'aura_soft', {
      speedX: { min: -8, max: 8 },
      speedY: { min: 8, max: 20 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: { min: 2500, max: 4000 },
      frequency: 120,
      quantity: 1,
      tint: [0xcceeff, 0xaaddff, 0x88ccff],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw - 6, -hh - 10, w + 12, 10),
      } as any,
      maxAliveParticles: 10,
    }),
  );

  // Occasional bright ice flash
  emitters.push(
    scene.add.particles(0, 0, 'aura_soft', {
      speed: { min: 1, max: 5 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: { min: 300, max: 600 },
      frequency: 500,
      quantity: 1,
      tint: 0xffffff,
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw, -hh, w, h),
      } as any,
      maxAliveParticles: 3,
    }),
  );

  return { emitters, tweens };
}

function createHolyParticles(
  scene: Scene,
  hw: number,
  hh: number,
  colors: (typeof AURA_COLORS)['holy'],
): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Sacred pulse ring radiating outward from center (main holy signature)
  emitters.push(
    scene.add.particles(0, 0, 'aura_soft', {
      speed: { min: 10, max: 24 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.14, end: 1.2 },
      alpha: { start: 0.5, end: 0 },
      lifespan: { min: 700, max: 1000 },
      frequency: 210,
      quantity: 3,
      tint: [0xffffff, colors.primary, colors.secondary],
      blendMode: 'ADD',
      emitZone: {
        type: 'edge',
        source: new Phaser.Geom.Circle(0, 0, Math.max(6, Math.floor(Math.min(hw, hh) * 0.35))),
        quantity: 14,
      } as any,
      maxAliveParticles: 28,
    }),
  );

  // Very light center shimmer between pulses (kept centered, not above the die)
  emitters.push(
    scene.add.particles(0, 0, 'aura_soft', {
      speed: { min: 1, max: 4 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.16, end: 0 },
      lifespan: { min: 900, max: 1400 },
      frequency: 180,
      quantity: 1,
      tint: [0xffffff, colors.secondary],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw * 0.4, -hh * 0.4, w * 0.8, h * 0.8),
      } as any,
      maxAliveParticles: 8,
    }),
  );

  // Subtle prism refraction sweep that drifts left-to-right across the die
  const prismSweep = scene.add.particles(-hw - 12, 0, 'aura_streak', {
    speedX: { min: 4, max: 10 },
    speedY: { min: -2, max: 2 },
    scale: { start: 0.42, end: 0 },
    alpha: { start: 0.13, end: 0 },
    lifespan: { min: 550, max: 850 },
    frequency: 120,
    quantity: 1,
    tint: [0xff7adf, 0xff66cc, 0xffffff],
    blendMode: 'ADD',
    rotate: { min: -12, max: 12 },
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(0, -hh - 3, 4, h + 6),
    } as any,
    maxAliveParticles: 6,
  });
  emitters.push(prismSweep);
  tweens.push(
    scene.tweens.add({
      targets: prismSweep,
      x: hw + 12,
      duration: 2500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    }),
  );

  // Occasional tiny prism sparkle so sweep has a highlight peak
  emitters.push(
    scene.add.particles(0, 0, 'aura_spark', {
      speed: { min: 18, max: 50 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.32, end: 0 },
      alpha: { start: 0.65, end: 0 },
      lifespan: { min: 240, max: 420 },
      frequency: 1250,
      quantity: 2,
      tint: [0xffffff, colors.primary, colors.secondary],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-hw, -hh, w, h),
      } as any,
      maxAliveParticles: 4,
    }),
  );

  return { emitters, tweens };
}

function createGhostParticles(
  _scene: Scene,
  _hw: number,
  _hh: number,
  _colors: (typeof AURA_COLORS)['ghost'],
): AuraParticleResult {
  // Ghost aura uses tint + transparency on the card itself, no particles needed
  return { emitters: [], tweens: [] };
}
