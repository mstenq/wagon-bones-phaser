import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { diceWithValue, item, calculateTestScore, resetDieIds } from '../testHelpers';

beforeEach(() => resetDieIds());

// ─── PARITY_MULT Items ───

describe('PARITY_MULT: Even Odds (even, +4 mult per even die)', () => {
  test('triggers on each even die scored', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('even_odds')],
    });
    // THREE_OF_A_KIND: baseMult=3
    // +4 per even die scored (3 dice with value 4) = +12
    // mult = (3 + 12) * 1 = 15
    expect(result.mult).toBeMult(15);
  });

  test('does not trigger on odd dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('even_odds')],
    });
    // No even dice → no bonus
    expect(result.mult).toBeMult(3);
  });

  test('only triggers on even dice in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(4, 2), ...diceWithValue(5, 2)],
      equipment: [item('even_odds')],
    });
    // TWO_PAIR: baseMult=2
    // 2 even dice (4s) → +8
    // mult = (2 + 8) * 1 = 10
    expect(result.mult).toBeMult(10);
  });

  test('works with value 12 (even)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(12, 2),
      equipment: [item('even_odds')],
    });
    // PAIR: baseMult=1, 2 even dice → +8 → mult=9
    expect(result.mult).toBeMult(9);
  });

  test('Mirror Lake copies +4 mult per even die scored', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('mirror_lake'), item('even_odds')],
    });
    // THREE_OF_A_KIND: baseMult=3, +12 even_odds +12 mirror = 27
    expect(result.mult).toBeMult(27);
  });
});

// ─── PARITY_MILES Items ───

describe('PARITY_MILES: Odd Fellow (odd, +31 miles per odd die)', () => {
  test('triggers on each odd die scored', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('odd_fellow')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // totalValue = 5+5+5 + 31+31+31 = 108
    // miles = (20 + 108) * 3 = 384
    expect(result.totalValue).toBe(108);
    expect(result.miles).toBeMiles(384);
  });

  test('does not trigger on even dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('odd_fellow')],
    });
    // totalValue = 12 (just pip values)
    expect(result.totalValue).toBe(12);
  });

  test('only triggers on odd dice in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 2), ...diceWithValue(4, 2)],
      equipment: [item('odd_fellow')],
    });
    // TWO_PAIR: baseMiles=15, baseMult=2
    // totalValue = 3+3+4+4 + 31+31 (two 3s are odd) = 76
    // miles = (15 + 76) * 2 = 182
    expect(result.totalValue).toBe(76);
    expect(result.miles).toBeMiles(182);
  });

  test('works with value 11 (odd)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(11, 2),
      equipment: [item('odd_fellow')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // totalValue = 11+11 + 31+31 = 84
    // miles = (10 + 84) * 1 = 94
    expect(result.totalValue).toBe(84);
    expect(result.miles).toBeMiles(94);
  });

  test('Mirror Lake copies +31 miles per odd die scored', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('mirror_lake'), item('odd_fellow')],
    });
    // THREE_OF_A_KIND: baseMiles=20, totalValue=15+186 parity = 201, miles=663
    expect(result.totalValue).toBe(201);
    expect(result.miles).toBeMiles(663);
  });
});
