// ─── Run progression math (No Phaser imports) ───

import type { BossDef, DifficultyLevel } from './types';
import { GAMEPLAY } from './Constants';
import { getBossDistanceMultiplier } from '../data/bosses';
import { getBaseTargetMilesForLeg } from '../data/target_miles';
import { ceilScore, multiplyScore, type Decimal } from './scoreMath';
import type { PayoutBreakdown } from './store/types';
import type { RunState } from './store/types';
import { resolveEquipmentList } from './store/resolve';
import { selectProfession, selectRoundReward } from './store/selectors/runSelectors';
import { forEachEquipmentResolved } from './effects/helpers';
import { resolveEffectParam, savingsAccountEligibleBalance } from './effectParams';

/** Target miles for a leg/round (difficulty scaling, permit shortcuts, round multiplier). */
export function computeTargetMiles(
  leg: number,
  round: number,
  permitScoreReduction: number,
  difficulty: DifficultyLevel,
  bossForLeg?: BossDef | null,
  blindSizeMultiplier = 1,
): Decimal {
  const effectiveLeg = leg - permitScoreReduction;
  let base = getBaseTargetMilesForLeg(effectiveLeg, difficulty);
  if (blindSizeMultiplier !== 1) {
    base = ceilScore(multiplyScore(base, blindSizeMultiplier));
  }
  let multiplier = GAMEPLAY.ROUND_MULTIPLIERS[round - 1] ?? 1;
  if (round === GAMEPLAY.ROUNDS_PER_LEG && bossForLeg) {
    const bossMultiplier = getBossDistanceMultiplier(bossForLeg);
    if (bossMultiplier !== null) {
      multiplier = bossMultiplier;
    }
  }
  return ceilScore(multiplyScore(base, multiplier));
}

/** Base money reward for completing a round at the given difficulty. */
export function computeRoundReward(round: number, difficulty: DifficultyLevel): number {
  const base = GAMEPLAY.ROUND_REWARDS[round - 1] ?? 3;
  if (difficulty >= 2 && round === 1) return 0;
  return base;
}

/** End-of-round payout breakdown (interest, equipment bonuses, day/reroll bonuses). */
export function computePayoutBreakdown(
  state: RunState,
  daysRemaining: number,
  rerollsRemaining: number = 0,
): PayoutBreakdown {
  const profession = selectProfession(state);
  const roundReward = selectRoundReward(state);
  const dayBonus = daysRemaining;

  const noInterest = !!(profession?.modifiers as Record<string, unknown>)?.noInterest;
  const perRemaining = ((profession?.modifiers as Record<string, unknown>)?.endOfRoundBonusPerRemaining as number) ?? 0;

  let interest = 0;
  let savingsAccountInterest = 0;
  let savingsAccountRate = 0;
  let savingsAccountChunk = GAMEPLAY.INTEREST_PER;
  if (!noInterest) {
    const cappedMoney = Math.min(state.balance, state.interestCap);
    interest = Math.floor(cappedMoney / GAMEPLAY.INTEREST_PER);
    const equipment = resolveEquipmentList(state);
    forEachEquipmentResolved(
      equipment,
      (equip) => {
        if (equip.def.effectType !== 'SAVINGS_ACCOUNT_INTEREST') return;
        const p = equip.def.effectParams as Record<string, unknown>;
        const chunk = (p.perChunk as number) ?? 5;
        const perChunk = (p.value as number) ?? 1;
        const eligible = savingsAccountEligibleBalance(state.balance, state.interestCap, p, profession?.id);
        savingsAccountInterest += Math.floor(eligible / chunk) * perChunk;
        savingsAccountRate = perChunk;
        savingsAccountChunk = chunk;
      },
      'skip',
    );
  }

  const rerollBonus = perRemaining > 0 ? rerollsRemaining * perRemaining : 0;

  let equipmentMoney = 0;
  for (const equip of resolveEquipmentList(state)) {
    if (equip.def.effectType === 'END_ROUND_MONEY') {
      const p = equip.def.effectParams as Record<string, unknown>;
      equipmentMoney += resolveEffectParam<number>(p, 'value', profession?.id) ?? 0;
    }
    if (equip.def.effectType === 'END_ROUND_MONEY_PER_REROLL') {
      equipmentMoney += ((equip.def.effectParams.value as number) ?? 0) * rerollsRemaining;
    }
    if (equip.def.effectType === 'END_ROUND_MONEY_SCALING') {
      const base = (equip.def.effectParams.base as number) ?? 1;
      const perBoss = (equip.def.effectParams.perBoss as number) ?? 2;
      const bossesDefeated = (equip.state.bossesDefeated as number) ?? 0;
      equipmentMoney += base + perBoss * bossesDefeated;
    }
    if (equip.def.effectType === 'TRAIL_ALMANAC_MONEY') {
      let discoveredCount = 0;
      for (const stats of Object.values(state.handStats)) {
        if (stats.level > 1) discoveredCount++;
      }
      equipmentMoney += ((equip.def.effectParams.value as number) ?? 1) * discoveredCount;
    }
  }

  return {
    roundReward,
    dayBonus,
    interest,
    savingsAccountInterest,
    savingsAccountRate,
    savingsAccountChunk,
    equipmentMoney,
    rerollBonus,
    total: roundReward + dayBonus + interest + savingsAccountInterest + equipmentMoney + rerollBonus,
  };
}
