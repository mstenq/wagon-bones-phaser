import { describe, test, expect } from 'bun:test';
import './setup';
import { HandType, PhaseState } from '../types';
import { GAMEPLAY } from '../Constants';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { isFinisherLeg } from '../../data/bosses';
import { setupGame, calculateTestScore, die, diceFromValues, item, setTestDifficulty } from './testHelpers';
import { getSupplyDefById } from '../ConsumablesSystem';
import { multiplyScore, eq, gt, lt, D } from '../scoreMath';
import {
  getBossRoundConfigMods,
  initBossRoundState,
  resetBossRoundState,
  isDiceScoringDisabledByBoss,
  isEquipmentDisabledByBoss,
  canPlayHandType,
  recordBossHandPlayed,
  getBossAdjustedHandStats,
  applyBossTricksterDowngrade,
  applyBossOnDayStart,
  getBossRoundState,
  applyBossAfterRoll,
  isDiceLockedByBoss,
  previewBossScoreSelection,
  isBossScoreForfeit,
  getInspectorRollSizeForDay,
  isBossEquipmentHintsHidden,
  remapEquipmentDisplayOrderAfterReorder,
  remapEquipmentDisplayOrderAfterRemove,
  isBossEquipmentHidden,
} from '../BossEffectsSystem';
import { bossActions, consumableActions, equipmentActions, progressionActions, roundActions } from '../store/actions';
import { runActions } from '../store';
import { getRunState } from '../store/runStore';
import { selectBossForLeg, selectHandStats, selectTargetMiles } from '../store/selectors/runSelectors';

