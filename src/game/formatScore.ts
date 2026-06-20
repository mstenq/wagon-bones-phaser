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

/** Format an xMult factor for score popups (two decimal places). */
export function formatXMult(value: DecimalSource): string {
  const d = D(value);
  if (d.eq(D(1))) return '1';
  const asNum = d.toNumber();
  if (Number.isFinite(asNum) && Math.abs(asNum) < GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD) {
    const rounded = Math.round(asNum * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(parseFloat(rounded.toFixed(2)));
  }
  return formatScientific(d);
}

const MULT_COMPACT_THRESHOLD = 1_000;

/** Format mult for UI (fractional mults like 1.5 when small; k/m/b when large). */
export function formatMult(value: DecimalSource): string {
  const d = D(value);
  if (d.eq(D(1))) return '1';
  const asNum = d.toNumber();
  if (!Number.isFinite(asNum)) {
    return formatScientific(d);
  }

  const abs = Math.abs(asNum);
  if (abs >= GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD) {
    return formatScientific(d);
  }

  if (abs >= MULT_COMPACT_THRESHOLD) {
    const sign = asNum < 0 ? '-' : '';
    return `${sign}${formatCompactAbbreviation(abs)}`;
  }

  const rounded = Math.round(asNum * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(parseFloat(rounded.toFixed(2)));
}

/** Compact k/m/b label for mult UI (sidebar / top bar pills). */
function formatCompactAbbreviation(abs: number): string {
  let divisor = 1e3;
  let suffix = 'k';
  if (abs >= 1e9) {
    divisor = 1e9;
    suffix = 'b';
  } else if (abs >= 1e6) {
    divisor = 1e6;
    suffix = 'm';
  }

  const scaled = abs / divisor;
  let formatted = formatCompactScaled(scaled);

  if (formatted === '1000') {
    if (suffix === 'k') return formatCompactAbbreviation(1e6);
    if (suffix === 'm') return formatCompactAbbreviation(1e9);
  }

  return `${formatted}${suffix}`;
}

function formatCompactScaled(scaled: number): string {
  if (scaled >= 100) {
    return String(Math.round(scaled));
  }
  return String(parseFloat(scaled.toFixed(1)));
}

function formatScientific(d: Decimal): string {
  if (d.eq(ZERO)) return '0';

  const sign = d.sign < 0 ? '-' : '';
  const abs = d.abs();
  // Beyond JS number range — keep the celebratory "Infinity" label (matches progress-bar tween overflow).
  if (!abs.isFinite() || !Number.isFinite(abs.toNumber())) {
    return `${sign}Infinity`;
  }

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
