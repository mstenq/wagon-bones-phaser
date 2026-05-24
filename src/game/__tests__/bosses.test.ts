import { describe, test, expect } from 'bun:test';
import './setup';
import { HandType, PhaseState } from '../types';
import { GAMEPLAY } from '../Constants';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { isFinisherLeg } from '../../data/bosses';
import { setupGame, calculateTestScore, die, diceFromValues, item, setTestDifficulty } from './testHelpers';
import { createConsumableInstance, getSupplyDefById } from '../ConsumablesSystem';
import { multiplyScore, eq, gt, lt } from '../scoreMath';
import {
  getBossRoundConfigMods,
  initBossRoundState,
  resetBossRoundState,
  isDiceScoringDisabledByBoss,
  isEquipmentDisabledByBoss,
  canPlayHandType,
  getBossAdjustedHandStats,
  applyBossHandRestriction,
  applyBossAfterScore,
  applyBossOnDayStart,
  getBossRoundState,
  isBossEquipmentHintsHidden,
  revealLandSlideHints,
  remapEquipmentDisplayOrderAfterReorder,
  remapEquipmentDisplayOrderAfterRemove,
} from '../BossEffectsSystem';
import { detectBestHand } from '../DiceSystem';

describe('Boss round config', () => {
  test('Marathon: 4x leg base (replaces round 3 2×, not stacked)', () => {
    const { game, player } = setupGame({ bossId: 'the_marathon', leg: 2 });
    setTestDifficulty(3);
    const legBase = getBaseTargetMilesForLeg(2, 3);
    expect(eq(player.targetMiles, multiplyScore(legBase, 4))).toBe(true);
    game.startRound({ targetMiles: player.targetMiles });
    expect(eq(game.config.targetMiles, multiplyScore(legBase, 4))).toBe(true);
  });

  test('Finish Line: 6x leg base on final leg', () => {
    const { game, player } = setupGame({ bossId: 'the_finish_line', leg: 8 });
    const legBase = getBaseTargetMilesForLeg(8, 1);
    expect(eq(player.targetMiles, multiplyScore(legBase, 6))).toBe(true);
    game.startRound({ targetMiles: player.targetMiles });
    expect(eq(game.config.targetMiles, multiplyScore(legBase, 6))).toBe(true);
  });

  test('Standoff: 1x leg base on showdown (not 2×)', () => {
    const { player } = setupGame({ bossId: 'the_standoff', leg: 2 });
    setTestDifficulty(3);
    const legBase = getBaseTargetMilesForLeg(2, 3);
    expect(eq(player.targetMiles, legBase)).toBe(true);
  });

  test('Chain Gang: 0 rerolls', () => {
    const { game } = setupGame({ bossId: 'the_chain_gang' });
    game.startRound();
    expect(game.config.maxRerolls).toBe(0);
  });

  test('Standoff: 1 day only', () => {
    const { game } = setupGame({ bossId: 'the_standoff' });
    game.startRound();
    expect(game.config.maxDays).toBe(1);
  });
});

describe('DISABLE_VALUES: Ghost Town / Undertaker', () => {
  test('Ghost Town disables even dice scoring value', () => {
    setupGame({ bossId: 'the_ghost_town' });
    resetBossRoundState();
    initBossRoundState();
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
    expect(isDiceScoringDisabledByBoss(die({ value: 5 }))).toBe(false);

    const { result } = calculateTestScore({
      bossId: 'the_ghost_town',
      scoredDice: diceFromValues([6, 6]),
    });
    // Pair uses both sixes for hand detection; even dice contribute no pip value
    expect(result.handResult.type).toBe(HandType.PAIR);
    expect(result.totalValue).toBe(0);
  });

  test('Undertaker disables odd dice', () => {
    setupGame({ bossId: 'the_undertaker' });
    resetBossRoundState();
    initBossRoundState();
    expect(isDiceScoringDisabledByBoss(die({ value: 5 }))).toBe(true);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(false);
  });

  test('stone dice are not disabled by Ghost Town or Undertaker', () => {
    const stone = die({ value: 0, enhancement: 'stone' });

    setupGame({ bossId: 'the_ghost_town' });
    resetBossRoundState();
    initBossRoundState();
    expect(isDiceScoringDisabledByBoss(stone)).toBe(false);

    setupGame({ bossId: 'the_undertaker' });
    resetBossRoundState();
    initBossRoundState();
    expect(isDiceScoringDisabledByBoss(stone)).toBe(false);
  });

  test('Ghost Town still scores stone dice miles', () => {
    const { result } = calculateTestScore({
      bossId: 'the_ghost_town',
      scoredDice: [die({ value: 6 }), die({ value: 6 }), die({ value: 0, enhancement: 'stone' })],
    });
    expect(result.handResult.type).toBe(HandType.PAIR);
    expect(result.totalValue).toBe(50);
  });
});

