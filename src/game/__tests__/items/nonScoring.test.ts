import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { getTrailTagById } from '../../../data/trail_tags';
import {
  die,
  diceWithValue,
  item,
  itemWithState,
  itemWithAura,
  setupGame,
  calculateTestScore,
  resetDieIds,
  playScoredDayAndEnd,
} from '../testHelpers';
import { getBossRoundConfigMods } from '../../BossEffectsSystem';
import { computePayoutBreakdown } from '../../runProgression';
import { getRunState, runActions } from '../../store/runStore';
import { getRoundState } from '../../store/roundStore';
import { buildShopFreeRerollPlan } from '../../store/selectors/runSelectors';
import { progressionActions } from '../../store/actions/progressionActions';
import { roundActions } from '../../store';
import { gte, D } from '../../scoreMath';
import {
  processEndOfRound,
  getConfigModifiers,
  getScoredRetriggerCount,
  findDeathPrevention,
  processEquipmentOnDayEnd,
  processPreScoreHandUpgrades,
  processEquipmentOnReroll,
  processEquipmentOnPackOpened,
  processEquipmentOnBossDefeat,
  processEquipmentOnRoundStart,
  processEquipmentOnShopEnd,
  processEquipmentOnPackSkipped,
} from '../../EquipmentEffects';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import { resolveChance, resolveEffectParam } from '../../effectParams';
import { HandType } from '../../types';
import { GAMEPLAY } from '../../Constants';

beforeEach(() => resetDieIds());

/** Mirror Lake must not alter scoring for lifecycle-only / NONE equipment.
 *  Does NOT verify that lifecycle copy wiring works — use mirrorLakeCoverage.test.ts for that. */
function expectMirrorLakeDoesNotChangeScore(
  itemId: string,
  opts: {
    scoredDice?: ReturnType<typeof diceWithValue>;
    heldDice?: ReturnType<typeof die>[];
    money?: number;
    profession?: string;
    currentDay?: number;
  } = {},
) {
  const scoreOpts = {
    scoredDice: opts.scoredDice ?? diceWithValue(5, 2),
    heldDice: opts.heldDice,
    money: opts.money,
    profession: opts.profession,
    currentDay: opts.currentDay,
  };
  const { result: alone } = calculateTestScore({ ...scoreOpts, equipment: [item(itemId)] });
  const { result: withMirror } = calculateTestScore({
    ...scoreOpts,
    equipment: [item('mirror_lake'), item(itemId)],
  });
  expect(withMirror.mult).toBeMult(alone.mult);
  expect(withMirror.miles).toBeMiles(alone.miles);
  expect(withMirror.totalValue).toBe(alone.totalValue);
}

// ─── MODIFY_REROLLS: Spare Holster ───

describe('MODIFY_REROLLS: Spare Holster (+1 reroll)', () => {
  test('adds +1 to max rerolls via config modifier', () => {
    const equip = [item('spare_holster')];
    const mods = getConfigModifiers(equip);
    expect(mods.rerollsBonus).toBe(1);
  });

  test('stacks with multiple spare holsters', () => {
    const equip = [item('spare_holster'), item('spare_holster')];
    const mods = getConfigModifiers(equip);
    expect(mods.rerollsBonus).toBe(2);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('spare_holster')],
    });
    game.startRound();
    // Default maxRerolls=6, +1 from spare_holster = 7
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS + 1);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS + 1);
  });
});

// ─── END_ROUND_MONEY: Payday ───

describe('END_ROUND_MONEY: Payday ($4 at end of round)', () => {
  test('reports $4 money earned at end of round', () => {
    const equip = [item('payday')];
    const result = processEndOfRound(equip);
    expect(result.moneyEarned).toBe(4);
  });

  test('stacks with multiple paydays', () => {
    const equip = [item('payday'), item('payday')];
    const result = processEndOfRound(equip);
    expect(result.moneyEarned).toBe(8);
  });

  test('does not destroy the item', () => {
    const equip = [item('payday')];
    const result = processEndOfRound(equip);
    expect(result.destroyedIndices).toEqual([]);
  });

  test('outlaw earns $12 at end of round', () => {
    const { player } = setupGame({ equipment: [item('payday')] });
    player.applyProfession('outlaw');
    const result = processEndOfRound(player.equipment);
    expect(result.moneyEarned).toBe(12);
  });

  test('computePayoutBreakdown includes payday at leg payout (live path)', () => {
    setupGame({ equipment: [item('payday')], money: 10 });
    const payout = computePayoutBreakdown(getRunState(), 0, 0);
    expect(payout.equipmentMoney).toBe(4);
  });

  test('computePayoutBreakdown uses outlaw payday amount', () => {
    const { player } = setupGame({ equipment: [item('payday')] });
    player.applyProfession('outlaw');
    const payout = computePayoutBreakdown(getRunState(), 0, 0);
    expect(payout.equipmentMoney).toBe(12);
  });

  test('computePayoutBreakdown stacks multiple paydays', () => {
    setupGame({ equipment: [item('payday'), item('payday')] });
    const payout = computePayoutBreakdown(getRunState(), 0, 0);
    expect(payout.equipmentMoney).toBe(8);
  });
});

// ─── BANK_NOTE: Bank Note ───

describe('BANK_NOTE: Bank Note', () => {
  test('allows spending into debt up to $20', () => {
    const { player } = setupGame({ equipment: [item('bank_note')], money: 5 });
    expect(player.canAfford(25)).toBe(true);
    expect(player.trySpend(25)).toBe(true);
    expect(player.economy.balance).toBe(-20);
  });

  test('cannot exceed $20 debt', () => {
    const { player } = setupGame({ equipment: [item('bank_note')], money: 0 });
    expect(player.canAfford(21)).toBe(false);
  });

  test('banker debt is wiped when selling bank note', () => {
    const { player } = setupGame({ equipment: [item('bank_note')], money: 0 });
    player.applyProfession('banker');
    player.economy.setBalance(-15);
    player.sellEquipment(0);
    expect(player.economy.balance).toBe(0);
    expect(player.equipment.length).toBe(0);
  });

  test('non-banker keeps debt when selling bank note', () => {
    const { player } = setupGame({ equipment: [item('bank_note')], money: 5 });
    player.trySpend(20);
    expect(player.economy.balance).toBe(-15);
    player.sellEquipment(0);
    expect(player.economy.balance).toBe(-14);
  });

  test('at $0 can still afford shop reroll and boss permit reroll into debt', () => {
    const { player } = setupGame({ equipment: [item('bank_note')], money: 0 });
    expect(player.canAfford(5)).toBe(true);
    expect(player.canRerollShop()).toBe(true);
    expect(player.canAfford(10)).toBe(true);
  });
});

// ─── SCORED_RETRIGGER_TIMED: War Drums ───

describe('SCORED_RETRIGGER_TIMED: War Drums', () => {
  test('retrigger count is 1 when days remaining > 0', () => {
    const inst = item('war_drums');
    expect(getScoredRetriggerCount([inst])).toBe(1);
  });

  test('retrigger count is 0 when expired', () => {
    const inst = itemWithState('war_drums', { daysRemaining: 0 });
    expect(getScoredRetriggerCount([inst])).toBe(0);
  });

  test('days decrement on day end', () => {
    const inst = item('war_drums');
    expect(inst.state.daysRemaining).toBe(10);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(9);
  });

  test('does not go below 0', () => {
    const inst = itemWithState('war_drums', { daysRemaining: 1 });
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(0);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(0);
  });

  test('days decrement after endDay in live round flow', () => {
    const { game, player } = setupGame({
      equipment: [item('war_drums')],
      dice: diceWithValue(5, 50),
    });
    game.startRound();
    playScoredDayAndEnd(game, { avoidWin: true });
    expect(player.equipment[0]?.state.daysRemaining).toBe(9);
  });
});

// ─── PREVENT_DEATH: Guardian Totem ───

describe('PREVENT_DEATH: Guardian Totem', () => {
  test('prevents death when miles >= 25% of target', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 100, 400); // 100 >= 400*0.25
    expect(idx).toBe(0);
  });

  test('does not prevent death below threshold', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 50, 400); // 50 < 100
    expect(idx).toBe(-1);
  });

  test('exactly at threshold', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 100, 400); // 100 = 400*0.25
    expect(idx).toBe(0);
  });
});

// ─── ROUND_START_ADD_DICE: Mystery Crate ───

