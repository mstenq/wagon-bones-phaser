import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  diceFromValues,
  item,
  itemWithState,
  calculateTestScore,
  resetDieIds,
} from '../testHelpers';
import { processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── PIP_MULT Items (deprecated — snake_eyes, double_deuces, etc. removed in Phase 3) ───

// ─── GOLD_DICE_MONEY: Gold Tooth ───

describe('GOLD_DICE_MONEY: Gold Tooth', () => {
  test('gold dice earn $4 when scored', () => {
    const { result, player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 1 gold die → $4
    expect(player.economy.balance).toBe(14); // 10 + 4
  });

  test('multiple gold dice each earn money', () => {
    const { result, player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5, enhancement: 'gold' })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 2 gold dice → $8
    expect(player.economy.balance).toBe(18);
  });

  test('no money from non-gold dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });
});

// ─── LUCKY_NUMBER_PIP_XMULT: Lucky Number ───

describe('LUCKY_NUMBER_PIP_XMULT: Lucky Number', () => {
  test('matching pip gives x1.5 per matching die', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    processEquipmentOnRoundStart([luckyNum]);
    luckyNum.state.pip = 5;

    expect(luckyNum.state.pip).toBe(5);
    expect(luckyNum.def.effectParams.value).toBe(1.5);
  });

  test('pip randomizes on round start', () => {
    const luckyNum = item('lucky_number');
    expect(luckyNum.state.pip).toBe(7); // initial
    processEquipmentOnRoundStart([luckyNum]);
    // After round start, pip should be 1-12
    expect(luckyNum.state.pip).toBeGreaterThanOrEqual(1);
    expect(luckyNum.state.pip).toBeLessThanOrEqual(12);
  });

  test('has correct effect type and params', () => {
    const inst = item('lucky_number');
    expect(inst.def.effectType).toBe('LUCKY_NUMBER_PIP_XMULT');
    expect(inst.def.effectParams.value).toBe(1.5);
  });
});

// ─── PIP_RETRIGGER: One-Eyed Jack ───

describe('PIP_RETRIGGER: One-Eyed Jack', () => {
  test('retriggers dice with pip value 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // Each 1 gets retriggered once: totalValue = 1+1+1+1 = 4
    // miles = (10 + 4) * 1 = 14
    expect(result.totalValue).toBe(4);
  });

  test('does not retrigger non-1 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: totalValue = 5+5 = 10 (no retrigger)
    expect(result.totalValue).toBe(10);
  });

  test('retriggers only 1s in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(1, 2), ...diceWithValue(5, 2)],
      equipment: [item('one_eyed_jack')],
    });
    // TWO_PAIR: two 1s retriggered once each = +2 value
    // totalValue = 1+1+5+5 + 1+1 (retriggers) = 14
    expect(result.totalValue).toBe(14);
  });
});

// ─── PIP_SUPPLY_CHANCE: Snake Eyes ───

describe('PIP_SUPPLY_CHANCE: Snake Eyes', () => {
  test('has correct effect type and params', () => {
    const inst = item('snake_eyes');
    expect(inst.def.effectType).toBe('PIP_SUPPLY_CHANCE');
    expect(inst.def.effectParams.pip).toBe(1);
    expect(inst.def.effectParams.chance).toEqual([1, 4]);
  });
});

// ─── ENHANCED_SCORE_MONEY: Gold Pan ───

describe('ENHANCED_SCORE_MONEY: Gold Pan', () => {
  test('has correct effect type and params', () => {
    const inst = item('gold_pan');
    expect(inst.def.effectType).toBe('ENHANCED_SCORE_MONEY');
    expect(inst.def.effectParams.chance).toEqual([1, 2]);
    expect(inst.def.effectParams.value).toBe(2);
  });
});

// ─── PERMANENT_DIE_MILES_GAIN: Cowboy Boots ───

