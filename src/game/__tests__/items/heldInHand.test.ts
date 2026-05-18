import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, calculateTestScore, resetDieIds } from '../testHelpers';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── HELD_RETRIGGER: Silver Bullets ───

describe('HELD_RETRIGGER: Silver Bullets', () => {
  test('retriggers steel held-in-hand dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
      equipment: [item('silver_bullets')],
    });
    // PAIR: baseMult=1
    // Steel held triggers 2 times (base + 1 retrigger from silver_bullets)
    // xMult = 1.5 * 1.5 = 2.25
    // heldMult = (1 + 0) * 2.25 = 2.25
    expect(result.mult).toBe(2.25);
  });

  test('retriggers eleventh_crossing effect', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 11 })],
      equipment: [item('silver_bullets'), item('eleventh_crossing')],
    });
    // PAIR: baseMult=1
    // Held die with value 11: eleventh_crossing triggers +11 per trigger
    // 2 triggers (base + silver_bullets) → +22 bonusMult
    // heldMult = (1 + 22) * 1 = 23
    expect(result.mult).toBe(23);
  });

  test('without silver_bullets, steel triggers once', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
      equipment: [],
    });
    // xMult = 1.5 (one trigger)
    expect(result.mult).toBe(1.5);
  });
});

// ─── HELD_LOWEST_MULT: Bottom Dollar ───

describe('HELD_LOWEST_MULT: Bottom Dollar', () => {
  test('adds double lowest held die value to mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3 }), die({ value: 7 })],
      equipment: [item('bottom_dollar')],
    });
    // PAIR: baseMult=1
    // Lowest held = 3, only die(3) matches → +6
    // heldMult = (1 + 6) * 1 = 7
    expect(result.mult).toBe(7);
  });

  test('only triggers on leftmost die when multiple tie for lowest', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 2 }), die({ value: 2 }), die({ value: 9 })],
      equipment: [item('bottom_dollar')],
    });
    // Lowest = 2, but only leftmost die triggers → +4
    // heldMult = (1 + 4) * 1 = 5
    expect(result.mult).toBe(5);
  });

  test('single held die is always the lowest', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 10 })],
      equipment: [item('bottom_dollar')],
    });
    // Lowest = 10 → +20
    // heldMult = (1 + 20) * 1 = 21
    expect(result.mult).toBe(21);
  });

  test('no held dice = no effect', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [],
      equipment: [item('bottom_dollar')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── HELD_PIP_XMULT: Ace in the Hole ───

describe('HELD_PIP_XMULT: Ace in the Hole (pip 1, x1.5)', () => {
  test('multiplies mult for each held 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 1 })],
      equipment: [item('ace_in_the_hole')],
    });
    // xMult = 1.5
    // heldMult = (1 + 0) * 1.5 = 1.5
    expect(result.mult).toBe(1.5);
  });

  test('stacks multiplicatively with multiple held 1s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 1 }), die({ value: 1 })],
      equipment: [item('ace_in_the_hole')],
    });
    // xMult = 1.5 * 1.5 = 2.25
    expect(result.mult).toBe(2.25);
  });

  test('does not trigger on non-1 held dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 7 })],
      equipment: [item('ace_in_the_hole')],
    });
    expect(result.mult).toBe(1);
  });

  test('retriggers with silver_bullets', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 1 })],
      equipment: [item('ace_in_the_hole'), item('silver_bullets')],
    });
    // 2 triggers per die: xMult = 1.5 * 1.5 = 2.25
    expect(result.mult).toBe(2.25);
  });
});

// ─── HELD_PIP_MULT: The Eleventh Crossing ───

describe('HELD_PIP_MULT: The Eleventh Crossing (pip 11, +11 mult)', () => {
  test('adds mult for each held 11', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 11 })],
      equipment: [item('eleventh_crossing')],
    });
    // PAIR: baseMult=1
    // +11 bonusMult → heldMult = (1 + 11) * 1 = 12
    expect(result.mult).toBe(12);
  });

  test('stacks with multiple held 11s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 11 }), die({ value: 11 })],
      equipment: [item('eleventh_crossing')],
    });
    // +11 + +11 = +22 → heldMult = (1 + 22) * 1 = 23
    expect(result.mult).toBe(23);
  });

  test('does not trigger on non-11 held dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 10 })],
      equipment: [item('eleventh_crossing')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── HELD_ENHANCED_MONEY: Prospector's Pouch ───

describe("HELD_ENHANCED_MONEY: Prospector's Pouch", () => {
  test('does not trigger on non-enhanced held dice', () => {
    const { result, player } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3 })], // no enhancement
      equipment: [item('prospectors_pouch')],
      money: 10,
    });
    expect(result.mult).toBe(1);
    expect(player.economy.balance).toBe(10); // unchanged
  });

  test('earns $1 per enhanced held die when random hits', () => {
    const original = Math.random;
    Math.random = () => 0.1; // always < 0.5 (1 in 2 chance), so it triggers
    try {
      const { player } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        heldDice: [die({ value: 3, enhancement: 'bone' }), die({ value: 7, enhancement: 'steel' })],
        equipment: [item('prospectors_pouch')],
        money: 10,
      });
      // 2 enhanced held dice, both trigger → +$2
      expect(player.economy.balance).toBe(12);
    } finally {
      Math.random = original;
    }
  });

  test('does not earn money when random misses', () => {
    const original = Math.random;
    Math.random = () => 0.9; // always >= 0.5, so it never triggers
    try {
      const { player } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        heldDice: [die({ value: 3, enhancement: 'bone' })],
        equipment: [item('prospectors_pouch')],
        money: 10,
      });
      expect(player.economy.balance).toBe(10); // unchanged
    } finally {
      Math.random = original;
    }
  });
});

// ─── HELD_RETRIGGER: Silver Bullets ───

describe('HELD_RETRIGGER: Silver Bullets', () => {
  test('retriggers held dice (same as Double Down)', () => {
    const inst = item('silver_bullets');
    expect(inst.def.effectType).toBe('HELD_RETRIGGER');
    expect(inst.def.effectParams.value).toBe(1);
  });
});
