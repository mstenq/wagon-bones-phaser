// ─── Score math helpers (No Phaser imports) ───
// Rounds products to avoid floating-point drift in mult/miles calculations.

import { GAMEPLAY } from './Constants';

const SCORE_ROUND_FACTOR = 10 ** GAMEPLAY.SCORE_MATH_DECIMALS;

/** Round a score-related value to the configured decimal precision. */
export function roundScore(n: number): number {
  return Math.round(n * SCORE_ROUND_FACTOR) / SCORE_ROUND_FACTOR;
}

/** Multiply score values and round the product. */
export function multiplyScore(a: number, b: number): number {
  return roundScore(a * b);
}
