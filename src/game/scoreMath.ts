// ─── Score math helpers (No Phaser imports) ───
// Re-exports Decimal-based score math (replaces native number arithmetic).

export {
  D,
  ZERO,
  ONE,
  roundScore,
  multiplyScore,
  addScore,
  divideScore,
  floorScore,
  ceilScore,
  maxScore,
  minScore,
  gte,
  gt,
  eq,
  lt,
  lte,
  milesToSave,
  milesFromSave,
  Decimal,
  type DecimalSource,
} from './decimal';

import { addScore, divideScore, multiplyScore, type Decimal, type DecimalSource } from './decimal';

/** Accountant profession: average miles component and mult before multiplying. */
export function balanceMilesAndMult(
  milesComponent: DecimalSource,
  mult: DecimalSource,
): { balanced: Decimal; miles: Decimal } {
  const balanced = divideScore(addScore(milesComponent, mult), 2);
  return { balanced, miles: multiplyScore(balanced, balanced) };
}
