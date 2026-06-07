import type { EffectFrameContext, EffectHostKind } from './types';
import { CARD_EFFECT_PADDING, DIE_EFFECT_PADDING } from './dieTuning';

export { CARD_EFFECT_PADDING, DIE_EFFECT_PADDING };

export function effectPhaseFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 997;
  }
  return h;
}

export function createDefaultEffectFrame(
  hostKind: EffectHostKind,
  width: number,
  height: number,
  phase = 0,
): EffectFrameContext {
  return {
    dt: 0,
    time: 0,
    width,
    height,
    hostKind,
    hovered: false,
    pointerNormX: 0.5,
    pointerNormY: 0.5,
    phase,
  };
}
