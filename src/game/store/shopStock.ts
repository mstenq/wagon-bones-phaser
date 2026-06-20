// ─── Shop stock generation (No Phaser imports) ───
// Builds scene-store shop slices and applies tag modifiers to stock rows.

import { SHOP_WEIGHTS } from '../Constants';
import { rollDiceAura } from '../auraRng';
import { createDie } from '../DiceSystem';
import type { Die } from '../types';
import { generateShopStock, type EquipmentDef } from '../ItemsSystem';
import diceEnhancements from '../../data/dice_enhancements';
import { getDiceStickerById } from '../../data/dice_stickers';
import type { HintSegment } from '../../data/items';
import {
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  type ConsumableDef,
} from '../ConsumablesSystem';
import { applyRandomSticker, generateShopPacks, playerAllowsDuplicateItems } from '../BoosterPackSystem';
import type { PackDef } from '../../data/packs';
import { getDiscountedShopPrice, getPermitAuraMultiplier, hasPermitDiceInShop, type PermitDef } from '../PermitsSystem';
import { getEquipmentPurchasePrice, rollShopEquipmentPreview } from '../EquipmentModifiers';
import { getEquipmentListPrice } from '../ItemsSystem';
import { getConsumableDefById } from '../ConsumablesSystem';
import { getProfessionById } from '../../data/professions';
import {
  applyAuraTagsToShopStock,
  applyInjectTagsToShopStock,
  processShopTags,
  type ShopTagModifications,
} from '../TagSystem';
import { rngFloat, rngPick } from '../RunRng';
import { getRunState } from './runStore';
import { resolveEquipmentInstance, storedFromEquipmentInstance } from './resolve';
import {
  DEFAULT_SHOP_VISIT_MODS,
  type RunState,
  type ShopSceneState,
  type ShopVisitMods,
  type StoredShopItem,
} from './types';
import { selectIsFirstShopVisit, selectTrailGuidesFree } from './selectors/runSelectors';

const SHOP_ENHANCEMENTS: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded'];

/** Fixed shop price for dice stock rows (enhanced / stickered dice from permits). */
export const DICE_SHOP_COST = 5;

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));

/** Equipment-shaped display metadata for shop dice cards (name, cost, tooltip). */
export function buildShopDieDisplayDef(die: Die): EquipmentDef {
  const enhInfo = die.enhancement ? ENHANCEMENT_INFO.get(die.enhancement) : null;
  const name = enhInfo ? `${enhInfo.name} Die` : 'Die';
  const stickerInfo = die.sticker ? getDiceStickerById(die.sticker) : null;

  return {
    id: `shop_die_${die.id}`,
    name,
    cost: DICE_SHOP_COST,
    rarity: 'uncommon',
    effectType: 'DICE',
    effectParams: {},
    display: (_round, player) => {
      const tooltip: HintSegment[][] = [[{ text: enhInfo?.description ?? 'Standard die', style: 'text' }]];
      if (stickerInfo) {
        tooltip.push([{ text: `Sticker: ${stickerInfo.name}`, style: 'text' }]);
        if (stickerInfo.tooltip) {
          tooltip.push(...stickerInfo.tooltip(player));
        }
      }
      return { hint: [], tooltip };
    },
  };
}

/** Equipment-shaped display metadata for shop permit cards (name, cost, tooltip). */
export function buildShopPermitDisplayDef(permit: PermitDef, cost: number): EquipmentDef {
  return {
    id: permit.id,
    name: permit.name,
    cost,
    rarity: 'permit',
    effectType: 'PERMIT',
    effectParams: {},
    display: () => ({
      hint: [],
      tooltip: [[{ text: permit.description, style: 'text' }]],
    }),
  };
}

const PACK_TIER_LABELS: Record<string, string> = {
  normal: 'Standard',
  jumbo: 'Jumbo',
  mega: 'Mega',
};

const PACK_CATEGORY_LABELS: Record<string, string> = {
  dice: 'Dice',
  supply: 'Supply',
  trail_guide: 'Trail Guide',
  frontier: 'Frontier',
  equipment: 'Equipment',
};

/** Equipment-shaped display metadata for shop booster pack cards (name, cost, tooltip). */
export function buildShopPackDisplayDef(pack: PackDef, cost: number): EquipmentDef {
  const tierLabel = PACK_TIER_LABELS[pack.tier] ?? pack.tier;
  const catLabel = PACK_CATEGORY_LABELS[pack.category] ?? pack.category;
  const subtitle = `${tierLabel} ${catLabel} Pack`;
  const pickInfo = `Pick ${pack.pickCount} of ${pack.totalCards}`;
  const tooltipText = `${subtitle}\n${pickInfo}`;

  return {
    id: pack.id,
    name: pack.name,
    cost,
    rarity: 'pack',
    effectType: 'PACK',
    effectParams: {},
    display: () => ({
      hint: [],
      tooltip: [[{ text: tooltipText, style: 'text' }]],
    }),
  };
}

