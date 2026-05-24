// ─── Shop stock generation (No Phaser imports) ───
// Builds scene-store shop slices and applies tag modifiers to stock rows.

import { SHOP_WEIGHTS } from '../Constants';
import { createDie } from '../DiceSystem';
import type { Die } from '../types';
import { generateShopStock, type EquipmentDef } from '../ItemsSystem';
import {
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  type ConsumableDef,
} from '../ConsumablesSystem';
import { generateShopPacks } from '../BoosterPackSystem';
import { hasPermitDiceInShop } from '../PermitsSystem';
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
const ALL_STICKERS: Die['sticker'][] = ['purple_flower', 'red_bullet', 'golden_dollar', 'blue_moon'];

/** Mutable row used while generating / tagging shop stock (equipment tag helpers need defs). */
export interface ShopStockGenRow {
  type: 'equipment' | 'consumable' | 'dice';
  def?: EquipmentDef;
  consumableDef?: ConsumableDef;
  die?: Die;
  preview?: ReturnType<typeof rollShopEquipmentPreview>;
  sold?: boolean;
}

function generateShopDie(mode: 'enhanced' | 'stickered'): Die {
  const enhancement = rngPick('shop', SHOP_ENHANCEMENTS);
  const die = createDie({ enhancement });
  if (mode === 'stickered') {
    die.sticker = rngPick('sticker', ALL_STICKERS);
  }
  return die;
}

function ownedDefIds(run: RunState): string[] {
  return [...run.equipment.map((e) => e.defId), ...run.consumables.map((c) => c.defId)];
}

/** Roll weighted shop stock rows (before tag injection / auras). */
export function generateShopStockRows(run: RunState = getRunState()): ShopStockGenRow[] {
  const slotCount = Math.max(1, run.shopSlots);
  const items: ShopStockGenRow[] = [];
  const excludeIds = ownedDefIds(run);
  const profession = run.professionId ? getProfessionById(run.professionId) : null;

  const diceMode = hasPermitDiceInShop(run.purchasedPermits);
  if (diceMode !== 'none') {
    items.push({ type: 'dice', die: generateShopDie(diceMode) });
  }

  const categories: { type: 'equipment' | 'supply' | 'trail_guide' | 'frontier'; weight: number }[] = [
    { type: 'equipment', weight: SHOP_WEIGHTS.equipment },
    { type: 'supply', weight: SHOP_WEIGHTS.supply },
    { type: 'trail_guide', weight: SHOP_WEIGHTS.trail_guide },
  ];
  if (profession?.modifiers?.frontierInShop) {
    categories.push({ type: 'frontier', weight: SHOP_WEIGHTS.frontier });
  }

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const remainingSlots = slotCount - items.length;

  for (let i = 0; i < remainingSlots; i++) {
    let roll = rngFloat('shop') * totalWeight;
    let picked = categories[0]!.type;
    for (const cat of categories) {
      roll -= cat.weight;
      if (roll <= 0) {
        picked = cat.type;
        break;
      }
    }

    if (picked === 'equipment') {
      const [def] = generateShopStock(1, excludeIds);
      if (!def) continue;
      items.push({
        type: 'equipment',
        def,
        preview: rollShopEquipmentPreview(def, run.purchasedPermits),
      });
      excludeIds.push(def.id);
    } else {
      let consumableDef: ConsumableDef;
      if (picked === 'supply') {
        consumableDef = getRandomSupplyDef(undefined, excludeIds);
      } else if (picked === 'trail_guide') {
        consumableDef = getRandomTrailGuideDef(undefined, excludeIds);
      } else {
        consumableDef = getShopRandomFrontierDef(undefined, excludeIds);
      }
      items.push({ type: 'consumable', consumableDef });
      excludeIds.push(consumableDef.id);
    }
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
