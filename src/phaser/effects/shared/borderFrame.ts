import type { EffectHostKind, EffectMountContext } from '../types';

export type BorderBounds = {
  halfW: number;
  halfH: number;
  cornerRadius: number;
};

export function borderBoundsFromSize(width: number, height: number, cornerRadius?: number): BorderBounds {
  const halfW = width / 2;
  const halfH = height / 2;
  const r = cornerRadius ?? Math.min(50, Math.min(halfW, halfH) * 0.12);
  return { halfW, halfH, cornerRadius: r };
}

export function effectVisualBounds(mount: EffectMountContext): BorderBounds {
  const pad = mount.padding;
  return borderBoundsFromSize(mount.width + pad * 2, mount.height + pad * 2);
}

export function hostIsDie(hostKind: EffectHostKind): boolean {
  return hostKind === 'die';
}