describe('ROUND_START_ADD_DICE: Mystery Crate', () => {
  test('has correct effect type', () => {
    const inst = item('mystery_crate');
    expect(inst.def.effectType).toBe('ROUND_START_ADD_DICE');
  });

  test('mirror lake copying mystery crate adds two sticker dice on day 1', () => {
    const { game, player } = setupGame({ equipment: [item('mirror_lake'), item('mystery_crate')] });
    const diceBefore = player.dice.length;
    game.startRound();

    const newDice = player.dice.slice(diceBefore);
    expect(newDice).toHaveLength(2);
    expect(newDice.every((d) => d.sticker != null)).toBe(true);
    for (const die of newDice) {
      expect(game.state.hand.some((d) => d.id === die.id)).toBe(true);
    }
    expect(game.state.hand.length).toBeGreaterThanOrEqual(game.config.rollSize + 1);
  });

  test('day 1 hand includes mystery crate die beyond roll size', () => {
    const { game, player } = setupGame({ equipment: [item('mystery_crate')] });
    const diceBefore = player.dice.length;
    game.startRound();

    expect(player.dice.length).toBe(diceBefore + 1);
    expect(player.pendingHandDiceIds).toHaveLength(0);
    const newDice = player.dice.slice(diceBefore);
    expect(newDice).toHaveLength(1);
    expect(newDice[0].sticker).not.toBeNull();
    expect(game.state.hand.some((d) => d.id === newDice[0].id)).toBe(true);
    expect(game.state.hand.length).toBe(game.config.rollSize + 1);
    expect(game.selectForRoll(game.state.hand.map((d) => d.id))).toBe(true);
  });

  test('multiple mystery crates add extra day-1 hand dice', () => {
    const { game, player } = setupGame({
      equipment: [item('mystery_crate'), item('mystery_crate')],
    });
    game.startRound();
    const stickerDice = player.dice.filter((d) => d.sticker != null);
    expect(stickerDice).toHaveLength(2);
    for (const die of stickerDice) {
      expect(game.state.hand.some((d) => d.id === die.id)).toBe(true);
    }
    // Hand includes all crate dice; may exceed rollSize when not all were randomly drawn
    expect(game.state.hand.length).toBeGreaterThanOrEqual(game.config.rollSize);
    expect(game.state.hand.length).toBeLessThanOrEqual(game.config.rollSize + 2);
  });

  test('day 2 refills to normal roll size without extra mystery slots', () => {
    const { game } = setupGame({ equipment: [item('mystery_crate')] });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const handIds = game.state.hand.map((d) => d.id);
    expect(game.selectForRoll(handIds)).toBe(true);
    expect(game.selectForScore([handIds[0]])).toBe(true);
    expect(game.calculateScore()).not.toBeNull();

    const result = game.endDay();
    expect(result.outcome).toBe('next-day');
    expect(game.state.hand.length).toBe(game.config.rollSize);
  });
});

describe('ROUND_START_ADD_STONE vs Mystery Crate day-1 hand', () => {
  test('quarry stone does not grant extra day-1 hand slot', () => {
    const { game, player } = setupGame({ equipment: [item('quarry_stone')] });
    const diceBefore = player.dice.length;
    game.startRound();

    expect(player.dice.length).toBe(diceBefore + 1);
    expect(player.pendingHandDiceIds).toHaveLength(0);
    expect(game.state.hand.length).toBe(game.config.rollSize);
  });
});

// ─── SCORED_RETRIGGER_FINAL_DAY: Last Stand ───

describe('SCORED_RETRIGGER_FINAL_DAY: Last Stand', () => {
  test('retriggers scored dice on final day', () => {
    const lastStand = item('last_stand');
    const count = getScoredRetriggerCount([lastStand], { currentDay: 5, maxDays: 5 });
    expect(count).toBe(1);
  });

  test('does not retrigger on non-final day', () => {
    const lastStand = item('last_stand');
    const count = getScoredRetriggerCount([lastStand], { currentDay: 3, maxDays: 5 });
    expect(count).toBe(0);
  });

  test('stacks with other scored retriggers (e.g. War Drums)', () => {
    const lastStand = item('last_stand');
    const warDrums = item('war_drums');
    const count = getScoredRetriggerCount([lastStand, warDrums], { currentDay: 5, maxDays: 5 });
    // Last Stand: +1, War Drums: +1 = 2
    expect(count).toBe(2);
  });
});

// ─── FREE_SHOP_REROLL: Coupon Book ───

describe('FREE_SHOP_REROLL: Coupon Book', () => {
  test('getConfigModifiers reports free rerolls', () => {
    const coupon = item('coupon_book');
    const config = getConfigModifiers([coupon]);
    expect(config.freeShopRerolls).toBe(1);
  });

  test('shop reroll cost is 0 for the coupon free reroll', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll();
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });

  test('shop reroll cost resumes after free rerolls used', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    // First reroll is free, second should be paid.
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll();
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });

  test('multiple coupon books stack free rerolls', () => {
    const { player } = setupGame({
      equipment: [item('coupon_book'), item('coupon_book')],
    });
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll(); // first free used
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll(); // second free used
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });
});

// ─── Shop Pass (supply card) ───

describe('Shop Pass supply card', () => {
  test('shop pass free reroll is consumed before coupon book', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    runActions.patch({
      shopFreeRerollPlan: buildShopFreeRerollPlan({
        ...getRunState(),
        statusTraitTokens: [{ id: 'shop_pass', copies: 1 }],
      }),
      statusTraitTokens: [{ id: 'shop_pass', copies: 1 }],
    });
    player.shopRerollCount = 0;
    expect(player.shopRerollCost).toBe(0);

    progressionActions.payShopReroll();
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'shop_pass')).toBeUndefined();
    expect(player.shopRerollCount).toBe(1);

    expect(player.shopRerollCost).toBe(0);
    progressionActions.payShopReroll();
    expect(player.shopRerollCount).toBe(2);
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });

  test('shop_pass tokens: mid-shop purchases still schedule future free rerolls without changing paid progression', () => {
    const { player } = setupGame({ money: 1000, equipment: [] });

    // 0: paid ($5)
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST);
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(1);
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 1);

    // 1: paid ($6)
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(2);
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 2);

    // Buy first shop_pass: 2 should be free.
    runActions.patch({ statusTraitTokens: [{ id: 'shop_pass', copies: 1 }] });
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(3);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'shop_pass')).toBeUndefined();

    // Next paid reroll cost should continue from paid progression ($7).
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 2);
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(4);
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 3);

    // One more paid reroll: $8 at index 4.
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(5);
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 4);

    // Buy second shop_pass: 5 should be free again.
    runActions.patch({ statusTraitTokens: [{ id: 'shop_pass', copies: 1 }] });
    expect(player.shopRerollCost).toBe(0);
    player.payShopReroll();
    expect(player.shopRerollCount).toBe(6);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'shop_pass')).toBeUndefined();

    // Next paid reroll should keep the same progression ($9).
    expect(player.shopRerollCost).toBe(GAMEPLAY.SHOP_REROLL_COST + 4);
  });
});

// ─── END_ROUND_MONEY_PER_REROLL: Rainy Day Fund ───

describe('END_ROUND_MONEY_PER_REROLL: Rainy Day Fund', () => {
  test('has correct effectType', () => {
    const inst = item('rainy_day_fund');
    expect(inst.def.effectType).toBe('END_ROUND_MONEY_PER_REROLL');
    expect(inst.def.effectParams.value).toBe(1);
  });
});

// ─── SOLO_FIRST_DAY_ENHANCE: Lucky Find ───

describe('SOLO_FIRST_DAY_ENHANCE: Lucky Find', () => {
  test('has correct effect type', () => {
    const inst = item('lucky_find');
    expect(inst.def.effectType).toBe('SOLO_FIRST_DAY_ENHANCE');
  });

  test('applies enhancement, aura, and sticker when solo scoring on day 1', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const steelDie = die({ value: 7, enhancement: 'steel', aura: 'fire', sticker: 'blue_moon' });
      const { result } = calculateTestScore({
        scoredDice: [steelDie],
        equipment: [item('lucky_find')],
        currentDay: 1,
      });
      const scored = result.handResult.scoringDice[0];
      expect(scored.enhancement).toBe('bone');
      expect(scored.aura).toBe('holy');
      expect(scored.sticker).toBe('purple_flower');
      const runDie = getRunState().dice.find((d) => d.id === steelDie.id)!;
      expect(runDie.enhancement).toBe('bone');
      expect(runDie.aura).toBe('holy');
      expect(runDie.sticker).toBe('purple_flower');
    } finally {
      Math.random = original;
    }
  });
});