/** Mutable row used while generating / tagging shop stock (equipment tag helpers need defs). */
export interface ShopStockGenRow {
  type: 'equipment' | 'consumable' | 'dice';
  def?: EquipmentDef;
  consumableDef?: ConsumableDef;
  die?: Die;
  preview?: ReturnType<typeof rollShopEquipmentPreview>;
  sold?: boolean;
}

export function generateShopDie(mode: 'enhanced' | 'stickered', run: RunState = getRunState()): Die {
  const enhancement = rngPick('shop', SHOP_ENHANCEMENTS);
  const die = createDie({ enhancement });
  const aura = rollDiceAura(getPermitAuraMultiplier(run.purchasedPermits), 'shop');
  if (aura) die.aura = aura;
  if (mode === 'stickered') {
    applyRandomSticker(die);
  }
  return die;
}

type ShopStockCategory = 'equipment' | 'supply' | 'trail_guide' | 'frontier' | 'dice';

interface ShopStockCategoryWeight {
  type: ShopStockCategory;
  weight: number;
}

function ownedDefIds(run: RunState): string[] {
  return [...run.equipment.map((e) => e.defId), ...run.consumables.map((c) => c.defId)];
}

/** Owned + in-shop ids excluded from generation, unless Counterfeit Goods allows duplicates. */
function shopStockExcludeIds(run: RunState, withinShopIds: string[] = []): string[] {
  if (playerAllowsDuplicateItems(run)) return [];
  return [...ownedDefIds(run), ...withinShopIds];
}

function defIdsFromStoredStock(stored: StoredShopItem[]): string[] {
  const ids: string[] = [];
  for (const item of stored) {
    if (item.type === 'equipment' || item.type === 'consumable') {
      ids.push(item.defId);
    }
  }
  return ids;
}

function defIdFromGenRow(row: ShopStockGenRow): string | null {
  if (row.type === 'equipment' && row.def) return row.def.id;
  if (row.type === 'consumable' && row.consumableDef) return row.consumableDef.id;
  return null;
}

function buildShopStockCategories(run: RunState): {
  categories: ShopStockCategoryWeight[];
  diceMode: ReturnType<typeof hasPermitDiceInShop>;
} {
  const profession = run.professionId ? getProfessionById(run.professionId) : null;
  const diceMode = hasPermitDiceInShop(run.purchasedPermits);
  const categories: ShopStockCategoryWeight[] = [
    { type: 'equipment', weight: SHOP_WEIGHTS.equipment },
    { type: 'supply', weight: SHOP_WEIGHTS.supply },
    { type: 'trail_guide', weight: SHOP_WEIGHTS.trail_guide },
  ];
  if (diceMode !== 'none') {
    categories.push({ type: 'dice', weight: SHOP_WEIGHTS.dice });
  }
  if (profession?.modifiers?.frontierInShop) {
    categories.push({ type: 'frontier', weight: SHOP_WEIGHTS.frontier });
  }
  return { categories, diceMode };
}

function pickShopStockCategory(categories: ShopStockCategoryWeight[]): ShopStockCategory {
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  let roll = rngFloat('shop') * totalWeight;
  let picked = categories[0]!.type;
  for (const cat of categories) {
    roll -= cat.weight;
    if (roll <= 0) {
      picked = cat.type;
      break;
    }
  }
  return picked;
}

/** Roll one weighted shop stock row (before tag injection / auras). */
export function generateOneShopStockRow(excludeIds: string[], run: RunState = getRunState()): ShopStockGenRow | null {
  const { categories, diceMode } = buildShopStockCategories(run);
  const picked = pickShopStockCategory(categories);

  if (picked === 'dice' && diceMode !== 'none') {
    return { type: 'dice', die: generateShopDie(diceMode, run) };
  }

  if (picked === 'equipment') {
    const [def] = generateShopStock(1, excludeIds);
    if (!def) return null;
    return {
      type: 'equipment',
      def,
      preview: rollShopEquipmentPreview(def, run.purchasedPermits),
    };
  }

  let consumableDef: ConsumableDef;
  if (picked === 'supply') {
    consumableDef = getRandomSupplyDef(undefined, excludeIds);
  } else if (picked === 'trail_guide') {
    consumableDef = getRandomTrailGuideDef(undefined, excludeIds);
  } else {
    consumableDef = getShopRandomFrontierDef(undefined, excludeIds);
  }
  return { type: 'consumable', consumableDef };
}

