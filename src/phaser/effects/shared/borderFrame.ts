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

/** Point on ellipse perimeter (t in 0..1). Works well for dice hosts. */
export function perimeterPointEllipse(bounds: BorderBounds, t: number): { x: number; y: number } {
  const a = bounds.halfW * 0.92;
  const b = bounds.halfH * 0.92;
  const angle = (((t % 1) + 1) % 1) * Math.PI * 2;
  return { x: Math.cos(angle) * a, y: Math.sin(angle) * b };
}