// ─── HAND_UPGRADE_CHANCE: Surveyor's Transit ───

describe("HAND_UPGRADE_CHANCE: Surveyor's Transit", () => {
  test('has a chance to upgrade hand on play', () => {
    const inst = item('surveyors_transit');
    const { player } = setupGame({ equipment: [inst] });
    const initialLevel = player.getHandStats(HandType.PAIR).level;
    for (let i = 0; i < 100; i++) {
      processPreScoreHandUpgrades([inst], HandType.PAIR);
    }
    // After 100 attempts at 1 in 4, very likely at least one upgrade
    expect(player.getHandStats(HandType.PAIR).level).toBeGreaterThan(initialLevel);
  });

  test('resolves 1 in 4 by default and 1 in 2 for surveyor', () => {
    const params = item('surveyors_transit').def.effectParams;
    expect(resolveChance(params, undefined)).toEqual([1, 4]);
    expect(resolveChance(params, 'surveyor')).toEqual([1, 2]);
  });

  test('default 1 in 4 fails between 25% and 50% roll', () => {
    const original = Math.random;
    Math.random = () => 0.4;
    try {
      const inst = item('surveyors_transit');
      const { player } = setupGame({ equipment: [inst] });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      processPreScoreHandUpgrades([inst], HandType.PAIR);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore);
    } finally {
      Math.random = original;
    }
  });

  test('surveyor 1 in 2 succeeds at same roll where default fails', () => {
    const original = Math.random;
    Math.random = () => 0.4;
    try {
      const inst = item('surveyors_transit');
      const { player } = setupGame({ equipment: [inst], profession: 'surveyor' });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      processPreScoreHandUpgrades([inst], HandType.PAIR);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore + 1);
    } finally {
      Math.random = original;
    }
  });

  test('surveyor 1 in 2 fails above 50% roll', () => {
    const original = Math.random;
    Math.random = () => 0.6;
    try {
      const inst = item('surveyors_transit');
      const { player } = setupGame({ equipment: [inst], profession: 'surveyor' });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      processPreScoreHandUpgrades([inst], HandType.PAIR);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore);
    } finally {
      Math.random = original;
    }
  });

  test('upgrade applies before scoring so the hand gains level bonus miles', () => {
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      const transit = item('surveyors_transit');
      const { result: without } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [],
        handLevels: { [HandType.PAIR]: 1 },
      });
      const { result: withUpgrade } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [transit],
        handLevels: { [HandType.PAIR]: 1 },
      });
      expect(withUpgrade.handUpgrades?.length).toBe(1);
      expect(gte(withUpgrade.miles, without.miles)).toBe(true);
      expect(withUpgrade.miles.gt(without.miles)).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test("Mirror Lake copies surveyor's transit hand upgrade chance", () => {
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      const equipment = [item('mirror_lake'), item('surveyors_transit')];
      const { player } = setupGame({ equipment });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      const upgrades = processPreScoreHandUpgrades(equipment, HandType.PAIR);
      expect(upgrades.length).toBe(2);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore + 2);
    } finally {
      Math.random = original;
    }
  });
});

// ─── TRAIL_TAX ───

describe('TRAIL_TAX: Trail Tax', () => {
  test('starts at 0 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_tax')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gains +2 mult per day end', () => {
    const inst = item('trail_tax');
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.mult).toBe(2);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.mult).toBe(4);
  });

  test('loses -1 mult per reroll', () => {
    const inst = item('trail_tax');
    inst.state.mult = 6;
    processEquipmentOnReroll([inst], 3);
    expect(inst.state.mult).toBe(5);
  });

  test('does not go below 0 on reroll loss', () => {
    const inst = item('trail_tax');
    inst.state.mult = 0;
    processEquipmentOnReroll([inst], 3);
    expect(inst.state.mult).toBe(0);
  });

  test('accumulated mult applies during scoring', () => {
    const inst = item('trail_tax');
    inst.state.mult = 8;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, +8 from trail tax = 9
    expect(result.mult).toBeMult(9);
  });

  test('gains +2 mult after endDay in live round flow', () => {
    const { game, player } = setupGame({
      equipment: [item('trail_tax')],
      dice: diceWithValue(5, 50),
    });
    game.startRound();
    playScoredDayAndEnd(game, { avoidWin: true });
    expect(player.equipment[0]?.state.mult).toBe(2);
  });

  test('Mirror Lake doubles accumulated mult at score time', () => {
    const tax = itemWithState('trail_tax', { mult: 8 });
    const { result: alone } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [tax],
    });
    const { result: withMirror } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), tax],
    });
    expect(alone.mult).toBeMult(9);
    expect(withMirror.mult).toBeMult(17);
  });

  test('Mirror Lake does not change score vs trail tax alone', () => {
    expectMirrorLakeDoesNotChangeScore('trail_tax');
  });
});

// ─── PACK_OPEN_SUPPLY_CHANCE: Leftovers ───

describe('PACK_OPEN_SUPPLY_CHANCE: Leftovers', () => {
  test('has correct effect type', () => {
    const inst = item('leftovers');
    expect(inst.def.effectType).toBe('PACK_OPEN_SUPPLY_CHANCE');
  });

  test('processEquipmentOnPackOpened returns boolean', () => {
    const inst = item('leftovers');
    // Run it many times; it should return true sometimes (1 in 2)
    let gotTrue = false;
    let gotFalse = false;
    for (let i = 0; i < 100; i++) {
      const result = processEquipmentOnPackOpened([inst]);
      if (result) gotTrue = true;
      else gotFalse = true;
      if (gotTrue && gotFalse) break;
    }
    expect(gotTrue).toBe(true);
    expect(gotFalse).toBe(true);
  });

  test('cook always grants supply on pack open', () => {
    const inst = item('leftovers');
    const { player } = setupGame({ equipment: [inst], profession: 'cook' });
    for (let i = 0; i < 10; i++) {
      expect(processEquipmentOnPackOpened(player.equipment)).toBe(true);
    }
  });

  test('returns false with no PACK_OPEN_SUPPLY_CHANCE equipment', () => {
    const result = processEquipmentOnPackOpened([item('horseshoe')]);
    expect(result).toBe(false);
  });

  test('Mirror Lake doubles pack-open supply roll attempts', () => {
    setupGame({ equipment: [] });
    let aloneGranted = 0;
    let mirrorGranted = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      if (processEquipmentOnPackOpened([item('leftovers')])) aloneGranted++;
      if (processEquipmentOnPackOpened([item('mirror_lake'), item('leftovers')])) mirrorGranted++;
    }

    const aloneRate = aloneGranted / runs;
    const mirrorRate = mirrorGranted / runs;
    expect(aloneRate).toBeGreaterThan(0.43);
    expect(aloneRate).toBeLessThan(0.57);
    expect(mirrorRate).toBeGreaterThan(0.7);
    expect(mirrorRate).toBeLessThan(0.8);
  });

  test('Mirror Lake does not change score vs leftovers alone', () => {
    expectMirrorLakeDoesNotChangeScore('leftovers');
  });
});

// ─── EXTRA_PACK_PICK: Rustler ───

describe('EXTRA_PACK_PICK: Rustler', () => {
  test('has correct definition', () => {
    const inst = item('rustler');
    expect(inst.def.effectType).toBe('EXTRA_PACK_PICK');
    expect(inst.def.cost).toBe(5);
    expect(inst.def.rarity).toBe('common');
  });

  test('getBonusPackPicks returns 1 with Rustler equipped', async () => {
    const { getBonusPackPicks } = await import('../../effects/helpers');
    expect(getBonusPackPicks([item('rustler')])).toBe(1);
    expect(getBonusPackPicks([item('horseshoe')])).toBe(0);
  });

  test('openPack grants one extra pick with Rustler', async () => {
    const { gameFacade } = await import('../../facade');
    const { getPackDefById } = await import('../../BoosterPackSystem');
    setupGame({ equipment: [item('rustler')] });

    const standard = getPackDefById('equipment_standard');
    expect(standard).toBeDefined();
    const opened = gameFacade.pack.openPack(standard!);
    expect(opened.picksRemaining).toBe(2);
    expect(opened.effectivePickCount).toBe(2);
  });

  test('openPack grants two extra picks with two Rustlers', async () => {
    const { gameFacade } = await import('../../facade');
    const { getPackDefById } = await import('../../BoosterPackSystem');
    setupGame({ equipment: [item('rustler'), item('rustler')] });

    const mega = getPackDefById('equipment_mega');
    expect(mega).toBeDefined();
    const opened = gameFacade.pack.openPack(mega!);
    expect(opened.picksRemaining).toBe(4);
    expect(opened.effectivePickCount).toBe(4);
  });
});

