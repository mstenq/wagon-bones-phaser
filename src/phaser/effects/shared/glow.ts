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
