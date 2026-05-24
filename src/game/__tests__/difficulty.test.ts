import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { computeTargetMiles, computeRoundReward, computePayoutBreakdown } from '../runProgression';
import { GAMEPLAY } from '../Constants';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { resetTestRun, setTestDifficulty } from './testHelpers';
import { ceilScore, multiplyScore, eq } from '../scoreMath';
import { getRunState, runActions, setupActions } from '../store';
import { selectEffectiveRerolls, selectRoundReward, selectTargetMiles } from '../store/selectors/runSelectors';

beforeEach(() => {
  resetTestRun();
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
  });

  describe('Round Rewards', () => {
    test('round 1 gives no reward at difficulty 2+', () => {
      expect(computeRoundReward(1, 2)).toBe(0);
      expect(computeRoundReward(1, 5)).toBe(0);
    });

    test('round 2+ gives normal reward at difficulty 2+', () => {
      expect(computeRoundReward(2, 2)).toBe(GAMEPLAY.ROUND_REWARDS[1]);
      expect(computeRoundReward(3, 2)).toBe(GAMEPLAY.ROUND_REWARDS[2]);
      expect(computeRoundReward(2, 7)).toBe(GAMEPLAY.ROUND_REWARDS[1]);
    });

    test('round 1 gives normal reward at difficulty 1', () => {
      expect(computeRoundReward(1, 1)).toBe(GAMEPLAY.ROUND_REWARDS[0]);
    });

    test('run roundReward reflects Thin Supplies on round 1', () => {
      setTestDifficulty(2);
      runActions.patch({ round: 1 });
      expect(selectRoundReward(getRunState())).toBe(0);
      runActions.patch({ round: 2 });
      expect(selectRoundReward(getRunState())).toBe(GAMEPLAY.ROUND_REWARDS[1]);
    });

    test('payout total excludes round reward on round 1 at difficulty 2+', () => {
      setTestDifficulty(2);
      runActions.patch({ round: 1, balance: 0 });
      const payout = computePayoutBreakdown(getRunState(), 0, 0);
      expect(payout.roundReward).toBe(0);
      expect(payout.total).toBe(0);
    });
  });

  describe('Harsh Rations (Level 5+)', () => {
    test('reduces max rerolls by 1 at difficulty 5+', () => {
      setTestDifficulty(5);
      expect(selectEffectiveRerolls(getRunState())).toBe(GAMEPLAY.MAX_REROLLS - 1);

      setTestDifficulty(8);
      expect(selectEffectiveRerolls(getRunState())).toBe(GAMEPLAY.MAX_REROLLS - 1);
    });

    test('stacks with profession reroll modifiers', () => {
      resetTestRun();
      setupActions.applyProfession('farmer');
      setTestDifficulty(5);
      expect(selectEffectiveRerolls(getRunState())).toBe(GAMEPLAY.MAX_REROLLS);
    });

    test('never goes below 0 rerolls', () => {
      setTestDifficulty(5);
      runActions.patch({
        permitRerollPenalty: 20,
        trailEventModifiers: {
          ...getRunState().trailEventModifiers,
          rerollPenalty: 20,
        },
      });
      expect(selectEffectiveRerolls(getRunState())).toBe(0);
    });

    test('difficulty 4 does not reduce rerolls', () => {
      setTestDifficulty(4);
      expect(selectEffectiveRerolls(getRunState())).toBe(GAMEPLAY.MAX_REROLLS);
    });
  });

  describe('run targetMiles integration', () => {
    test('difficulty 1: normal target miles', () => {
      runActions.patch({ leg: 2, round: 2 });
      expect(
        eq(
          selectTargetMiles(getRunState()),
          ceilScore(multiplyScore(getBaseTargetMilesForLeg(2, 1), GAMEPLAY.ROUND_MULTIPLIERS[1])),
        ),
      ).toBe(true);
    });

    test('difficulty 3: rough targets', () => {
      setTestDifficulty(3);
      runActions.patch({ leg: 2, round: 1 });
      expect(eq(selectTargetMiles(getRunState()), getBaseTargetMilesForLeg(2, 3))).toBe(true);
    });

    test('difficulty 6: deadly targets', () => {
      setTestDifficulty(6);
      runActions.patch({ leg: 3, round: 1 });
      expect(eq(selectTargetMiles(getRunState()), getBaseTargetMilesForLeg(3, 6))).toBe(true);
    });
  });
});
