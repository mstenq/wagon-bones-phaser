import { describe, expect, test, beforeEach } from 'bun:test';
import { getRunState, runActions } from '../../store/runStore';
import { getSceneState, sceneActions } from '../../store/sceneStore';
import { setupActions } from '../../store/actions/setupActions';
import { economyActions } from '../../store/actions/economyActions';
import {
  appendShopStockForSlots,
  generateNewShopState,
  generateShopStockRows,
  shopRowsToStored,
  buildShopDieDisplayDef,
  buildShopPermitDisplayDef,
  DICE_SHOP_COST,
} from '../../store/shopStock';
import { createDie } from '../../DiceSystem';
import { getItemDisplayContext } from '../../displayContext';
import { getPermitById } from '../../PermitsSystem';
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

  test('appendShopStockForSlots preserves existing stock rows', () => {
    const existing = shopRowsToStored(generateShopStockRows());
    const targetCount = existing.length + 2;
    const appended = appendShopStockForSlots(existing, targetCount);

    expect(appended.length).toBe(targetCount);
    for (let i = 0; i < existing.length; i++) {
      expect(appended[i]).toEqual(existing[i]);
    }
  });

  test('appendShopStockForSlots does not append when stock already meets slot count', () => {
    const existing = shopRowsToStored(generateShopStockRows());
    const same = appendShopStockForSlots(existing, existing.length);

    expect(same.length).toBe(existing.length);
    expect(same).toEqual(existing);
  });

  test('appendShopStockForSlots excludes owned and existing stock ids from new rows', () => {
    const existing = shopRowsToStored(generateShopStockRows());
    const existingIds = existing
      .filter((item) => item.type === 'equipment' || item.type === 'consumable')
      .map((item) => item.defId);

    runActions.patch({
      equipment: [{ defId: 'dynamite', sellValue: 2, state: {}, modifiers: [] }],
    });

    const targetCount = existing.length + 4;
    const appended = appendShopStockForSlots(existing, targetCount);
    const newRows = appended.slice(existing.length);

    expect(newRows.length).toBe(4);
    for (const item of newRows) {
      if (item.type === 'equipment' || item.type === 'consumable') {
        expect(item.defId).not.toBe('dynamite');
        expect(existingIds).not.toContain(item.defId);
      }
    }
  });

  test('appendShopStockForSlots equipment rows include preview instances', () => {
    const existing = shopRowsToStored(generateShopStockRows());

    let sawEquipment = false;
    for (let i = 0; i < 40; i++) {
      const appended = appendShopStockForSlots(existing, existing.length + 1);
      const row = appended[existing.length];
      if (row?.type === 'equipment') {
        sawEquipment = true;
        expect(row.preview).toBeDefined();
        expect(row.preview.defId).toBe(row.defId);
        break;
      }
    }

    expect(sawEquipment).toBe(true);
  });

  test('appendShopStockForSlots can roll dice when dice permits are active', () => {
    runActions.patch({ purchasedPermits: ['dice_carver'] });
    const existing = shopRowsToStored(generateShopStockRows().slice(0, 1));

    let diceAppended = 0;
    for (let i = 0; i < 200; i++) {
      const appended = appendShopStockForSlots(existing, 4);
      if (appended.slice(1).some((row) => row.type === 'dice')) diceAppended++;
    }

    expect(diceAppended).toBeGreaterThan(0);
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

describe('buildShopDieDisplayDef', () => {
  test('plain die uses default name and description', () => {
    const die = createDie();
    const displayDef = buildShopDieDisplayDef(die);
    expect(displayDef.name).toBe('Die');
    expect(displayDef.cost).toBe(DICE_SHOP_COST);
    const tooltip = displayDef.display(null, getItemDisplayContext()).tooltip?.[0]?.[0]?.text ?? '';
    expect(tooltip).toBe('Standard die');
  });

  test('enhanced die includes enhancement description in tooltip', () => {
    const die = createDie({ enhancement: 'gold' });
    const displayDef = buildShopDieDisplayDef(die);
    expect(displayDef.name).toBe('Gold Die');
    const tooltip = displayDef.display(null, getItemDisplayContext()).tooltip?.[0]?.[0]?.text ?? '';
    expect(tooltip).toContain('Earn $3 when dice is not scored at end of round');
  });

  test('stickered die appends sticker line to tooltip', () => {
    const die = createDie({ enhancement: 'steel', sticker: 'purple_flower' });
    const displayDef = buildShopDieDisplayDef(die);
    const tooltip = displayDef.display(null, getItemDisplayContext()).tooltip?.[0]?.[0]?.text ?? '';
    expect(tooltip).toContain('Sticker: Purple Flower');
  });

  test('shop die display id is tied to die instance', () => {
    const die = createDie({ enhancement: 'lucky' });
    const displayDef = buildShopDieDisplayDef(die);
    expect(displayDef.id).toBe(`shop_die_${die.id}`);
    expect(displayDef.cost).toBe(5);
  });
});

describe('buildShopPermitDisplayDef', () => {
  test('permit card uses permit metadata and supplied cost', () => {
    const permit = getPermitById('supply_wagon');
    expect(permit).not.toBeNull();
    const displayDef = buildShopPermitDisplayDef(permit!, 7);
    expect(displayDef.id).toBe('supply_wagon');
    expect(displayDef.name).toBe(permit!.name);
    expect(displayDef.cost).toBe(7);
    expect(displayDef.rarity).toBe('permit');
    const tooltip = displayDef.display(null, getItemDisplayContext()).tooltip?.[0]?.[0]?.text ?? '';
    expect(tooltip).toBe(permit!.description);
  });
});