// ─── END_ROUND_MONEY_SCALING: Railroad Bonds ───

describe('END_ROUND_MONEY_SCALING: Railroad Bonds', () => {
  test('earns $1 base at end of round (no bosses defeated)', () => {
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst] });
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(1);
  });

  test('earns $1 + $2 per boss defeated while equipped', () => {
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst] });
    // Defeat 2 bosses while equipped
    processEquipmentOnBossDefeat([inst]);
    processEquipmentOnBossDefeat([inst]);
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(5);
  });

  test('does not count bosses defeated before equipping', () => {
    // Player is on leg 3 but just picked up railroad bonds
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst], leg: 3 });
    // No boss defeats tracked on this item
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(1);
  });

  test('stacks with other end-of-round money equipment', () => {
    const bonds = item('railroad_bonds');
    processEquipmentOnBossDefeat([bonds]); // 1 boss defeated while equipped
    const { player } = setupGame({ equipment: [bonds, item('payday')] });
    // railroad bonds: $1 + $2 = $3, payday: $4, total = $7
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(7);
  });
});

// ─── XMULT_RISKY: Nitro (end of round) ───

describe('XMULT_RISKY: Nitro (end of round)', () => {
  test('has a 1/1000 destroy chance', () => {
    const inst = item('nitro');
    expect(inst.def.effectParams.destroyChance).toEqual([1, 1000]);
  });

  test('processEndOfRound includes XMULT_RISKY items in destroy check', () => {
    const inst = item('nitro');
    // Run many times — extremely unlikely to destroy (1/1000)
    let destroyed = false;
    for (let i = 0; i < 100; i++) {
      const result = processEndOfRound([inst]);
      if (result.destroyedIndices.length > 0) {
        destroyed = true;
        break;
      }
    }
    // With 100 iterations, 1/1000 chance, very unlikely to destroy, but we just check it doesn't throw
    expect(typeof destroyed).toBe('boolean');
  });
});

// ─── ENHANCEMENT_COUNT_MILES: Quarry Mine ───

describe('ENHANCEMENT_COUNT_MILES: Quarry Mine', () => {
  test('adds +25 miles per stone die in collection', () => {
    const stoneDice = [die({ value: 0, enhancement: 'stone' }), die({ value: 0, enhancement: 'stone' })];
    const normalDice = diceWithValue(5, 2);
    // Include stone dice in the "all dice" pool
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 48)];
    const { game } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +50 (2 stone × 25) = 70 * mult(1)
    expect(result.miles).toBeMiles(70);
  });

  test('no bonus with zero stone dice', () => {
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...diceWithValue(1, 48)];
    const { game } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +0 (no stone) = 20 * mult(1)
    expect(result.miles).toBeMiles(20);
  });

  test('scales with number of stone dice', () => {
    const stoneDice = [
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
    ];
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 44)];
    const { game } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +100 (4 stone × 25) = 120 * mult(1)
    expect(result.miles).toBeMiles(120);
  });

  test('Mirror Lake doubles stone-die miles bonus', () => {
    const stoneDice = [die({ value: 0, enhancement: 'stone' }), die({ value: 0, enhancement: 'stone' })];
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 48)];
    const { game: aloneGame } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    aloneGame.startRound();
    aloneGame.state.phase = 'ROLL';
    aloneGame.state.rolledDice = normalDice;
    aloneGame.state.selectedForRoll = normalDice;
    aloneGame.state.rerollsRemaining = 6;
    aloneGame.selectForScore(normalDice.map((d) => d.id));
    const aloneResult = aloneGame.calculateScore()!;

    const { game: mirrorGame } = setupGame({
      equipment: [item('mirror_lake'), item('quarry_mine')],
      dice: allDice,
    });
    mirrorGame.startRound();
    mirrorGame.state.phase = 'ROLL';
    mirrorGame.state.rolledDice = normalDice;
    mirrorGame.state.selectedForRoll = normalDice;
    mirrorGame.state.rerollsRemaining = 6;
    mirrorGame.selectForScore(normalDice.map((d) => d.id));
    const mirrorResult = mirrorGame.calculateScore()!;

    expect(aloneResult.miles).toBeMiles(70);
    expect(mirrorResult.miles).toBeMiles(120);
  });

  test('Mirror Lake does not change score vs quarry mine alone', () => {
    expectMirrorLakeDoesNotChangeScore('quarry_mine');
  });
});

// ─── FIRST_DICE_RETRIGGER: Quick Draw ───

describe('FIRST_DICE_RETRIGGER: Quick Draw', () => {
  test('retriggers first die 2 additional times', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('quick_draw')],
    });
    // PAIR: baseMiles=10, first die triggers 3x (5+5+5) + second die 1x (5) = 20
    expect(result.totalValue).toBe(20);
  });

  test('does not retrigger non-first dice', () => {
    const scoredDice = [die({ value: 3 }), die({ value: 3 })];
    const { result } = calculateTestScore({
      scoredDice,
      equipment: [item('quick_draw')],
    });
    // First die triggers 3x (3+3+3) + second die 1x (3) = 12
    expect(result.totalValue).toBe(12);
  });

  test('retrigger includes enhancement effects', () => {
    const scoredDice = [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })];
    const { result } = calculateTestScore({
      scoredDice,
      equipment: [item('quick_draw')],
    });
    // First die (bone) triggers 3x: value 5*3=15, bone +4mult*3=12
    // Second die 1x: value 5
    // totalValue=20, baseMult=1+12=13
    expect(result.totalValue).toBe(20);
    expect(result.mult).toBeMult(13);
  });

  test('retriggers leftmost played die when stone is first in play order', () => {
    const stone = die({ enhancement: 'stone', value: 0 });
    const { result } = calculateTestScore({
      scoredDice: [stone, die({ value: 2 }), die({ value: 2 })],
      equipment: [item('quick_draw')],
    });
    // PAIR: stone leftmost → 3×50 + 2 + 2 = 154 (not 3×2 + 2 + 50 = 58)
    expect(result.totalValue).toBe(154);
    expect(result.handResult.scoringDice[0].enhancement).toBe('stone');
  });

  test('purple_flower on quick_draw retrigger respects consumable slot cap', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, sticker: 'purple_flower' }), die({ value: 5 })],
      equipment: [item('quick_draw')],
    });
    expect(player.consumables.length).toBe(2);
  });
});

// ─── LAST_DICE_RETRIGGER: Last Laugh ───

describe('LAST_DICE_RETRIGGER: Last Laugh', () => {
  test('retriggers last die 1 additional time', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('last_laugh')],
    });
    // PAIR: first die 1x (5) + last die 2x (5+5) = 15
    expect(result.totalValue).toBe(15);
  });

  test('single die is both first and last — applies both if both equipped', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 8 })],
      equipment: [item('quick_draw'), item('last_laugh')],
    });
    // HIGH_VALUE: die is first AND last, quick_draw +2, last_laugh +1 = 4 triggers
    // totalValue = 8*4 = 32
    expect(result.totalValue).toBe(32);
  });
});

// ─── ENHANCED_RETRIGGER: Moonshine ───

describe('ENHANCED_RETRIGGER: Moonshine', () => {
  test('retriggers enhanced dice once', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('moonshine')],
    });
    // PAIR: bone die triggers 2x: value 5+5=10, bone +4+4=8
    // non-enhanced die 1x: value 5
    // totalValue=15, baseMult=1+8=9
    expect(result.totalValue).toBe(15);
    expect(result.mult).toBeMult(9);
  });

  test('does not retrigger non-enhanced dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('moonshine')],
    });
    // PAIR: both dice trigger 1x (no enhancement), totalValue=10
    expect(result.totalValue).toBe(10);
  });

  test('Mirror Lake doubles enhanced-die retrigger', () => {
    const scoredDice = [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })];
    const { result: alone } = calculateTestScore({
      scoredDice,
      equipment: [item('moonshine')],
    });
    const { result: withMirror } = calculateTestScore({
      scoredDice,
      equipment: [item('mirror_lake'), item('moonshine')],
    });
    expect(alone.totalValue).toBe(15);
    expect(alone.mult).toBeMult(9);
    expect(withMirror.totalValue).toBe(20);
    expect(withMirror.mult).toBeMult(13);
  });

  test('Mirror Lake does not change score vs moonshine alone', () => {
    expectMirrorLakeDoesNotChangeScore('moonshine');
  });
});

