import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, calculateTestScore, resetDieIds, setupGame } from '../testHelpers';
import { createConsumableInstance, getSupplyDefById, type ConsumableDef } from '../../ConsumablesSystem';
import { initRunRng } from '../../RunRng';
import { roundActions } from '../../store';
import { getPlayerState } from '../testRunPlayer';
import type { EquipmentInstance } from '../../ItemsSystem';

function scorePurpleFlowerKicker(options: {
  runSeed?: string;
  equipment?: EquipmentInstance[];
  startingConsumable?: ConsumableDef;
}) {
  const scoredDice = [die({ value: 5 }), die({ value: 5 }), die({ value: 3, sticker: 'purple_flower' })];
  const { game } = setupGame({
    equipment: options.equipment ?? [],
    dice: [...scoredDice, ...diceWithValue(1, 50)],
  });
  const player = getPlayerState();
  if (options.startingConsumable) {
    player.consumables = [createConsumableInstance(options.startingConsumable)];
  }
  if (options.runSeed) initRunRng(options.runSeed);

  game.startRound();
  roundActions.patch({
    phase: 'ROLL',
    rolledDice: scoredDice.map((d) => ({ id: d.id, value: d.value })),
    selectedForRollIds: scoredDice.map((d) => d.id),
    dieValuesByDieId: Object.fromEntries(scoredDice.map((d) => [d.id, d.value])),
    rerollsRemaining: 6,
  });
  game.selectForScore(scoredDice.map((d) => d.id));
  const result = game.calculateScore();
  player.syncFromStore();
  return { result, player };
}

beforeEach(() => resetDieIds());

// ─── purple_flower: Grant supply card when played but not scoring ───

describe('purple_flower sticker', () => {
  test('grants a supply card when played die does not score', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5 }), die({ value: 5 }), die({ value: 3, sticker: 'purple_flower' })],
    });
    expect(player.consumables.length).toBeGreaterThanOrEqual(1);
    expect(player.consumables[0].def.category).toBe('supply');
  });

  test('does not grant supply when purple_flower die scores', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, sticker: 'purple_flower' }), die({ value: 5 })],
    });
    expect(player.consumables.length).toBe(0);
  });

  test('multiple non-scoring purple_flower kickers respect consumable slot cap', () => {
    const { player } = calculateTestScore({
      scoredDice: [
        die({ value: 5 }),
        die({ value: 5 }),
        die({ value: 3, sticker: 'purple_flower' }),
        die({ value: 7, sticker: 'purple_flower' }),
        die({ value: 9, sticker: 'purple_flower' }),
      ],
    });
    expect(player.consumables.length).toBe(2);
  });

  test('avoids owned supply cards without counterfeit_goods', () => {
    const ownedId = 'coffee_tin';
    const owned = getSupplyDefById(ownedId)!;

    for (let i = 0; i < 50; i++) {
      const { player } = scorePurpleFlowerKicker({
        runSeed: `purple-flower-no-dupe-${i}`,
        startingConsumable: owned,
      });
      expect(player.consumables.length).toBe(2);
      const granted = player.consumables.find((c) => c.def.id !== ownedId);
      expect(granted).toBeDefined();
      expect(granted!.def.id).not.toBe(ownedId);
    }
  });

  test('allows duplicate supply with counterfeit_goods', () => {
    const ownedId = 'coffee_tin';
    const owned = getSupplyDefById(ownedId)!;
    let sawDuplicate = false;

    for (let i = 0; i < 80; i++) {
      const { player } = scorePurpleFlowerKicker({
        runSeed: `purple-flower-dupe-${i}`,
        startingConsumable: owned,
        equipment: [item('counterfeit_goods')],
      });
      if (player.consumables.filter((c) => c.def.id === ownedId).length > 1) {
        sawDuplicate = true;
        break;
      }
    }

    expect(sawDuplicate).toBe(true);
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

// ─── blue_moon: Trail guide at round win (not during scoring) ───

describe('blue_moon sticker', () => {
  test('does not grant a trail guide during scoring', () => {
    const { player, result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, sticker: 'blue_moon' })],
    });
    expect(player.consumables.filter((c) => c.def.category === 'trail_guide').length).toBe(0);
    expect(result.animEvents.some((e) => e.popupType === 'trail_guide')).toBe(false);
  });
});

