// ─── Score math helpers (No Phaser imports) ───
// Re-exports Decimal-based score math (replaces native number arithmetic).

export {
  D,
  ZERO,
  ONE,
  roundScore,
  multiplyScore,
  addScore,
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
