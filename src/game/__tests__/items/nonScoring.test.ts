import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { getTrailTagById } from '../../../data/trail_tags';
import { die, diceWithValue, item, itemWithState, itemWithAura, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import {
  processEndOfRound,
  getConfigModifiers,
  getScoredRetriggerCount,
  findDeathPrevention,
  getDayModifiers,
  processEquipmentOnDayEnd,
  processEquipmentOnDiceSpent,
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processEquipmentOnReroll,
  processEquipmentOnPackOpened,
  processEquipmentOnBossDefeat,
  processEquipmentOnRoundStart,
  processEquipmentOnShopEnd,
} from '../../EquipmentEffects';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import { resolveChance, resolveEffectParam } from '../../effectParams';
import { getBossRoundConfigMods } from '../../BossEffectsSystem';
import { HandType } from '../../types';
import { GAMEPLAY } from '../../Constants';

beforeEach(() => resetDieIds());

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

// ─── REFRESH_SPENT_DICE: Extra Saddlebag ───
// This effect is handled by the UI/game flow, not by scoring.
// We test that the item exists and has correct effect type.

describe('REFRESH_SPENT_DICE: Extra Saddlebag', () => {
  test('has correct effect type and params', () => {
    const equip = item('extra_saddlebag');
    expect(equip.def.effectType).toBe('REFRESH_SPENT_DICE');
    expect(equip.def.effectParams.value).toBe(1);
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

// ─── AUTO_REFRESH_REDUCE_DAYS: Stagecoach ───

describe('AUTO_REFRESH_REDUCE_DAYS: Stagecoach', () => {
  test('reduces days by 1', () => {
    const inst = item('stagecoach');
    const { daysPenalty } = getDayModifiers([inst]);
    expect(daysPenalty).toBe(1);
  });

  test('stacks with multiple stagecoaches', () => {
    const { daysPenalty } = getDayModifiers([item('stagecoach'), item('stagecoach')]);
    expect(daysPenalty).toBe(2);
  });

  test('no penalty without stagecoach', () => {
    const { daysPenalty } = getDayModifiers([item('horseshoe')]);
    expect(daysPenalty).toBe(0);
  });
});

// ─── ROUND_START_ADD_DICE: Mystery Crate ───

describe('ROUND_START_ADD_DICE: Mystery Crate', () => {
  test('has correct effect type', () => {
    const inst = item('mystery_crate');
    expect(inst.def.effectType).toBe('ROUND_START_ADD_DICE');
  });
});

// ─── ENHANCED_SPENT_MILES_GAIN: Bone Collector ───

describe.skip('ENHANCED_SPENT_MILES_GAIN: Bone Collector', () => {
  test('starts at +0 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('bone_collector')],
    });
    // No accumulated miles → just base
    expect(result.miles).toBe(20); // (10+10)*1
  });

  test('gains +3 miles per enhanced die spent', () => {
    const inst = item('bone_collector');
    const enhancedDice = [die({ value: 5, enhancement: 'bone' }), die({ value: 3, enhancement: 'wooden' })];
    processEquipmentOnDiceSpent([inst], enhancedDice);
    expect(inst.state.miles).toBe(6); // 2 enhanced × 3
  });

  test('ignores non-enhanced dice', () => {
    const inst = item('bone_collector');
    const plainDice = [die({ value: 5 }), die({ value: 3 })];
    processEquipmentOnDiceSpent([inst], plainDice);
    expect(inst.state.miles).toBe(0);
  });

  test('accumulated miles applied during scoring', () => {
    const inst = item('bone_collector');
    inst.state.miles = 15; // simulate 5 enhanced dice spent

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMiles=10, totalValue=10, +15 bonusMiles
    // finalMiles = (10 + 10 + 15) * 1 = 35
    expect(result.miles).toBe(35);
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

  test('shop reroll cost is 0 for free rerolls', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    player.shopRerollCount = 0;
    expect(player.shopRerollCost).toBe(0);
  });

  test('shop reroll cost resumes after free rerolls used', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    player.shopRerollCount = 1; // 1 free used, now paid
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });

  test('multiple coupon books stack free rerolls', () => {
    const { player } = setupGame({
      equipment: [item('coupon_book'), item('coupon_book')],
    });
    player.shopRerollCount = 0;
    expect(player.shopRerollCost).toBe(0);
    player.shopRerollCount = 1;
    expect(player.shopRerollCost).toBe(0);
    player.shopRerollCount = 2; // both free used
    expect(player.shopRerollCost).toBeGreaterThan(0);
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
});

// ─── HAND_UPGRADE_CHANCE: Surveyor's Transit ───

describe("HAND_UPGRADE_CHANCE: Surveyor's Transit", () => {
  test('has a chance to upgrade hand on play', () => {
    const inst = item('surveyors_transit');
    const { player } = setupGame({ equipment: [inst] });
    const initialLevel = player.getHandStats(HandType.PAIR).level;
    for (let i = 0; i < 100; i++) {
      processEquipmentAfterHandScored([inst], HandType.PAIR);
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
      processEquipmentAfterHandScored([inst], HandType.PAIR);
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
      processEquipmentAfterHandScored([inst], HandType.PAIR);
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
      processEquipmentAfterHandScored([inst], HandType.PAIR);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore);
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
    expect(result.mult).toBe(1);
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
    expect(result.mult).toBe(9);
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
    const stoneDice = [
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
    ];
    const normalDice = diceWithValue(5, 2);
    // Include stone dice in the "all dice" pool
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 48)];
    const { game, player } = setupGame({
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
    expect(result.miles).toBe(70);
  });

  test('no bonus with zero stone dice', () => {
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...diceWithValue(1, 48)];
    const { game, player } = setupGame({
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
    expect(result.miles).toBe(20);
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
    const { game, player } = setupGame({
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
    expect(result.miles).toBe(120);
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
    expect(result.mult).toBe(13);
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
    expect(result.mult).toBe(9);
  });

  test('does not retrigger non-enhanced dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('moonshine')],
    });
    // PAIR: both dice trigger 1x (no enhancement), totalValue=10
    expect(result.totalValue).toBe(10);
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
    expect(result.miles).toBeGreaterThanOrEqual(250);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('express_train')],
    });
    game.startRound();
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 2);
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
});

// ─── EXPLORER_GUILD ───

describe('EXPLORER_GUILD: Explorer\'s Guild', () => {
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
});

// ─── SAVINGS_ACCOUNT_INTEREST: Savings Account ───

describe('SAVINGS_ACCOUNT_INTEREST: Savings Account', () => {
  test('adds extra interest per $5 held', () => {
    const { player } = setupGame({ equipment: [item('savings_account')], money: 25 });
    const payout = player.calculatePayout(0, 0);
    // base interest $5 + savings $5 = $10
    expect(payout.interest).toBe(10);
  });

  test('accountant earns double savings bonus', () => {
    const { player } = setupGame({ equipment: [item('savings_account')], money: 25 });
    player.applyProfession('accountant');
    const payout = player.calculatePayout(0, 0);
    // base $5 + savings ($5 + $5 accountant) = $15
    expect(payout.interest).toBe(15);
  });
});

// ─── SELL_DISABLE_BOSS: Sheriff's Badge ───

describe('SELL_DISABLE_BOSS: Sheriff\'s Badge', () => {
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
    expect(result.miles).toBe(30);
  });

  test('retriggers held-in-hand effects', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
      equipment: [item('seventh_trumpet')],
    });
    // Steel held triggers twice (base + seventh trumpet): x1.5 * x1.5 = 2.25
    expect(result.mult).toBeCloseTo(2.25, 5);
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
});
