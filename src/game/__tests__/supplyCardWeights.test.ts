import './setup';
import { describe, test, expect, beforeEach } from 'bun:test';
import supplyCardsData from '../../data/supply_cards';
import { PACK_EXCLUDED_SUPPLY_IDS } from '../Constants';
import { parseWeightSupplyFromParams } from '../effectParams';
import {
  expectedRelativeRate,
  getSupplyCardWeightMultiplier,
  pickWeightedSupplyCard,
  pickWeightedSupplyCardsWithoutReplacement,
} from '../supplyCardWeights';
import {
  getRandomSupplyDef,
  getSupplyDefById,
  executeConsumableEffect,
  createConsumableInstance,
} from '../ConsumablesSystem';
import { initRunRng } from '../RunRng';
import { setupGame, item, resetDieIds } from './testHelpers';
import { equipmentActions } from '../store';

const SUPPLY_POOL_SIZE = supplyCardsData.length;

function measurePickRate(targetId: string, runs: number): number {
  let hits = 0;
  for (let i = 0; i < runs; i++) {
    if (getRandomSupplyDef().id === targetId) hits++;
  }
  return hits / runs;
}

/** Monte Carlo: weighted pick rate / uniform pick rate should match expectedRelativeRate(weight). */
function expectPickRateRatioNearWeight(
  actualRatio: number,
  weightMultiplier: number,
  options?: { poolSize?: number; low?: number; high?: number },
): void {
  const poolSize = options?.poolSize ?? SUPPLY_POOL_SIZE;
  const expected = expectedRelativeRate(weightMultiplier, poolSize);
  const low = options?.low ?? 0.75;
  const high = options?.high ?? 1.35;
  expect(actualRatio).toBeGreaterThan(expected * low);
  expect(actualRatio).toBeLessThan(expected * high);
}

describe('expectedRelativeRate', () => {
  test('uniform weight 1 yields ratio 1', () => {
    expect(expectedRelativeRate(1, SUPPLY_POOL_SIZE)).toBeCloseTo(1, 5);
  });

  test('2× pool weight is below 2.0 pick-rate ratio in a finite pool', () => {
    expect(expectedRelativeRate(2, SUPPLY_POOL_SIZE)).toBeCloseTo((2 * SUPPLY_POOL_SIZE) / (SUPPLY_POOL_SIZE + 1), 5);
    expect(expectedRelativeRate(2, SUPPLY_POOL_SIZE)).toBeLessThan(2);
  });

  test('4× pool weight is below 4.0 pick-rate ratio in a finite pool', () => {
    expect(expectedRelativeRate(4, SUPPLY_POOL_SIZE)).toBeCloseTo((4 * SUPPLY_POOL_SIZE) / (SUPPLY_POOL_SIZE + 3), 5);
    expect(expectedRelativeRate(4, SUPPLY_POOL_SIZE)).toBeLessThan(4);
  });

  test('8× pool weight is below 8.0 pick-rate ratio in a finite pool', () => {
    expect(expectedRelativeRate(8, SUPPLY_POOL_SIZE)).toBeCloseTo((8 * SUPPLY_POOL_SIZE) / (SUPPLY_POOL_SIZE + 7), 5);
    expect(expectedRelativeRate(8, SUPPLY_POOL_SIZE)).toBeLessThan(8);
  });
});

beforeEach(() => {
  resetDieIds();
});

describe('parseWeightSupplyFromParams', () => {
  test('returns empty for missing or empty array', () => {
    expect(parseWeightSupplyFromParams({})).toEqual([]);
    expect(parseWeightSupplyFromParams({ weightSupply: [] })).toEqual([]);
  });

  test('rejects non-array weightSupply', () => {
    expect(parseWeightSupplyFromParams({ weightSupply: { supplyId: 'loaded', multiplier: 2 } })).toEqual([]);
  });

  test('parses valid array entries and skips invalid', () => {
    expect(
      parseWeightSupplyFromParams({
        weightSupply: [
          { supplyId: 'coffee_tin', multiplier: 2 },
          { supplyId: 'bad', multiplier: 0 },
          { supplyId: 1, multiplier: 2 },
        ],
      }),
    ).toEqual([{ supplyId: 'coffee_tin', multiplier: 2 }]);
  });
});

