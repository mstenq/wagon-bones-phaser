import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, itemWithState, calculateTestScore, setupGame, resetDieIds } from '../testHelpers';
import { processEndOfRound, processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

describe('ADD_MULT: Horseshoe', () => {
  test('+4 mult on any hand', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe')],
    });
    // PAIR: baseMult=1, +4 from horseshoe = 5
    expect(result.mult).toBeMult(5);
  });

  test('stacks with multiple horseshoes', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('horseshoe')],
    });
    // baseMult=1, +4+4 = 9
    expect(result.mult).toBeMult(9);
  });

  test('adds to existing hand mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('horseshoe')],
    });
    // THREE_OF_A_KIND: baseMult=3, +4 = 7
    expect(result.mult).toBeMult(7);
  });
});

describe('ADD_MULT_RISKY: Dynamite', () => {
  test('+15 mult during scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('dynamite')],
    });
    // PAIR: baseMult=1, +15 = 16
    expect(result.mult).toBeMult(16);
  });

  test('stacks with other mult equipment', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('dynamite')],
    });
    // baseMult=1, +4+15 = 20
    expect(result.mult).toBeMult(20);
  });

  test('destroyed at end of round when random hits (1 in 6)', () => {
    const original = Math.random;
    Math.random = () => 0.1; // 0.1 < 1/6 → explodes
    try {
      const equip = [item('horseshoe'), item('dynamite')];
      const result = processEndOfRound(equip);
      expect(result.destroyedIndices).toContain(1); // dynamite is at index 1
    } finally {
      Math.random = original;
    }
  });

  test('survives when random misses', () => {
    const original = Math.random;
    Math.random = () => 0.5; // 0.5 > 1/6 → survives
    try {
      const equip = [item('horseshoe'), item('dynamite')];
      const result = processEndOfRound(equip);
      expect(result.destroyedIndices).toEqual([]);
    } finally {
      Math.random = original;
    }
  });

  test('destroyed equipment is removed from player after endDay', () => {
    const original = Math.random;
    Math.random = () => 0.1; // force destruction
    try {
      const { game, player } = setupGame({
        equipment: [item('horseshoe'), item('dynamite')],
        dice: diceWithValue(5, 50),
      });
      game.startRound();
      // Play through a day: SELECT → ROLL → SCORE → DAY_END
      const diceIds = game.state.hand.slice(0, 5).map((d) => d.id);
      game.selectForRoll(diceIds);
      const scoredIds = game.state.rolledDice.slice(0, 2).map((d) => d.id);
      game.selectForScore(scoredIds);
      game.calculateScore();
      game.endDay();
      // Dynamite should be gone, horseshoe remains; unlocks Nitro in shops
      expect(player.equipment.length).toBe(1);
      expect(player.equipment[0].def.id).toBe('horseshoe');
      expect(player.dynamiteSelfDestructed).toBe(true);
    } finally {
      Math.random = original;
    }
  });
});

// ─── SHOP_REROLL_MULT_GAIN: Bargain Bin ───

describe('SHOP_REROLL_MULT_GAIN: Bargain Bin', () => {
  test('starts at +0 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('bargain_bin')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gains +2 mult per shop reroll via payShopReroll', () => {
    const { player } = setupGame({
      equipment: [item('bargain_bin')],
      money: 100,
    });
    player.payShopReroll();
    const bargain = player.equipment[0];
    expect(bargain.state.mult).toBe(2);

    player.payShopReroll();
    expect(bargain.state.mult).toBe(4);
  });

  test('reroll cost increases by $1 per reroll', () => {
    const { player } = setupGame({ money: 100 });
    const baseCost = player.shopRerollCost;
    player.payShopReroll();
    expect(player.shopRerollCost).toBe(baseCost + 1);
    player.payShopReroll();
    expect(player.shopRerollCost).toBe(baseCost + 2);
  });

  test('reroll cost resets via resetShopRerolls', () => {
    const { player } = setupGame({ money: 100 });
    const baseCost = player.shopRerollCost;
    player.payShopReroll();
    player.payShopReroll();
    expect(player.shopRerollCost).toBe(baseCost + 2);
    player.resetShopRerolls();
    expect(player.shopRerollCost).toBe(baseCost);
  });

  test('accumulated mult applied during scoring', () => {
    const { player } = setupGame({
      equipment: [item('bargain_bin')],
      money: 100,
    });
    player.payShopReroll();
    player.payShopReroll();
    player.payShopReroll();
    // 3 rerolls × +2 = +6

    const inst = player.equipment[0];
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1 + 6 = 7
    expect(result.mult).toBeMult(7);
  });
});

// ─── DECAYING_MULT: Fading Memory ───

describe('DECAYING_MULT: Fading Memory', () => {
  test('first scored round has +20 mult (no decay until round end)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('fading_memory')],
    });
    // PAIR: baseMult=1 + 20 = 21
    expect(result.mult).toBeMult(21);
  });

  test('loses -4 mult per round end', () => {
    const inst = item('fading_memory');
    processEndOfRound([inst]);
    expect(inst.state.mult).toBe(16);
    expect(inst.state.roundsPlayed).toBe(1);

    processEndOfRound([inst]);
    expect(inst.state.mult).toBe(12);
    expect(inst.state.roundsPlayed).toBe(2);
  });

  test('marked for destruction after 5 round ends', () => {
    const inst = item('fading_memory');
    for (let i = 0; i < 4; i++) {
      const result = processEndOfRound([inst]);
      expect(result.destroyedIndices).toEqual([]);
    }
    const result = processEndOfRound([inst]);
    expect(result.destroyedIndices).toContain(0);
  });

  test('mult value after 3 round ends then score', () => {
    const inst = item('fading_memory');
    for (let i = 0; i < 3; i++) processEndOfRound([inst]);
    // 20 - 3*4 = 8

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeMult(9); // baseMult=1 + 8
  });
});

// ─── SELL_VALUE_AS_MULT: Desperado ───

describe('SELL_VALUE_AS_MULT: Desperado', () => {
  test('adds sell value of other equipment as mult', () => {
    const horseshoe = item('horseshoe'); // cost 2, sell = 1
    const dynamite = item('dynamite'); // cost 5, sell = 2
    const desp = item('desperado');

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [desp, horseshoe, dynamite],
    });
    // PAIR: baseMult=1
    // horseshoe: +4, dynamite: +15 → +19
    // desperado: +sell values of horseshoe(1) + dynamite(2) = +3
    // total mult = 1 + 19 + 3 = 23
    expect(result.mult).toBeMult(23);
  });

  test('no bonus when alone', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('desperado')],
    });
    expect(result.mult).toBeMult(1);
  });
});

// ─── RANDOM_MULT: Wild Card ───

describe('RANDOM_MULT: Wild Card', () => {
  test('adds random bonus mult between 0 and 23', () => {
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      resetDieIds();
      const { result } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('wild_card')],
      });
      // PAIR: baseMult=1, bonusMult from wild_card is random 0-23
      results.push(result.mult);
    }
    // All results should be >= 1 (baseMult) and <= 24 (1 + 23)
    expect(results.every((r) => r >= 1 && r <= 24)).toBe(true);
    // At least some variation (not all the same)
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });
});
