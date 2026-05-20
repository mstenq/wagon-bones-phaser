// ─── Items System (No Phaser imports) ───
// Equipment definitions, shop stock generation, aura system.

import allItems from '../data/items';
import itemAurasData from '../data/item_auras.json';

export type { HintSegment, HintStyle } from '../data/items';

import type { GameState } from './GameState';
import type { PlayerState } from './PlayerState';
import { CHANCES } from './Constants';

export interface ItemAura {
  id: string;
  name: string;
  description: string;
  costIncrease: number;
  chance: number;
}

export interface EquipmentDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  description: string;
  effectType: string;
  effectParams: Record<string, unknown>;
  initialState?: Record<string, number>;
  aura?: ItemAura | null;
  hintDisplay?: (game: GameState | null, player: PlayerState) => import('../data/items').HintSegment[][];
}

export interface EquipmentInstance {
  def: EquipmentDef;
  sellValue: number;
  state: Record<string, number>;
}

const ITEMS_POOL: EquipmentDef[] = allItems as EquipmentDef[];
const ITEM_AURAS: ItemAura[] = itemAurasData as ItemAura[];

const SHOP_SIZE = 5;
const LEGENDARY_RARITY = 'legendary';

/** Equipment pool eligible for shop stock and random rolls (excludes legendaries). */
function getShopEquipmentPool(excludeIds?: string[]): EquipmentDef[] {
  let pool = ITEMS_POOL.filter((i) => i.rarity !== LEGENDARY_RARITY);
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    pool = pool.filter((i) => !excluded.has(i.id));
  }
  return pool;
}

// ─── Aura Helpers ───

/** Get an aura by its id. Returns null if not found. */
export function getItemAuraById(id: string): ItemAura | null {
  const aura = ITEM_AURAS.find((a) => a.id === id);
  return aura ? { ...aura } : null;
}

/** Roll for a random aura. Returns null most of the time. */
export function rollRandomItemAura(): ItemAura | null {
  for (const aura of ITEM_AURAS) {
    if (Math.random() < aura.chance) return { ...aura };
  }
  return null;
}

/** Apply a random aura to an EquipmentDef, returning a new copy with adjusted cost.
 *  Items can only have one aura. */
export function applyRandomAura(def: EquipmentDef): EquipmentDef {
  if (def.aura) return def; // already has one
  const aura = rollRandomItemAura();
  if (!aura) return def;
  return {
    ...def,
    aura,
    cost: def.cost + aura.costIncrease,
  };
}

// ─── Shop Stock ───

/** Generate a random shop stock of equipment, with random aura rolls */
export function generateShopStock(count: number = SHOP_SIZE, excludeIds?: string[]): EquipmentDef[] {
  let pool = getShopEquipmentPool(excludeIds);
  if (pool.length === 0) {
    // Fallback: if all items are owned, generate horseshoe copies
    const horseshoe = ITEMS_POOL.find((i) => i.id === 'horseshoe') ?? ITEMS_POOL[0];
    return Array.from({ length: count }, () => applyRandomAura({ ...horseshoe }));
  }
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(applyRandomAura);
}

/** Get all equipment definitions */
export function getAllEquipment(): EquipmentDef[] {
  return ITEMS_POOL;
}

function pickWeightedEquipmentRarity(pool: EquipmentDef[]): string | null {
  const rarityWeights: Array<{ rarity: string; weight: number }> = [
    { rarity: 'rare', weight: CHANCES.RARE },
    { rarity: 'uncommon', weight: CHANCES.UNCOMMON },
    { rarity: 'common', weight: CHANCES.COMMON },
  ].filter(({ rarity }) => pool.some((item) => item.rarity === rarity));

  const totalWeight = rarityWeights.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const entry of rarityWeights) {
    if (roll < entry.weight) return entry.rarity;
    roll -= entry.weight;
  }

  return rarityWeights[rarityWeights.length - 1]?.rarity ?? null;
}

// ─── Random Equipment Generation ───

/** Generate a random piece of equipment filtered by rarity.
 *  If no items match the filter, falls back to any rarity.
 *  Applies a random aura roll. */
/** Create an EquipmentInstance from a def, initializing state from initialState. */
export function createEquipmentInstance(def: EquipmentDef): EquipmentInstance {
  return {
    def,
    sellValue: Math.max(1, Math.floor(def.cost / 2)),
    state: def.initialState ? { ...def.initialState } : {},
  };
}

export function generateRandomEquipment(options?: { rarity?: string; excludeRarity?: string }): EquipmentDef {
  let pool = [...ITEMS_POOL];

  // Legendaries are only granted via explicit rarity (e.g. Pandora's Box)
  if (options?.rarity !== LEGENDARY_RARITY) {
    pool = pool.filter((i) => i.rarity !== LEGENDARY_RARITY);
  }

  if (options?.rarity) {
    const filtered = pool.filter((i) => i.rarity === options.rarity);
    if (filtered.length > 0) pool = filtered;
  }

  if (options?.excludeRarity) {
    const filtered = pool.filter((i) => i.rarity !== options.excludeRarity);
    if (filtered.length > 0) pool = filtered;
  }

  if (!options?.rarity) {
    const rarity = pickWeightedEquipmentRarity(pool);
    if (rarity) {
      const filtered = pool.filter((i) => i.rarity === rarity);
      if (filtered.length > 0) pool = filtered;
    }
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  return applyRandomAura({ ...picked });
}
