// ─── Items System (No Phaser imports) ───
// Equipment definitions, shop stock generation, aura system.

import allItems from '../data/items';
import itemAuras, { type ItemAura } from '../data/item_auras';

export type { HintSegment, HintStyle, ItemDisplayResult, CardTemplate } from '../data/items';
import type { ItemDisplayResult } from '../data/items';

import type { GameState } from './GameState';
import type { PlayerState } from './PlayerState';
import type { EquipmentModifier } from './types';
import { getDiscountedShopPrice } from './PermitsSystem';
import { CHANCES } from './Constants';
import { getPlayerState } from './PlayerState';
import { rngFloat, rngPick, type RngStream } from './RunRng';

export type { EquipmentUnlockCondition } from './equipmentUnlock';

export function isEquipmentUnlocked(def: EquipmentDef, game: GameState | null = null, player?: PlayerState): boolean {
  if (!def.unlockCondition) return true;
  return def.unlockCondition(game, player ?? getPlayerState());
}

export type { ItemAura };

export interface EquipmentDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  effectType: string;
  effectParams: Record<string, unknown>;
  initialState?: Record<string, number>;
  aura?: ItemAura | null;
  display: (game: GameState | null, player: PlayerState) => ItemDisplayResult;
  unlockCondition?: (game: GameState | null, player: PlayerState) => boolean;
  modifierImmunity?: EquipmentModifier[];
}

/** True when this equipment def cannot receive a given difficulty modifier roll. */
export function isEquipmentModifierImmune(def: EquipmentDef, modifier: EquipmentModifier): boolean {
  return def.modifierImmunity?.includes(modifier) ?? false;
}

export interface EquipmentInstance {
  def: EquipmentDef;
  sellValue: number;
  state: Record<string, number>;
  modifiers: EquipmentModifier[];
  /** Rounds remaining before perishable equipment is destroyed. */
  perishableRoundsLeft?: number;
}

export function hasEquipmentModifier(instance: EquipmentInstance, modifier: EquipmentModifier): boolean {
  return instance.modifiers.includes(modifier);
}

export function isEquipmentCursed(instance: EquipmentInstance): boolean {
  return hasEquipmentModifier(instance, 'cursed');
}

export function isEquipmentPerishable(instance: EquipmentInstance): boolean {
  return hasEquipmentModifier(instance, 'perishable');
}

export function isEquipmentLeased(instance: EquipmentInstance): boolean {
  return hasEquipmentModifier(instance, 'leased');
}

const ITEMS_POOL: EquipmentDef[] = allItems as EquipmentDef[];
const ITEM_AURAS: ItemAura[] = itemAuras;

const SHOP_SIZE = 5;
const LEGENDARY_RARITY = 'legendary';

/** Equipment pool eligible for shop stock and random rolls (excludes legendaries and locked items). */
function getShopEquipmentPool(
  excludeIds?: string[],
  game: GameState | null = null,
  player?: PlayerState,
): EquipmentDef[] {
  let pool = ITEMS_POOL.filter((i) => i.rarity !== LEGENDARY_RARITY && isEquipmentUnlocked(i, game, player));
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
    if (rngFloat('shop') < aura.chance) return { ...aura };
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

/** Generate a random shop stock of equipment, with random aura rolls.
 *  Each slot rolls rarity via CHANCES (5% rare / 25% uncommon / 70% common), then picks uniformly within that tier. */
export function generateShopStock(count: number = SHOP_SIZE, excludeIds?: string[]): EquipmentDef[] {
  const horseshoe = ITEMS_POOL.find((i) => i.id === 'horseshoe') ?? ITEMS_POOL[0];
  const usedIds = new Set(excludeIds ?? []);
  const stock: EquipmentDef[] = [];

  for (let i = 0; i < count; i++) {
    const available = getShopEquipmentPool([...usedIds]);
    if (available.length === 0) {
      stock.push(applyRandomAura({ ...horseshoe }));
      continue;
    }

    let candidates = available;
    const rarity = pickWeightedEquipmentRarity(available);
    if (rarity) {
      const filtered = available.filter((item) => item.rarity === rarity);
      if (filtered.length > 0) candidates = filtered;
    }

    const picked = rngPick('shop', candidates);
    stock.push(applyRandomAura({ ...picked }));
    usedIds.add(picked.id);
  }

  return stock;
}

/** Get all equipment definitions */
export function getAllEquipment(): EquipmentDef[] {
  return ITEMS_POOL;
}

function pickWeightedEquipmentRarity(pool: EquipmentDef[], stream: RngStream = 'shop'): string | null {
  const rarityWeights: Array<{ rarity: string; weight: number }> = [
    { rarity: 'rare', weight: CHANCES.RARE },
    { rarity: 'uncommon', weight: CHANCES.UNCOMMON },
    { rarity: 'common', weight: CHANCES.COMMON },
  ].filter(({ rarity }) => pool.some((item) => item.rarity === rarity));

  const totalWeight = rarityWeights.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = rngFloat(stream) * totalWeight;
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
/** Look up the canonical base definition for an equipment id. */
export function getEquipmentDefById(id: string): EquipmentDef | undefined {
  return ITEMS_POOL.find((i) => i.id === id);
}

/** Camp shop list price before permit discounts (includes aura cost bump).
 *  When cost is overridden to $0 (free tag, On the House, etc.), reconstruct from base + aura. */
export function getEquipmentListPrice(def: EquipmentDef): number {
  if (def.cost > 0) return def.cost;
  const base = getEquipmentDefById(def.id);
  if (!base) return 0;
  const auraBump = def.aura?.costIncrease ?? 0;
  return base.cost + auraBump;
}

/** Sell value: half of what the player would pay in camp shop (list price + permit discount). */
export function getEquipmentSellValue(def: EquipmentDef, purchasedPermitIds: string[] = []): number {
  const listPrice = getEquipmentListPrice(def);
  const shopPrice = getDiscountedShopPrice(listPrice, purchasedPermitIds);
  return Math.max(1, Math.floor(shopPrice / 2));
}

/** Create an EquipmentInstance from a def, initializing state from initialState. */
export function createEquipmentInstance(def: EquipmentDef, purchasedPermitIds: string[] = []): EquipmentInstance {
  return {
    def,
    sellValue: getEquipmentSellValue(def, purchasedPermitIds),
    state: def.initialState ? { ...def.initialState } : {},
    modifiers: [],
  };
}

export function generateRandomEquipment(options?: { rarity?: string; excludeRarity?: string }): EquipmentDef {
  let pool = ITEMS_POOL.filter((i) => isEquipmentUnlocked(i));
  const stream: RngStream =
    options?.rarity === 'rare'
      ? 'createRare'
      : options?.rarity === 'legendary'
        ? 'createLegendary'
        : 'createRandomEquipment';

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
    const rarity = pickWeightedEquipmentRarity(pool, stream);
    if (rarity) {
      const filtered = pool.filter((i) => i.rarity === rarity);
      if (filtered.length > 0) pool = filtered;
    }
  }

  const picked = rngPick(stream, pool);
  return applyRandomAura({ ...picked });
}
