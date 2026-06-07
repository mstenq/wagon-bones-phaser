import type { EffectMountContext } from './types';
import type { BorderBounds } from './shared/borderFrame';
import { hostIsDie } from './shared/borderFrame';

export const DIE_EFFECT_PADDING = 12;
export const CARD_EFFECT_PADDING = 18;

export function dieHalfSize(mount: EffectMountContext): number {
  return Math.min(mount.width, mount.height) / 2;
}

export function isDieMount(mount: EffectMountContext): boolean {
  return hostIsDie(mount.hostKind);
}

export function effectRadius(mount: EffectMountContext, bounds: BorderBounds): number {
  if (isDieMount(mount)) {
    return dieHalfSize(mount) * 1.14;
  }
  return Math.min(bounds.halfW, bounds.halfH) * 0.96;
}

export function tightDieBounds(mount: EffectMountContext): BorderBounds {
  const r = dieHalfSize(mount) * 0.96;
  return { halfW: r, halfH: r, cornerRadius: 0 };
}

export function dieBlurPadding(mount: EffectMountContext): number {
  return isDieMount(mount) ? 10 : mount.padding;
}

export function dieBlurStrength(mount: EffectMountContext, cardStrength: number): number {
  return isDieMount(mount) ? cardStrength * 0.55 : cardStrength;
}

export function hostParticleScale(mount: EffectMountContext): number {
  return isDieMount(mount) ? 0.72 : 1;
}