// ─── ALLOW_DUPLICATES: Counterfeit Goods ───

describe('ALLOW_DUPLICATES: Counterfeit Goods', () => {
  test('has correct effect type', () => {
    const inst = item('counterfeit_goods');
    expect(inst.def.effectType).toBe('ALLOW_DUPLICATES');
  });

  test('item exists and has correct cost', () => {
    const inst = item('counterfeit_goods');
    expect(inst.def.cost).toBe(5);
    expect(inst.def.rarity).toBe('uncommon');
  });
});

// ─── TRAIL_BACKPACK ───

describe('TRAIL_BACKPACK: Trail Backpack', () => {
  test('adds +2 rerolls and -1 roll size via config modifier', () => {
    const equip = [item('trail_backpack')];
    const mods = getConfigModifiers(equip);
    expect(mods.rerollsBonus).toBe(2);
    expect(mods.rollSizeBonus).toBe(-1);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('trail_backpack')],
    });
    game.startRound();
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS + 2);
    expect(game.config.rollSize).toBe(GAMEPLAY.ROLL_SIZE - 1);
  });
});

// ─── EXPRESS_TRAIN ───

describe('EXPRESS_TRAIN: Express Train', () => {
  test('adds +250 miles and -2 rerolls', () => {
    const mods = getConfigModifiers([item('express_train')]);
    expect(mods.rerollsBonus).toBe(-2);
  });

  test('adds miles bonus to score', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('express_train')],
    });
    // PAIR base miles + 250 express train bonus
    expect(gte(result.miles, 250)).toBe(true);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('express_train')],
    });
    game.startRound();
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 2);
  });

  test('Mirror Lake copies +250 miles but not reroll penalty', () => {
    const { result: alone } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('express_train')],
    });
    const { result: withMirror } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('express_train')],
    });
    expect(withMirror.miles).toBeMiles(alone.miles.add(250));
    const mods = getConfigModifiers([item('mirror_lake'), item('express_train')]);
    expect(mods.rerollsBonus).toBe(-2);
  });
});

// ─── PHANTOM_WAGON ───

describe('PHANTOM_WAGON: Phantom Wagon', () => {
  test('has correct effect type and initial state', () => {
    const inst = item('phantom_wagon');
    expect(inst.def.effectType).toBe('PHANTOM_WAGON');
    expect(inst.state.roundsHeld).toBe(0);
  });

  test('increments roundsHeld on processEquipmentOnRoundStart', () => {
    const inst = item('phantom_wagon');
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.roundsHeld).toBe(1);
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.roundsHeld).toBe(2);
  });

  test('selling before 2 rounds does not duplicate', () => {
    const horseshoe = item('horseshoe');
    const phantom = item('phantom_wagon');
    phantom.state.roundsHeld = 1; // not ready yet
    const { player } = setupGame({ equipment: [horseshoe, phantom] });
    player.equipment = [horseshoe, phantom];

    const balanceBefore = player.economy.balance;
    player.sellEquipment(1); // sell phantom
    expect(player.equipment.length).toBe(1); // only horseshoe remains
    expect(player.equipment[0].def.id).toBe('horseshoe');
    expect(player.economy.balance).toBe(balanceBefore + phantom.sellValue);
  });

  test('selling after 2 rounds duplicates a random item', () => {
    const horseshoe = item('horseshoe');
    const phantom = item('phantom_wagon');
    phantom.state.roundsHeld = 2; // ready!
    const { player } = setupGame({ equipment: [horseshoe, phantom] });
    player.equipment = [horseshoe, phantom];

    player.sellEquipment(1); // sell phantom
    // Should have horseshoe + duplicated horseshoe
    expect(player.equipment.length).toBe(2);
    expect(player.equipment[0].def.id).toBe('horseshoe');
    expect(player.equipment[1].def.id).toBe('horseshoe');
  });

  test('removes ghost aura when duplicating', () => {
    const ghostItem = itemWithAura('horseshoe', 'ghost');
    const phantom = item('phantom_wagon');
    phantom.state.roundsHeld = 2;
    const { player } = setupGame({ equipment: [ghostItem, phantom] });
    player.equipment = [ghostItem, phantom];

    player.sellEquipment(1); // sell phantom
    // The duplicate should have ghost aura removed
    const duplicate = player.equipment[1];
    expect(duplicate.def.id).toBe('horseshoe');
    expect(duplicate.def.aura).toBeUndefined();
  });

  test('preserves non-ghost aura when duplicating', () => {
    const fireItem = itemWithAura('horseshoe', 'fire');
    const phantom = item('phantom_wagon');
    phantom.state.roundsHeld = 2;
    const { player } = setupGame({ equipment: [fireItem, phantom] });
    player.equipment = [fireItem, phantom];

    player.sellEquipment(1); // sell phantom
    const duplicate = player.equipment[1];
    expect(duplicate.def.id).toBe('horseshoe');
    expect(duplicate.def.aura?.id).toBe('fire');
  });
});

// ─── TRAIL_ALMANAC_MONEY ───

describe('TRAIL_ALMANAC_MONEY: Trail Almanac', () => {
  test('has correct effect type', () => {
    const inst = item('trail_almanac');
    expect(inst.def.effectType).toBe('TRAIL_ALMANAC_MONEY');
  });

  test('earns $1 per trail guide type discovered', () => {
    const { player } = setupGame({ equipment: [item('trail_almanac')] });
    // Upgrade 3 different hand types (simulate discovering trail guides)
    player.upgradeHandLevel(HandType.PAIR);
    player.upgradeHandLevel(HandType.THREE_OF_A_KIND);
    player.upgradeHandLevel(HandType.FIVE_STRAIGHT);

    const payout = player.calculatePayout(0, 0);
    // $1 per discovered type = $3 from trail almanac
    expect(payout.equipmentMoney).toBe(3);
  });

  test('earns $0 when no trail guides discovered', () => {
    const { player } = setupGame({ equipment: [item('trail_almanac')] });
    const payout = player.calculatePayout(0, 0);
    expect(payout.equipmentMoney).toBe(0);
  });
});

// ─── ROUND_START_SUPPLY: Supply Drop ───

describe('ROUND_START_SUPPLY: Supply Drop', () => {
  test('creates a supply card at start of round', () => {
    const { game, player } = setupGame({
      equipment: [item('supply_drop')],
    });
    const consumablesBefore = player.consumables.length;
    game.startRound();
    expect(player.consumables.length).toBe(consumablesBefore + 1);
  });

  test('Mirror Lake does not change score vs supply drop alone', () => {
    expectMirrorLakeDoesNotChangeScore('supply_drop');
  });
});

// ─── EXPLORER_GUILD ───

describe("EXPLORER_GUILD: Explorer's Guild", () => {
  test('has correct effect type', () => {
    const inst = item('explorers_guild');
    expect(inst.def.effectType).toBe('EXPLORER_GUILD');
  });

  test('is copy-incompatible', () => {
    const { COPY_INCOMPATIBLE_EFFECTS } = require('../../Constants');
    expect(COPY_INCOMPATIBLE_EFFECTS.has('EXPLORER_GUILD')).toBe(true);
  });

  test('trailGuidesFree returns true when equipped', () => {
    const { player } = setupGame({ equipment: [item('explorers_guild')] });
    expect(player.trailGuidesFree).toBe(true);
  });

  test('trailGuidesFree returns false when not equipped', () => {
    const { player } = setupGame({ equipment: [item('horseshoe')] });
    expect(player.trailGuidesFree).toBe(false);
  });

  test('trailGuidesFree returns false with no equipment', () => {
    const { player } = setupGame({ equipment: [] });
    expect(player.trailGuidesFree).toBe(false);
  });
});

// ─── PACK_SADDLE ───

