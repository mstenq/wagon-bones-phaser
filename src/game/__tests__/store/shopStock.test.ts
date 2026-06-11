import { describe, expect, test, beforeEach } from 'bun:test';
import trailTags from '../../../data/trail_tags';
import { getRunState, runActions } from '../../store/runStore';
import { getSceneState, sceneActions } from '../../store/sceneStore';
import { setupActions } from '../../store/actions/setupActions';
import { economyActions } from '../../store/actions/economyActions';
import {
  appendShopStockForSlots,
  applyShopTagModsToRows,
  generateNewShopState,
  generateRerolledShopStock,
  generateShopStockRows,
  resolveShopEquipmentFromStored,
  resolveShopPackPurchaseCost,
  resolveShopStockPurchaseCost,
  shopRowsToStored,
  buildShopDieDisplayDef,
  buildShopPermitDisplayDef,
  buildShopPackDisplayDef,
  DICE_SHOP_COST,
  type ShopStockGenRow,
} from '../../store/shopStock';
import { createDie } from '../../DiceSystem';
import { getItemDisplayContext } from '../../displayContext';
import { generateShopPermit, getPermitById } from '../../PermitsSystem';
import { getPackById } from '../../../data/packs';
import { shopSceneActions } from '../../store/actions/shopSceneActions';
import { selectShopStockRevision } from '../../store/selectors/sceneSelectors';
import { selectShopRerollCost } from '../../store/selectors/runSelectors';
import { initRunRng } from '../../RunRng';
import { applyAuraTagsToShopStock, applyInjectTagsToShopStock, processShopTags } from '../../TagSystem';
import { getEquipmentDefById, type EquipmentDef } from '../../ItemsSystem';
import { getRandomTrailGuideDef } from '../../ConsumablesSystem';
import { deserializeEquipmentInstance } from '../../SaveLoad';
import { resolveEquipmentInstance } from '../../store/resolve';
import { rollShopEquipmentPreview } from '../../EquipmentModifiers';
import { getPlayerState, resetPlayerState } from '../testRunPlayer';

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

  test('appendShopStockForSlots drops sold rows and fills new slots (supply_wagon tactic)', () => {
    const existing = shopRowsToStored(generateShopStockRows().slice(0, 2));
    const soldOut = existing.map((item) => ({ ...item, sold: true as const }));

    const refreshed = appendShopStockForSlots(soldOut, 3);

    expect(refreshed.length).toBe(3);
    expect(refreshed.every((item) => !item.sold)).toBe(true);
  });

  test('appendShopStockForSlots keeps unsold rows and only replaces sold slots', () => {
    const existing = shopRowsToStored(generateShopStockRows().slice(0, 2));
    const mixed = [
      { ...existing[0]!, sold: true as const },
      { ...existing[1]! },
    ];

    const refreshed = appendShopStockForSlots(mixed, 3);

    expect(refreshed.length).toBe(3);
    expect(refreshed[0]).toEqual(mixed[1]);
    expect(refreshed.every((item) => !item.sold)).toBe(true);
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

describe('shop tag integration', () => {
  const ALL_TAGS = trailTags;

  beforeEach(() => {
    resetPlayerState();
    sceneActions.reset();
    initRunRng('tag-shop-integration');
    setupActions.applyProfession('outlaw');
  });

  test('On the House: stored stock and packs resolve to $0 after round-trip', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_company_store')!);
    const { shop, tagMods } = generateNewShopState();
    expect(tagMods.freeShop).toBe(true);
    expect(shop.visitMods?.freeShop).toBe(true);
    const visitMods = shop.visitMods ?? { freeShop: true };

    for (const item of shop.stock) {
      expect(resolveShopStockPurchaseCost(item)).toBe(0);
    }
    for (const pack of shop.packs) {
      const def = getPackById(pack.defId);
      expect(def).toBeDefined();
      expect(resolveShopPackPurchaseCost(def!, visitMods)).toBe(0);
    }
  });

  test('On the House: rerolled stock is not free', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_company_store')!);
    generateNewShopState();
    const rerolled = generateRerolledShopStock();
    expect(rerolled.length).toBeGreaterThan(0);
    const hasPaidItem = rerolled.some((item) => resolveShopStockPurchaseCost(item) > 0);
    expect(hasPaidItem).toBe(true);
  });

  test('visitMods.freeShop alone does not free unstamped stock rows', () => {
    const rows = generateShopStockRows();
    const stored = shopRowsToStored(rows);
    const consumable = stored.find((s) => s.type === 'consumable' && s.shopCost == null);
    expect(consumable).toBeDefined();
    if (!consumable) return;
    expect(resolveShopStockPurchaseCost(consumable)).toBeGreaterThan(0);
  });

  test("Outfitter's Pick: injected equipment is free after store round-trip", () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_uncommon')!);
    processShopTags(player);
    const stock: ShopStockGenRow[] = [
      { type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef },
      { type: 'equipment', def: { id: 'c', cost: 5 } as EquipmentDef },
    ];
    applyInjectTagsToShopStock(stock, player);
    for (const row of stock) {
      if (row.type === 'equipment' && row.def) {
        row.preview = rollShopEquipmentPreview(row.def, getRunState().purchasedPermits);
      }
    }
    const stored = shopRowsToStored(stock);
    expect(stored[0]?.shopCost).toBe(0);
    expect(resolveShopStockPurchaseCost(stored[0]!)).toBe(0);
  });

  test('Saloon Find: injected rare equipment is free after store round-trip', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_rare')!);
    processShopTags(player);
    const stock: ShopStockGenRow[] = [{ type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef }];
    applyInjectTagsToShopStock(stock, player);
    for (const row of stock) {
      if (row.type === 'equipment' && row.def) {
        row.preview = rollShopEquipmentPreview(row.def, getRunState().purchasedPermits);
      }
    }
    const stored = shopRowsToStored(stock);
    expect(stored[0]?.shopCost).toBe(0);
    expect(resolveShopStockPurchaseCost(stored[0]!)).toBe(0);
  });

  const AURA_SHOP_TAG_CASES: [string, string][] = [
    ['tag_ghost', 'ghost'],
    ['tag_fire', 'fire'],
    ['tag_arcane', 'arcane'],
    ['tag_holy', 'holy'],
  ];

  for (const [tagId, auraId] of AURA_SHOP_TAG_CASES) {
    test(`shop stored preview hydrates ${auraId} aura (${tagId})`, () => {
      const player = getPlayerState();
      player.addTag(ALL_TAGS.find((t) => t.id === tagId)!);
      const horseshoe = getEquipmentDefById('horseshoe')!;
      const rows: ShopStockGenRow[] = [
        { type: 'equipment', def: { ...horseshoe }, preview: rollShopEquipmentPreview(horseshoe, []) },
      ];
      applyAuraTagsToShopStock(rows);
      for (const row of rows) {
        if (row.type === 'equipment' && row.def && row.preview) {
          row.preview.def = row.def;
        }
      }
      const stored = shopRowsToStored(rows)[0]!;
      expect(stored.type).toBe('equipment');
      if (stored.type !== 'equipment') return;
      expect(stored.preview.auraId).toBe(auraId);

      const hydrated = resolveEquipmentInstance(stored.preview);
      expect(hydrated.def.aura?.id).toBe(auraId);
      expect(deserializeEquipmentInstance(stored.preview).def.aura).toBeUndefined();
    });
  }

  test('Haunted Relic: aura applied and free on base equipment slot', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_ghost')!);
    const { shop } = generateNewShopState();
    const ghostRow = shop.stock.find((s) => s.type === 'equipment' && s.preview.auraId === 'ghost');
    expect(ghostRow).toBeDefined();
    expect(resolveShopStockPurchaseCost(ghostRow!)).toBe(0);
  });

  test('Haunted Relic: banks when shop has no base equipment', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find((t) => t.id === 'tag_ghost')!;
    player.pendingTags = [{ def: tag, copies: 1 }];
    applyAuraTagsToShopStock([], player);
    expect(getRunState().storedAuraTags).toEqual([{ tagId: 'tag_ghost', copies: 1 }]);
  });

  test('Haunted Relic: partial apply re-banks leftover stored copies', () => {
    runActions.patch({ storedAuraTags: [{ tagId: 'tag_ghost', copies: 2 }] });
    const horseshoe = getEquipmentDefById('horseshoe')!;
    const rows: ShopStockGenRow[] = [
      { type: 'equipment', def: { ...horseshoe }, preview: rollShopEquipmentPreview(horseshoe, []) },
    ];
    applyAuraTagsToShopStock(rows);
    const row = rows[0];
    expect(row?.type).toBe('equipment');
    if (row?.type !== 'equipment' || !row.def) return;
    expect(row.def.aura?.id).toBe('ghost');
    expect(getRunState().storedAuraTags).toEqual([{ tagId: 'tag_ghost', copies: 1 }]);
  });

  test('Haunted Relic: after trail-guide-only shop and reroll, ghost aura and $0 price match on same card', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_ghost')!);
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_free_reroll')!);

    const initialRows: ShopStockGenRow[] = [
      { type: 'consumable', consumableDef: getRandomTrailGuideDef() },
      { type: 'consumable', consumableDef: getRandomTrailGuideDef() },
    ];
    const tagMods = processShopTags(player);
    expect(tagMods.freeFirstReroll).toBe(true);
    applyShopTagModsToRows(initialRows, tagMods);
    expect(getRunState().storedAuraTags).toEqual([{ tagId: 'tag_ghost', copies: 1 }]);

    const horseshoe = getEquipmentDefById('horseshoe')!;
    const dynamite = getEquipmentDefById('dynamite')!;
    const rerollRows: ShopStockGenRow[] = [
      { type: 'equipment', def: { ...horseshoe }, preview: rollShopEquipmentPreview(horseshoe, []) },
      { type: 'equipment', def: { ...dynamite }, preview: rollShopEquipmentPreview(dynamite, []) },
    ];
    applyInjectTagsToShopStock(rerollRows);
    applyAuraTagsToShopStock(rerollRows);
    for (const row of rerollRows) {
      if (row.type === 'equipment' && row.def && !row.preview) {
        row.preview = rollShopEquipmentPreview(row.def, getRunState().purchasedPermits);
      } else if (row.type === 'equipment' && row.def && row.preview) {
        row.preview.def = row.def;
      }
    }
    const stored = shopRowsToStored(rerollRows);

    const ghostRow = stored.find((s) => s.type === 'equipment' && s.preview.auraId === 'ghost');
    expect(ghostRow).toBeDefined();
    const resolved = resolveShopEquipmentFromStored(ghostRow as Extract<typeof ghostRow, { type: 'equipment' }>);
    expect(resolved.def.aura?.id).toBe('ghost');
    expect(resolved.purchaseCost).toBe(0);
    expect(getRunState().storedAuraTags).toEqual([]);

    const paidRow = stored.find((s) => s.type === 'equipment' && s.preview.auraId !== 'ghost');
    expect(paidRow).toBeDefined();
    expect(
      resolveShopEquipmentFromStored(paidRow as Extract<typeof paidRow, { type: 'equipment' }>).purchaseCost,
    ).toBeGreaterThan(0);
  });

  test('Haunted Relic: generateRerolledShopStock applies banked ghost after consumable-only visit', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_ghost')!);
    const initialRows: ShopStockGenRow[] = [
      { type: 'consumable', consumableDef: getRandomTrailGuideDef() },
      { type: 'consumable', consumableDef: getRandomTrailGuideDef() },
    ];
    applyShopTagModsToRows(initialRows, { freeShop: false, freeFirstReroll: false, extraPermits: 0 });
    expect(getRunState().storedAuraTags).toEqual([{ tagId: 'tag_ghost', copies: 1 }]);

    initRunRng('ghost-reroll-stock-gen');
    const rerolled = generateRerolledShopStock();
    const equipment = rerolled.filter((s) => s.type === 'equipment');
    expect(equipment.length).toBeGreaterThan(0);
    const ghostRow = equipment.find((s) => s.preview.auraId === 'ghost');
    expect(ghostRow).toBeDefined();
    const resolved = resolveShopEquipmentFromStored(ghostRow as Extract<typeof ghostRow, { type: 'equipment' }>);
    expect(resolved.def.aura?.id).toBe('ghost');
    expect(resolved.purchaseCost).toBe(0);
  });

  test('Permit Stamp: adds bonus permits to shop visit', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_permit')!);
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_permit')!);
    const shop = shopSceneActions.openShop();
    expect(shop.bonusPermitIds?.length).toBe(2);
    expect(getSceneState().shop?.bonusPermitIds?.length).toBe(2);
  });

  test('Coupon Book: first shop reroll is free', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_free_reroll')!);
    shopSceneActions.openShop();
    expect(getRunState().tagFreeReroll).toBe(true);
    expect(selectShopRerollCost(getRunState())).toBe(0);
  });

  test('On the House: permits are not included in free shop pricing', () => {
    const player = getPlayerState();
    player.addTag(ALL_TAGS.find((t) => t.id === 'tag_company_store')!);
    const { shop } = generateNewShopState();
    expect(shop.visitMods?.freeShop).toBe(true);
    const permit = generateShopPermit([]);
    expect(permit).not.toBeNull();
    expect(permit!.cost).toBeGreaterThan(0);
  });
});

describe('buildShopPackDisplayDef', () => {
  test('pack card uses pack metadata, cost, and pick info tooltip', () => {
    const pack = getPackById('dice_standard');
    expect(pack).toBeDefined();
    const displayDef = buildShopPackDisplayDef(pack!, 3);
    expect(displayDef.id).toBe('dice_standard');
    expect(displayDef.name).toBe(pack!.name);
    expect(displayDef.cost).toBe(3);
    expect(displayDef.rarity).toBe('pack');
    const tooltip = displayDef.display(null, getItemDisplayContext()).tooltip?.[0]?.[0]?.text ?? '';
    expect(tooltip).toBe(`Standard Dice Pack\nPick ${pack!.pickCount} of ${pack!.totalCards}`);
  });
});
