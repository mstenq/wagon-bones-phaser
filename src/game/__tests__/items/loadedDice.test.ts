import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  item,
  itemWithState,
  setupGame,
  calculateTestScore,
  resetDieIds,
  seedTestRoll,
} from '../testHelpers';
import {
  processEndOfRound,
  processPreScoreHandUpgrades,
  processEquipmentOnPackOpened,
  processEquipmentOnRoundStart,
} from '../../EquipmentEffects';
import { PACK_ONLY_FRONTIER_IDS } from '../../Constants';
import {
  getLoadedDiceMultiplier,
  getLoadedFaceRollChance,
  getGravityModeFace,
  getGravityRollChance,
} from '../../equipmentUtils';
import { getEquipmentDefById } from '../../ItemsSystem';
import { getItemDisplayContext } from '../../displayContext';
import { selectEquipmentHintRoundContext } from '../../store/selectors/roundSelectors';
import { computeScoredDieRetriggers } from '../../effects/scoredRetrigger';
import { gt } from '../../scoreMath';
import { executeConsumableEffect, createConsumableInstance, getSupplyDefById } from '../../ConsumablesSystem';
import { getItemAuraById } from '../../ItemsSystem';
import { HandType } from '../../types';
import { rollDie } from '../../DiceSystem';
import { getPlayerState, resetPlayerState } from '../testRunPlayer';
import { initRunRng } from '../../RunRng';
import { getRoundState } from '../../store/roundStore';
import { roundActions } from '../../store';
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
    expect(withLoaded.miles).toBeMiles(without.miles);
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

  test('raises the selected face close to one-in-three for loaded dice', () => {
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
    expect(rate).toBeGreaterThan(0.31);
    expect(rate).toBeLessThan(0.36);
  });

  test('Loaded Dice equipment raises the selected face close to two-in-three', () => {
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
    expect(rate).toBeGreaterThan(0.64);
    expect(rate).toBeLessThan(0.69);
  });

  test("Gambler's Dice Cup gives unenhanced dice ~1-in-6 toward selected face", () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(9);
    player.equipment = [item('gamblers_dice_cup')];

    let targetHits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 0 })).value === 9) {
        targetHits++;
      }
    }

    const rate = targetHits / trials;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.185);
  });

  test("Gambler's Dice Cup gives the gambler unenhanced dice ~1-in-3 toward selected face", () => {
    const { player } = setupGame({ profession: 'gambler', equipment: [item('gamblers_dice_cup')] });
    player.setLoadedDieTarget(9);

    expect(getLoadedFaceRollChance(player.equipment, null, 'gambler')).toBeCloseTo(1 / 3);

    const display = getEquipmentDefById('gamblers_dice_cup')?.display(null, getItemDisplayContext());
    expect(display?.hint[0]?.find((segment) => segment.style === 'odds')?.text).toBe('1 in 3');

    let targetHits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 0 })).value === 9) {
        targetHits++;
      }
    }

    const rate = targetHits / trials;
    expect(rate).toBeGreaterThan(0.31);
    expect(rate).toBeLessThan(0.36);
  });

  test("Gambler's Dice Cup keeps loaded enhancement at ~1-in-3", () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(9);
    player.equipment = [item('gamblers_dice_cup')];

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

  test('cup + Loaded Dice item raises unenhanced dice toward ~1-in-3', () => {
    const player = getPlayerState();
    player.setLoadedDieTarget(9);
    player.equipment = [item('gamblers_dice_cup'), item('loaded_dice')];

    let targetHits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 0 })).value === 9) {
        targetHits++;
      }
    }

    const rate = targetHits / trials;
    expect(rate).toBeGreaterThan(0.31);
    expect(rate).toBeLessThan(0.36);
  });

  test('sync with lucky number uses lucky pip for loaded rolls', () => {
    const player = getPlayerState();
    const lucky = itemWithState('lucky_number', { pip: 5 });
    player.equipment = [lucky];
    player.setLoadedDieSyncLucky(true);
    expect(player.getResolvedLoadedDieTarget()).toBe(5);

    const original = Math.random;
    Math.random = () => 0;
    try {
      const rolled = rollDie(die({ enhancement: 'loaded', value: 0 }));
      expect(rolled.value).toBe(5);
    } finally {
      Math.random = original;
    }
  });

  test('round start updates loaded target when synced to lucky number', () => {
    const player = getPlayerState();
    const lucky = item('lucky_number');
    player.equipment = [lucky];
    player.setLoadedDieSyncLucky(true);
    processEquipmentOnRoundStart([lucky]);
    expect(player.loadedDieTarget).toBe(lucky.state.pip);
    expect(player.getResolvedLoadedDieTarget()).toBe(lucky.state.pip);
  });

  test('picking a loaded face disables lucky sync', () => {
    const player = getPlayerState();
    player.equipment = [item('lucky_number')];
    player.setLoadedDieSyncLucky(true);
    player.setLoadedDieTarget(3);
    expect(player.loadedDieSyncLucky).toBe(false);
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

describe('loaded_chamber', () => {
  test('retriggers lucky dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5 })],
      equipment: [item('loaded_chamber')],
    });
    expect(result.totalValue).toBe(15);
  });

  test('Mirror Lake copy doubles lucky retrigger scoring', () => {
    const luckyDie = die({ value: 5, enhancement: 'lucky' });
    const { result: withMirror } = calculateTestScore({
      scoredDice: [luckyDie, die({ value: 5 })],
      equipment: [item('mirror_lake'), item('loaded_chamber')],
    });
    const { result: chamberOnly } = calculateTestScore({
      scoredDice: [luckyDie, die({ value: 5 })],
      equipment: [item('loaded_chamber')],
    });
    expect(withMirror.totalValue).toBe(20);
    expect(chamberOnly.totalValue).toBe(15);
  });

  test('Mirror Lake copy doubles lucky retrigger count', () => {
    const lucky = die({ value: 5, enhancement: 'lucky' });
    const { triggerCount: withMirror } = computeScoredDieRetriggers({
      die: lucky,
      equipment: [item('mirror_lake'), item('loaded_chamber')],
      firstDieId: lucky.id,
      lastDieId: lucky.id,
      isEnhanced: true,
      isLucky: true,
    });
    const { triggerCount: chamberOnly } = computeScoredDieRetriggers({
      die: lucky,
      equipment: [item('loaded_chamber')],
      firstDieId: lucky.id,
      lastDieId: lucky.id,
      isEnhanced: true,
      isLucky: true,
    });
    expect(withMirror).toBe(3);
    expect(chamberOnly).toBe(2);
  });
});