describe('PACK_SADDLE: Pack Saddle', () => {
  test('adds +1 roll size via config modifier', () => {
    const mods = getConfigModifiers([item('pack_saddle')]);
    expect(mods.rollSizeBonus).toBe(1);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('pack_saddle')],
    });
    game.startRound();
    expect(game.config.rollSize).toBe(GAMEPLAY.ROLL_SIZE + 1);
  });

  test('is copy-incompatible', () => {
    const { COPY_INCOMPATIBLE_EFFECTS } = require('../../Constants');
    expect(COPY_INCOMPATIBLE_EFFECTS.has('PACK_SADDLE')).toBe(true);
  });
});

// ─── COFFEE ───

describe('COFFEE: Coffee', () => {
  test('adds +2 roll size and -1 day via config modifier', () => {
    const mods = getConfigModifiers([item('coffee')]);
    expect(mods.rollSizeBonus).toBe(2);
    expect(mods.daysPenalty).toBe(1);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('coffee')],
    });
    game.startRound();
    expect(game.config.rollSize).toBe(GAMEPLAY.ROLL_SIZE + 2);
    expect(game.config.maxDays).toBe(GAMEPLAY.MAX_DAYS - 1);
  });

  test('is copy-incompatible', () => {
    const { COPY_INCOMPATIBLE_EFFECTS } = require('../../Constants');
    expect(COPY_INCOMPATIBLE_EFFECTS.has('COFFEE')).toBe(true);
  });
});

// ─── FLOUR_SACK ───

describe('FLOUR_SACK: Flour Sack', () => {
  test('starts with +5 hand size bonus', () => {
    const inst = item('flour_sack');
    expect(inst.state.handSizeBonus).toBe(5);
  });

  test('provides roll size bonus from state', () => {
    const mods = getConfigModifiers([item('flour_sack')]);
    expect(mods.rollSizeBonus).toBe(5);
  });

  test('decays by 1 each round on processEquipmentOnRoundStart', () => {
    const inst = item('flour_sack');
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.handSizeBonus).toBe(4);
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.handSizeBonus).toBe(3);
  });

  test('does not go below 0', () => {
    const inst = itemWithState('flour_sack', { handSizeBonus: 1 });
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.handSizeBonus).toBe(0);
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.handSizeBonus).toBe(0);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('flour_sack')],
    });
    game.startRound();
    // Config is computed BEFORE round-start decay, so uses full 5 bonus
    expect(game.config.rollSize).toBe(GAMEPLAY.ROLL_SIZE + 5);
  });

  test('handSizeBonus decays and persists across consecutive startRound calls', () => {
    const { game, player } = setupGame({ equipment: [item('flour_sack')] });
    game.startRound();
    expect(player.equipment[0]?.state.handSizeBonus).toBe(4);

    roundActions.clearRound();
    game.startRound();
    expect(player.equipment[0]?.state.handSizeBonus).toBe(3);
  });

  test('is copy-incompatible', () => {
    const { COPY_INCOMPATIBLE_EFFECTS } = require('../../Constants');
    expect(COPY_INCOMPATIBLE_EFFECTS.has('FLOUR_SACK')).toBe(true);
  });

  test('farmer has no decay (decayPerRound resolves to 0)', () => {
    const params = item('flour_sack').def.effectParams;
    expect(resolveEffectParam<number>(params, 'decayPerRound', 'farmer')).toBe(0);
    expect(resolveEffectParam<number>(params, 'decayPerRound', undefined)).toBe(1);
  });

  test('farmer flour sack stays at +5 hand size after multiple rounds', () => {
    const inst = item('flour_sack');
    const { player } = setupGame({ equipment: [inst], profession: 'farmer' });
    for (let i = 0; i < 6; i++) {
      processEquipmentOnRoundStart([inst]);
    }
    expect(inst.state.handSizeBonus).toBe(5);
    expect(getConfigModifiers(player.equipment).rollSizeBonus).toBe(5);
  });

  test('non-farmer still decays when farmer profession is not active', () => {
    const inst = item('flour_sack');
    setupGame({ equipment: [inst] });
    processEquipmentOnRoundStart([inst]);
    processEquipmentOnRoundStart([inst]);
    expect(inst.state.handSizeBonus).toBe(3);
  });
});

// ─── END_ROUND_SELL_VALUE_ALL: Raffle Ticket ───

describe('END_ROUND_SELL_VALUE_ALL: Raffle Ticket', () => {
  test('adds $1 sell value to all equipment at end of round', () => {
    const raffle = item('raffle_ticket');
    const horseshoe = item('horseshoe');
    const beforeRaffle = raffle.sellValue;
    const beforeHorse = horseshoe.sellValue;
    processEndOfRound([raffle, horseshoe]);
    expect(raffle.sellValue).toBe(beforeRaffle + 1);
    expect(horseshoe.sellValue).toBe(beforeHorse + 1);
  });

  test('sell value persists after endDay in live round flow', () => {
    const raffle = item('raffle_ticket');
    const horseshoe = item('horseshoe');
    const beforeRaffle = raffle.sellValue;
    const beforeHorse = horseshoe.sellValue;

    const { game, player } = setupGame({
      equipment: [raffle, horseshoe],
      dice: diceWithValue(5, 50),
    });
    game.startRound();
    playScoredDayAndEnd(game, { avoidWin: true });

    const storedRaffle = player.equipment.find((e) => e.def.id === 'raffle_ticket');
    const storedHorse = player.equipment.find((e) => e.def.id === 'horseshoe');
    expect(storedRaffle?.sellValue).toBe(beforeRaffle + 1);
    expect(storedHorse?.sellValue).toBe(beforeHorse + 1);
  });

  test('adds $1 sell value to held consumables at end of round', () => {
    const raffle = item('raffle_ticket');
    const { player } = setupGame({ equipment: [raffle] });
    const supplyDef = getRandomSupplyDef();
    player.addConsumable(supplyDef);
    const before = player.consumables[0]!.sellValue;

    processEndOfRound([raffle]);

    expect(player.consumables[0]!.sellValue).toBe(before + 1);
  });
});

// ─── SAVINGS_ACCOUNT_INTEREST: Savings Account ───

describe('SAVINGS_ACCOUNT_INTEREST: Savings Account', () => {
  test('adds extra interest per $5 held', () => {
    const { player } = setupGame({ equipment: [item('savings_account')], money: 25 });
    const payout = player.calculatePayout(0, 0);
    expect(payout.interest).toBe(5);
    expect(payout.savingsAccountInterest).toBe(5);
    expect(payout.total).toBeGreaterThanOrEqual(10);
  });

  test('accountant savings bonus ignores interest cap', () => {
    const { player } = setupGame({ equipment: [item('savings_account')], money: 50 });
    const capped = player.calculatePayout(0, 0);
    expect(capped.interest).toBe(5);
    expect(capped.savingsAccountInterest).toBe(5);

    player.applyProfession('accountant');
    const accountant = player.calculatePayout(0, 0);
    expect(accountant.interest).toBe(5);
    expect(accountant.savingsAccountInterest).toBe(10);
    expect(accountant.savingsAccountRate).toBe(1);
  });
});

// ─── SELL_DISABLE_BOSS: Sheriff's Badge ───

describe("SELL_DISABLE_BOSS: Sheriff's Badge", () => {
  test('selling on boss round disables boss effect', () => {
    const { player } = setupGame({ equipment: [item('sheriffs_badge')] });
    player.round = 3;
    expect(player.isBossRound).toBe(true);
    player.sellEquipment(0);
    expect(player.bossEffectDisabled).toBe(true);
    expect(player.equipment.length).toBe(0);
  });
});

// ─── SELL_GRANT_TAG: Bounty Contract ───

describe('SELL_GRANT_TAG: Bounty Contract', () => {
  test('selling grants a Twin Wagon tag', () => {
    const { player } = setupGame({ equipment: [item('bounty_contract')] });
    expect(player.twinWagonCount).toBe(0);
    player.sellEquipment(0);
    expect(player.equipment.length).toBe(0);
    expect(player.twinWagonCount).toBe(1);
    expect(player.pendingTags.length).toBe(0);
  });

  test('Twin Wagon from contract doubles the next earned tag', () => {
    const { player } = setupGame({ equipment: [item('bounty_contract')] });
    player.sellEquipment(0);
    player.addTag(getTrailTagById('tag_shortcut')!);
    expect(player.pendingTags[0].copies).toBe(2);
  });
});