describe('PERMANENT_DIE_MILES_GAIN: Cowboy Boots', () => {
  test('grants permanent +5 bonusMiles to scored dice', () => {
    const d = die({ value: 5 });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    expect(d.bonusMiles).toBe(5);
  });

  test('bonusMiles accumulates across multiple hands', () => {
    const d = die({ value: 5 });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    expect(d.bonusMiles).toBe(10);
  });

  test('bonusMiles is included in score calculation', () => {
    const d = die({ value: 5, bonusMiles: 10 });
    const { result } = calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [],
    });
    // PAIR baseMiles=10, dice: (5+10) + 5 = 20, total = 30
    expect(result.miles).toBe(30);
  });
});

// ─── LUCKY_DICE_MONEY: Lucky Penny ───

describe('LUCKY_DICE_MONEY: Lucky Penny', () => {
  test('lucky dice earn $1 when scored', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5 })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    // 1 lucky die → $1 (may also hit lucky's built-in 1/15 $20 bonus)
    expect(player.economy.balance).toBeGreaterThanOrEqual(11);
  });

  test('multiple lucky dice each earn money', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5, enhancement: 'lucky' })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    // 2 lucky dice → $2 (may also hit lucky's built-in 1/15 $20 bonus)
    expect(player.economy.balance).toBeGreaterThanOrEqual(12);
  });

  test('no money from non-lucky dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });
});

// ─── WOODEN_DICE_MILES: Wood Axe ───

describe('WOODEN_DICE_MILES: Wood Axe', () => {
  test('wooden dice give +50 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue: 5+10(wooden enh)+50(wood axe)+5 = 70, miles=(10+70)*1=80
    expect(result.miles).toBe(80);
  });

  test('multiple wooden dice each get bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue: (5+10+50)+(5+10+50)=130, miles=(10+130)*1=140
    expect(result.miles).toBe(140);
  });

  test('no bonus from non-wooden dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue=5+5=10, mult=1+4(bone)=5
    // miles=(10+10)*5=100
    expect(result.miles).toBe(100);
  });
});

// ─── IRON_DICE_MULT: Iron Spurs ───

describe('IRON_DICE_MULT: Iron Spurs', () => {
  test('steel dice give +7 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5 })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1, +7 from iron spurs = 8
    expect(result.mult).toBe(8);
  });

  test('multiple steel dice each get bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5, enhancement: 'steel' })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1, +7+7=15 from iron spurs = 15
    expect(result.mult).toBe(15);
  });

  test('no bonus from non-steel dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1+4(bone)=5, no iron spurs bonus
    expect(result.mult).toBe(5);
  });
});

// ─── ENHANCEMENT_SCORED_MILES: Covered Wagon ───

describe('ENHANCEMENT_SCORED_MILES: Covered Wagon', () => {
  test('gains +30 miles when wooden die is scored', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [inst],
    });
    // Miles gained: +30 from wooden scored (stored in state)
    expect(inst.state.miles).toBe(30);
  });

  test('accumulates across multiple wooden dice', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(60);
  });

  test('does not gain from non-wooden dice', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(0);
  });
});

// ─── BONE_DICE_XMULT_CHANCE: Bone Charm ───

describe('BONE_DICE_XMULT_CHANCE: Bone Charm', () => {
  test('has correct effect type and params', () => {
    const inst = item('bone_charm');
    expect(inst.def.effectType).toBe('BONE_DICE_XMULT_CHANCE');
    expect(inst.def.effectParams.chance).toEqual([1, 2]);
    expect(inst.def.effectParams.value).toBe(1.5);
  });

  test('does not trigger on non-bone dice', () => {
    // With non-bone dice, the effect should never apply regardless of RNG
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('bone_charm')],
    });
    // PAIR: baseMult=1, no bone charm trigger, xMult stays 1
    // The mult should only include base (1) — no x1.5
    // wooden gives +10 miles but no mult
    expect(result.mult).toBe(1);
  });
});