describe('cursed_dice', () => {
  test('has loaded destroy chance metadata', () => {
    const inst = item('cursed_dice');
    expect(inst.def.effectType).toBe('CURSED_DICE');
    expect(inst.def.effectParams.chance).toEqual([1, 7]);
  });

  test('hit adds a frontier encounter consumable', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 9, enhancement: 'loaded' })],
      equipment: [item('cursed_dice'), item('loaded_dice'), item('loaded_dice'), item('loaded_dice')],
    });

    expect(player.consumables.length).toBe(1);
    expect(player.consumables[0]?.def.category).toBe('frontier');
  });

  test('never grants pack-only frontier encounters', () => {
    const packOnlyIds = [...PACK_ONLY_FRONTIER_IDS];
    const grantedIds = new Set<string>();

    for (let i = 0; i < 150; i++) {
      const { player } = calculateTestScore({
        scoredDice: [die({ value: 11, enhancement: 'loaded' })],
        equipment: [item('cursed_dice'), item('loaded_dice'), item('loaded_dice'), item('loaded_dice')],
      });
      const grantedId = player.consumables[0]?.def.id;
      expect(grantedId).toBeDefined();
      grantedIds.add(grantedId!);
      expect(PACK_ONLY_FRONTIER_IDS.has(grantedId!)).toBe(false);
    }

    for (const packOnly of packOnlyIds) {
      expect(grantedIds.has(packOnly)).toBe(false);
    }
  });

  test('Mirror Lake copy doubles loaded shatter grant chance', () => {
    let grantsWithMirror = 0;
    let grantsChamberOnly = 0;
    const runs = 8000;

    for (let i = 0; i < runs; i++) {
      const { player: mirrored } = calculateTestScore({
        scoredDice: [die({ value: 9, enhancement: 'loaded' })],
        equipment: [item('mirror_lake'), item('cursed_dice')],
      });
      if (mirrored.consumables.length > 0) grantsWithMirror++;

      const { player: solo } = calculateTestScore({
        scoredDice: [die({ value: 9, enhancement: 'loaded' })],
        equipment: [item('cursed_dice')],
      });
      if (solo.consumables.length > 0) grantsChamberOnly++;
    }

    const mirrorRate = grantsWithMirror / runs;
    const soloRate = grantsChamberOnly / runs;
    // Two independent 1/7 rolls ≈ 2/7; single roll ≈ 1/7
    expect(mirrorRate).toBeGreaterThan(0.22);
    expect(mirrorRate).toBeLessThan(0.32);
    expect(soloRate).toBeGreaterThan(0.11);
    expect(soloRate).toBeLessThan(0.17);
    expect(mirrorRate).toBeGreaterThan(soloRate * 1.35);
  });

  test('Loaded Dice boosts real Cursed Dice only, not Mirror Lake copy', () => {
    let grantsMirrorCursedLoaded = 0;
    let grantsMirrorCursed = 0;
    const runs = 6000;

    for (let i = 0; i < runs; i++) {
      const { player: mirrorCursedLoaded } = calculateTestScore({
        scoredDice: [die({ value: 9, enhancement: 'loaded' })],
        equipment: [item('mirror_lake'), item('cursed_dice'), item('loaded_dice')],
      });
      if (mirrorCursedLoaded.consumables.length > 0) grantsMirrorCursedLoaded++;

      const { player: mirrorCursed } = calculateTestScore({
        scoredDice: [die({ value: 9, enhancement: 'loaded' })],
        equipment: [item('mirror_lake'), item('cursed_dice')],
      });
      if (mirrorCursed.consumables.length > 0) grantsMirrorCursed++;
    }

    const loadedRate = grantsMirrorCursedLoaded / runs;
    const mirrorRate = grantsMirrorCursed / runs;
    // Mirror copies Cursed Dice at 1/7; real Cursed Dice at 2/7 with Loaded Dice → 1 − (6/7)(5/7) ≈ 39%
    expect(loadedRate).toBeGreaterThan(0.33);
    expect(loadedRate).toBeLessThan(0.44);
    // Two independent 1/7 rolls (Loaded Dice item is not copied) ≈ 27%
    expect(mirrorRate).toBeGreaterThan(0.22);
    expect(mirrorRate).toBeLessThan(0.32);
    expect(loadedRate).toBeGreaterThan(mirrorRate * 1.15);
    // Would be ~48% if Loaded Dice doubled both rolls — that must not happen
    expect(loadedRate).toBeLessThan(mirrorRate * 1.55);
  });
});