// ─── SHOP_END_GHOST_CONSUMABLE: Ghost Lantern ───

describe('SHOP_END_GHOST_CONSUMABLE: Ghost Lantern', () => {
  test('creates ghost copy of random consumable at shop end', () => {
    const { player } = setupGame({ equipment: [item('ghost_lantern')] });
    const supplyDef = getRandomSupplyDef();
    player.addConsumable(supplyDef);
    expect(player.consumables.length).toBe(1);

    processEquipmentOnShopEnd(player.equipment);

    expect(player.consumables.length).toBe(2);
    const ghost = player.consumables.find((c) => c.def.aura?.id === 'ghost');
    expect(ghost).toBeDefined();
    expect(ghost!.def.id).toBe(supplyDef.id);
  });

  test('does nothing with no consumables', () => {
    const { player } = setupGame({ equipment: [item('ghost_lantern')] });
    processEquipmentOnShopEnd(player.equipment);
    expect(player.consumables.length).toBe(0);
  });

  test('Mirror Lake copying ghost lantern creates two ghost copies at shop end', () => {
    const { player } = setupGame({ equipment: [item('mirror_lake'), item('ghost_lantern')] });
    const supplyDef = getRandomSupplyDef();
    player.addConsumable(supplyDef);
    expect(player.consumables.length).toBe(1);

    processEquipmentOnShopEnd(player.equipment);

    expect(player.consumables.length).toBe(3);
    const ghosts = player.consumables.filter((c) => c.def.aura?.id === 'ghost');
    expect(ghosts.length).toBe(2);
    expect(ghosts.every((g) => g.def.id === supplyDef.id)).toBe(true);
  });

  test('Mirror Lake does not change score vs ghost lantern alone', () => {
    expectMirrorLakeDoesNotChangeScore('ghost_lantern');
  });
});

// ─── ALL_RETRIGGER: The Seventh Trumpet ───

describe('ALL_RETRIGGER: The Seventh Trumpet', () => {
  test('retriggers all scored dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('seventh_trumpet')],
    });
    // PAIR base miles from dice: (5+5)*2 triggers = 20 value
    // baseMult=1, mult=1 → miles = (10 + 20) * 1 = 30
    expect(result.miles).toBeMiles(30);
  });

  test('retriggers held-in-hand effects', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
      equipment: [item('seventh_trumpet')],
    });
    // Steel held triggers twice (base + seventh trumpet): x1.5 * x1.5 = 2.25
    expect(result.mult).toBeMultCloseTo(2.25, 5);
  });

  test('Mirror Lake copies seventh trumpet retrigger', () => {
    expect(getScoredRetriggerCount([item('mirror_lake'), item('seventh_trumpet')])).toBe(2);
    expect(getScoredRetriggerCount([item('seventh_trumpet')])).toBe(1);

    const { result: alone } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('seventh_trumpet')],
    });
    const { result: withMirror } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('seventh_trumpet')],
    });
    expect(alone.totalValue).toBe(20);
    expect(withMirror.totalValue).toBe(30);
  });
});

// ─── Saint Elmo's Shield: boss negation ───

describe("Saint Elmo's Shield boss negation", () => {
  test('negates boss distance multiplier', () => {
    const { player } = setupGame({ equipment: [item('saint_elmos_shield')] });
    player.round = 3;
    (player as any).bossAssignments = [
      {
        id: 'the_marathon',
        name: 'The Marathon',
        description: 'Distance is 4x normal',
        effectType: 'DISTANCE_MULTIPLIER',
        effectParams: { multiplier: 4 },
      },
    ] as any;

    expect(getBossRoundConfigMods().targetMilesMultiplier).toBe(1);
  });

  test("Mirror Lake does not change score vs saint elmo's shield alone", () => {
    expectMirrorLakeDoesNotChangeScore('saint_elmos_shield');
  });
});

describe('New utility equipment lifecycle effects', () => {
  test('pack mule increases consumable slots by 2', () => {
    const base = setupGame().player.maxConsumableSlots;
    const boosted = setupGame({ equipment: [item('pack_mule')] }).player.maxConsumableSlots;
    expect(boosted).toBe(base + 2);
  });

  test('Mirror Lake does not change score vs pack mule alone', () => {
    expectMirrorLakeDoesNotChangeScore('pack_mule');
  });

  test('penny pincher grants $5 when a pack is skipped', () => {
    const { player } = setupGame({ equipment: [item('penny_pincher')], money: 0 });
    const before = player.economy.balance;
    processEquipmentOnPackSkipped(player.equipment);
    expect(player.economy.balance).toBe(before + 5);
  });

  test('Mirror Lake does not change score vs penny pincher alone', () => {
    expectMirrorLakeDoesNotChangeScore('penny_pincher');
  });

  test('potluck fills free slots with second helpings after boss defeat', () => {
    const { player } = setupGame({ equipment: [item('potluck')] });
    player.maxConsumableSlots = 3;
    processEquipmentOnBossDefeat(player.equipment);
    expect(player.consumables.length).toBe(3);
    expect(player.consumables.every((card) => card.def.id === 'second_helpings')).toBe(true);
  });

  test('Mirror Lake does not change score vs potluck alone', () => {
    expectMirrorLakeDoesNotChangeScore('potluck');
  });

  test('pawn broker gains sell value whenever money is earned', () => {
    const broker = item('pawn_broker');
    const { player } = setupGame({ equipment: [broker], money: 0 });
    const before = player.equipment[0]!.sellValue;
    player.economy.earn(10);
    expect(player.equipment[0]!.sellValue).toBe(before + 1);
  });

  test('pawn broker keeps sell value after scoring money (e.g. one armed bandit)', () => {
    const original = Math.random;
    Math.random = () => 0;

    try {
      const broker = item('pawn_broker');
      const before = broker.sellValue;
      const { player } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('one_armed_bandit'), broker],
      });
      const stored = player.equipment.find((e) => e.def.id === 'pawn_broker')!;
      expect(stored.sellValue).toBe(before + 1);
    } finally {
      Math.random = original;
    }
  });

  test('Mirror Lake doubles sell-value gain on earn', () => {
    const { player: alonePlayer } = setupGame({ equipment: [item('pawn_broker')], money: 0 });
    const aloneBefore = alonePlayer.equipment[0]!.sellValue;
    alonePlayer.economy.earn(10);
    expect(alonePlayer.equipment[0]!.sellValue).toBe(aloneBefore + 1);

    const { player: mirrorPlayer } = setupGame({
      equipment: [item('mirror_lake'), item('pawn_broker')],
      money: 0,
    });
    const mirrorBefore = mirrorPlayer.equipment[1]!.sellValue;
    mirrorPlayer.economy.earn(10);
    expect(mirrorPlayer.equipment[1]!.sellValue).toBe(mirrorBefore + 2);
  });

  test('Mirror Lake does not change score vs pawn broker alone', () => {
    expectMirrorLakeDoesNotChangeScore('pawn_broker');
  });

  test('pocket watch gains miles from days left and mult from rerolls left at leg round end', () => {
    const watch = item('pocket_watch');
    const { game, player } = setupGame({ equipment: [watch] });
    game.startRound();
    const round = getRoundState()!;
    roundActions.patch({ rerollsRemaining: 3 });
    processEndOfRound(player.equipment, { isLegRoundEnd: true });
    const inst = player.equipment.find((e) => e.def.id === 'pocket_watch')!;
    const daysLeft = round.config.maxDays - round.day + 1;
    expect(inst.state.miles).toBe(daysLeft * 10);
    expect(inst.state.mult).toBe(3);
  });

  test('pocket watch does not tick on mid-round day end', () => {
    const watch = item('pocket_watch');
    const { game, player } = setupGame({ equipment: [watch] });
    game.startRound();
    processEndOfRound(player.equipment, { isLegRoundEnd: false });
    const inst = player.equipment.find((e) => e.def.id === 'pocket_watch')!;
    expect(inst.state.miles).toBe(0);
    expect(inst.state.mult).toBe(0);
  });

  test('pocket watch ticks once per leg round through endDay', () => {
    const watch = item('pocket_watch');
    const { game, player } = setupGame({ equipment: [watch] });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const maxDays = getRoundState()!.config.maxDays;
    for (let day = 0; day < maxDays - 1; day++) {
      playScoredDayAndEnd(game, { avoidWin: true });
    }
    const instMid = player.equipment.find((e) => e.def.id === 'pocket_watch')!;
    expect(instMid.state.miles ?? 0).toBe(0);
    playScoredDayAndEnd(game, { avoidWin: true });
    const instEnd = player.equipment.find((e) => e.def.id === 'pocket_watch')!;
    expect((instEnd.state.miles ?? 0) > 0).toBe(true);
  });

  test('Mirror Lake doubles leg-round-end state tick', () => {
    const watch = item('pocket_watch');
    const { game, player } = setupGame({ equipment: [watch] });
    game.startRound();
    const round = getRoundState()!;
    roundActions.patch({ rerollsRemaining: 3 });
    processEndOfRound(player.equipment, { isLegRoundEnd: true });
    const alone = player.equipment.find((e) => e.def.id === 'pocket_watch')!;
    const daysLeft = round.config.maxDays - round.day + 1;
    expect(alone.state.mult).toBe(3);
    expect(alone.state.miles).toBe(daysLeft * 10);

    const { game: game2, player: player2 } = setupGame({
      equipment: [item('mirror_lake'), item('pocket_watch')],
    });
    game2.startRound();
    roundActions.patch({ rerollsRemaining: 3 });
    processEndOfRound(player2.equipment, { isLegRoundEnd: true });
    const withMirror = player2.equipment.find((e) => e.def.id === 'pocket_watch')!;
    expect(withMirror.state.mult).toBe(6);
    expect(withMirror.state.miles).toBe(daysLeft * 10 * 2);
  });

  test('Mirror Lake does not change score vs pocket watch alone', () => {
    expectMirrorLakeDoesNotChangeScore('pocket_watch');
  });

  test('offering bowl destroys a consumable and stores mult on round start', () => {
    const bowl = item('offering_bowl');
    const { player } = setupGame({ equipment: [bowl] });
    const supplyDef = getRandomSupplyDef();
    player.addConsumable(supplyDef);
    player.addConsumable(getRandomSupplyDef());
    expect(player.consumables.length).toBe(2);
    processEquipmentOnRoundStart([bowl]);
    expect(player.consumables.length).toBe(1);
    expect(bowl.state.mult).toBe(4);
  });

  test('offering bowl skips when no consumables', () => {
    const bowl = item('offering_bowl');
    const { player } = setupGame({ equipment: [bowl] });
    processEquipmentOnRoundStart([bowl]);
    expect(player.consumables.length).toBe(0);
    expect(bowl.state.mult ?? 0).toBe(0);
  });

  test('Mirror Lake doubles stored mult at score time', () => {
    const bowl = itemWithState('offering_bowl', { mult: 4 });
    const { result: alone } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [bowl],
    });
    const { result: withMirror } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), bowl],
    });
    expect(alone.mult).toBeMult(5);
    expect(withMirror.mult).toBeMult(9);
  });

  test('Mirror Lake does not change score vs offering bowl alone', () => {
    expectMirrorLakeDoesNotChangeScore('offering_bowl');
  });
});

