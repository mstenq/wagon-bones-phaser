// ─── Round score progress bar math ───
// Pure tier/fill logic for the round-score progress UI.

import { D, divideScore, type DecimalSource } from '../../game/decimal';
import { UI } from '../../game/Constants';

export interface ScoreProgressState {
  /** 0-indexed tier (0 = first target chunk, 1 = second lap, …). */
  tierIndex: number;
  /** Fill within the current tier, 0–1. */
  tierFill: number;
  /** roundScore / targetMiles as a number (0 when target is 0). */
  ratio: number;
}

export interface ScoreProgressLayer {
  tierIndex: number;
  fill: number;
}

export interface StackedScoreProgressState extends ScoreProgressState {
  /** Bottom-to-top layers (completed tiers + current partial). */
  layers: ScoreProgressLayer[];
  /** e.g. 2 for "x2" when past first target; null when ratio <= 1. */
  multiplierLabel: number | null;
}

/** Golden-angle hue step — maximally distinct saturated tiers without a fixed palette cap. */
const SCORE_PROGRESS_HUE_STEP = 137.508;
const SCORE_PROGRESS_BASE_HUE = 120;
const SCORE_PROGRESS_SATURATION = 0.94;
const SCORE_PROGRESS_LIGHTNESS = 0.5;

function hslToColor(hueDeg: number, saturation: number, lightness: number): number {
  const h = ((hueDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

/** Vibrant fill color for a 0-based tier; tier 0 is green, hues spread via golden angle. */
export function getScoreProgressTierColor(tierIndex: number): number {
  const hue = SCORE_PROGRESS_BASE_HUE + tierIndex * SCORE_PROGRESS_HUE_STEP;
  return hslToColor(hue, SCORE_PROGRESS_SATURATION, SCORE_PROGRESS_LIGHTNESS);
}

function ratioToNumber(roundScore: DecimalSource, targetMiles: DecimalSource): number {
  const target = D(targetMiles);
  if (target.lte(0)) return 0;
  const ratio = divideScore(roundScore, target);
  if (!ratio.isFinite()) return 0;
  return ratio.toNumber();
}

export function getScoreProgressState(roundScore: DecimalSource, targetMiles: DecimalSource): ScoreProgressState {
  const ratio = ratioToNumber(roundScore, targetMiles);

  if (ratio <= 0) {
    return { tierIndex: 0, tierFill: 0, ratio };
  }

  if (ratio < 1) {
    return { tierIndex: 0, tierFill: ratio, ratio };
  }

  const floored = Math.floor(ratio);
  const fractional = ratio - floored;

  if (fractional === 0) {
    return { tierIndex: floored - 1, tierFill: 1, ratio };
  }

  return { tierIndex: floored, tierFill: fractional, ratio };
}

/** Overflow lap label shown when score has passed the target at least once. */
export function getOverflowMultiplierLabel(ratio: number): number | null {
  if (ratio <= 1) return null;
  const floored = Math.floor(ratio);
  const fractional = ratio - floored;
  const label = fractional <= 1e-6 ? floored : floored + 1;
  if (label >= UI.SCORE_PROGRESS_OVERFLOW_LABEL_MAX) return null;
  return label;
}

/** Bottom-to-top stacked layers for the progress bar. */
export function getStackedProgressLayers(
  roundScore: DecimalSource,
  targetMiles: DecimalSource,
): StackedScoreProgressState {
  const state = getScoreProgressState(roundScore, targetMiles);
  const multiplierLabel = getOverflowMultiplierLabel(state.ratio);

  if (state.ratio < 1) {
    return {
      ...state,
      layers: [{ tierIndex: 0, fill: state.tierFill }],
      multiplierLabel,
    };
  }

  const layers: ScoreProgressLayer[] = [];
  if (state.tierFill < 1 && state.tierIndex > 0) {
    layers.push({ tierIndex: state.tierIndex - 1, fill: 1 });
  }
  layers.push({ tierIndex: state.tierIndex, fill: state.tierFill });

  return { ...state, layers, multiplierLabel };
}
