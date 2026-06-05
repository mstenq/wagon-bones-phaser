// ─── Shared dice row layout math (arc fan + centered X positions) ───

import { UI } from '../../../game/Constants';

/** Get X positions for a row of count dice centered on contentCX. */
export function getRowXPositions(count: number, contentCenterX: number, diceSpacing: number): number[] {
  if (count === 0) return [];
  const totalWidth = (count - 1) * diceSpacing;
  const startX = contentCenterX - totalWidth / 2;
  return Array.from({ length: count }, (_, i) => startX + i * diceSpacing);
}

/** Balatro-style arc Y offset and rotation for die at index i in a row of count. */
export function getArcOffset(i: number, count: number): { y: number; rotation: number } {
  if (count <= 1) return { y: 0, rotation: 0 };
  const t = i / (count - 1) - 0.5;
  const y = -UI.DICE_ARC_HEIGHT * (1 - 4 * t * t);
  const rotation = t * UI.DICE_ARC_ROTATION * 2;
  return { y, rotation };
}
