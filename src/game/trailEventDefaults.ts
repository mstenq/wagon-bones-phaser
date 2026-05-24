// ─── Trail event default state (No Phaser imports) ───
// Kept separate from TrailEventsSystem so runStore can init without heavy imports.

export interface TrailEventModifiers {
  dayPenalty: number;
  rerollPenalty: number;
  handSizePenalty: number;
  scoreMultiplier: number;
  disableRerollDay1: boolean;
  standardDiceDay1: boolean;
  moneyPerDayLoss: number;
  diamondCrackDoubled: boolean;
  luckyOddsHalved: boolean;
  scoredDiceDestroyChance: number;
  bossUpgradeMultiplier: number;
  flatMilesPenalty: number;
  skipNextShop: boolean;
  loseAllRerolls: boolean;
}

/** Round-duration trail penalties applied after startRound consumes trailEventModifiers. */
export interface TrailRoundEffects {
  disableRerollDay1: boolean;
  standardDiceDay1: boolean;
  moneyPerDayLoss: number;
  diamondCrackDoubled: boolean;
  luckyOddsHalved: boolean;
  scoredDiceDestroyChance: number;
}

export function createEmptyModifiers(): TrailEventModifiers {
  return {
    dayPenalty: 0,
    rerollPenalty: 0,
    handSizePenalty: 0,
    scoreMultiplier: 1.0,
    disableRerollDay1: false,
    standardDiceDay1: false,
    moneyPerDayLoss: 0,
    diamondCrackDoubled: false,
    luckyOddsHalved: false,
    scoredDiceDestroyChance: 0,
    bossUpgradeMultiplier: 1.0,
    flatMilesPenalty: 0,
    skipNextShop: false,
    loseAllRerolls: false,
  };
}

export function createEmptyTrailRoundEffects(): TrailRoundEffects {
  return {
    disableRerollDay1: false,
    standardDiceDay1: false,
    moneyPerDayLoss: 0,
    diamondCrackDoubled: false,
    luckyOddsHalved: false,
    scoredDiceDestroyChance: 0,
  };
}