describe('getSupplyCardWeightMultiplier', () => {
  test('defaults to 1 with no equipment', () => {
    equipmentActions.setEquipment([]);
    expect(getSupplyCardWeightMultiplier('firewood')).toBe(1);
  });

  test('single equipment doubles targeted supply', () => {
    equipmentActions.setEquipment([item('gold_tooth')]);
    expect(getSupplyCardWeightMultiplier('pan_for_gold')).toBe(2);
    expect(getSupplyCardWeightMultiplier('coffee_tin')).toBe(1);
  });

  test('wood_axe and covered_wagon stack to 4x firewood', () => {
    equipmentActions.setEquipment([item('wood_axe'), item('covered_wagon')]);
    expect(getSupplyCardWeightMultiplier('firewood')).toBe(4);
  });

  test('iron_spurs and iron_furnace stack to 4x coffee_tin', () => {
    equipmentActions.setEquipment([item('iron_spurs'), item('iron_furnace')]);
    expect(getSupplyCardWeightMultiplier('coffee_tin')).toBe(4);
  });

  test('loaded_chamber and rabbits_foot stack to 4x rabbits_foot supply', () => {
    equipmentActions.setEquipment([item('loaded_chamber'), item('rabbits_foot')]);
    expect(getSupplyCardWeightMultiplier('rabbits_foot')).toBe(4);
  });

  test('cursed_dice and stacked_deck stack to 4x loaded supply', () => {
    equipmentActions.setEquipment([item('cursed_dice'), item('stacked_deck')]);
    expect(getSupplyCardWeightMultiplier('loaded')).toBe(4);
  });

  test('alchemy_kit weights coffee_tin and pan_for_gold', () => {
    equipmentActions.setEquipment([item('alchemy_kit')]);
    expect(getSupplyCardWeightMultiplier('coffee_tin')).toBe(2);
    expect(getSupplyCardWeightMultiplier('pan_for_gold')).toBe(2);
    expect(getSupplyCardWeightMultiplier('firewood')).toBe(1);
  });

  test('alchemy_kit stacks with iron_furnace for coffee_tin only', () => {
    equipmentActions.setEquipment([item('alchemy_kit'), item('iron_furnace')]);
    expect(getSupplyCardWeightMultiplier('coffee_tin')).toBe(4);
    expect(getSupplyCardWeightMultiplier('pan_for_gold')).toBe(2);
  });

  test('iron_furnace, iron_spurs, and alchemy_kit multiply to 8× coffee_tin (2×2×2)', () => {
    equipmentActions.setEquipment([item('iron_furnace'), item('iron_spurs'), item('alchemy_kit')]);
    expect(getSupplyCardWeightMultiplier('coffee_tin')).toBe(8);
    expect(getSupplyCardWeightMultiplier('pan_for_gold')).toBe(2);
  });
});

describe('pickWeightedSupplyCard', () => {
  test('respects excludeIds', () => {
    const pool = supplyCardsData;
    for (let i = 0; i < 50; i++) {
      const picked = pickWeightedSupplyCard(pool, 'consumables', { excludeIds: ['coffee_tin'] });
      expect(picked.id).not.toBe('coffee_tin');
    }
  });

  test('without replacement avoids duplicate ids', () => {
    const pool = supplyCardsData.filter((c) => !PACK_EXCLUDED_SUPPLY_IDS.includes(c.id));
    const picks = pickWeightedSupplyCardsWithoutReplacement(pool, 5, 'supplyPack');
    const ids = picks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getRandomSupplyDef weighted distribution', () => {
  test('gold_tooth roughly doubles pan_for_gold picks', () => {
    initRunRng('supply-weight-gold-tooth');
    setupGame({ equipment: [] });
    const baseline = measurePickRate('pan_for_gold', 8000);

    initRunRng('supply-weight-gold-tooth');
    setupGame({ equipment: [item('gold_tooth')] });
    const weighted = measurePickRate('pan_for_gold', 8000);

    expectPickRateRatioNearWeight(weighted / baseline, 2);
  });

  test('wood_axe and covered_wagon roughly quadruple firewood picks', () => {
    initRunRng('supply-weight-firewood-base');
    setupGame({ equipment: [] });
    const baseline = measurePickRate('firewood', 8000);

    initRunRng('supply-weight-firewood-stack');
    setupGame({ equipment: [item('wood_axe'), item('covered_wagon')] });
    const weighted = measurePickRate('firewood', 8000);

    expectPickRateRatioNearWeight(weighted / baseline, 4);
  });

  test('iron_furnace, iron_spurs, and alchemy_kit multiply to ~8× coffee_tin pick rate', () => {
    initRunRng('supply-weight-coffee-base');
    setupGame({ equipment: [] });
    const baseline = measurePickRate('coffee_tin', 8000);

    initRunRng('supply-weight-coffee-steel-trio');
    setupGame({ equipment: [item('iron_furnace'), item('iron_spurs'), item('alchemy_kit')] });
    const weighted = measurePickRate('coffee_tin', 8000);

    expectPickRateRatioNearWeight(weighted / baseline, 8);
  });

  test('steel trio leaves pan_for_gold at 2× pool weight only', () => {
    initRunRng('supply-weight-pan-base');
    setupGame({ equipment: [] });
    const baseline = measurePickRate('pan_for_gold', 8000);

    initRunRng('supply-weight-pan-steel-trio');
    setupGame({ equipment: [item('iron_furnace'), item('iron_spurs'), item('alchemy_kit')] });
    const weighted = measurePickRate('pan_for_gold', 8000);

    expectPickRateRatioNearWeight(weighted / baseline, 2);
  });
});

describe('Supply Cache uses supply weights', () => {
  function measureCachePanRate(seed: string, equipment: ReturnType<typeof item>[]): number {
    initRunRng(seed);
    const { player } = setupGame({ equipment });
    player.maxConsumableSlots = 40;
    const cacheDef = getSupplyDefById('supply_cache')!;
    let panHits = 0;
    const runs = 1500;

    for (let i = 0; i < runs; i++) {
      player.consumables = [];
      const result = executeConsumableEffect(createConsumableInstance(cacheDef));
      if (!result.success) continue;
      for (const c of player.consumables) {
        if (c.def.id === 'pan_for_gold') panHits++;
      }
    }
    return panHits / (runs * 2);
  }

  test('supply_cache favors pan_for_gold with gold_tooth equipped', () => {
    const baseline = measureCachePanRate('supply-cache-base', []);
    const weighted = measureCachePanRate('supply-cache-weighted', [item('gold_tooth')]);

    expectPickRateRatioNearWeight(weighted / baseline, 2);
  });
});
