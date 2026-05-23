import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import {
  processEndOfRound,
  processEquipmentAfterHandScored,
  processEquipmentOnPackOpened,
} from '../../EquipmentEffects';
import { getLoadedDiceMultiplier } from '../../Constants';
import { executeConsumableEffect, createConsumableInstance, getSupplyDefById } from '../../ConsumablesSystem';
import { getItemAuraById } from '../../ItemsSystem';
import { HandType } from '../../types';
import { rollDie } from '../../DiceSystem';
import { getPlayerState, resetPlayerState } from '../../PlayerState';
import '../../effects';

beforeEach(() => {
  resetDieIds();
  resetPlayerState();
});

// ─── getLoadedDiceMultiplier ───

describe('getLoadedDiceMultiplier', () => {
  test('returns 1 with no Loaded Dice', () => {
    const equipment = [item('horseshoe')];
    expect(getLoadedDiceMultiplier(equipment)).toBe(1);
  });

  test('returns 2 with one Loaded Dice', () => {
    const equipment = [item('horseshoe'), item('loaded_dice')];
    expect(getLoadedDiceMultiplier(equipment)).toBe(2);
  });

  test('returns 4 with two Loaded Dice (stacks)', () => {
    const equipment = [item('loaded_dice'), item('loaded_dice')];
    expect(getLoadedDiceMultiplier(equipment)).toBe(4);
  });

  test('returns 8 with three Loaded Dice', () => {
    const equipment = [item('loaded_dice'), item('loaded_dice'), item('loaded_dice')];
    expect(getLoadedDiceMultiplier(equipment)).toBe(8);
  });
});

// ─── LOADED_DICE item definition ───

describe('LOADED_DICE: item definition', () => {
  test('has correct properties', () => {
    const inst = item('loaded_dice');
    expect(inst.def.effectType).toBe('LOADED_DICE');
    expect(inst.def.cost).toBe(4);
    expect(inst.def.rarity).toBe('uncommon');
  });

  test('does not itself affect scoring', () => {
    // Loaded Dice alone adds no mult/miles
    const { result: withLoaded } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('loaded_dice')],
    });
    const { result: without } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [],
    });
    expect(withLoaded.miles).toBe(without.miles);
  });
});

// ─── loaded enhancement die rolling ───

describe('loaded enhancement rolling', () => {
  test('uses the selected loaded die target when the weighted range hits the target bucket', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(7);
    const original = Math.random;
    Math.random = () => 0;

    try {
      const rolled = rollDie(die({ enhancement: 'loaded', value: 0 }));
      expect(rolled.value).toBe(7);
    } finally {
      Math.random = original;
    }
  });

  test('falls back to a normal roll when no loaded die target is selected', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(null);
    const original = Math.random;
    Math.random = () => 0.01;

    try {
      const rolled = rollDie(die({ enhancement: 'loaded', value: 0 }));
      expect(rolled.value).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  test('raises the selected face close to one-in-six for loaded dice', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(9);

    let targetHits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ enhancement: 'loaded', value: 0 })).value === 9) {
        targetHits++;
      }
    }

    const rate = targetHits / trials;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.185);
  });

  test('Loaded Dice equipment raises the selected face close to one-in-three', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(9);
    player.equipment = [item('loaded_dice')];

    let targetHits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ enhancement: 'loaded', value: 0 })).value === 9) {
        targetHits++;
      }
    }

    const rate = targetHits / trials;
    expect(rate).toBeGreaterThan(0.31);
    expect(rate).toBeLessThan(0.36);
  });

  test('enough Loaded Dice equipment can guarantee the selected face', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(4);
    player.equipment = [item('loaded_dice'), item('loaded_dice'), item('loaded_dice')];
    const original = Math.random;
    Math.random = () => 0.99;

    try {
      const rolled = rollDie(die({ enhancement: 'loaded', value: 0 }));
      expect(rolled.value).toBe(4);
    } finally {
      Math.random = original;
    }
  });
});

// ─── Dynamite: ADD_MULT_RISKY destruction probability ───

describe('Loaded Dice + Dynamite (ADD_MULT_RISKY)', () => {
  test('doubles destroy chance with one Loaded Dice', () => {
    // Dynamite: destroyChance [1, 6] → normally ~16.7%, with loaded dice → ~33.3%
    const equipment = [item('dynamite'), item('loaded_dice')];
    let destroyed = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const { destroyedIndices } = processEndOfRound([item('dynamite'), item('loaded_dice')]);
      if (destroyedIndices.includes(0)) destroyed++;
    }

    const rate = destroyed / trials;
    // Expected: 2/6 ≈ 0.333, allow reasonable margin
    expect(rate).toBeGreaterThan(0.28);
    expect(rate).toBeLessThan(0.39);
  });

  test('without Loaded Dice has base destroy rate', () => {
    let destroyed = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const { destroyedIndices } = processEndOfRound([item('dynamite')]);
      if (destroyedIndices.includes(0)) destroyed++;
    }

    const rate = destroyed / trials;
    // Expected: 1/6 ≈ 0.167
    expect(rate).toBeGreaterThan(0.13);
    expect(rate).toBeLessThan(0.21);
  });
});

