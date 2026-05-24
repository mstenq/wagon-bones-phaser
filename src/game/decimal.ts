// ─── Large-number helpers (break_eternity.js) ───
// Used for miles, targets, and score math. Money and die pips stay as plain numbers.

import Decimal from 'break_eternity.js';
import { GAMEPLAY } from './Constants';

export { Decimal };
export type DecimalSource = Decimal | number | string;

export const ZERO = Decimal.dZero;
export const ONE = Decimal.dOne;

/** Coerce any score input to Decimal. */
export function D(value: DecimalSource): Decimal {
  return Decimal.fromValue(value);
}

const ROUND_FACTOR = 10 ** GAMEPLAY.SCORE_MATH_DECIMALS;

/** Round score-related values to configured decimal precision. */
export function roundScore(value: DecimalSource): Decimal {
  const d = D(value);
  if (!d.isFinite()) return d;
  const scaled = d.times(ROUND_FACTOR);
  const rounded = Decimal.round(scaled).div(ROUND_FACTOR);
  return rounded;
}

export function multiplyScore(a: DecimalSource, b: DecimalSource): Decimal {
  return roundScore(D(a).times(b));
}

export function addScore(a: DecimalSource, b: DecimalSource): Decimal {
  return roundScore(D(a).plus(b));
}

export function divideScore(a: DecimalSource, b: DecimalSource): Decimal {
  return roundScore(D(a).div(b));
}

export function floorScore(value: DecimalSource): Decimal {
  return D(value).floor();
}

export function ceilScore(value: DecimalSource): Decimal {
  return D(value).ceil();
}

export function maxScore(a: DecimalSource, b: DecimalSource): Decimal {
  return Decimal.max(a, b);
}

export function minScore(a: DecimalSource, b: DecimalSource): Decimal {
  return Decimal.min(a, b);
}

export function gte(a: DecimalSource, b: DecimalSource): boolean {
  return D(a).gte(b);
}

export function gt(a: DecimalSource, b: DecimalSource): boolean {
  return D(a).gt(b);
}

export function eq(a: DecimalSource, b: DecimalSource): boolean {
  return D(a).eq(b);
}

export function lt(a: DecimalSource, b: DecimalSource): boolean {
  return D(a).lt(b);
}

export function lte(a: DecimalSource, b: DecimalSource): boolean {
  return D(a).lte(b);
}

/** JSON save format for miles fields. */
export function milesToSave(value: DecimalSource): string {
  return D(value).toString();
}

export function milesFromSave(raw: string | number): Decimal {
  return D(raw);
}
