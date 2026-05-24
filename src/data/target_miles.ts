// ─── Leg target miles (Balatro-style ante scaling) ───
// Source of truth: GAME_ROUND_TARGET_MILES.md
// Stored as strings — JS number cannot represent leg 39+ values (exceeds ~1.8e308).

import type { DifficultyLevel } from '../game/types';
import { D, type Decimal } from '../game/decimal';

/** Highest leg number with defined base targets. */
export const MAX_LEG_NUMBER = 39;

const SHARED_EARLY: Record<number, string> = { [-1]: '100', 0: '100', 1: '300' };

/** Clear Skies / difficulty 1–2 base miles by leg number (-1 … 39). */
const TARGET_MILES_BY_LEG_STRING: Record<number, string> = {
  ...SHARED_EARLY,
  2: '800',
  3: '2000',
  4: '5000',
  5: '11000',
  6: '20000',
  7: '35000',
  8: '50000',
  9: '110000',
  10: '560000',
  11: '7200000',
  12: '300000000',
  13: '47000000000',
  14: '2.9e13',
  15: '7.7e16',
  16: '8.6e20',
  17: '4.2e25',
  18: '9.2e30',
  19: '9.2e36',
  20: '4.3e43',
  21: '9.7e50',
  22: '1.0e59',
  23: '5.8e67',
  24: '1.6e77',
  25: '2.4e87',
  26: '1.9e98',
  27: '8.4e109',
  28: '2.0e122',
  29: '2.7e135',
  30: '2.1e149',
  31: '9.9e163',
  32: '2.7e179',
  33: '4.4e195',
  34: '4.4e212',
  35: '2.8e230',
  36: '1.1e249',
  37: '2.7e268',
  38: '4.5e288',
  39: '4.8e309',
};

/** Rough Trail (difficulty 3–5) base miles by leg number. */
const TARGET_MILES_BY_LEG_ROUGH_STRING: Record<number, string> = {
  ...SHARED_EARLY,
  2: '900',
  3: '2600',
  4: '8000',
  5: '20000',
  6: '36000',
  7: '60000',
  8: '100000',
  9: '230000',
  10: '1100000',
  11: '14000000',
  12: '600000000',
  13: '94000000000',
  14: '5.8e13',
  15: '1.5e17',
  16: '1.7e21',
  17: '8.4e25',
  18: '1.8e31',
  19: '1.8e37',
  20: '8.6e43',
  21: '1.9e51',
  22: '2.1e59',
  23: '1.1e68',
  24: '3.3e77',
  25: '4.9e87',
  26: '3.9e98',
  27: '1.6e110',
  28: '4.0e122',
  29: '5.5e135',
  30: '4.3e149',
  31: '1.9e164',
  32: '5.4e179',
  33: '8.9e195',
  34: '8.9e212',
  35: '5.6e230',
  36: '2.2e249',
  37: '5.5e268',
  38: '9.0e288',
  39: '9.6e309',
};

/** Deadly Frontier (difficulty 6+) base miles by leg number. */
const TARGET_MILES_BY_LEG_DEADLY_STRING: Record<number, string> = {
  ...SHARED_EARLY,
  2: '1000',
  3: '3200',
  4: '9000',
  5: '25000',
  6: '60000',
  7: '110000',
  8: '200000',
  9: '460000',
  10: '2200000',
  11: '29000000',
  12: '1200000000',
  13: '1.8e11',
  14: '1.1e14',
  15: '3.0e17',
  16: '3.4e21',
  17: '1.6e26',
  18: '3.7e31',
  19: '3.7e37',
  20: '1.7e44',
  21: '3.8e51',
  22: '4.2e59',
  23: '2.3e68',
  24: '6.6e77',
  25: '9.8e87',
  26: '7.8e98',
  27: '3.3e110',
  28: '8.1e122',
  29: '1.1e136',
  30: '8.6e149',
  31: '3.9e164',
  32: '1.0e180',
  33: '1.7e196',
  34: '1.7e213',
  35: '1.1e231',
  36: '4.4e249',
  37: '1.1e269',
  38: '1.8e289',
  39: '1.9e310',
};

function tableForDifficulty(difficulty: DifficultyLevel): Record<number, string> {
  if (difficulty >= 6) return TARGET_MILES_BY_LEG_DEADLY_STRING;
  if (difficulty >= 3) return TARGET_MILES_BY_LEG_ROUGH_STRING;
  return TARGET_MILES_BY_LEG_STRING;
}

/** Base mile requirement for a leg number (before round/boss multipliers). */
export function getBaseTargetMilesForLeg(leg: number, difficulty: DifficultyLevel): Decimal {
  const raw = tableForDifficulty(difficulty)[leg];
  if (raw === undefined) {
    throw new Error(`No target miles for leg ${leg} at difficulty ${difficulty}`);
  }
  return D(raw);
}