// ─── Nitro: XMULT_RISKY destruction probability ───

describe('Loaded Dice + Nitro (XMULT_RISKY)', () => {
  test('doubles destroy chance with one Loaded Dice', () => {
    // Nitro: destroyChance [1, 1000] → normally 0.1%, with loaded → 0.2%
    let destroyed = 0;
    const trials = 100000;

    for (let i = 0; i < trials; i++) {
      const { destroyedIndices } = processEndOfRound([item('nitro'), item('loaded_dice')]);
      if (destroyedIndices.includes(0)) destroyed++;
    }

    const rate = destroyed / trials;
    // Expected: 2/1000 = 0.002
    expect(rate).toBeGreaterThan(0.001);
    expect(rate).toBeLessThan(0.004);
  });
});

// ─── Snake Eyes: PIP_SUPPLY_CHANCE ───

describe('Loaded Dice + Snake Eyes (PIP_SUPPLY_CHANCE)', () => {
  test('doubles supply card chance when 1 is scored', () => {
    // Snake Eyes: chance [1, 4] for pip 1, with loaded → [2, 4] = 50%
    let supplyCount = 0;
    const runs = 5000;
    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 1 })],
        equipment: [item('snake_eyes'), item('loaded_dice')],
        money: 10,
      });
      if (player.consumables.length > 0) supplyCount++;
    }

    const rate = supplyCount / runs;
    // Expected: 2/4 = 0.5 (doubled from 1/4 = 0.25)
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  });

  test('base rate without Loaded Dice', () => {
    let supplyCount = 0;
    const runs = 5000;
    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 1 })],
        equipment: [item('snake_eyes')],
        money: 10,
      });
      if (player.consumables.length > 0) supplyCount++;
    }

    const rate = supplyCount / runs;
    // Expected: 1/4 = 0.25
    expect(rate).toBeGreaterThan(0.19);
    expect(rate).toBeLessThan(0.31);
  });
});

// ─── Gold Pan: ENHANCED_SCORE_MONEY ───

describe('Loaded Dice + Gold Pan (ENHANCED_SCORE_MONEY)', () => {
  test('doubles money chance with Loaded Dice', () => {
    // Gold Pan: chance [1, 2], value $2 → with loaded, chance becomes [2, 2] = 100%
    let moneyEarned = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'bone' })],
        equipment: [item('gold_pan'), item('loaded_dice')],
        money: 10,
      });
      moneyEarned += player.economy.balance - 10;
    }

    const avgEarned = moneyEarned / runs;
    // With loaded dice, chance is 2/2 = 100%, so $2 every time
    expect(avgEarned).toBeGreaterThan(1.85);
    expect(avgEarned).toBeLessThan(2.15);
  });

  test('base rate without Loaded Dice (50% chance)', () => {
    let moneyEarned = 0;
    const runs = 2000;

    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'bone' })],
        equipment: [item('gold_pan')],
        money: 10,
      });
      moneyEarned += player.economy.balance - 10;
    }

    const avgEarned = moneyEarned / runs;
    // Base: 1/2 chance for $2 = average $1
    expect(avgEarned).toBeGreaterThan(0.8);
    expect(avgEarned).toBeLessThan(1.2);
  });
});

// ─── Surveyor's Transit: HAND_UPGRADE_CHANCE ───

describe("Loaded Dice + Surveyor's Transit (HAND_UPGRADE_CHANCE)", () => {
  test('doubles upgrade chance', () => {
    // Surveyor's Transit: chance [1, 4], with loaded → [2, 4] = 50%
    let upgraded = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const equipment = [item('surveyors_transit'), item('loaded_dice')];
      const upgrades = processEquipmentAfterHandScored(equipment, HandType.PAIR);
      if (upgrades.length > 0) upgraded++;
    }

    const rate = upgraded / runs;
    // Expected: 2/4 = 0.5
    expect(rate).toBeGreaterThan(0.43);
    expect(rate).toBeLessThan(0.57);
  });

  test('base rate without Loaded Dice', () => {
    let upgraded = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const equipment = [item('surveyors_transit')];
      const upgrades = processEquipmentAfterHandScored(equipment, HandType.PAIR);
      if (upgrades.length > 0) upgraded++;
    }

    const rate = upgraded / runs;
    // Expected: 1/4 = 0.25
    expect(rate).toBeGreaterThan(0.19);
    expect(rate).toBeLessThan(0.31);
  });
});

