import type { GameObjects } from 'phaser';
import { dieBlurStrength } from '../dieTuning';
import type { EffectMountContext } from '../types';

type FilterableGraphics = GameObjects.Graphics & {
  enableFilters?: () => void;
  filters?: {
    internal: {
      addBlur: (
        quality?: number,
        x?: number,
        y?: number,
        strength?: number,
        color?: number,
        steps?: number,
      ) => { setPaddingOverride?: (left?: number | null) => void };
    };
  };
};

function asFilterableGraphics(g: GameObjects.Graphics): FilterableGraphics {
  return g as FilterableGraphics;
}

export function applyBlurredGlowForMount(g: GameObjects.Graphics, mount: EffectMountContext, strength: number): void {
  const gfx = asFilterableGraphics(g);
  if (!gfx.enableFilters) {
    return;
  }
  gfx.enableFilters();
  const str = dieBlurStrength(mount, strength);
  const blur = gfx.filters!.internal.addBlur(1, str * 0.5, str * 0.5, 1, 0xffffff, 4);
  blur.setPaddingOverride?.(null);
}

export function applyLayerBlur(g: GameObjects.Graphics, strength: number, quality: number): void {
  const gfx = asFilterableGraphics(g);
  if (!gfx.enableFilters) {
    return;
  }
  gfx.enableFilters();
  const blurQuality = quality >= 4 ? 2 : quality >= 3 ? 1 : 0;
  const blur = gfx.filters!.internal.addBlur(blurQuality, strength * 0.4, strength * 0.4, 1, 0xffffff, 4);
  blur.setPaddingOverride?.(null);
}

/** Stronger blur + blue tint for arcane aura layers (closer to Pixi BlurFilter response). */
export function applyArcaneLayerBlur(
  g: GameObjects.Graphics,
  strength: number,
  quality: number,
  tint = 0x66ccff,
): void {
  const gfx = asFilterableGraphics(g);
  if (!gfx.enableFilters) {
    return;
  }
  gfx.enableFilters();
  let blurQuality = 0;
  if (quality >= 3) {
    blurQuality = 2;
  } else if (quality >= 2) {
    blurQuality = 1;
  }
  const scale = quality >= 3 ? 0.85 : quality >= 2 ? 0.65 : 0.5;
  const blur = gfx.filters!.internal.addBlur(blurQuality, strength * scale, strength * scale, 1, tint, 6);
  blur.setPaddingOverride?.(null);
}