describe('SINGLE_HAND_TYPE: Preacher', () => {
  test('locks to first hand played', () => {
    setupGame({ bossId: 'the_preacher' });
    resetBossRoundState();
    const state = getBossRoundState();
    expect(canPlayHandType(HandType.PAIR).allowed).toBe(true);
    state.preacherLockedHand = HandType.PAIR;
    expect(canPlayHandType(HandType.PAIR).allowed).toBe(true);
    expect(canPlayHandType(HandType.THREE_OF_A_KIND).allowed).toBe(false);
  });
});

describe('UNIQUE_HANDS_ONLY: Call Girl', () => {
  test('rejects repeated hand type', () => {
    setupGame({ bossId: 'the_call_girl' });
    resetBossRoundState();
    getBossRoundState().handsPlayedThisRound = [HandType.PAIR];
    expect(canPlayHandType(HandType.PAIR).allowed).toBe(false);
    expect(canPlayHandType(HandType.HIGH_VALUE).allowed).toBe(true);
  });
});

describe('STRAIGHTS_ONLY: The River', () => {
  test('non-straight downgrades to high card', () => {
    setupGame({ bossId: 'the_river' });
    const dice = diceFromValues([6, 6, 4, 3, 2]);
    const pair = detectBestHand(dice);
    const restricted = applyBossHandRestriction(pair, dice);
    expect(restricted.type).toBe(HandType.HIGH_VALUE);
    expect(restricted.scoringDice.length).toBe(1);
    expect(restricted.scoringDice[0].value).toBe(6);
  });

  test('straight hand unchanged', () => {
    setupGame({ bossId: 'the_river' });
    const dice = diceFromValues([1, 2, 3, 4, 5]);
    const straight = detectBestHand(dice);
    const restricted = applyBossHandRestriction(straight, dice);
    expect(restricted.type).toBe(HandType.FIVE_STRAIGHT);
  });
});

describe('Trail knowledge bosses', () => {
  test('Trickster reduces effective hand level', () => {
    const { player } = setupGame({ bossId: 'the_trickster' });
    player.upgradeHandLevel(HandType.PAIR, 2); // level 3
    const stats = getBossAdjustedHandStats(HandType.PAIR, player.getHandStats(HandType.PAIR));
    expect(stats.level).toBe(2);
  });

  test('Bottle halves hand level', () => {
    const { player } = setupGame({ bossId: 'the_bottle' });
    player.upgradeHandLevel(HandType.PAIR, 4); // level 5
    const stats = getBossAdjustedHandStats(HandType.PAIR, player.getHandStats(HandType.PAIR));
    expect(stats.level).toBe(2);
  });

  test('Trickster caps at level 1', () => {
    const { player } = setupGame({ bossId: 'the_trickster' });
    const stats = getBossAdjustedHandStats(HandType.PAIR, player.getHandStats(HandType.PAIR));
    expect(stats.level).toBe(1);
  });
});

describe('ZERO_MONEY_ON_MOST_PLAYED: Tax Man', () => {
  test('zeros money when playing most-played hand', () => {
    const { game, player } = setupGame({ bossId: 'the_tax_man', money: 50 });
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.THREE_OF_A_KIND);
    game.startRound();
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    game.calculateScore();
    expect(player.economy.balance).toBe(0);
  });
});

