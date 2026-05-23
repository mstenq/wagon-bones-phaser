// ─── Leg target miles (Balatro-style ante scaling) ───
// Source of truth: GAME_ROUND_TARGET_MILES.md
// JS number precision degrades past ~9e15; leg 39 values may become Infinity.

import type { DifficultyLevel } from '../game/types';

/** Highest leg number with defined base targets. */
export const MAX_LEG_NUMBER = 39;

const SHARED_EARLY: Record<number, number> = { [-1]: 100, 0: 100, 1: 300 };

/** Clear Skies / difficulty 1–2 base miles by leg number (-1 … 39). */
export const TARGET_MILES_BY_LEG_NUMBER: Record<number, number> = {
  ...SHARED_EARLY,
  2: 800,
  3: 2_000,
  4: 5_000,
  5: 11_000,
  6: 20_000,
  7: 35_000,
  8: 50_000,
  9: 110_000,
  10: 560_000,
  11: 7_200_000,
  12: 300_000_000,
  13: 47_000_000_000,
  14: 2.9e13,
  15: 7.7e16,
  16: 8.6e20,
  17: 4.2e25,
  18: 9.2e30,
  19: 9.2e36,
  20: 4.3e43,
  21: 9.7e50,
  22: 1.0e59,
  23: 5.8e67,
  24: 1.6e77,
  25: 2.4e87,
  26: 1.9e98,
  27: 8.4e109,
  28: 2.0e122,
  29: 2.7e135,
  30: 2.1e149,
  31: 9.9e163,
  32: 2.7e179,
  33: 4.4e195,
  34: 4.4e212,
  35: 2.8e230,
  36: 1.1e249,
  37: 2.7e268,
  38: 4.5e288,
  39: 4.8e309,
};

/** Rough Trail (difficulty 3–5) base miles by leg number. */
export const TARGET_MILES_BY_LEG_NUMBER_ROUGH: Record<number, number> = {
  ...SHARED_EARLY,
  2: 900,
  3: 2_600,
  4: 8_000,
  5: 20_000,
  6: 36_000,
  7: 60_000,
  8: 100_000,
  9: 230_000,
  10: 1_100_000,
  11: 14_000_000,
  12: 600_000_000,
  13: 94_000_000_000,
  14: 5.8e13,
  15: 1.5e17,
  16: 1.7e21,
  17: 8.4e25,
  18: 1.8e31,
  19: 1.8e37,
  20: 8.6e43,
  21: 1.9e51,
  22: 2.1e59,
  23: 1.1e68,
  24: 3.3e77,
  25: 4.9e87,
  26: 3.9e98,
  27: 1.6e110,
  28: 4.0e122,
  29: 5.5e135,
  30: 4.3e149,
  31: 1.9e164,
  32: 5.4e179,
  33: 8.9e195,
  34: 8.9e212,
  35: 5.6e230,
  36: 2.2e249,
  37: 5.5e268,
  38: 9.0e288,
  39: 9.6e309,
};

/** Deadly Frontier (difficulty 6+) base miles by leg number. */
export const TARGET_MILES_BY_LEG_NUMBER_DEADLY: Record<number, number> = {
  ...SHARED_EARLY,
  2: 1_000,
  3: 3_200,
  4: 9_000,
  5: 25_000,
  6: 60_000,
  7: 110_000,
  8: 200_000,
  9: 460_000,
  10: 2_200_000,
  11: 29_000_000,
  12: 1_200_000_000,
  13: 1.8e11,
  14: 1.1e14,
  15: 3.0e17,
  16: 3.4e21,
  17: 1.6e26,
  18: 3.7e31,
  19: 3.7e37,
  20: 1.7e44,
  21: 3.8e51,
  22: 4.2e59,
  23: 2.3e68,
  24: 6.6e77,
  25: 9.8e87,
  26: 7.8e98,
  27: 3.3e110,
  28: 8.1e122,
  29: 1.1e136,
  30: 8.6e149,
  31: 3.9e164,
  32: 1.0e180,
  33: 1.7e196,
  34: 1.7e213,
  35: 1.1e231,
  36: 4.4e249,
  37: 1.1e269,
  38: 1.8e289,
  39: 1.9e310,
};

function tableForDifficulty(difficulty: DifficultyLevel): Record<number, number> {
  if (difficulty >= 6) return TARGET_MILES_BY_LEG_NUMBER_DEADLY;
  if (difficulty >= 3) return TARGET_MILES_BY_LEG_NUMBER_ROUGH;
  return TARGET_MILES_BY_LEG_NUMBER;
}

/** Base mile requirement for a leg number (before round/boss multipliers). */
export function getBaseTargetMilesForLeg(leg: number, difficulty: DifficultyLevel): number {
  const base = tableForDifficulty(difficulty)[leg];
  if (base === undefined) {
    throw new Error(`No target miles for leg ${leg} at difficulty ${difficulty}`);
  }
  return base;
}