// ─── Dynamite: ADD_MULT_RISKY destruction probability ───

describe('Loaded Dice + Dynamite (ADD_MULT_RISKY)', () => {
  test('doubles destroy chance with one Loaded Dice', () => {
    // Dynamite: destroyChance [1, 6] → normally ~16.7%, with loaded dice → ~33.3%
    let destroyed = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const { destroyedIndices } = processEndOfRound([item('dynamite'), item('loaded_dice')], {
        isLegRoundEnd: true,
      });
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
      const { destroyedIndices } = processEndOfRound([item('dynamite')], { isLegRoundEnd: true });
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
      const { destroyedIndices } = processEndOfRound([item('nitro'), item('loaded_dice')], {
        isLegRoundEnd: true,
      });
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
      const { upgrades } = processPreScoreHandUpgrades(equipment, HandType.PAIR);
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
      const { upgrades } = processPreScoreHandUpgrades(equipment, HandType.PAIR);
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
      if (gt(result.mult, 10)) multHits++;
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
      if (gt(result.mult, 10)) multHits++;
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
      const { destroyedIndices } = processEndOfRound([item('dynamite'), item('loaded_dice'), item('loaded_dice')], {
        isLegRoundEnd: true,
      });
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
      executeConsumableEffect(consumed);

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
      executeConsumableEffect(consumed);

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
    // Manually add an aura (persist to run store — bless reads resolveEquipmentList)
    const eq = player.equipment[0];
    eq.def = { ...eq.def, aura: getItemAuraById('fire')! };
    player.persistEquipment();

    const blessDef = getSupplyDefById('bless');
    if (!blessDef) throw new Error('bless not found');
    const consumed = createConsumableInstance(blessDef);
    const result = executeConsumableEffect(consumed);

    expect(result.success).toBe(false);
    expect(result.failReason).toBe('All equipment already has auras!');
  });
});

// ─── GRAVITY ───

