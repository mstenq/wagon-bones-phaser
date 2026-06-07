import type { GameObjects } from 'phaser';
import type { BorderBounds } from './borderFrame';
import { hostIsDie } from './borderFrame';
import type { EffectHostKind } from '../types';

export function drawEffectBackdrop(
  g: GameObjects.Graphics,
  bounds: BorderBounds,
  hostKind: EffectHostKind,
  color: number,
  alpha: number,
  inset = 6,
): void {
  g.clear();
  if (hostIsDie(hostKind)) {
    const r = Math.min(bounds.halfW, bounds.halfH) - inset * 0.4;
    g.fillStyle(color, alpha);
    g.fillCircle(0, 0, r);
    g.fillStyle(color, alpha * 0.55);
    g.fillCircle(0, 0, r * 0.72);
    return;
  }
  const { halfW, halfH, cornerRadius } = bounds;
  g.fillStyle(color, alpha);
  g.fillRoundedRect(-halfW + inset, -halfH + inset, halfW * 2 - inset * 2, halfH * 2 - inset * 2, cornerRadius);
  g.fillStyle(color, alpha * 0.45);
  g.fillRoundedRect(
    -halfW + inset * 2,
    -halfH + inset * 2,
    halfW * 2 - inset * 4,
    halfH * 2 - inset * 4,
    Math.max(4, cornerRadius - 2),
  );
}