/** Append rows until `targetSlotCount` is reached; preserves unsold stock, drops sold rows. */
export function appendShopStockForSlots(
  existingStored: StoredShopItem[],
  targetSlotCount: number,
  run: RunState = getRunState(),
): StoredShopItem[] {
  const slotCount = Math.max(1, targetSlotCount);
  const activeStock = existingStored.filter((item) => !item.sold);

  if (activeStock.length >= slotCount) {
    return activeStock.map((item) => ({ ...item }));
  }

  const allowDupes = playerAllowsDuplicateItems(run);
  const excludeIds = shopStockExcludeIds(run, defIdsFromStoredStock(activeStock));
  const newRows: ShopStockGenRow[] = [];

  while (activeStock.length + newRows.length < slotCount) {
    const row = generateOneShopStockRow(excludeIds, run);
    if (!row) continue;
    newRows.push(row);
    const id = defIdFromGenRow(row);
    if (id && !allowDupes) excludeIds.push(id);
  }

  return [...activeStock, ...shopRowsToStored(newRows)];
}

/** After a permit purchase: only SHOP_SLOTS permits drop sold rows and fill new slots. */
export function refreshShopStockAfterPermitPurchase(
  existingStored: StoredShopItem[],
  permit: PermitDef,
  run: RunState = getRunState(),
): StoredShopItem[] {
  if (permit.effect.type === 'SHOP_SLOTS') {
    return appendShopStockForSlots(existingStored, Math.max(1, run.shopSlots), run);
  }
  return existingStored.map((item) => ({ ...item }));
}

/** Roll weighted shop stock rows (before tag injection / auras). */
export function generateShopStockRows(run: RunState = getRunState()): ShopStockGenRow[] {
  const slotCount = Math.max(1, run.shopSlots);
  const items: ShopStockGenRow[] = [];
  const allowDupes = playerAllowsDuplicateItems(run);
  const excludeIds = shopStockExcludeIds(run);

  for (let i = 0; i < slotCount; i++) {
    const row = generateOneShopStockRow(excludeIds, run);
    if (!row) continue;
    items.push(row);
    const id = defIdFromGenRow(row);
    if (id && !allowDupes) excludeIds.push(id);
  }

  return items;
}

function applyFreeShopCosts(rows: ShopStockGenRow[]): void {
  for (const row of rows) {
    if (row.type === 'equipment' && row.def) {
      row.def = { ...row.def, cost: 0 };
    } else if (row.type === 'consumable' && row.consumableDef) {
      row.consumableDef = { ...row.consumableDef, cost: 0 };
    } else if (row.type === 'dice') {
      // Dice use DICE_SHOP_COST at display time; shopCost: 0 is stamped when storing.
    }
  }
}

function shopCostOverrideForRow(row: ShopStockGenRow, freeShop: boolean): number | undefined {
  if (freeShop) return 0;
  if (row.type === 'equipment' && row.def?.cost === 0) return 0;
  if (row.type === 'consumable' && row.consumableDef?.cost === 0) return 0;
  return undefined;
}

export function normalizeShopVisitMods(mods?: Partial<ShopVisitMods> | null): ShopVisitMods {
  return { freeShop: mods?.freeShop ?? false };
}

export function normalizeShopSceneState(shop: ShopSceneState): ShopSceneState {
  let bonusPermitIds = shop.bonusPermitIds ?? [];
  if (bonusPermitIds.length === 0) {
    const legacyId = getRunState().bonusShopPermitId;
    if (legacyId) bonusPermitIds = [legacyId];
  }
  return {
    ...shop,
    visitMods: normalizeShopVisitMods(shop.visitMods),
    bonusPermitIds,
  };
}

/**
 * Resolve purchase cost for a stored shop stock row (logic-only; used by tests and shop UI).
 * Stock freeness is stamped per row via `shopCost: 0` (initial On the House / inject / aura stock).
 * Visit-level `visitMods.freeShop` applies to packs only — rerolled stock stays paid.
 */
export function resolveShopStockPurchaseCost(item: StoredShopItem, run: RunState = getRunState()): number {
  if (item.shopCost === 0) {
    if (item.type === 'equipment') {
      const preview = resolveEquipmentInstance(item.preview, run.purchasedPermits);
      const def = { ...preview.def, cost: 0 };
      const listPrice = getEquipmentListPrice(def);
      return getEquipmentPurchasePrice(def, preview.modifiers, listPrice, run.purchasedPermits);
    }
    return 0;
  }

  if (item.type === 'equipment') {
    const preview = resolveEquipmentInstance(item.preview, run.purchasedPermits);
    const listPrice = getEquipmentListPrice(preview.def);
    return getEquipmentPurchasePrice(preview.def, preview.modifiers, listPrice, run.purchasedPermits);
  }

  if (item.type === 'consumable') {
    const def = getConsumableDefById(item.defId);
    if (!def) return 0;
    if (def.category === 'trail_guide' && selectTrailGuidesFree(run)) return 0;
    return getDiscountedShopPrice(def.cost, run.purchasedPermits);
  }

  if (item.type === 'dice') {
    return DICE_SHOP_COST;
  }

  return 0;
}