describe('GRAVITY: helpers', () => {
  test('getGravityRollChance follows the odds table', () => {
    const equipment = [item('horseshoe')];
    expect(getGravityRollChance(0, equipment)).toBe(0);
    expect(getGravityRollChance(1, equipment)).toBe(0);
    expect(getGravityRollChance(2, equipment)).toBeCloseTo(1 / 6);
    expect(getGravityRollChance(3, equipment)).toBeCloseTo(1 / 3);
    expect(getGravityRollChance(4, equipment)).toBeCloseTo(1 / 2);
    expect(getGravityRollChance(5, equipment)).toBe(1);
    expect(getGravityRollChance(8, equipment)).toBe(1);
  });

  test('getGravityRollChance scales with Loaded Dice multiplier', () => {
    const equipment = [item('loaded_dice'), item('loaded_dice')];
    expect(getGravityRollChance(2, equipment)).toBeCloseTo(2 / 3);
    expect(getGravityRollChance(3, equipment)).toBe(1);
  });

  test('getGravityModeFace ignores stone dice and tie-breaks to highest pip', () => {
    const sixes = diceWithValue(6, 2);
    const eights = diceWithValue(8, 2);
    expect(getGravityModeFace([...sixes, ...eights])).toEqual({ face: 8, count: 2 });
    expect(getGravityModeFace([die({ value: 6 }), die({ enhancement: 'stone', value: 0 })])).toBeNull();
    expect(getGravityModeFace([die({ value: 4 })])).toBeNull();
  });

  test('getGravityModeFace only counts dice passed in', () => {
    const twelves = diceWithValue(12, 5);
    const selected = twelves.slice(0, 2);
    expect(getGravityModeFace(selected)).toEqual({ face: 12, count: 2 });
    expect(getGravityRollChance(2, [item('horseshoe')])).toBeCloseTo(1 / 6);
  });
});

describe('GRAVITY: composition with loaded/cup', () => {
  test('gravity + gamblers_dice_cup gives ~1/6 for loaded target and ~1/6 for mode face', () => {
    const rolled = [die({ value: 3 }), die({ value: 3 }), die({ value: 7 })];
    setupGame({ equipment: [item('gravity'), item('gamblers_dice_cup')], dice: rolled });
    getPlayerState().setLoadedDieTarget(1);
    seedTestRoll(rolled);

    let face1 = 0;
    let face3 = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      const result = rollDie(die({ value: 0 }));
      if (result.value === 1) face1++;
      if (result.value === 3) face3++;
    }

    expect(face1 / trials).toBeGreaterThan(0.15);
    expect(face1 / trials).toBeLessThan(0.185);
    expect(face3 / trials).toBeGreaterThan(0.15);
    expect(face3 / trials).toBeLessThan(0.185);
  });

  test('gravity + loaded enhancement gives ~1/3 for loaded target and ~1/6 for mode face', () => {
    const rolled = [die({ value: 3 }), die({ value: 3 }), die({ value: 7 })];
    setupGame({ equipment: [item('gravity')], dice: rolled });
    getPlayerState().setLoadedDieTarget(1);
    seedTestRoll(rolled);

    let face1 = 0;
    let face3 = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      const result = rollDie(die({ enhancement: 'loaded', value: 0 }));
      if (result.value === 1) face1++;
      if (result.value === 3) face3++;
    }

    expect(face1 / trials).toBeGreaterThan(0.31);
    expect(face1 / trials).toBeLessThan(0.36);
    expect(face3 / trials).toBeGreaterThan(0.15);
    expect(face3 / trials).toBeLessThan(0.185);
  });

  test('guaranteed gravity overwhelms loaded enhancement', () => {
    const rolled = diceWithValue(3, 5);
    setupGame({ equipment: [item('gravity')], dice: rolled });
    getPlayerState().setLoadedDieTarget(1);
    seedTestRoll(rolled);

    const result = rollDie(die({ enhancement: 'loaded', value: 0 }));
    expect(result.value).toBe(3);
  });

  test('guaranteed gravity overwhelms gamblers_dice_cup', () => {
    const rolled = diceWithValue(3, 5);
    setupGame({ equipment: [item('gravity'), item('gamblers_dice_cup')], dice: rolled });
    getPlayerState().setLoadedDieTarget(1);
    seedTestRoll(rolled);

    const result = rollDie(die({ value: 0 }));
    expect(result.value).toBe(3);
  });

  test('same-face stacking combines chances capped at 1', () => {
    const rolled = [die({ value: 3 }), die({ value: 3 }), die({ value: 7 })];
    setupGame({ equipment: [item('gravity'), item('gamblers_dice_cup')], dice: rolled });
    getPlayerState().setLoadedDieTarget(3);
    seedTestRoll(rolled);

    let face3 = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 0 })).value === 3) face3++;
    }

    expect(face3 / trials).toBeGreaterThan(0.31);
    expect(face3 / trials).toBeLessThan(0.36);
  });
});