// ─── Leftovers: PACK_OPEN_SUPPLY_CHANCE ───

describe('Loaded Dice + Leftovers (PACK_OPEN_SUPPLY_CHANCE)', () => {
  test('doubles supply chance on pack open', () => {
    // Leftovers: chance [1, 2], with loaded → [2, 2] = 100%
    let granted = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const equipment = [item('leftovers'), item('loaded_dice')];
      if (processEquipmentOnPackOpened(equipment)) granted++;
    }

    const rate = granted / runs;
    // Expected: 2/2 = 1.0 (guaranteed)
    expect(rate).toBe(1.0);
  });

  test('base rate without Loaded Dice (50%)', () => {
    let granted = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const equipment = [item('leftovers')];
      if (processEquipmentOnPackOpened(equipment)) granted++;
    }

    const rate = granted / runs;
    // Expected: 1/2 = 0.5
    expect(rate).toBeGreaterThan(0.43);
    expect(rate).toBeLessThan(0.57);
  });
});

// ─── Moonshine: ENHANCED_RETRIGGER destroy chance ───

describe('Loaded Dice + Moonshine (ENHANCED_RETRIGGER)', () => {
  test('doubles enhanced dice destroy chance', () => {
    // Moonshine: destroyChance [1, 6], with loaded → [2, 6] ≈ 33%
    let destroyed = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'bone' })],
        equipment: [item('moonshine'), item('loaded_dice')],
        money: 10,
      });
      // Moonshine destroys dice from the player's collection
      // calculateTestScore pads the pool with 50 extra dice, so initial is 51
      if (player.dice.length < 51) destroyed++;
    }

    const rate = destroyed / runs;
    // Expected: 2/6 ≈ 0.333
    expect(rate).toBeGreaterThan(0.27);
    expect(rate).toBeLessThan(0.4);
  });

  test('doubles diamond destroy chance', () => {
    // Moonshine: diamondDestroyChance [1, 3], with loaded → [2, 3] ≈ 66.7%
    let destroyed = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'diamond' })],
        equipment: [item('moonshine'), item('loaded_dice')],
        money: 10,
      });
      if (player.dice.length < 51) destroyed++;
    }

    const rate = destroyed / runs;
    // Expected: 2/3 ≈ 0.667
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.74);
  });
});

// ─── Bone Charm: BONE_DICE_XMULT_CHANCE ───

describe('Loaded Dice + Bone Charm (BONE_DICE_XMULT_CHANCE)', () => {
  test('doubles xMult chance with Loaded Dice (becomes guaranteed)', () => {
    // Bone Charm: chance [1, 2], value x1.5, with loaded → [2, 2] = 100%
    let triggered = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const { result } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'bone' })],
        equipment: [item('bone_charm'), item('loaded_dice')],
      });
      // PAIR baseMult=1, +4 per bone die (2 dice=+8), bone charm x1.5 per trigger
      // Without charm: (1+8)*1 = 9, with both triggered: (1+8)*1.5*1.5 = 20.25
      if (result.mult > 9.5) triggered++;
    }

    // Should be guaranteed with loaded dice (100% per die)
    expect(triggered).toBe(runs);
  });

  test('base rate without Loaded Dice (50% per die)', () => {
    let neitherTriggered = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { result } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
        equipment: [item('bone_charm')],
      });
      // PAIR baseMult=1, +4 from bone die, bone charm x1.5 when triggered
      // Without charm: (1+4)*1 = 5, with charm triggered: (1+4)*1.5 = 7.5
      if (result.mult <= 5.1) neitherTriggered++;
    }

    const noTriggerRate = neitherTriggered / runs;
    // Expected: 50% chance NOT to trigger = 0.5
    expect(noTriggerRate).toBeGreaterThan(0.43);
    expect(noTriggerRate).toBeLessThan(0.57);
  });
});

// ─── Lucky Dice Enhancement ───

