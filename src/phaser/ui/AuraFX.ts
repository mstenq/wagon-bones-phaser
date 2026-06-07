// ─── AuraFX ───
// Shared aura color palette and procedural particle textures for score/destruction VFX.

import { Scene } from 'phaser';

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
  arcane: {
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

/** Procedural soft glow circle used by score and destruction animations. */
export function ensureAuraTextures(scene: Scene): void {
  const tm = scene.textures;

  if (!tm.exists('aura_soft')) {
    const gfx = scene.add.graphics();
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
}