/** Resolve purchase cost for a booster pack this shop visit. */
export function resolveShopPackPurchaseCost(
  packDef: PackDef,
  visitMods: ShopVisitMods = DEFAULT_SHOP_VISIT_MODS,
  run: RunState = getRunState(),
): number {
  if (packDef.category === 'trail_guide' && selectTrailGuidesFree(run)) return 0;
  if (visitMods.freeShop) return 0;
  return getDiscountedShopPrice(packDef.cost, run.purchasedPermits);
}

function syncEquipmentPreviews(rows: ShopStockGenRow[], run: RunState): void {
  for (const row of rows) {
    if (row.type !== 'equipment' || !row.def) continue;
    if (!row.preview) {
      row.preview = rollShopEquipmentPreview(row.def, run.purchasedPermits);
      continue;
    }
    row.preview.def = row.def;
  }
}

export function applyShopTagModsToRows(
  rows: ShopStockGenRow[],
  tagMods: ShopTagModifications,
  run: RunState = getRunState(),
): void {
  applyInjectTagsToShopStock(rows, run);
  if (tagMods.freeShop) {
    applyFreeShopCosts(rows);
  }
  applyAuraTagsToShopStock(rows, run);
  syncEquipmentPreviews(rows, getRunState());
}

export function shopRowsToStored(rows: ShopStockGenRow[], options?: { freeShop?: boolean }): StoredShopItem[] {
  const freeShop = options?.freeShop ?? false;
  return rows.map((row) => {
    const shopCost = shopCostOverrideForRow(row, freeShop);
    const costField = shopCost === 0 ? { shopCost: 0 as const } : {};

    if (row.type === 'equipment' && row.def && row.preview) {
      return {
        type: 'equipment',
        defId: row.def.id,
        preview: storedFromEquipmentInstance(row.preview),
        sold: row.sold,
        ...costField,
      };
    }
    if (row.type === 'consumable' && row.consumableDef) {
      return { type: 'consumable', defId: row.consumableDef.id, sold: row.sold, ...costField };
    }
    if (row.type === 'dice' && row.die) {
      return { type: 'dice', die: { ...row.die }, sold: row.sold, ...costField };
    }
    throw new Error('Invalid shop stock row');
  });
}

export function buildShopPacksForRun(run: RunState = getRunState()): ShopSceneState['packs'] {
  const packs = generateShopPacks(
    2,
    selectIsFirstShopVisit(run) ? { guaranteePackId: 'equipment_standard' } : undefined,
  );
  return packs.map((p) => ({ defId: p.def.id, instanceId: p.id }));
}

/** Generate a fresh shop visit (stock + packs + reroll count snapshot). */
export function generateNewShopState(run: RunState = getRunState()): {
  shop: ShopSceneState;
  tagMods: ShopTagModifications;
} {
  const rows = generateShopStockRows(run);
  const tagMods = processShopTags(run);
  applyShopTagModsToRows(rows, tagMods, run);
  const visitMods: ShopVisitMods = { freeShop: tagMods.freeShop };
  return {
    tagMods,
    shop: {
      stock: shopRowsToStored(rows, { freeShop: tagMods.freeShop }),
      packs: buildShopPacksForRun(run),
      shopRerollCount: getRunState().shopRerollCount,
      visitMods,
    },
  };
}

/** Regenerate stock after a paid reroll (packs unchanged). */
export function generateRerolledShopStock(run: RunState = getRunState()): StoredShopItem[] {
  const rows = generateShopStockRows(run);
  applyInjectTagsToShopStock(rows, run);
  applyAuraTagsToShopStock(rows, run);
  syncEquipmentPreviews(rows, getRunState());
  return shopRowsToStored(rows);
}

/** Resolve shop equipment def + preview from stored stock (includes tag auras). */
export function resolveShopEquipmentFromStored(
  item: StoredShopItem & { type: 'equipment' },
  run: RunState = getRunState(),
): { def: EquipmentDef; preview: ReturnType<typeof resolveEquipmentInstance>; purchaseCost: number } {
  const preview = resolveEquipmentInstance(item.preview, run.purchasedPermits);
  return {
    def: preview.def,
    preview,
    purchaseCost: resolveShopStockPurchaseCost(item, run),
  };
}
