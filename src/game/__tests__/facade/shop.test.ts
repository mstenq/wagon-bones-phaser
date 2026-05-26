import '../setup';
import { afterEach, describe, expect, test } from 'bun:test';
import { gameFacade } from '../../facade';
import { resetTestRun } from '../testHelpers';
import { setupActions } from '../../store/actions';
import { economyActions } from '../../store/actions/economyActions';
import { getRunState } from '../../store/runStore';
import { getSceneState, sceneActions } from '../../store/sceneStore';
import { initRunRng } from '../../RunRng';
import { getEquipmentDefById } from '../../ItemsSystem';
import { rollShopEquipmentPreview } from '../../EquipmentModifiers';

describe('gameFacade.shop', () => {
  afterEach(() => {
    resetTestRun();
  });

  test('openShop writes stock to scene store', () => {
    initRunRng('facade-shop-open');
    setupActions.applyProfession('outlaw');

    const shop = gameFacade.shop.openShop();
    expect(shop.stock.length).toBeGreaterThan(0);
    expect(getSceneState().shop?.stock.length).toBe(shop.stock.length);
  });

  test('buyEquipment spends money and adds equipment to run', () => {
    initRunRng('facade-shop-buy');
    setupActions.applyProfession('outlaw');
    gameFacade.shop.openShop();
    economyActions.setBalance(50);

    const stock = getSceneState().shop!.stock;
    const row = stock.find((item) => item.type === 'equipment' && !item.sold);
    expect(row?.type).toBe('equipment');
    if (row?.type !== 'equipment') return;

    const def = getEquipmentDefById(row.defId);
    expect(def).toBeTruthy();
    if (!def) return;
    const preview = rollShopEquipmentPreview(def, getRunState().purchasedPermits);
    const listPrice = gameFacade.shop.getEquipmentListPrice(def);
    const cost = gameFacade.shop.getEquipmentPurchasePrice(
      def,
      preview.modifiers,
      listPrice,
      getRunState().purchasedPermits,
    );
    const balanceBefore = getRunState().balance;
    const slotsBefore = getRunState().equipment.length;

    const result = gameFacade.shop.buyEquipment(def, preview, listPrice);
    expect(result.ok).toBe(true);
    expect(getRunState().balance).toBe(balanceBefore - cost);
    expect(getRunState().equipment.length).toBe(slotsBefore + 1);

    sceneActions.markShopStockSold(stock.indexOf(row));
    expect(getSceneState().shop?.stock[stock.indexOf(row)]?.sold).toBe(true);
  });
});