describe('LOSE_MONEY_PER_PLAYED: Banker', () => {
  test('loses $1 per played die (all selected, not just hand dice)', () => {
    const { game, player } = setupGame({ bossId: 'the_banker', money: 10 });
    game.startRound();
    // Pair of 6s plus two extra dice played for scoring
    const rolled = diceFromValues([6, 6, 4, 3]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    game.calculateScore();
    expect(player.economy.balance).toBe(6);
  });
});

describe('SPEND_RANDOM_AFTER_SCORE: Inspector', () => {
  test('spends dice from available pool after score', () => {
    const { game, player } = setupGame({
      bossId: 'the_inspector',
      dice: diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    game.startRound();
    const before = player.availableDice.length;
    applyBossAfterScore();
    expect(player.spentDiceIds.size).toBeGreaterThan(0);
    expect(player.availableDice.length).toBeLessThan(before);
  });
});

describe('DISABLE_RANDOM_EQUIPMENT: Jinx', () => {
  test('disables only one item per day and replaces previous day disable', () => {
    setupGame({
      bossId: 'the_jinx',
      equipment: [item('horseshoe'), item('dynamite'), item('coffee')],
    });
    applyBossOnDayStart(1);
    expect(getBossRoundState().disabledEquipmentIndices).toHaveLength(1);
    applyBossOnDayStart(2);
    expect(getBossRoundState().disabledEquipmentIndices).toHaveLength(1);
    applyBossOnDayStart(3);
    expect(getBossRoundState().disabledEquipmentIndices).toHaveLength(1);
  });

  test('disabled equipment re-enabled when boss round is not active', () => {
    const { player } = setupGame({ bossId: 'the_jinx', equipment: [item('horseshoe')] });
    getBossRoundState().disabledEquipmentIndices = [0];
    player.round = 1;
    expect(isEquipmentDisabledByBoss(0)).toBe(false);
  });

  test('disabled equipment skipped in scoring', () => {
    const horseshoe = item('horseshoe');
    const { game, player } = setupGame({
      bossId: 'the_jinx',
      equipment: [horseshoe],
    });
    game.startRound();
    getBossRoundState().disabledEquipmentIndices = [0];
    expect(isEquipmentDisabledByBoss(0)).toBe(true);

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceFromValues([6, 6]);
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    const disabledResult = game.calculateScore()!;

    const { result: normal } = calculateTestScore({
      scoredDice: diceFromValues([6, 6]),
      equipment: [horseshoe],
    });
    expect(lt(disabledResult.mult, normal.mult)).toBe(true);
    void player;
  });
});

describe('DISABLE_ALL_DICE: Bank Lien', () => {
  test('disables all dice scoring but equipment still scores', () => {
    setupGame({ bossId: 'the_bank_lien' });
    resetBossRoundState();
    initBossRoundState();
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
    expect(isDiceScoringDisabledByBoss(die({ value: 5 }))).toBe(true);

    const { result } = calculateTestScore({
      bossId: 'the_bank_lien',
      scoredDice: diceFromValues([6, 6]),
      equipment: [item('horseshoe')],
    });
    expect(result.handResult.type).toBe(HandType.PAIR);
    expect(result.totalValue).toBe(0);
    expect(gt(result.mult, 1)).toBe(true);
  });

  test('selling equipment re-enables dice scoring for the rest of the round', () => {
    const { game, player } = setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe'), item('dynamite')],
    });
    game.startRound();
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);

    expect(player.sellEquipment(0)).toBe(true);
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(true);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(false);

    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.state.selectedForRoll = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    const result = game.calculateScore();
    expect(result).not.toBeNull();
    expect(result!.handResult.type).toBe(HandType.PAIR);
    expect(result!.totalValue).toBeGreaterThan(0);
  });

  test('selling a consumable does not lift the Bank Lien', () => {
    const { player } = setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe')],
    });
    player.consumables.push(createConsumableInstance(getSupplyDefById('bless')!));
    expect(player.sellConsumable(0)).toBe(true);
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
  });

  test('destroying equipment does not lift the Bank Lien', () => {
    const { player } = setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe')],
    });
    expect(player.destroyEquipment(0)).toBe(true);
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
  });
});

