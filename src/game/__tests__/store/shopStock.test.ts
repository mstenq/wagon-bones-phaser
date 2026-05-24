import { describe, expect, test, beforeEach } from 'bun:test';
import { getRunState, runActions } from '../../store/runStore';
import { getSceneState, sceneActions } from '../../store/sceneStore';
import { setupActions } from '../../store/actions/setupActions';
import { economyActions } from '../../store/actions/economyActions';
import { generateNewShopState, generateShopStockRows, shopRowsToStored } from '../../store/shopStock';
import { shopSceneActions } from '../../store/actions/shopSceneActions';
import { selectShopStockRevision } from '../../store/selectors/sceneSelectors';

describe('shopStock', () => {
  beforeEach(() => {
    runActions.reset();
    sceneActions.reset();
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
});
