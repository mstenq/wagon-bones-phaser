import './setup';
import { describe, test, expect, afterEach } from 'bun:test';
import diceAuras, { DICE_AURA_ORDER } from '../../data/dice_auras';
import itemAuras, { DICE_STICKER_CHANCE } from '../../data/item_auras';
import { pickEquipmentAuraWeighted, rollDiceAura, rollEquipmentAura, scaleAuraChance } from '../auraRng';
import { rollRandomItemAura } from '../ItemsSystem';
import { applyRandomSticker } from '../BoosterPackSystem';
import { generateShopDie } from '../store/shopStock';
import { createDie } from '../DiceSystem';
import { resetRunRng } from '../RunRng';
import { resetGameStores } from './testHelpers';
import { runActions } from '../store/runStore';
import { initRunRng } from '../RunRng';

const TOLERANCE = 0.015;
const TRIALS = 10_000;

function monteCarloRate(trials: number, hit: () => boolean): number {
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    if (hit()) hits++;
  }
  return hits / trials;
}

function expectRate(actual: number, expected: number, _label?: string): void {
  expect(actual).toBeGreaterThan(expected - TOLERANCE);
  expect(actual).toBeLessThan(expected + TOLERANCE);
}

describe('scaleAuraChance', () => {
  test('caps at 1', () => {
    expect(scaleAuraChance(0.5, 4)).toBe(1);
  });
});

describe('rollEquipmentAura (deterministic)', () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
    resetRunRng();
  });

  test('scales holy with multiplier; ghost unchanged at 4x', () => {
    resetRunRng();
    Math.random = () => 0.01;
    expect(rollRandomItemAura(0.5)).toBeNull();
    expect(rollRandomItemAura(1)?.id).toBe('fire');
    expect(rollRandomItemAura(4)?.id).toBe('holy');

    let rollCall = 0;
    Math.random = () => {
      rollCall++;
      if (rollCall <= 3) return 0.99;
      return 0.002;
    };
    expect(rollEquipmentAura(1)?.id).toBe('ghost');
  });
});

describe('rollDiceAura (deterministic)', () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
    resetRunRng();
  });

  test('sequential holy then fire at 1x', () => {
    resetRunRng();
    Math.random = () => 0.02;
    expect(rollDiceAura(1)).toBe('fire');
    Math.random = () => 0.005;
    expect(rollDiceAura(1)).toBe('holy');
    Math.random = () => 0.5;
    expect(rollDiceAura(1)).toBeNull();
  });
});

describe('equipment aura marginals (Monte Carlo)', () => {
  afterEach(() => {
    resetRunRng();
  });

  test('1x rates match AURA_PERCENTAGES.md', () => {
    resetRunRng();
    const rates: Record<string, number> = { holy: 0, fire: 0, arcane: 0, ghost: 0 };
    for (let i = 0; i < TRIALS; i++) {
      const aura = rollEquipmentAura(1, 'shop');
      if (aura) rates[aura.id]!++;
    }
    for (const def of itemAuras) {
      expectRate(rates[def.id]! / TRIALS, def.equipmentChance, def.id);
    }
  });

  test('2x scales holy/fire/arcane; ghost stays 0.3%', () => {
    resetRunRng();
    const ghostRate = monteCarloRate(TRIALS, () => rollEquipmentAura(2, 'shop')?.id === 'ghost');
    expectRate(ghostRate, 0.003, 'ghost');
    const holyRate = monteCarloRate(TRIALS, () => rollEquipmentAura(2, 'shop')?.id === 'holy');
    expectRate(holyRate, 0.01, 'holy');
  });

  test('4x sacred ceremony rates for holy/fire/arcane', () => {
    resetRunRng();
    const holyRate = monteCarloRate(TRIALS, () => rollEquipmentAura(4, 'shop')?.id === 'holy');
    expectRate(holyRate, 0.02, 'holy');
    const fireRate = monteCarloRate(TRIALS, () => rollEquipmentAura(4, 'shop')?.id === 'fire');
    expectRate(fireRate, 0.056, 'fire');
    const arcaneRate = monteCarloRate(TRIALS, () => rollEquipmentAura(4, 'shop')?.id === 'arcane');
    expectRate(arcaneRate, 0.08, 'arcane');
  });
});

describe('dice aura marginals (Monte Carlo)', () => {
  afterEach(() => {
    resetRunRng();
  });

  test('1x rates match AURA_PERCENTAGES.md', () => {
    resetRunRng();
    const rates: Record<string, number> = { holy: 0, fire: 0, arcane: 0 };
    for (let i = 0; i < TRIALS; i++) {
      const aura = rollDiceAura(1, 'pack');
      if (aura) rates[aura]!++;
    }
    for (const id of DICE_AURA_ORDER) {
      const def = diceAuras.find((a) => a.id === id)!;
      expectRate(rates[id]! / TRIALS, def.diceChance, id);
    }
  });

  test('4x permit multiplier on dice', () => {
    resetRunRng();
    const holyRate = monteCarloRate(TRIALS, () => rollDiceAura(4, 'pack') === 'holy');
    expectRate(holyRate, 0.048, 'holy');
  });
});

describe('pickEquipmentAuraWeighted', () => {
  test('respects equipmentChance ratios', () => {
    resetRunRng();
    const counts = { fire: 0, arcane: 0, holy: 0 };
    for (let i = 0; i < TRIALS; i++) {
      const aura = pickEquipmentAuraWeighted(['fire', 'arcane', 'holy'], 'consumables');
      counts[aura.id as keyof typeof counts]++;
    }
    const blessable = itemAuras.filter((a) => ['fire', 'arcane', 'holy'].includes(a.id));
    const total = blessable.reduce((s, a) => s + a.equipmentChance, 0);
    for (const a of blessable) {
      expectRate(counts[a.id as keyof typeof counts] / TRIALS, a.equipmentChance / total, a.id);
    }
  });
});

describe('dice sticker chance', () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
    resetRunRng();
  });

  test('applyRandomSticker ~20%', () => {
    resetRunRng();
    const rate = monteCarloRate(TRIALS, () => {
      const die = createDie({});
      applyRandomSticker(die);
      return die.sticker != null;
    });
    expectRate(rate, DICE_STICKER_CHANCE, 'sticker');
  });
});

describe('generateShopDie integration', () => {
  afterEach(() => {
    resetGameStores();
    resetRunRng();
  });

  test('applies dice auras with permit multiplier', () => {
    resetGameStores();
    initRunRng('shop-dice-aura-test');
    runActions.patch({ purchasedPermits: ['sacred_ceremony'] });
    let withAura = 0;
    for (let i = 0; i < 500; i++) {
      const die = generateShopDie('enhanced');
      if (die.aura) withAura++;
    }
    expect(withAura).toBeGreaterThan(100);
  });
});