// ─── green_contagion: Spread enhancement + sticker to played neighbors ───

describe('green_contagion sticker', () => {
  test('spreads enhancement and sticker to left play-order neighbor', () => {
    const neighbor = die({ value: 4 });
    const source = die({ value: 6, enhancement: 'bone', sticker: 'green_contagion' });
    const { result, player } = calculateTestScore({
      scoredDice: [neighbor, source],
      runSeed: 'gc-4',
    });
    const patched = player.dice.find((d) => d.id === neighbor.id);
    expect(patched?.sticker).toBe('green_contagion');
    expect(patched?.enhancement).toBe('bone');
    expect(result.mutations.diceEnhanced.some((p) => p.id === neighbor.id && p.sticker === 'green_contagion')).toBe(
      true,
    );
  });

  test('does not spread to unplayed rolled dice', () => {
    const playedNeighbor = die({ value: 4 });
    const source = die({ value: 6, enhancement: 'bone', sticker: 'green_contagion' });
    const unplayed = die({ value: 8 });
    const { player } = calculateTestScore({
      scoredDice: [playedNeighbor, source],
      heldDice: [unplayed],
      runSeed: 'gc-4',
    });
    const untouched = player.dice.find((d) => d.id === unplayed.id);
    expect(untouched?.sticker).toBeNull();
    expect(untouched?.enhancement).toBeNull();
  });

  test('50% fail seed does not spread', () => {
    const neighbor = die({ value: 4 });
    const source = die({ value: 6, enhancement: 'bone', sticker: 'green_contagion' });
    const { player } = calculateTestScore({
      scoredDice: [neighbor, source],
      runSeed: 'gc-fail-2',
    });
    const patched = player.dice.find((d) => d.id === neighbor.id);
    expect(patched?.sticker).toBeNull();
    expect(patched?.enhancement).toBeNull();
  });

  test('both neighbors can spread independently', () => {
    const left = die({ value: 2 });
    const source = die({ value: 6, enhancement: 'lucky', sticker: 'green_contagion' });
    const right = die({ value: 8 });
    const { player } = calculateTestScore({
      scoredDice: [left, source, right],
      runSeed: 'gc-both-8',
    });
    expect(player.dice.find((d) => d.id === left.id)?.sticker).toBe('green_contagion');
    expect(player.dice.find((d) => d.id === right.id)?.sticker).toBe('green_contagion');
  });

  test('loaded_dice turns a failing spread seed into a success', () => {
    const neighbor = die({ value: 4 });
    const source = die({ value: 6, enhancement: 'bone', sticker: 'green_contagion' });
    const { player } = calculateTestScore({
      scoredDice: [neighbor, source],
      runSeed: 'gc-fail-2',
      equipment: [item('loaded_dice')],
    });
    const patched = player.dice.find((d) => d.id === neighbor.id);
    expect(patched?.sticker).toBe('green_contagion');
    expect(patched?.enhancement).toBe('bone');
  });

  test('loaded_dice doubles spread chance for a single neighbor', () => {
    const neighbor = die({ value: 4 });
    const source = die({ value: 6, enhancement: 'bone', sticker: 'green_contagion' });
    let spreadBase = 0;
    let spreadLoaded = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { player: basePlayer } = calculateTestScore({
        scoredDice: [neighbor, source],
        runSeed: `gc-rate-base-${i}`,
      });
      if (basePlayer.dice.find((d) => d.id === neighbor.id)?.sticker === 'green_contagion') spreadBase++;

      const { player: loadedPlayer } = calculateTestScore({
        scoredDice: [neighbor, source],
        runSeed: `gc-rate-loaded-${i}`,
        equipment: [item('loaded_dice')],
      });
      if (loadedPlayer.dice.find((d) => d.id === neighbor.id)?.sticker === 'green_contagion') spreadLoaded++;
    }

    const baseRate = spreadBase / runs;
    const loadedRate = spreadLoaded / runs;
    expect(baseRate).toBeGreaterThan(0.42);
    expect(baseRate).toBeLessThan(0.58);
    expect(loadedRate).toBeGreaterThan(0.95);
  });
});
