import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, calculateTestScore, resetDieIds } from '../testHelpers';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── purple_flower: Grant supply card on score ───

describe('purple_flower sticker', () => {
  test('grants a supply card when die scores', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, sticker: 'purple_flower' }), die({ value: 5 })],
    });
    // Should have gained 1 supply card
    expect(player.consumables.length).toBeGreaterThanOrEqual(1);
    expect(player.consumables[0].def.category).toBe('supply');
  });

  test('grants multiple supply cards for multiple purple_flower dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, sticker: 'purple_flower' }), die({ value: 5, sticker: 'purple_flower' })],
    });
    expect(player.consumables.length).toBeGreaterThanOrEqual(2);
  });

  test('third purple_flower retrigger does not exceed slot limit', () => {
    const { player } = calculateTestScore({
      scoredDice: [
        die({ value: 3, sticker: 'purple_flower' }),
        die({ value: 3, sticker: 'purple_flower' }),
        die({ value: 3, sticker: 'purple_flower' }),
      ],
    });
    expect(player.consumables.length).toBe(2);
  });
});

// ─── red_bullet: Retrigger scored die ───

describe('red_bullet sticker', () => {
  test('triggers scored die twice (doubles value contribution)', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6, sticker: 'red_bullet' })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // Die triggers twice: totalValue = 6 + 6 = 12
    // miles = (5 + 12) * 1 = 17
    expect(result.totalValue).toBe(12);
  });

  test('retriggers enhancement effects', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 4, sticker: 'red_bullet', enhancement: 'bone' })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // Die triggers twice: totalValue = 4 + 4 = 8, bonusMult = 4 + 4 = 8
    // mult = (1 + 8) = 9
    expect(result.totalValue).toBe(8);
    expect(result.mult).toBeMult(9);
  });

  test('retriggers in held-in-hand context', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel', sticker: 'red_bullet' })],
    });
    // PAIR: baseMult=1
    // Held steel die triggers 2 times (base + red_bullet retrigger)
    // xMult = 1.5 * 1.5 = 2.25
    expect(result.mult).toBeMult(2.25);
  });
});

// ─── golden_dollar: Earn $3 when scored ───

describe('golden_dollar sticker', () => {
  test('earns $3 when die is scored', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 3, sticker: 'golden_dollar' })],
      money: 10,
    });
    // Should have earned $3 from golden_dollar
    expect(player.economy.balance).toBe(13);
  });

  test('multiple golden_dollar dice each earn $3', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, sticker: 'golden_dollar' }), die({ value: 5, sticker: 'golden_dollar' })],
      money: 10,
    });
    // PAIR hand — both dice score, each triggers golden_dollar +$3
    expect(player.economy.balance).toBe(16);
  });
});

// ─── blue_moon: Grant trail guide when held ───

describe('blue_moon sticker', () => {
  test('grants a trail guide for the scored hand when held in hand', () => {
    const { player, result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, sticker: 'blue_moon' })],
    });
    expect(player.consumables.length).toBeGreaterThanOrEqual(1);
    const tg = player.consumables.find((c) => c.def.category === 'trail_guide');
    expect(tg).toBeDefined();
    expect(tg!.def.handType).toBe(HandType.PAIR);
    const moonEvent = result.animEvents.find((e) => e.popupType === 'trail_guide');
    expect(moonEvent).toBeDefined();
    expect(moonEvent!.consumableId).toBe(tg!.def.id);
  });

  test('silver bullets retriggers blue moon trail guide grant', () => {
    const { player, result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, sticker: 'blue_moon' })],
      equipment: [item('silver_bullets')],
    });
    expect(result.animEvents.filter((e) => e.popupType === 'trail_guide')).toHaveLength(2);
    expect(player.consumables.filter((c) => c.def.category === 'trail_guide').length).toBe(2);
  });
});
