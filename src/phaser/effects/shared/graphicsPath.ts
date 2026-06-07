import * as Phaser from 'phaser';
import type { GameObjects } from 'phaser';

const BEZIER_SEGMENTS = 10;

export function appendQuadraticBezier(
  gfx: GameObjects.Graphics,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): void {
  for (let i = 1; i <= BEZIER_SEGMENTS; i++) {
    const t = i / BEZIER_SEGMENTS;
    const x = Phaser.Math.Interpolation.QuadraticBezier(t, x0, cx, x1);
    const y = Phaser.Math.Interpolation.QuadraticBezier(t, y0, cy, y1);
    gfx.lineTo(x, y);
  }
}