describe('Loaded Dice + Lucky dice enhancement', () => {
  test('doubles lucky mult chance (1/5 → 2/5)', () => {
    let multHits = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { result } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'lucky' })],
        equipment: [item('loaded_dice')],
      });
      // Base PAIR mult = 1, lucky +20 when triggered
      if (result.mult > 10) multHits++;
    }

    const rate = multHits / runs;
    // Expected: 2/5 = 0.4
    expect(rate).toBeGreaterThan(0.33);
    expect(rate).toBeLessThan(0.47);
  });

  test('doubles lucky money chance (1/15 → 2/15)', () => {
    let moneyHits = 0;
    const runs = 10000;

    for (let i = 0; i < runs; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'lucky' })],
        equipment: [item('loaded_dice')],
        money: 0,
      });
      if (player.economy.balance > 0) moneyHits++;
    }

    const rate = moneyHits / runs;
    // Expected: 2/15 ≈ 0.133
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.17);
  });

  test('base lucky mult chance without Loaded Dice (1/5)', () => {
    let multHits = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { result } = calculateTestScore({
        scoredDice: [die({ value: 5, enhancement: 'lucky' })],
        equipment: [],
      });
      if (result.mult > 10) multHits++;
    }

    const rate = multHits / runs;
    // Expected: 1/5 = 0.2
    expect(rate).toBeGreaterThan(0.14);
    expect(rate).toBeLessThan(0.26);
  });
});

// ─── Two Loaded Dice stack ───

describe('Loaded Dice stacking (2 copies = 4x)', () => {
  test('Leftovers with 2 Loaded Dice is guaranteed', () => {
    // Leftovers: [1, 2] → with 2 loaded: 4/2 = always triggers (capped)
    let granted = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const equipment = [item('leftovers'), item('loaded_dice'), item('loaded_dice')];
      if (processEquipmentOnPackOpened(equipment)) granted++;
    }

    expect(granted).toBe(runs);
  });

  test('Dynamite with 2 Loaded Dice has ~66% destroy chance', () => {
    // Dynamite: [1, 6] → with 2 loaded: 4/6 ≈ 66.7%
    let destroyed = 0;
    const runs = 10000;

    for (let i = 0; i < runs; i++) {
      const { destroyedIndices } = processEndOfRound([item('dynamite'), item('loaded_dice'), item('loaded_dice')]);
      if (destroyedIndices.includes(0)) destroyed++;
    }

    const rate = destroyed / runs;
    // Expected: 4/6 ≈ 0.667
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.73);
  });
});

// ─── Bless supply card ───

describe('Loaded Dice + Bless supply card', () => {
  test('doubles blessing chance', () => {
    // Bless: 1/4 → with loaded 2/4 = 50%
    let totalBlessed = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { player } = setupGame({
        equipment: [item('horseshoe'), item('loaded_dice')],
        money: 10,
      });
      const blessDef = getSupplyDefById('bless');
      if (!blessDef) throw new Error('bless not found');
      const consumed = createConsumableInstance(blessDef);
      executeConsumableEffect(consumed, player);

      // Check if any equipment got an aura
      if (player.equipment.some((e) => e.def.aura)) totalBlessed++;
    }

    const rate = totalBlessed / runs;
    // Expected: 2/4 = 0.5
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  });

  test('base bless rate without Loaded Dice (25%)', () => {
    let totalBlessed = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const { player } = setupGame({
        equipment: [item('horseshoe')],
        money: 10,
      });
      const blessDef = getSupplyDefById('bless');
      if (!blessDef) throw new Error('bless not found');
      const consumed = createConsumableInstance(blessDef);
      executeConsumableEffect(consumed, player);

      if (player.equipment[0].def.aura) totalBlessed++;
    }

    const rate = totalBlessed / runs;
    // Expected: 1/4 = 0.25
    expect(rate).toBeGreaterThan(0.19);
    expect(rate).toBeLessThan(0.31);
  });

  test('fails when all equipment already has auras', () => {
    const { player } = setupGame({
      equipment: [item('horseshoe')],
      money: 10,
    });
    // Manually add an aura
    player.equipment[0].def = { ...player.equipment[0].def, aura: getItemAuraById('fire')! };

    const blessDef = getSupplyDefById('bless');
    if (!blessDef) throw new Error('bless not found');
    const consumed = createConsumableInstance(blessDef);
    const result = executeConsumableEffect(consumed, player);

    expect(result.success).toBe(false);
    expect(result.failReason).toBe('All equipment already has auras!');
  });
});

// ─── Copy incompatibility ───

describe('Loaded Dice cannot be copied', () => {
  test('Mirror Lake cannot copy Loaded Dice', () => {
    // Mirror Lake is to the left of Loaded Dice
    const { result: withCopy } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('loaded_dice')],
    });
    // Mirror Lake should show as "Incompatible" and not affect anything
    // Just verify it doesn't crash and scoring is same as just loaded dice
    const { result: justLoaded } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('loaded_dice')],
    });
    expect(withCopy.miles).toBe(justLoaded.miles);
  });
});
