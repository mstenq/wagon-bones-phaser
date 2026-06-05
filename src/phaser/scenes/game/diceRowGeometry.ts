// ─── Shared dice row layout math (arc fan + centered X positions) ───

import { DICE, UI } from '../../../game/Constants';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Side inset for centering a dice row within the content area. */
export function computeDiceRowEdgePad(contentWidth: number): number {
  if (contentWidth >= UI.DICE_ROW_COMPACT_WIDTH) return UI.DICE_ROW_EDGE_PAD;
  if (contentWidth < 450) return 4;
  return UI.DICE_ROW_EDGE_PAD_COMPACT;
}

/** Uniform scale for dice sprites when the play area is narrow. */
export function computeDiceDisplayScale(contentWidth: number): number {
  if (contentWidth >= UI.DICE_ROW_COMPACT_WIDTH) return 1;
  const minWidth = 360;
  const t = clamp01((contentWidth - minWidth) / (UI.DICE_ROW_COMPACT_WIDTH - minWidth));
  return UI.DICE_ROW_SCALE_MIN + t * (1 - UI.DICE_ROW_SCALE_MIN);
}

export interface DiceRowLayout {
  spacing: number;
  scale: number;
  edgePad: number;
  dieSize: number;
}

export function computeDiceRowLayout(diceCount: number, contentWidth: number): DiceRowLayout {
  const scale = computeDiceDisplayScale(contentWidth);
  const edgePad = computeDiceRowEdgePad(contentWidth);
  const dieSize = DICE.SIZE * scale;
  const spacing =
    diceCount <= 1
      ? UI.DICE_SPACING * scale
      : Math.floor(
          Math.min(UI.DICE_SPACING * scale, Math.max(0, (contentWidth - edgePad * 2 - dieSize) / (diceCount - 1))),
        );
  return { spacing, scale, edgePad, dieSize };
}

/** Fit center-to-center spacing for `diceCount` dice within `contentWidth`. */
export function computeDiceSpacing(diceCount: number, contentWidth: number): number {
  return computeDiceRowLayout(diceCount, contentWidth).spacing;
}

/** Get X positions for a row of count dice centered on contentCX. */
export function getRowXPositions(count: number, contentCenterX: number, diceSpacing: number): number[] {
  if (count === 0) return [];
  const totalWidth = (count - 1) * diceSpacing;
  const startX = contentCenterX - totalWidth / 2;
  return Array.from({ length: count }, (_, i) => startX + i * diceSpacing);
}

/** Balatro-style arc Y offset and rotation for die at index i in a row of count. */
export function getArcOffset(i: number, count: number, scale = 1): { y: number; rotation: number } {
  if (count <= 1) return { y: 0, rotation: 0 };
  const t = i / (count - 1) - 0.5;
  const y = -UI.DICE_ARC_HEIGHT * scale * (1 - 4 * t * t);
  const rotation = t * UI.DICE_ARC_ROTATION * 2;
  return { y, rotation };
}