describe('Boss round config', () => {
  test('Marathon: 4x leg base (replaces round 3 2×, not stacked)', () => {
    const { game } = setupGame({ bossId: 'the_marathon', leg: 2 });
    setTestDifficulty(3);
    const legBase = getBaseTargetMilesForLeg(2, 3);
    const targetMiles = selectTargetMiles(getRunState());
    expect(eq(targetMiles, multiplyScore(legBase, 4))).toBe(true);
    game.startRound({ targetMiles });
    expect(eq(game.config.targetMiles, multiplyScore(legBase, 4))).toBe(true);
  });

  test('Finish Line: 6x leg base on final leg', () => {
    const { game } = setupGame({ bossId: 'the_finish_line', leg: 8 });
    const legBase = getBaseTargetMilesForLeg(8, 1);
    const targetMiles = selectTargetMiles(getRunState());
    expect(eq(targetMiles, multiplyScore(legBase, 6))).toBe(true);
    game.startRound({ targetMiles });
    expect(eq(game.config.targetMiles, multiplyScore(legBase, 6))).toBe(true);
  });

  test('Standoff: 1x leg base on showdown (not 2×)', () => {
    setupGame({ bossId: 'the_standoff', leg: 2 });
    setTestDifficulty(3);
    const legBase = getBaseTargetMilesForLeg(2, 3);
    expect(eq(selectTargetMiles(getRunState()), legBase)).toBe(true);
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

  test('disabled dice skip enhancement, sticker retriggers, and per-die miles', () => {
    const scoredDice = [
      die({ value: 6, enhancement: 'bone', sticker: 'red_bullet' }),
      die({ value: 6, enhancement: 'bone' }),
    ];
    const { result: normal } = calculateTestScore({ scoredDice });
    const { result: boss } = calculateTestScore({ bossId: 'the_ghost_town', scoredDice });

    expect(boss.totalValue).toBe(0);
    expect(boss.mult).toBeMult(1);
    expect(normal.totalValue).toBe(18);
    expect(normal.mult).toBeMult(13);

    const milesDieIds = (events: typeof normal.animEvents) =>
      events.filter((e) => e.popupType === 'miles' && e.dieId).map((e) => e.dieId!);
    expect(milesDieIds(boss.animEvents)).toHaveLength(0);
    expect(milesDieIds(normal.animEvents).filter((id) => id === scoredDice[0].id)).toHaveLength(2);
    expect(boss.animEvents.some((e) => e.popupType === 'again')).toBe(false);
  });

  test('golden_spike does not enhance boss-disabled scored dice', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const disabledDie = die({ value: 6 });
      const { result } = calculateTestScore({
        bossId: 'the_ghost_town',
        scoredDice: [disabledDie, die({ value: 5 })],
        equipment: [item('stacked_deck'), item('golden_spike')],
      });
      const scored = result.handResult.scoringDice.find((d) => d.id === disabledDie.id)!;
      expect(scored.enhancement).not.toBe('gold');
      expect(
        result.animEvents.some(
          (e) => e.popupType === 'enhance' && e.dieId === disabledDie.id && e.enhancement === 'gold',
        ),
      ).toBe(false);
    } finally {
      Math.random = original;
    }
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

  test('recordBossHandPlayed locks first hand type', () => {
    setupGame({ bossId: 'the_preacher' });
    resetBossRoundState();
    recordBossHandPlayed(HandType.PAIR);
    expect(getBossRoundState().preacherLockedHand).toBe(HandType.PAIR);
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

  test('recordBossHandPlayed tracks unique hands for rejection', () => {
    setupGame({ bossId: 'the_call_girl' });
    resetBossRoundState();
    recordBossHandPlayed(HandType.PAIR);
    expect(getBossRoundState().handsPlayedThisRound).toEqual([HandType.PAIR]);
    expect(canPlayHandType(HandType.PAIR).allowed).toBe(false);
    expect(canPlayHandType(HandType.HIGH_VALUE).allowed).toBe(true);
  });
});

describe('STRAIGHTS_ONLY: The River', () => {
  test('non-straight preview warns and forfeits', () => {
    setupGame({ bossId: 'the_river' });
    const dice = diceFromValues([6, 6, 4, 3, 2]);
    const preview = previewBossScoreSelection(dice);
    expect(preview.handType).toBe(HandType.PAIR);
    expect(preview.warning).toBe('Only Straights or High Value can score this round.');
    expect(isBossScoreForfeit(preview)).toBe(true);
  });

  test('straight preview has no warning', () => {
    setupGame({ bossId: 'the_river' });
    const dice = diceFromValues([1, 2, 3, 4, 5]);
    const preview = previewBossScoreSelection(dice);
    expect(preview.handType).toBe(HandType.FIVE_STRAIGHT);
    expect(preview.warning).toBeNull();
    expect(isBossScoreForfeit(preview)).toBe(false);
  });

  test('high value preview has no warning', () => {
    setupGame({ bossId: 'the_river' });
    const dice = diceFromValues([12, 9, 7, 5, 3]);
    const preview = previewBossScoreSelection(dice);
    expect(preview.handType).toBe(HandType.HIGH_VALUE);
    expect(preview.warning).toBeNull();
    expect(isBossScoreForfeit(preview)).toBe(false);
  });

  test('forfeit non-straight scores zero miles', () => {
    const { game } = setupGame({ bossId: 'the_river' });
    game.startRound();
    const rolled = diceFromValues([6, 6, 4, 3, 2]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(eq(result.miles, D(0))).toBe(true);
  });

  test('straight scores normally', () => {
    const { result } = calculateTestScore({
      bossId: 'the_river',
      scoredDice: diceFromValues([1, 2, 3, 4, 5]),
    });
    expect(result.handResult.type).toBe(HandType.FIVE_STRAIGHT);
    expect(gt(result.miles, 0)).toBe(true);
  });

  test('high value scores normally', () => {
    const { result } = calculateTestScore({
      bossId: 'the_river',
      scoredDice: diceFromValues([12, 9, 7, 5, 3]),
    });
    expect(result.handResult.type).toBe(HandType.HIGH_VALUE);
    expect(gt(result.miles, 0)).toBe(true);
  });
});

describe('Trail knowledge bosses', () => {
  test('Trickster permanently downgrades on score', () => {
    const { game } = setupGame({ bossId: 'the_trickster' });
    progressionActions.upgradeHandLevel(HandType.PAIR, 2); // level 3
    game.startRound();
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(selectHandStats(getRunState(), HandType.PAIR).level).toBe(2);
    expect(result.handUpgrades?.[0]?.oldLevel).toBe(3);
    expect(result.handUpgrades?.[0]?.newLevel).toBe(2);
  });

  test('Trickster downgrade caps at level 1', () => {
    setupGame({ bossId: 'the_trickster' });
    const info = applyBossTricksterDowngrade(HandType.PAIR);
    expect(info).toBeNull();
    expect(selectHandStats(getRunState(), HandType.PAIR).level).toBe(1);
  });

  test('Bottle halves hand level for the round only', () => {
    setupGame({ bossId: 'the_bottle' });
    progressionActions.upgradeHandLevel(HandType.PAIR, 4); // level 5
    const stats = getBossAdjustedHandStats(HandType.PAIR, selectHandStats(getRunState(), HandType.PAIR));
    expect(stats.level).toBe(2);
    expect(selectHandStats(getRunState(), HandType.PAIR).level).toBe(5);
  });
});

describe('ZERO_MONEY_ON_MOST_PLAYED: Tax Man', () => {
  test('zeros money when playing most-played hand', () => {
    const { game } = setupGame({ bossId: 'the_tax_man', money: 50 });
    progressionActions.recordHandPlayed(HandType.PAIR);
    progressionActions.recordHandPlayed(HandType.PAIR);
    progressionActions.recordHandPlayed(HandType.THREE_OF_A_KIND);
    game.startRound();
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    game.calculateScore();
    expect(getRunState().balance).toBe(0);
  });
});

describe('LOSE_MONEY_PER_PLAYED: Banker', () => {
  test('loses $1 per played die (all selected, not just hand dice)', () => {
    const { game } = setupGame({ bossId: 'the_banker', money: 10 });
    game.startRound();
    // Pair of 6s plus two extra dice played for scoring
    const rolled = diceFromValues([6, 6, 4, 3]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    game.calculateScore();
    expect(getRunState().balance).toBe(6);
  });
});

describe('SHRINK_HAND_PER_DAY: Inspector', () => {
  test('shrinks actual next-day hand size, not just config', () => {
    const { game } = setupGame({
      bossId: 'the_inspector',
      dice: diceFromValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const base = game.config.rollSize;
    expect(getBossRoundState().inspectorBaseRollSize).toBe(base);
    expect(getInspectorRollSizeForDay(1)).toBe(base);
    expect(getInspectorRollSizeForDay(2)).toBe(base - 1);

    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    game.calculateScore();
    const end = game.endDay({ deferEquipmentDestructionAnimation: true });
    expect(end.outcome).toBe('next-day');
    expect(game.state.day).toBe(2);
    expect(game.config.rollSize).toBe(base - 1);
    expect(game.state.hand.length).toBe(base - 1);
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

  test('does not disable the same equipment twice in a row', () => {
    setupGame({
      bossId: 'the_jinx',
      equipment: [item('horseshoe'), item('dynamite'), item('coffee')],
    });
    applyBossOnDayStart(1);
    for (let day = 2; day <= 20; day++) {
      const previous = getBossRoundState().disabledEquipmentIndices[0]!;
      applyBossOnDayStart(day);
      expect(getBossRoundState().disabledEquipmentIndices[0]).not.toBe(previous);
    }
  });

  test('with only one equipment, still disables that equipment each day', () => {
    setupGame({ bossId: 'the_jinx', equipment: [item('horseshoe')] });
    applyBossOnDayStart(1);
    expect(getBossRoundState().disabledEquipmentIndices).toEqual([0]);
    applyBossOnDayStart(2);
    expect(getBossRoundState().disabledEquipmentIndices).toEqual([0]);
  });

  test('does not re-disable the same equipment after reorder', () => {
    setupGame({
      bossId: 'the_jinx',
      equipment: [item('mirror_lake'), item('quick_draw'), item('horseshoe')],
    });
    applyBossOnDayStart(1);
    const disabledIndex = getBossRoundState().disabledEquipmentIndices[0]!;
    equipmentActions.reorderEquipment(disabledIndex, 2);
    expect(getBossRoundState().disabledEquipmentIndices[0]).toBe(2);
    applyBossOnDayStart(2);
    expect(getBossRoundState().disabledEquipmentIndices[0]).not.toBe(2);
  });

  test('disabled equipment re-enabled when boss round is not active', () => {
    setupGame({ bossId: 'the_jinx', equipment: [item('horseshoe')] });
    getBossRoundState().disabledEquipmentIndices = [0];
    runActions.patch({ round: 1 });
    expect(isEquipmentDisabledByBoss(0)).toBe(false);
  });

  test('disabled equipment skipped in scoring', () => {
    const horseshoe = item('horseshoe');
    const { game } = setupGame({
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
  });

  test('disabled mirror lake does not copy quick draw retriggers', () => {
    const { game } = setupGame({
      bossId: 'the_jinx',
      equipment: [item('mirror_lake'), item('quick_draw')],
    });
    game.startRound();
    getBossRoundState().disabledEquipmentIndices = [0];

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceFromValues([5, 5]);
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    const disabledResult = game.calculateScore()!;

    const { result: quickDrawOnly } = calculateTestScore({
      scoredDice: diceFromValues([5, 5]),
      equipment: [item('quick_draw')],
    });
    const { result: bothEnabled } = calculateTestScore({
      scoredDice: diceFromValues([5, 5]),
      equipment: [item('mirror_lake'), item('quick_draw')],
    });

    // Quick Draw only: first die ×3, second die ×1 → 20. With Mirror Lake copy: 30.
    expect(disabledResult.totalValue).toBe(20);
    expect(quickDrawOnly.totalValue).toBe(20);
    expect(bothEnabled.totalValue).toBe(30);
  });

  test('remaps disabled indices when equipment is reordered', () => {
    setupGame({
      bossId: 'the_jinx',
      equipment: [item('mirror_lake'), item('quick_draw'), item('horseshoe')],
    });
    getBossRoundState().disabledEquipmentIndices = [0];
    equipmentActions.reorderEquipment(0, 2);
    expect(isEquipmentDisabledByBoss(2)).toBe(true);
    expect(isEquipmentDisabledByBoss(0)).toBe(false);
  });
});

describe('LOCK_RANDOM_DICE: The Bounty', () => {
  test('applyBossAfterRoll marks one rolled die as locked', () => {
    setupGame({ bossId: 'the_bounty' });
    resetBossRoundState();
    initBossRoundState();
    const rolled = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    applyBossAfterRoll(rolled);
    const locked = getBossRoundState().lockedDiceIds;
    expect(locked).toHaveLength(1);
    expect(rolled.some((d) => d.id === locked[0])).toBe(true);
    expect(isDiceLockedByBoss(locked[0]!)).toBe(true);
  });

  test('validateScoreSelection rejects hands that omit the bounty die', () => {
    const rolled = diceFromValues([6, 6, 4, 3, 2, 1, 7, 8]);
    const { game } = setupGame({ bossId: 'the_bounty', dice: rolled });
    game.startRound();
    roundActions.selectForRoll(rolled.map((d) => d.id));
    const lockedId = getBossRoundState().lockedDiceIds[0]!;
    const withoutBounty = rolled
      .filter((d) => d.id !== lockedId)
      .slice(0, 2)
      .map((d) => d.id);
    const check = game.validateScoreSelection(withoutBounty);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('Marked die must be played');
    const withBounty = [...withoutBounty, lockedId];
    expect(game.validateScoreSelection(withBounty).allowed).toBe(true);
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
    const { game } = setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe'), item('dynamite')],
    });
    game.startRound();
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);

    expect(equipmentActions.sellEquipment(0)).toBe(true);
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
    setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe')],
    });
    const bless = getSupplyDefById('bless');
    expect(bless).toBeDefined();
    expect(consumableActions.addConsumable(bless!)).toBe(true);
    expect(consumableActions.sellConsumable(0)).toBe(true);
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
  });

  test('destroying equipment does not lift the Bank Lien', () => {
    setupGame({
      bossId: 'the_bank_lien',
      equipment: [item('horseshoe')],
    });
    expect(equipmentActions.destroyEquipment(0)).toBe(true);
    expect(getBossRoundState().diceScoringReenabledBySell).toBe(false);
    expect(isDiceScoringDisabledByBoss(die({ value: 6 }))).toBe(true);
  });
});

describe('SINGLE_HAND_TYPE: Preacher integration', () => {
  test('forfeit wrong hand scores zero and does not change lock', () => {
    const { game } = setupGame({
      bossId: 'the_preacher',
      dice: diceFromValues([6, 6, 6, 4, 3, 2, 1, 7]),
    });
    game.startRound();
    const pairDice = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = pairDice;
    game.selectForScore(pairDice.map((d) => d.id));
    const first = game.calculateScore()!;
    expect(gt(first.miles, 0)).toBe(true);
    expect(getBossRoundState().preacherLockedHand).toBe(HandType.PAIR);

    game.endDay({ deferEquipmentDestructionAnimation: true });

    const tripleDice = diceFromValues([6, 6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = tripleDice;
    const preview = previewBossScoreSelection(tripleDice);
    expect(preview.forfeit).toBe(true);
    game.selectForScore(tripleDice.map((d) => d.id));
    const forfeit = game.calculateScore()!;
    expect(eq(forfeit.miles, D(0))).toBe(true);
    expect(getBossRoundState().preacherLockedHand).toBe(HandType.PAIR);
  });
});

describe('UNIQUE_HANDS_ONLY: Call Girl score warning', () => {
  test('validateScoreSelection allows duplicate with warning', () => {
    const { game } = setupGame({ bossId: 'the_call_girl' });
    game.startRound();
    getBossRoundState().handsPlayedThisRound = [HandType.PAIR];
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    const check = game.validateScoreSelection(rolled.map((d) => d.id));
    expect(check.allowed).toBe(true);
    expect(check.warning).toContain('already been played');
  });

  test('forfeit duplicate hand scores zero', () => {
    const { game } = setupGame({ bossId: 'the_call_girl' });
    game.startRound();
    recordBossHandPlayed(HandType.PAIR);
    const rolled = diceFromValues([6, 6]);
    game.state.phase = 'ROLL';
    game.state.rolledDice = rolled;
    game.selectForScore(rolled.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(eq(result.miles, D(0))).toBe(true);
    expect(getBossRoundState().handsPlayedThisRound).toEqual([HandType.PAIR]);
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
    setupGame();
    const run = getRunState();
    const ids = Array.from({ length: 8 }, (_, i) => selectBossForLeg(run, i + 1)?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('finisher legs only assign finisher bosses', () => {
    setupGame();
    bossActions.assignBosses();
    const run = getRunState();
    for (const leg of [8, 16, 24, 32]) {
      expect(isFinisherLeg(leg)).toBe(true);
      const boss = selectBossForLeg(run, leg);
      expect(boss?.minimumLeg ?? 1).toBeGreaterThanOrEqual(8);
    }
  });

  test('assignBosses covers all endless legs', () => {
    setupGame();
    bossActions.assignBosses();
    expect(getRunState().bossAssignmentIds.length).toBe(GAMEPLAY.MAX_LEGS);
  });
});

describe('HIDE_EQUIPMENT: Land Slide', () => {
  test('shuffles underlying equipment order and keeps hints hidden', () => {
    setupGame({
      bossId: 'the_land_slide',
      equipment: [item('express_train'), item('deadeye'), item('wild_card'), item('worn_deck')],
    });
    const before = getRunState().equipment.map((e) => e.defId);
    resetBossRoundState();
    initBossRoundState();
    const state = getBossRoundState();
    const after = getRunState().equipment.map((e) => e.defId);
    expect(after).not.toEqual(before);
    expect(state.equipmentDisplayOrder).toBeNull();
    expect(isBossEquipmentHintsHidden()).toBe(true);
    expect(state.equipmentHidden).toBe(true);
    expect(isBossEquipmentHidden()).toBe(true);
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

  test('does not keep equipment hidden outside active Land Slide boss round', () => {
    setupGame({
      bossId: 'the_land_slide',
      equipment: [item('horseshoe')],
    });
    resetBossRoundState();
    initBossRoundState();
    expect(isBossEquipmentHidden()).toBe(true);
    runActions.patch({ round: 1 });
    expect(isBossEquipmentHidden()).toBe(false);
  });

  test('scores using shuffled display order', () => {
    const { game } = setupGame({
      bossId: 'the_land_slide',
      equipment: [item('quick_draw'), item('mirror_lake')],
    });
    game.startRound();

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceFromValues([5, 5]);
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    const shuffledOrderResult = game.calculateScore()!;

    const order = getRunState().equipment.map((e) => e.defId);
    const expectedTotal = order[0] === 'quick_draw' ? 20 : 30;
    expect(shuffledOrderResult.totalValue).toBe(expectedTotal);
  });
});

describe('Boss assignment minimumLeg', () => {
  test('leg 1 boss pool excludes high minimumLeg bosses', () => {
    setupGame({ leg: 1 });
    bossActions.ensureBossAssignments();
    const boss = selectBossForLeg(getRunState(), 1);
    expect(boss).not.toBeNull();
    expect(boss!.minimumLeg ?? 1).toBeLessThanOrEqual(1);
  });
});

describe('getBossRoundConfigMods without boss', () => {
  test('returns defaults on non-boss round', () => {
    setupGame();
    runActions.patch({ round: 1 });
    expect(getBossRoundConfigMods().targetMilesMultiplier).toBe(1);
    expect(getBossRoundConfigMods().setMaxRerolls).toBeNull();
  });
});