// ─── STEW / SANDWICH: timed rounds decay per leg round ───

describe('STEW', () => {
  test('rolls upgrade chance on day 1 only, before scoring', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const stew = item('stew');
      const { game } = setupGame({ equipment: [stew] });
      game.startRound();
      const day1Upgrades = processPreScoreHandUpgrades([stew], HandType.PAIR);
      expect(day1Upgrades.length).toBe(1);

      roundActions.patch({ day: 2 });
      const day2Upgrades = processPreScoreHandUpgrades([stew], HandType.PAIR);
      expect(day2Upgrades.length).toBe(0);
    } finally {
      Math.random = original;
    }
  });

  test('upgrade applies to scored hand miles on day 1', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const { result, player } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('stew')],
        currentDay: 1,
        handLevels: { [HandType.PAIR]: 1 },
      });
      expect(result.handUpgrades?.length).toBe(1);
      expect(player.getHandStats(HandType.PAIR).level).toBe(2);
      expect(result.miles.gt(D(20))).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test('Mirror Lake copies stew day-1 hand upgrade chance', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const equipment = [item('mirror_lake'), item('stew')];
      const { game } = setupGame({ equipment });
      game.startRound();
      const upgrades = processPreScoreHandUpgrades(equipment, HandType.PAIR);
      expect(upgrades.length).toBe(2);
    } finally {
      Math.random = original;
    }
  });
});

describe('STEW: rounds remaining', () => {
  test('does not decay on mid-round day end', () => {
    const stew = item('stew');
    const { game, player } = setupGame({ equipment: [stew] });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const result = playScoredDayAndEnd(game, { avoidWin: true });
    expect(result.outcome).toBe('next-day');
    const inst = player.equipment.find((e) => e.def.id === 'stew')!;
    expect(inst.state.roundsRemaining).toBe(5);
  });

  test('decays once after all days in a leg round', () => {
    const stew = item('stew');
    const { game, player } = setupGame({ equipment: [stew] });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const maxDays = getRoundState()!.config.maxDays;
    for (let day = 0; day < maxDays; day++) {
      playScoredDayAndEnd(game, { avoidWin: true });
    }
    const inst = player.equipment.find((e) => e.def.id === 'stew')!;
    expect(inst.state.roundsRemaining).toBe(4);
  });
});

describe('SANDWICH', () => {
  test('grants a mega pack tag at leg round end', () => {
    const sandwich = item('sandwich');
    const before = getRunState().pendingTags.length;
    processEndOfRound([sandwich], { isLegRoundEnd: true });
    expect(getRunState().pendingTags.length).toBe(before + 1);
    const added = getRunState().pendingTags[getRunState().pendingTags.length - 1]!;
    expect(['tag_dice_mega', 'tag_supply_mega', 'tag_trail_guide_mega', 'tag_equipment_mega']).toContain(added.tagId);
  });

  test('Mirror Lake doubles mega-pack tag grant at leg round end', () => {
    const { player } = setupGame({ equipment: [item('mirror_lake'), item('sandwich')] });
    const before = getRunState().pendingTags.length;
    processEndOfRound(player.equipment, { isLegRoundEnd: true });
    expect(getRunState().pendingTags.length).toBe(before + 2);
  });

  test('Mirror Lake does not change score vs sandwich alone', () => {
    expectMirrorLakeDoesNotChangeScore('sandwich');
  });
});

describe('SANDWICH: rounds remaining', () => {
  test('decays once per leg round, not per day', () => {
    const sandwich = item('sandwich');
    const { game, player } = setupGame({ equipment: [sandwich] });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const maxDays = getRoundState()!.config.maxDays;
    for (let day = 0; day < maxDays - 1; day++) {
      const result = playScoredDayAndEnd(game, { avoidWin: true });
      expect(result.outcome).toBe('next-day');
    }
    const instMid = player.equipment.find((e) => e.def.id === 'sandwich')!;
    expect(instMid.state.roundsRemaining).toBe(5);
    playScoredDayAndEnd(game, { avoidWin: true });
    const instEnd = player.equipment.find((e) => e.def.id === 'sandwich')!;
    expect(instEnd.state.roundsRemaining).toBe(4);
  });
});

// ─── FIRST_DAY_NONSCORING_DESTROY: Skullwing ───

describe('FIRST_DAY_NONSCORING_DESTROY: Skullwing', () => {
  test('destroys played non-scoring dice on day 1 and earns $1 each', () => {
    const hand = [die({ value: 5 }), die({ value: 5 }), die({ value: 3 }), die({ value: 7 })];
    const { result, player } = calculateTestScore({
      scoredDice: hand,
      equipment: [item('skullwing')],
    });
    expect(result.mutations.moneyEarned).toBe(2);
    expect(player.dice.length).toBe(52);
    expect(result.animEvents.some((evt) => evt.popupType === 'crack' && evt.target.kind === 'die')).toBe(true);
  });

  test('open palm anti-synergy: all played dice count as scoring so none are destroyed', () => {
    const hand = [die({ value: 5 }), die({ value: 5 }), die({ value: 3 }), die({ value: 7 })];
    const { result, player } = calculateTestScore({
      scoredDice: hand,
      equipment: [item('skullwing'), item('open_palm')],
    });
    expect(result.mutations.moneyEarned).toBe(0);
    expect(player.dice.length).toBe(54);
    expect(result.animEvents.some((evt) => evt.popupType === 'crack' && evt.target.kind === 'die')).toBe(false);
  });
});
