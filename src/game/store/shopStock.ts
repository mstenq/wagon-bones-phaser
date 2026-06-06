// ─── Shop stock generation (No Phaser imports) ───
// Builds scene-store shop slices and applies tag modifiers to stock rows.

import { SHOP_WEIGHTS } from '../Constants';
import { rollDiceAura } from '../auraRng';
import { createDie } from '../DiceSystem';
import type { Die } from '../types';
import { generateShopStock, type EquipmentDef } from '../ItemsSystem';
import diceEnhancements from '../../data/dice_enhancements';
import pipEnhancements from '../../data/pip_enhancements';
import {
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  type ConsumableDef,
} from '../ConsumablesSystem';
import { applyRandomSticker, generateShopPacks } from '../BoosterPackSystem';
import type { PackDef } from '../../data/packs';
import { getPermitAuraMultiplier, hasPermitDiceInShop, type PermitDef } from '../PermitsSystem';
import { rollShopEquipmentPreview } from '../EquipmentModifiers';
import { getProfessionById } from '../../data/professions';
import {
  applyAuraTagsToShopStock,
  applyInjectTagsToShopStock,
  processShopTags,
  type ShopTagModifications,
} from '../TagSystem';
import { rngFloat, rngPick } from '../RunRng';
import { getRunState } from './runStore';
import { storedFromEquipmentInstance } from './resolve';
import type { RunState, ShopSceneState, StoredShopItem } from './types';
import { selectIsFirstShopVisit } from './selectors/runSelectors';

const SHOP_ENHANCEMENTS: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded'];

/** Fixed shop price for dice stock rows (enhanced / stickered dice from permits). */
export const DICE_SHOP_COST = 5;

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

/** Equipment-shaped display metadata for shop dice cards (name, cost, tooltip). */
export function buildShopDieDisplayDef(die: Die): EquipmentDef {
  const enhInfo = die.enhancement ? ENHANCEMENT_INFO.get(die.enhancement) : null;
  const name = enhInfo ? `${enhInfo.name} Die` : 'Die';
  const descParts = [enhInfo?.description ?? 'Standard die'];
  if (die.sticker) {
    const stickerInfo = STICKER_INFO.get(die.sticker);
    if (stickerInfo) descParts.push(`Sticker: ${stickerInfo.name}`);
  }
  const tooltipText = descParts.join('\n');
  return {
    id: `shop_die_${die.id}`,
    name,
    cost: DICE_SHOP_COST,
    rarity: 'uncommon',
    effectType: 'DICE',
    effectParams: {},
    display: () => ({
      hint: [],
      tooltip: [[{ text: tooltipText, style: 'text' }]],
    }),
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

/** Append rows until `targetSlotCount` is reached; preserves existing stored stock. */
export function appendShopStockForSlots(
  existingStored: StoredShopItem[],
  targetSlotCount: number,
  run: RunState = getRunState(),
): StoredShopItem[] {
  const slotCount = Math.max(1, targetSlotCount);
  if (existingStored.length >= slotCount) {
    return existingStored.map((item) => ({ ...item }));
  }

  const excludeIds = [...ownedDefIds(run), ...defIdsFromStoredStock(existingStored)];
  const newRows: ShopStockGenRow[] = [];

  while (existingStored.length + newRows.length < slotCount) {
    const row = generateOneShopStockRow(excludeIds, run);
    if (!row) continue;
    newRows.push(row);
    const id = defIdFromGenRow(row);
    if (id) excludeIds.push(id);
  }

  return [...existingStored, ...shopRowsToStored(newRows)];
}

/** Roll weighted shop stock rows (before tag injection / auras). */
export function generateShopStockRows(run: RunState = getRunState()): ShopStockGenRow[] {
  const slotCount = Math.max(1, run.shopSlots);
  const items: ShopStockGenRow[] = [];
  const excludeIds = ownedDefIds(run);

  for (let i = 0; i < slotCount; i++) {
    const row = generateOneShopStockRow(excludeIds, run);
    if (!row) continue;
    items.push(row);
    const id = defIdFromGenRow(row);
    if (id) excludeIds.push(id);
  }

  return items;
}

function applyFreeShopCosts(rows: ShopStockGenRow[]): void {
  for (const row of rows) {
    if (row.type === 'equipment' && row.def) {
      row.def = { ...row.def, cost: 0 };
    } else if (row.type === 'consumable' && row.consumableDef) {
      row.consumableDef = { ...row.consumableDef, cost: 0 };
    }
  }
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
  const equipRows = rows.filter(
    (r): r is ShopStockGenRow & { type: 'equipment'; def: EquipmentDef } => r.type === 'equipment' && !!r.def,
  );
  applyInjectTagsToShopStock(equipRows, run);
  if (tagMods.freeShop) {
    applyFreeShopCosts(rows);
  }
  applyAuraTagsToShopStock(equipRows, run);
  syncEquipmentPreviews(rows, getRunState());
}

export function shopRowsToStored(rows: ShopStockGenRow[]): StoredShopItem[] {
  return rows.map((row) => {
    if (row.type === 'equipment' && row.def && row.preview) {
      return {
        type: 'equipment',
        defId: row.def.id,
        preview: storedFromEquipmentInstance(row.preview),
        sold: row.sold,
      };
    }
    if (row.type === 'consumable' && row.consumableDef) {
      return { type: 'consumable', defId: row.consumableDef.id, sold: row.sold };
    }
    if (row.type === 'dice' && row.die) {
      return { type: 'dice', die: { ...row.die }, sold: row.sold };
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
  return {
    tagMods,
    shop: {
      stock: shopRowsToStored(rows),
      packs: buildShopPacksForRun(run),
      shopRerollCount: getRunState().shopRerollCount,
    },
  };
}

/** Regenerate stock after a paid reroll (packs unchanged). */
export function generateRerolledShopStock(run: RunState = getRunState()): StoredShopItem[] {
  const rows = generateShopStockRows(run);
  applyInjectTagsToShopStock(
    rows.filter(
      (r): r is ShopStockGenRow & { type: 'equipment'; def: EquipmentDef } => r.type === 'equipment' && !!r.def,
    ),
    run,
  );
  applyAuraTagsToShopStock(
    rows.filter(
      (r): r is ShopStockGenRow & { type: 'equipment'; def: EquipmentDef } => r.type === 'equipment' && !!r.def,
    ),
    run,
  );
  syncEquipmentPreviews(rows, getRunState());
  return shopRowsToStored(rows);
}
