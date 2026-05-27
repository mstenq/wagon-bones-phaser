import { describe, expect, test, beforeEach } from 'bun:test';
import { getRunState, runActions } from '../../store/runStore';
import { getSceneState, sceneActions } from '../../store/sceneStore';
import { setupActions } from '../../store/actions/setupActions';
import { economyActions } from '../../store/actions/economyActions';
import { generateNewShopState, generateShopStockRows, shopRowsToStored } from '../../store/shopStock';
import { shopSceneActions } from '../../store/actions/shopSceneActions';
import { selectShopStockRevision } from '../../store/selectors/sceneSelectors';
import { initRunRng } from '../../RunRng';

describe('shopStock', () => {
  beforeEach(() => {
    runActions.reset();
    sceneActions.reset();
    initRunRng('shop-stock-test');
    setupActions.applyProfession('outlaw');
  });

  test('generateShopStockRows returns slot count items', () => {
    const rows = generateShopStockRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.type === 'equipment' || r.type === 'consumable' || r.type === 'dice')).toBe(true);
  });

  test('generateNewShopState produces serializable stock', () => {
    const { shop } = generateNewShopState();
    expect(shop.stock.length).toBeGreaterThan(0);
    expect(shop.packs.length).toBe(2);
    expect(shop.stock[0]).toHaveProperty('type');
  });

  test('shopSceneActions.openShop writes scene store', () => {
    const shop = shopSceneActions.openShop();
    expect(shop.stock.length).toBeGreaterThan(0);
    const stored = shopRowsToStored(generateShopStockRows());
    expect(stored.length).toBe(shop.stock.length);
  });

  test('openShop after clearShop rolls fresh stock without sold flags', () => {
    shopSceneActions.openShop();
    sceneActions.markShopStockSold(0);
    expect(getSceneState().shop?.stock[0]?.sold).toBe(true);
    sceneActions.clearShop();
    const shop = shopSceneActions.openShop();
    expect(shop.stock.every((item) => !item.sold)).toBe(true);
  });

  test('shopSceneActions.rerollShop replaces stock and bumps revision', () => {
    shopSceneActions.openShop();
    economyActions.setBalance(100);
    const before = selectShopStockRevision();
    expect(shopSceneActions.rerollShop()).toBe(true);
    const after = selectShopStockRevision();
    expect(after).not.toBe(before);
    expect(getSceneState().shop?.shopRerollCount).toBe(1);
  });

  test('shopSceneActions.rerollShop does not charge when shop slice is missing', () => {
    economyActions.setBalance(100);
    expect(shopSceneActions.rerollShop()).toBe(false);
    expect(getRunState().balance).toBe(100);
    expect(getRunState().shopRerollCount).toBe(0);
  });

  test('dice permit rolls dice into non-first slots (not hard-injected)', () => {
    runActions.patch({ purchasedPermits: ['dice_carver'] });

    let firstSlotDice = 0;
    let laterSlotDice = 0;

    for (let i = 0; i < 250; i++) {
      const rows = generateShopStockRows();
      if (rows[0]?.type === 'dice') firstSlotDice++;
      if (rows.slice(1).some((row) => row.type === 'dice')) laterSlotDice++;
    }

    expect(firstSlotDice).toBeGreaterThan(0);
    expect(laterSlotDice).toBeGreaterThan(0);
  });

  test('master_engraver shop dice can include stickers with booster odds', () => {
    runActions.patch({
      purchasedPermits: ['dice_carver', 'master_engraver'],
      shopSlots: 8,
    });

    let diceSeen = 0;
    let stickeredDiceSeen = 0;
    let unstickeredDiceSeen = 0;

    for (let i = 0; i < 200; i++) {
      const rows = generateShopStockRows();
      for (const row of rows) {
        if (row.type !== 'dice' || !row.die) continue;
        diceSeen++;
        if (row.die.sticker) stickeredDiceSeen++;
        else unstickeredDiceSeen++;
      }
    }

    expect(diceSeen).toBeGreaterThan(0);
    expect(stickeredDiceSeen).toBeGreaterThan(0);
    expect(unstickeredDiceSeen).toBeGreaterThan(0);
  });

  test('dice_carver shop dice can include auras using dice aura rates', () => {
    runActions.patch({
      purchasedPermits: ['dice_carver'],
      shopSlots: 8,
    });

    let diceSeen = 0;
    let auraDiceSeen = 0;
    let nonAuraDiceSeen = 0;

    for (let i = 0; i < 250; i++) {
      const rows = generateShopStockRows();
      for (const row of rows) {
        if (row.type !== 'dice' || !row.die) continue;
        diceSeen++;
        if (row.die.aura) auraDiceSeen++;
        else nonAuraDiceSeen++;
      }
    }

    expect(diceSeen).toBeGreaterThan(0);
    expect(auraDiceSeen).toBeGreaterThan(0);
    expect(nonAuraDiceSeen).toBeGreaterThan(0);
  });

  test('master_engraver shop dice can include auras using dice aura rates', () => {
    runActions.patch({
      purchasedPermits: ['dice_carver', 'master_engraver'],
      shopSlots: 8,
    });

    let diceSeen = 0;
    let auraDiceSeen = 0;
    let nonAuraDiceSeen = 0;

    for (let i = 0; i < 250; i++) {
      const rows = generateShopStockRows();
      for (const row of rows) {
        if (row.type !== 'dice' || !row.die) continue;
        diceSeen++;
        if (row.die.aura) auraDiceSeen++;
        else nonAuraDiceSeen++;
      }
    }

    expect(diceSeen).toBeGreaterThan(0);
    expect(auraDiceSeen).toBeGreaterThan(0);
    expect(nonAuraDiceSeen).toBeGreaterThan(0);
  });
});