describe('UNIQUE_HANDS_ONLY: Call Girl score rejection', () => {
  test('validateScoreSelection rejects duplicate hand', () => {
    const { game } = setupGame({ bossId: 'the_call_girl' });
    game.startRound();
    getBossRoundState().handsPlayedThisRound = [HandType.PAIR];
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    const check = game.validateScoreSelection(rolled.map((d) => d.id));
    expect(check.allowed).toBe(false);
  });

  test('cancelScore returns to ROLL phase', () => {
    const { game } = setupGame({ bossId: 'the_call_girl' });
    game.startRound();
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    expect(game.state.phase).toBe('SCORE');
    game.cancelScore();
    expect(game.state.phase).toBe('ROLL');
  });
});

describe('Boss assignment uniqueness', () => {
  test('legs 1-8 have no duplicate bosses', () => {
    const player = setupGame().player;
    const ids = Array.from({ length: 8 }, (_, i) => player.getBossForLeg(i + 1)?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('finisher legs only assign finisher bosses', () => {
    const player = setupGame().player;
    player.assignBosses();
    for (const leg of [8, 16, 24, 32]) {
      expect(isFinisherLeg(leg)).toBe(true);
      const boss = player.getBossForLeg(leg);
      expect((boss?.minimumLeg ?? 1)).toBeGreaterThanOrEqual(8);
    }
  });

  test('assignBosses covers all endless legs', () => {
    const player = setupGame().player;
    player.assignBosses();
    expect(player.getBossAssignmentIds().length).toBe(GAMEPLAY.MAX_LEGS);
  });
});

describe('HIDE_EQUIPMENT: Land Slide', () => {
  test('shuffles display order and hides hints until reveal', () => {
    setupGame({
      bossId: 'the_land_slide',
      equipment: [item('horseshoe'), item('dynamite')],
    });
    resetBossRoundState();
    initBossRoundState();
    const state = getBossRoundState();
    expect(state.equipmentDisplayOrder).not.toBeNull();
    expect(state.equipmentDisplayOrder!.length).toBe(2);
    expect([...state.equipmentDisplayOrder!].sort()).toEqual([0, 1]);
    expect(isBossEquipmentHintsHidden()).toBe(true);
    revealLandSlideHints();
    expect(isBossEquipmentHintsHidden()).toBe(false);
    expect(state.equipmentHidden).toBe(true);
  });

  test('remaps display order when equipment is reordered or sold', () => {
    setupGame({
      bossId: 'the_land_slide',
      equipment: [item('horseshoe'), item('dynamite'), item('coffee')],
    });
    resetBossRoundState();
    initBossRoundState();
    const state = getBossRoundState();
    state.equipmentDisplayOrder = [2, 0, 1];

    remapEquipmentDisplayOrderAfterReorder(0, 2);
    expect(state.equipmentDisplayOrder).toEqual([1, 2, 0]);

    remapEquipmentDisplayOrderAfterRemove(1);
    expect(state.equipmentDisplayOrder).toEqual([1, 0]);
  });
});

describe('Boss assignment minimumLeg', () => {
  test('leg 1 boss pool excludes high minimumLeg bosses', () => {
    const { player } = setupGame({ leg: 1 });
    const boss = player.getBossForLeg(1);
    expect(boss).not.toBeNull();
    expect(boss!.minimumLeg ?? 1).toBeLessThanOrEqual(1);
  });
});

describe('getBossRoundConfigMods without boss', () => {
  test('returns defaults on non-boss round', () => {
    const { player } = setupGame();
    player.round = 1;
    expect(getBossRoundConfigMods().targetMilesMultiplier).toBe(1);
    expect(getBossRoundConfigMods().setMaxRerolls).toBeNull();
  });
});
