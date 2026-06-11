// ─── Score anim lab sandbox defaults (No Phaser imports) ───

import { D } from './scoreMath';

export const SCORE_ANIM_SANDBOX = {
  targetMiles: D(1_000_000_000),
  maxDays: 100,
  maxRerolls: 100,
  diceCount: 56,
  startingMoney: 999_999,
  handSizeBonus: 4,
} as const;
