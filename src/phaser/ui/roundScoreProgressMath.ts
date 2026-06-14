// ─── Round score progress bar math ───
// Pure tier/fill logic for the round-score progress UI.

import { D, divideScore, type DecimalSource } from '../../game/decimal';

export interface ScoreProgressState {
  /** 0-indexed tier (0 = first target chunk, 4 = 400%+). */
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

export const SCORE_PROGRESS_MAX_TIER = 4;

function ratioToNumber(roundScore: DecimalSource, targetMiles: DecimalSource): number {
  const target = D(targetMiles);
  if (target.lte(0)) return 0;
  const ratio = divideScore(roundScore, target);
  if (!ratio.isFinite()) return 0;
  return ratio.toNumber();
}

/** Pick light or dark label text for readability on a fill color. */
export function contrastingTextColor(fillColor: number): string {
  const r = (fillColor >> 16) & 0xff;
  const g = (fillColor >> 8) & 0xff;
  const b = fillColor & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#1a1a2e' : '#ffffff';
}

/** Label color for text centered on the progress bar track. */
export function barLabelTextColor(fillColor: number, fillW: number, barW: number): string {
  const textCenterX = barW / 2;
  if (fillW >= textCenterX) {
    return contrastingTextColor(fillColor);
  }
  return '#ffffff';
}

export function getScoreProgressState(
  roundScore: DecimalSource,
  targetMiles: DecimalSource,
  maxTier: number = SCORE_PROGRESS_MAX_TIER,
): ScoreProgressState {
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
    const tierIndex = Math.min(floored - 1, maxTier);
    return { tierIndex, tierFill: 1, ratio };
  }

  const tierIndex = Math.min(floored, maxTier);
  return { tierIndex, tierFill: fractional, ratio };
}

/** Overflow lap label shown when score has passed the target at least once. */
export function getOverflowMultiplierLabel(ratio: number): number | null {
  if (ratio <= 1) return null;
  const floored = Math.floor(ratio);
  const fractional = ratio - floored;
  if (fractional <= 1e-6) return floored;
  return floored + 1;
}

/** Bottom-to-top stacked layers for the progress bar. */
export function getStackedProgressLayers(
  roundScore: DecimalSource,
  targetMiles: DecimalSource,
  maxTier: number = SCORE_PROGRESS_MAX_TIER,
): StackedScoreProgressState {
  const state = getScoreProgressState(roundScore, targetMiles, maxTier);
  const multiplierLabel = getOverflowMultiplierLabel(state.ratio);

  if (state.ratio < 1) {
    return {
      ...state,
      layers: [{ tierIndex: 0, fill: state.tierFill }],
      multiplierLabel,
    };
  }

  const layers: ScoreProgressLayer[] = [];
  for (let tier = 0; tier < state.tierIndex; tier++) {
    layers.push({ tierIndex: tier, fill: 1 });
  }
  layers.push({ tierIndex: state.tierIndex, fill: state.tierFill });

  return { ...state, layers, multiplierLabel };
}
