import './setup';
import { describe, test, expect } from 'bun:test';
import itemAurasData from '../../data/item_auras.json';
import { generateRandomEquipment, generateShopStock, getAllEquipment } from '../ItemsSystem';
import { getRandomSupplyDef, getRandomTrailGuideDef, getRandomFrontierDef } from '../ConsumablesSystem';

describe('Shop stock exclusion', () => {
  test('generateShopStock excludes items by id', () => {
    // Generate a full stock to get some IDs
    const stock = generateShopStock(5);
    const excludeIds = stock.map((s) => s.id);

    // Generate again excluding those IDs — none should appear
    for (let i = 0; i < 20; i++) {
      const newStock = generateShopStock(5, excludeIds);
      for (const item of newStock) {
        expect(excludeIds).not.toContain(item.id);
      }
    }
  });

  test('generateShopStock returns items when excludeIds is empty', () => {
    const stock = generateShopStock(3, []);
    expect(stock.length).toBe(3);
  });

  test('generateShopStock returns items when no exclusion provided', () => {
    const stock = generateShopStock(3);
    expect(stock.length).toBe(3);
  });

  test('getRandomSupplyDef excludes by id', () => {
    // Get a supply def, then exclude it
    const first = getRandomSupplyDef();
    const excludeIds = [first.id];

    // Run many times to verify exclusion (probabilistic)
    let foundExcluded = false;
    for (let i = 0; i < 100; i++) {
      const def = getRandomSupplyDef(undefined, excludeIds);
      if (def.id === first.id) {
        foundExcluded = true;
        break;
      }
    }
    expect(foundExcluded).toBe(false);
  });

  test('getRandomTrailGuideDef excludes by id', () => {
    const first = getRandomTrailGuideDef();
    const excludeIds = [first.id];

    let foundExcluded = false;
    for (let i = 0; i < 100; i++) {
      const def = getRandomTrailGuideDef(undefined, excludeIds);
      if (def.id === first.id) {
        foundExcluded = true;
        break;
      }
    }
    expect(foundExcluded).toBe(false);
  });

  test('getRandomFrontierDef excludes by id', () => {
    const first = getRandomFrontierDef();
    const excludeIds = [first.id];

    let foundExcluded = false;
    for (let i = 0; i < 100; i++) {
      const def = getRandomFrontierDef(undefined, excludeIds);
      if (def.id === first.id) {
        foundExcluded = true;
        break;
      }
    }
    expect(foundExcluded).toBe(false);
  });

  test('getRandomSupplyDef falls back to full pool if all excluded', () => {
    // Exclude every possible ID — should still return something (fallback)
    const excludeIds = Array.from({ length: 100 }, (_, i) => `fake_id_${i}`);
    // Add real IDs too
    for (let i = 0; i < 50; i++) {
      excludeIds.push(getRandomSupplyDef().id);
    }
    const def = getRandomSupplyDef(undefined, excludeIds);
    expect(def).toBeDefined();
    expect(def.id).toBeTruthy();
  });

  test('generateShopStock falls back to horseshoe when all items excluded', () => {
    // Get all equipment IDs and exclude them all
    const allIds = getAllEquipment().map((e) => e.id);
    // Exclude everything
    const result = generateShopStock(3, allIds);
    expect(result.length).toBe(3);
    for (const item of result) {
      expect(item.id).toBe('horseshoe');
    }
  });

  test('generateRandomEquipment uses weighted rarity thresholds when no rarity is provided', () => {
    const originalRandom = Math.random;
    const rarityRolls = [0.01, 0.2, 0.9];
    const auraRollCount = itemAurasData.length;
    let rarityIndex = 0;
    let callStep = 0;

    Math.random = () => {
      if (callStep === 0) {
        callStep++;
        return rarityRolls[rarityIndex] ?? 1;
      }

      if (callStep === 1) {
        callStep++;
        return 0;
      }

      callStep++;
      if (callStep > auraRollCount + 1) {
        callStep = 0;
        rarityIndex++;
      }
      return 1;
    };

    try {
      expect(generateRandomEquipment().rarity).toBe('rare');
      expect(generateRandomEquipment().rarity).toBe('uncommon');
      expect(generateRandomEquipment().rarity).toBe('common');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('generateRandomEquipment respects explicit rarity filters before weighted rolls', () => {
    const originalRandom = Math.random;
    const rolls = [0.01, 0, 1, 1, 1, 1, 1];

    Math.random = () => rolls.shift() ?? 1;

    try {
      expect(generateRandomEquipment({ rarity: 'common' }).rarity).toBe('common');
    } finally {
      Math.random = originalRandom;
    }
  });
});
