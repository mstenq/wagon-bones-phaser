import './setup';
import { describe, test, expect } from 'bun:test';
import itemAuras from '../../data/item_auras';
import {
  generateRandomEquipment,
  generateShopStock,
  getAllEquipment,
  getEquipmentDefById,
  isEquipmentUnlocked,
  rollRandomItemAura,
} from '../ItemsSystem';
import { getItemDisplayContext } from '../displayContext';
import {
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getRandomFrontierDef,
  getShopRandomFrontierDef,
  generateShopConsumables,
} from '../ConsumablesSystem';
import { resetPlayerState } from '../__tests__/testRunPlayer';
import { die } from './testHelpers';

describe('Shop stock exclusion', () => {
  test('generateShopStock never includes legendary items', () => {
    for (let i = 0; i < 50; i++) {
      const stock = generateShopStock(5);
      for (const item of stock) {
        expect(item.rarity).not.toBe('legendary');
      }
    }
  });

  test('generateRandomEquipment never rolls legendary without explicit rarity', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRandomEquipment().rarity).not.toBe('legendary');
    }
  });

  test('generateRandomEquipment allows legendary when explicitly requested', () => {
    expect(generateRandomEquipment({ rarity: 'legendary' }).rarity).toBe('legendary');
  });

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

  test('getRandomFrontierDef never returns pack-only cards', () => {
    for (let i = 0; i < 500; i++) {
      const def = getRandomFrontierDef();
      expect(def.id).not.toBe('pandoras_box');
      expect(def.id).not.toBe('spiritual_journey');
    }
  });

  test('getShopRandomFrontierDef never returns pack-only cards', () => {
    for (let i = 0; i < 500; i++) {
      const def = getShopRandomFrontierDef();
      expect(def.id).not.toBe('pandoras_box');
      expect(def.id).not.toBe('spiritual_journey');
    }
  });

  test('generateShopConsumables never includes pack-only frontier cards', () => {
    for (let i = 0; i < 20; i++) {
      const stock = generateShopConsumables(20, { includeFrontier: true });
      for (const def of stock) {
        expect(def.id).not.toBe('pandoras_box');
        expect(def.id).not.toBe('spiritual_journey');
      }
    }
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
    const auraRollCount = itemAuras.length;
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

  test('generateShopStock uses weighted rarity thresholds (5% rare / 25% uncommon / 70% common)', () => {
    const counts = { common: 0, uncommon: 0, rare: 0 };
    const trials = 10_000;
    for (let i = 0; i < trials; i++) {
      const [item] = generateShopStock(1);
      counts[item.rarity as keyof typeof counts]++;
    }
    expect(counts.rare / trials).toBeCloseTo(0.05, 1);
    expect(counts.uncommon / trials).toBeCloseTo(0.25, 1);
    expect(counts.common / trials).toBeCloseTo(0.7, 1);
  });

  test('locked equipment is excluded from shop stock', () => {
    const player = resetPlayerState();
    const dynamite = getEquipmentDefById('dynamite')!;
    const nitro = getEquipmentDefById('nitro')!;
    const excludeAllButNitro = getAllEquipment()
      .filter((item) => item.id !== 'nitro')
      .map((item) => item.id);
    const excludeAllButDynamite = getAllEquipment()
      .filter((item) => item.id !== 'dynamite')
      .map((item) => item.id);

    expect(isEquipmentUnlocked(dynamite, null, getItemDisplayContext())).toBe(true);
    expect(isEquipmentUnlocked(nitro, null, getItemDisplayContext())).toBe(false);

    // Before self-destruct, dynamite can still be generated.
    const preExplosionDynamiteStock = generateShopStock(1, excludeAllButDynamite);
    expect(preExplosionDynamiteStock[0]?.id).toBe('dynamite');

    // While locked, nitro cannot appear even when every other item is excluded.
    const lockedStock = generateShopStock(1, excludeAllButNitro);
    expect(lockedStock[0]?.id).toBe('horseshoe');

    for (let i = 0; i < 50; i++) {
      const stock = generateShopStock(5);
      expect(stock.some((item) => item.id === 'nitro')).toBe(false);
    }

    player.dynamiteSelfDestructed = true;
    expect(isEquipmentUnlocked(dynamite, null, getItemDisplayContext())).toBe(false);
    expect(isEquipmentUnlocked(nitro, null, getItemDisplayContext())).toBe(true);

    // After self-destruct, dynamite is retired from the pool.
    const postExplosionDynamiteStock = generateShopStock(1, excludeAllButDynamite);
    expect(postExplosionDynamiteStock[0]?.id).toBe('horseshoe');

    // After unlock, nitro is the only eligible pick when everything else is excluded.
    const unlockedStock = generateShopStock(1, excludeAllButNitro);
    expect(unlockedStock[0]?.id).toBe('nitro');
  });

  test('isEquipmentUnlocked gates enhancement-specific items', () => {
    const player = resetPlayerState();
    const goldTooth = getEquipmentDefById('gold_tooth')!;
    expect(isEquipmentUnlocked(goldTooth, null, getItemDisplayContext())).toBe(false);

    player.dice.push(die({ enhancement: 'gold', value: 6 }));
    expect(isEquipmentUnlocked(goldTooth, null, getItemDisplayContext())).toBe(true);
  });

  test('rainbow_trail requires two different enhanced dice in pouch', () => {
    const player = resetPlayerState();
    const rainbow = getEquipmentDefById('rainbow_trail')!;
    player.dice.push(die({ enhancement: 'gold', value: 6 }));
    expect(isEquipmentUnlocked(rainbow, null, getItemDisplayContext())).toBe(false);

    player.dice.push(die({ enhancement: 'steel', value: 5 }));
    expect(isEquipmentUnlocked(rainbow, null, getItemDisplayContext())).toBe(true);
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

  test('rollRandomItemAura scales correctly with aura multiplier', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01;
    try {
      expect(rollRandomItemAura(0.5)).toBeNull();
      expect(rollRandomItemAura(1)?.id).toBe('fire');
      expect(rollRandomItemAura(4)?.id).toBe('holy');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('generateShopStock uses permit-based aura multiplier from run state', () => {
    const originalRandom = Math.random;
    const player = resetPlayerState();
    const onlyHorseshoe = getAllEquipment()
      .filter((def) => def.id !== 'horseshoe')
      .map((def) => def.id);
    Math.random = () => 0.02;

    try {
      player.purchasedPermits = [];
      const [withoutAuraBoost] = generateShopStock(1, onlyHorseshoe);
      expect(withoutAuraBoost?.aura).toBeUndefined();

      player.purchasedPermits = ['spirit_ritual', 'sacred_ceremony'];
      const [withAuraBoost] = generateShopStock(1, onlyHorseshoe);
      expect(withAuraBoost?.aura).toBeDefined();
    } finally {
      Math.random = originalRandom;
    }
  });
});
