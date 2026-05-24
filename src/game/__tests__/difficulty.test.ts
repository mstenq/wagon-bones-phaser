import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetPlayerState, computeTargetMiles, computeRoundReward } from '../PlayerState';
import { GAMEPLAY } from '../Constants';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { setTestDifficulty } from './testHelpers';
import { ceilScore, multiplyScore, eq } from '../scoreMath';

beforeEach(() => {
  resetPlayerState();
});

describe('Difficulty System', () => {
  describe('Target Miles', () => {
    test('uses normal targets at difficulty 1–2', () => {
      const leg = 2;
      const round = 1;
      const base = getBaseTargetMilesForLeg(leg, 1);
      const mult = GAMEPLAY.ROUND_MULTIPLIERS[round - 1];

      expect(eq(computeTargetMiles(leg, round, 0, 1), ceilScore(multiplyScore(base, mult)))).toBe(true);
      expect(eq(computeTargetMiles(leg, round, 0, 2), ceilScore(multiplyScore(base, mult)))).toBe(true);
    });

    test('uses rough targets at difficulty 3–5', () => {
      const leg = 4;
      const round = 2;
      const base = getBaseTargetMilesForLeg(leg, 3);
      const mult = GAMEPLAY.ROUND_MULTIPLIERS[round - 1];

      expect(eq(computeTargetMiles(leg, round, 0, 3), ceilScore(multiplyScore(base, mult)))).toBe(true);
      expect(eq(computeTargetMiles(leg, round, 0, 5), ceilScore(multiplyScore(base, mult)))).toBe(true);
    });

    test('uses deadly targets at difficulty 6+', () => {
      const leg = 5;
      const round = 3;
      const base = getBaseTargetMilesForLeg(leg, 6);
      const mult = GAMEPLAY.ROUND_MULTIPLIERS[round - 1];

      expect(eq(computeTargetMiles(leg, round, 0, 6), ceilScore(multiplyScore(base, mult)))).toBe(true);
      expect(eq(computeTargetMiles(leg, round, 0, 8), ceilScore(multiplyScore(base, mult)))).toBe(true);
    });

    test('deadly overrides rough at difficulty 6', () => {
      const leg = 3;
      const round = 1;
      expect(eq(computeTargetMiles(leg, round, 0, 6), getBaseTargetMilesForLeg(leg, 6))).toBe(true);
      expect(eq(computeTargetMiles(leg, round, 0, 3), getBaseTargetMilesForLeg(leg, 3))).toBe(true);
      expect(eq(computeTargetMiles(leg, round, 0, 6), computeTargetMiles(leg, round, 0, 3))).toBe(false);
    });

    test('permit score reduction lowers effective leg index for targets', () => {
      setTestDifficulty(3);
      const withReduction = computeTargetMiles(4, 1, 1, 3);
      const without = computeTargetMiles(4, 1, 0, 3);
      expect(eq(withReduction, getBaseTargetMilesForLeg(3, 3))).toBe(true);
      expect(eq(without, getBaseTargetMilesForLeg(4, 3))).toBe(true);
    });
  });

  describe('Thin Supplies (Level 2+)', () => {
    test('round 1 gives no money reward at difficulty 2+', () => {
      expect(computeRoundReward(1, 2)).toBe(0);
      expect(computeRoundReward(1, 8)).toBe(0);
    });

    test('rounds 2 and 3 give normal rewards at difficulty 2+', () => {
      expect(computeRoundReward(2, 2)).toBe(GAMEPLAY.ROUND_REWARDS[1]);
      expect(computeRoundReward(3, 2)).toBe(GAMEPLAY.ROUND_REWARDS[2]);
      expect(computeRoundReward(2, 7)).toBe(GAMEPLAY.ROUND_REWARDS[1]);
    });

    test('round 1 gives normal reward at difficulty 1', () => {
      expect(computeRoundReward(1, 1)).toBe(GAMEPLAY.ROUND_REWARDS[0]);
    });

    test('player roundReward reflects Thin Supplies on round 1', () => {
      const player = resetPlayerState();
      player.setDifficulty(2);
      player.round = 1;
      expect(player.roundReward).toBe(0);
      player.round = 2;
      expect(player.roundReward).toBe(GAMEPLAY.ROUND_REWARDS[1]);
    });

    test('payout total excludes round reward on round 1 at difficulty 2+', () => {
      const player = resetPlayerState();
      player.setDifficulty(2);
      player.round = 1;
      player.economy.setBalance(0);
      const payout = player.calculatePayout(0, 0);
      expect(payout.roundReward).toBe(0);
      expect(payout.total).toBe(0);
    });
  });

  describe('Harsh Rations (Level 5+)', () => {
    test('reduces max rerolls by 1 at difficulty 5+', () => {
      const player = resetPlayerState();
      player.setDifficulty(5);
      expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS - 1);

      player.setDifficulty(8);
      expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS - 1);
    });

    test('stacks with profession reroll modifiers', () => {
      const player = resetPlayerState();
      player.applyProfession('farmer');
      player.setDifficulty(5);
      expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS);
    });

    test('never goes below 0 rerolls', () => {
      const player = resetPlayerState();
      player.setDifficulty(5);
      player.permitRerollPenalty = 20;
      player.trailEventModifiers.rerollPenalty = 20;
      expect(player.effectiveRerolls).toBe(0);
    });

    test('difficulty 4 does not reduce rerolls', () => {
      const player = resetPlayerState();
      player.setDifficulty(4);
      expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS);
    });
  });

  describe('player targetMiles integration', () => {
    test('difficulty 1: normal target miles on player state', () => {
      const player = resetPlayerState();
      player.leg = 2;
      player.round = 2;
      expect(
        eq(
          player.targetMiles,
          ceilScore(multiplyScore(getBaseTargetMilesForLeg(2, 1), GAMEPLAY.ROUND_MULTIPLIERS[1])),
        ),
      ).toBe(true);
    });

    test('difficulty 3: rough targets on player state', () => {
      const player = resetPlayerState();
      player.setDifficulty(3);
      player.leg = 2;
      player.round = 1;
      expect(eq(player.targetMiles, getBaseTargetMilesForLeg(2, 3))).toBe(true);
    });

    test('difficulty 6: deadly targets on player state', () => {
      const player = resetPlayerState();
      player.setDifficulty(6);
      player.leg = 3;
      player.round = 1;
      expect(eq(player.targetMiles, getBaseTargetMilesForLeg(3, 6))).toBe(true);
    });
  });
});