describe('GRAVITY: rolling', () => {
  test('does not bias the initial roll (SELECT phase, no rolled dice yet)', () => {
    const rolled = diceWithValue(6, 5);
    setupGame({ equipment: [item('gravity')], dice: rolled });
    initRunRng('GRAVITYFIRST');
    roundActions.patch({ phase: 'SELECT', rolledDice: [] });
    const result = rollDie(die({ value: 1 }));
    expect(result.value).toBe(4);
  });

  test('guarantees the mode face on reroll with five matches', () => {
    const rolled = diceWithValue(6, 5);
    setupGame({ equipment: [item('gravity')], dice: rolled });
    seedTestRoll(rolled);
    const rerolled = rollDie(die({ value: 1 }));
    expect(rerolled.value).toBe(6);
  });

  test('biases toward mode face on reroll when gravity bucket hits', () => {
    const rolled = [die({ value: 6 }), die({ value: 6 }), die({ value: 3 })];
    setupGame({ equipment: [item('gravity')], dice: rolled });
    initRunRng('GRAV2');
    seedTestRoll(rolled);
    const rerolled = rollDie(die({ value: 1 }));
    expect(rerolled.value).toBe(6);
  });

  test('uses selected and reroll-locked dice for gravity odds on reroll', () => {
    const twelves = diceWithValue(12, 5);
    const selected = twelves.slice(0, 2);
    setupGame({ equipment: [item('gravity')], dice: twelves });
    seedTestRoll(twelves, { selectedForScore: selected });

    let face12 = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 1 })).value === 12) face12++;
    }

    expect(face12 / trials).toBeGreaterThan(0.15);
    expect(face12 / trials).toBeLessThan(0.185);
  });

  test('reroll-locked dice count toward gravity mode face', () => {
    const twelves = diceWithValue(12, 5);
    const locked = twelves.slice(0, 2);
    setupGame({ equipment: [item('gravity')], dice: twelves });
    seedTestRoll(twelves, { selectedForScore: [], rerollLocked: locked });

    let face12 = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollDie(die({ value: 1 })).value === 12) face12++;
    }

    expect(face12 / trials).toBeGreaterThan(0.15);
    expect(face12 / trials).toBeLessThan(0.185);
  });

  test('selected plus reroll-locked dice combine for gravity count', () => {
    const twelves = diceWithValue(12, 5);
    const selected = twelves.slice(0, 2);
    const locked = twelves.slice(2, 5);
    setupGame({ equipment: [item('gravity')], dice: twelves });
    seedTestRoll(twelves, { selectedForScore: selected, rerollLocked: locked });

    const result = rollDie(die({ value: 1 }));
    expect(result.value).toBe(12);
  });

  test('player reroll path applies gravity with five matching faces', () => {
    const rolled = diceWithValue(6, 5);
    const { game } = setupGame({ equipment: [item('gravity')], dice: rolled });
    game.startRound();
    const handIds = rolled.map((d) => d.id);
    game.selectForRoll(handIds);
    roundActions.patch({
      rolledDice: rolled.map((d) => ({ id: d.id, value: 6 })),
      selectedForScoreIds: handIds,
    });
    const rerollId = handIds[0]!;
    expect(game.reroll([rerollId])).toBe(true);
    const ref = getRoundState()!.rolledDice.find((r) => r.id === rerollId);
    expect(ref?.value).toBe(6);
  });
});

describe('GRAVITY: item definition', () => {
  test('has correct properties', () => {
    const inst = item('gravity');
    expect(inst.def.effectType).toBe('GRAVITY');
    expect(inst.def.cost).toBe(8);
    expect(inst.def.rarity).toBe('rare');
  });

  test('hint shows 1 in 6 when only two matching faces are selected', () => {
    const twelves = diceWithValue(12, 5);
    const selected = twelves.slice(0, 2);
    setupGame({ equipment: [item('gravity')], dice: twelves });
    seedTestRoll(twelves, { selectedForScore: selected });

    const def = getEquipmentDefById('gravity');
    const display = def?.display(selectEquipmentHintRoundContext(), getItemDisplayContext());
    const oddsSegment = display?.hint?.[0]?.find((seg) => seg.style === 'odds');
    expect(oddsSegment?.text).toBe('1 in 6');
  });

  test('does not itself affect scoring', () => {
    const { result: withGravity } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('gravity')],
    });
    const { result: without } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [],
    });
    expect(withGravity.miles).toBeMiles(without.miles);
  });
});

describe('Gravity cannot be copied', () => {
  test('Mirror Lake cannot copy Gravity', () => {
    const { result: withCopy } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('gravity')],
    });
    const { result: justGravity } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('gravity')],
    });
    expect(withCopy.miles).toBeMiles(justGravity.miles);
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
    expect(withCopy.miles).toBeMiles(justLoaded.miles);
  });
});
