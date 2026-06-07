import type { Display } from 'phaser';
import type { FilterableImage } from '../types';

export type FireArtFilterState = {
  colorMatrix: Display.ColorMatrix;
  cmController: { colorMatrix: Display.ColorMatrix };
  displacement: { x: number; y: number } | null;
};

export function createFireArtFilters(img: FilterableImage, useDisplacement: boolean): FireArtFilterState {
  img.enableFilters?.();
  const cmController = img.filters!.internal.addColorMatrix();
  const colorMatrix = cmController.colorMatrix;
  colorMatrix.brightness(1.04);
  colorMatrix.saturate(0.2, true);
  colorMatrix.sepia(true);
  colorMatrix.hue(8);

  let displacement: { x: number; y: number } | null = null;
  if (useDisplacement) {
    displacement = img.filters!.internal.addDisplacement('effect_displacement_heat', 0.02, 0.02);
  }

  return { colorMatrix, cmController, displacement };
}

export function stepFireArtMatrix(state: FireArtFilterState, burst: number): void {
  state.colorMatrix.brightness(1.04 + burst * 0.18);
  state.colorMatrix.saturate(0.2 + burst * 0.12, false);
}

export function stepFireDisplacement(
  displacement: { x: number; y: number },
  t: number,
  burst: number,
  cursorActive: boolean,
): void {
  const heatBoost = cursorActive ? 1.35 : 1;
  const scale = (0.02 + Math.sin(t * 3) * 0.006 + burst * 0.008) * heatBoost;
  displacement.x = scale;
  displacement.y = scale;
}

export type HolyArtFilterState = {
  colorMatrix: Display.ColorMatrix;
  cmController: { colorMatrix: Display.ColorMatrix };
};

/** Warm divine tint on artwork — approximates Pixi colorTone via sepia + hue. */
export function createHolyArtFilters(img: FilterableImage): HolyArtFilterState {
  img.enableFilters?.();
  const cmController = img.filters!.internal.addColorMatrix();
  const colorMatrix = cmController.colorMatrix;
  colorMatrix.brightness(1.06);
  colorMatrix.saturate(0.12, true);
  colorMatrix.sepia(true);
  colorMatrix.hue(-8);

  return { colorMatrix, cmController };
}

export function stepHolyArtMatrix(state: HolyArtFilterState, pulse: number): void {
  state.colorMatrix.brightness(1.04 + pulse * 0.1);
}
