// ─── Score / miles display formatting ───
// Below billions: thousand separators (8,357,843).
// At or above billions: Balatro-style scientific notation (8.36e18).

import { GAMEPLAY } from './Constants';

/** Format a miles/score value for UI display. */
export function formatScore(value: number): string {
  const n = Math.floor(value);
  if (Math.abs(n) >= GAMEPLAY.SCORE_SCIENTIFIC_THRESHOLD) {
    return formatScientific(n);
  }
  return n.toLocaleString('en-US');
}

function formatScientific(n: number): string {
  if (n === 0) return '0';

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  let exp = Math.floor(Math.log10(abs));
  let mantissa = abs / 10 ** exp;

  mantissa = Math.round(mantissa * 100) / 100;
  if (mantissa >= 10) {
    mantissa /= 10;
    exp += 1;
  }

  const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : String(parseFloat(mantissa.toFixed(2)));
  return `${sign}${mantissaStr}e${exp}`;
}
