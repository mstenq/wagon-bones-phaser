// ─── Score / miles display formatting ───
// Below billions: thousand separators (8,357,843).
// At or above billions: Balatro-style scientific notation (8.36e18).

import Decimal from 'break_eternity.js';
import { GAMEPLAY } from './Constants';
import { D, ZERO, type DecimalSource } from './decimal';

/** Format a miles/score value for UI display. */
export function formatScore(value: DecimalSource): string {
  const d = D(value);
  if (d.eq(ZERO)) return '0';

  const threshold = D(GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD);
  if (d.abs().gte(threshold)) {
    return formatScientific(d);
  }

  const n = d.floor().toNumber();
  if (!Number.isFinite(n)) {
    return formatScientific(d);
  }
  return n.toLocaleString('en-US');
}

/**
 * Format a pre-multiply miles component for scoring UI.
 * Allows fractional values (e.g. accountant balance) while keeping comma separators for whole numbers.
 */
export function formatScoreComponent(value: DecimalSource): string {
  const d = D(value);
  if (d.eq(ZERO)) return '0';

  const threshold = D(GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD);
  if (d.abs().gte(threshold)) {
    return formatScientific(d);
  }

  const asNum = d.toNumber();
  if (!Number.isFinite(asNum)) {
    return formatScientific(d);
  }

  const rounded = Math.round(asNum * 100) / 100;
  if (!Number.isInteger(rounded)) {
    return String(parseFloat(rounded.toFixed(2)));
  }
  return rounded.toLocaleString('en-US');
}

/** Format mult for UI (fractional mults like 1.5 when small). */
export function formatMult(value: DecimalSource): string {
  const d = D(value);
  if (d.eq(D(1))) return '1';
  const asNum = d.toNumber();
  if (Number.isFinite(asNum) && Math.abs(asNum) < GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD) {
    const rounded = Math.round(asNum * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(parseFloat(rounded.toFixed(2)));
  }
  return formatScientific(d);
}

function formatScientific(d: Decimal): string {
  if (d.eq(ZERO)) return '0';

  const sign = d.sign < 0 ? '-' : '';
  const abs = d.abs();
  const expD = abs.log10().floor();
  let exp = expD.toNumber();
  if (!Number.isFinite(exp)) {
    return `${sign}${abs.toString()}`;
  }

  const mantissaD = abs.div(Decimal.pow(10, expD));
  let mantissa = Number(mantissaD.toStringWithDecimalPlaces(2));
  if (!Number.isFinite(mantissa)) {
    return `${sign}${abs.toString()}`;
  }

  if (mantissa >= 10) {
    mantissa /= 10;
    exp += 1;
  }

  const expStr = Number.isFinite(exp) ? String(Math.round(exp)) : expD.toString();
  const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : String(parseFloat(mantissa.toFixed(2)));
  return `${sign}${mantissaStr}e${expStr}`;
}
