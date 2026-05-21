// ─── Consumables System (No Phaser imports) ───
// Defines consumable card types, instances, and generation helpers.
// Consumables are one-time-use cards (supply cards, trail guides, frontier encounters)
// held in the consumable bar. They can be used, sold, or reordered.

import type { ItemAura, EquipmentInstance } from './ItemsSystem';
import { getItemAuraById, isEquipmentCursed } from './ItemsSystem';
import type { DiceSelectionConfig } from './DiceSelectionSystem';
import type { InstantEffect } from './BoosterPackSystem';
import { HandType, HandDefinition, HandUpgradeInfo } from './types';
import handsData from '../data/hands.json';
import { checkLoadedChance, PACK_ONLY_FRONTIER_IDS } from './Constants';
import { resolveEffectParam } from './effects/helpers';

const HAND_TABLE: HandDefinition[] = handsData as HandDefinition[];

export type ConsumableCategory = 'supply' | 'trail_guide' | 'frontier';

/** Returns the texture key prefix used when loading/displaying a consumable category's image.
 *  Trail guide IDs already include `tg_`, so their prefix is empty. */
export function getConsumableTexturePrefix(category: ConsumableCategory): string {
  switch (category) {
    case 'supply':
      return 'supply_';
    case 'trail_guide':
      return ''; // IDs are already prefixed (e.g. tg_high_value)
    case 'frontier':
      return 'fe_';
  }
}

export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  category: ConsumableCategory;
  cost: number;
  aura?: ItemAura | null;
  instantEffect?: InstantEffect;
  diceSelection?: DiceSelectionConfig;
  /** For trail guides — which hand type they upgrade */
  handType?: string;
}

export interface ConsumableInstance {
  def: ConsumableDef;
  sellValue: number;
}

// ─── Generation Helpers ───

import supplyCardsData from '../data/supply_cards.json';
import trailGuidesData from '../data/trail_guides.json';
import frontierEncountersData from '../data/frontier_encounters.json';
import { DiceSelectionEffectType, DiceSelectionEffectParams } from './DiceSelectionSystem';

const SUPPLY_CARDS = supplyCardsData;
const TRAIL_GUIDES = trailGuidesData;
const FRONTIER_ENCOUNTERS = frontierEncountersData;

/** Create a ConsumableDef from a supply card JSON entry */
export function createSupplyConsumableDef(
  cardData: (typeof SUPPLY_CARDS)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  const def: ConsumableDef = {
    id: cardData.id,
    name: cardData.name,
    description: cardData.description,
    category: 'supply',
    cost: 3,
    aura: aura ?? null,
  };
  if ('instantEffect' in cardData && cardData.instantEffect) {
    def.instantEffect = cardData.instantEffect as InstantEffect;
  }
  if ('diceSelection' in cardData && cardData.diceSelection) {
    const ds = cardData.diceSelection as {
      drawCount: number;
      pickCount: number;
      effectType: string;
      effectParams: Record<string, unknown>;
    };
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType as DiceSelectionEffectType,
      effectParams: ds.effectParams as DiceSelectionEffectParams,
      cardName: cardData.name,
      description: cardData.description,
      skippable: true,
    };
  }
  return def;
}

/** Create a ConsumableDef from a trail guide JSON entry */
export function createTrailGuideConsumableDef(
  tgData: (typeof TRAIL_GUIDES)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  return {
    id: tgData.id,
    name: tgData.name,
    description: tgData.description,
    category: 'trail_guide',
    cost: 3,
    aura: aura ?? null,
    handType: tgData.handType,
  };
}

/** Create a ConsumableDef from a frontier encounter JSON entry */
export function createFrontierConsumableDef(
  feData: (typeof FRONTIER_ENCOUNTERS)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  const def: ConsumableDef = {
    id: feData.id,
    name: feData.name,
    description: feData.description,
    category: 'frontier',
    cost: 4,
    aura: aura ?? null,
  };
  if ('instantEffect' in feData && feData.instantEffect) {
    def.instantEffect = feData.instantEffect as InstantEffect;
  }
  if ('diceSelection' in feData && feData.diceSelection) {
    const ds = feData.diceSelection as {
      drawCount: number;
      pickCount: number;
      effectType: string;
      effectParams: Record<string, unknown>;
    };
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType as DiceSelectionEffectType,
      effectParams: ds.effectParams as DiceSelectionEffectParams,
      cardName: feData.name,
      description: feData.description,
      skippable: true,
    };
  }
  return def;
}

/** Create a ConsumableInstance from a def */
export function createConsumableInstance(def: ConsumableDef): ConsumableInstance {
  return {
    def,
    sellValue: Math.max(1, Math.floor(def.cost / 2)),
  };
}

/** Get a random supply card def */
export function getRandomSupplyDef(aura?: ItemAura | null, excludeIds?: string[]): ConsumableDef {
  let pool = SUPPLY_CARDS;
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    pool = pool.filter((c) => !excluded.has(c.id));
  }
  if (pool.length === 0) pool = SUPPLY_CARDS; // fallback if all excluded
  const card = pool[Math.floor(Math.random() * pool.length)];
  return createSupplyConsumableDef(card, aura);
}

/** Get a random trail guide def */
export function getRandomTrailGuideDef(aura?: ItemAura | null, excludeIds?: string[]): ConsumableDef {
  let pool = TRAIL_GUIDES;
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    pool = pool.filter((t) => !excluded.has(t.id));
  }
  if (pool.length === 0) pool = TRAIL_GUIDES; // fallback if all excluded
  const tg = pool[Math.floor(Math.random() * pool.length)];
  return createTrailGuideConsumableDef(tg, aura);
}

/** Get a random frontier encounter def (excludes pack-only ultra-rare cards). */
export function getRandomFrontierDef(aura?: ItemAura | null, excludeIds?: string[]): ConsumableDef {
  let pool = FRONTIER_ENCOUNTERS.filter((f) => !PACK_ONLY_FRONTIER_IDS.has(f.id));
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    pool = pool.filter((f) => !excluded.has(f.id));
  }
  if (pool.length === 0) pool = FRONTIER_ENCOUNTERS.filter((f) => !PACK_ONLY_FRONTIER_IDS.has(f.id));
  const fe = pool[Math.floor(Math.random() * pool.length)];
  return createFrontierConsumableDef(fe, aura);
}

/** Shop stock frontier picker — pack-only cards never appear as standalone shop cards. */
export function getShopRandomFrontierDef(aura?: ItemAura | null, excludeIds?: string[]): ConsumableDef {
  return getRandomFrontierDef(aura, excludeIds);
}

/** Get a supply card def by id */
export function getSupplyDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  const card = SUPPLY_CARDS.find((c) => c.id === id);
  if (!card) return null;
  return createSupplyConsumableDef(card, aura);
}

/** Get a trail guide def by id */
export function getTrailGuideDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  const tg = TRAIL_GUIDES.find((t) => t.id === id);
  if (!tg) return null;
  return createTrailGuideConsumableDef(tg, aura);
}

/** Get a frontier encounter def by id */
export function getFrontierDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  const fe = FRONTIER_ENCOUNTERS.find((f) => f.id === id);
  if (!fe) return null;
  return createFrontierConsumableDef(fe, aura);
}

/** Look up a consumable definition by ID across all categories. */
export function getConsumableDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  return getSupplyDefById(id, aura) ?? getTrailGuideDefById(id, aura) ?? getFrontierDefById(id, aura);
}

/** Shop context has no natural dice board; block dice-edit cards there. */
export function canUseConsumableInShop(def: ConsumableDef): boolean {
  if (def.id === 'raid') return false;
  const effectType = def.diceSelection?.effectType;
  if (!effectType) return true;
  if (effectType === 'ENHANCE' || effectType === 'ADD_STICKER') return false;
  return true;
}

// ─── Shop Generation ───

/** Generate random consumable cards for the shop.
 *  Picks from supply cards and trail guides (frontier only if enabled). */
export function generateShopConsumables(count: number, options?: { includeFrontier?: boolean }): ConsumableDef[] {
  const pool: ConsumableDef[] = [];

  // Add all supply cards to pool
  for (const card of SUPPLY_CARDS) {
    pool.push(createSupplyConsumableDef(card));
  }

  // Add all trail guides
  for (const tg of TRAIL_GUIDES) {
    pool.push(createTrailGuideConsumableDef(tg));
  }

  // Add frontier encounters if enabled (Demon Hunter) — excludes pack-only cards
  if (options?.includeFrontier) {
    for (const fe of FRONTIER_ENCOUNTERS.filter((f) => !PACK_ONLY_FRONTIER_IDS.has(f.id))) {
      pool.push(createFrontierConsumableDef(fe));
    }
  }

  // Shuffle and pick
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ─── Use Execution (non-Phaser logic) ───

import { createDie } from './DiceSystem';
import { generateRandomEquipment } from './ItemsSystem';
import { acquireRewardEquipmentInstance } from './EquipmentModifiers';
import type { DiceEnhancement } from './types';
import type { PlayerState } from './PlayerState';
import { processEquipmentOnDiceDestroyed } from './EquipmentEffects';

/** Add a medicine supply card with ghost aura (Doctor profession, trail events, etc.). */
export function grantGhostMedicine(player: PlayerState): boolean {
  const ghostAura = getItemAuraById('ghost');
  const def = getSupplyDefById('medicine', ghostAura);
  if (!def) return false;
  return player.addConsumable(def);
}

export interface UseConsumableResult {
  /** Whether the effect was applied successfully */
  success: boolean;
  /** If the consumable requires a dice selection scene, this config is set */
  diceSelection?: DiceSelectionConfig;
  /** Number of consumables created (for feedback) */
  consumablesCreated?: number;
  /** Reason for failure */
  failReason?: string;
  /** Hand upgrade info for animation (trail guides, etc.) */
  handUpgrade?: import('./types').HandUpgradeInfo;
  /** Multi-hand upgrade info for effects like Spiritual Journey */
  handUpgrades?: import('./types').HandUpgradeInfo[];
  /** Optional animation events for non-scoring consumable effects */
  consumableAnimEvents?: ConsumableAnimEvent[];
}

export interface UseConsumableContext {
  /** Dice IDs currently visible/targetable in the active scene */
  visibleDiceIds?: string[];
}

export interface ConsumableAnimEvent {
  type: 'destroy_dice';
  diceIds: string[];
}

/**
 * Execute a consumable's game-logic effect (non-Phaser).
 * Returns a result indicating what happened so the scene can animate/chain appropriately.
 */
export function executeConsumableEffect(
  consumed: ConsumableInstance,
  player: PlayerState,
  context: UseConsumableContext = {},
): UseConsumableResult {
  const def = consumed.def;

  // Update Campfire Stories: +mult per supply card used
  if (def.category === 'supply') {
    for (const equip of player.equipment) {
      if (equip.def.effectType === 'SUPPLY_USED_MULT') {
        equip.state.mult = (equip.state.mult ?? 0) + ((equip.def.effectParams as Record<string, unknown>).value as number);
      }
    }
  }

  // ─── Trail guide → upgrade hand level ───
  if (def.category === 'trail_guide' && def.handType) {
    const ht = def.handType as HandType;
    const stats = player.getHandStats(ht);
    const handDef = HAND_TABLE.find((h) => h.type === ht)!;
    const oldLevel = stats.level;
    const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
    const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);

    player.upgradeHandLevel(ht);
    player.trailGuidesUsed++;

    const newLevel = stats.level;
    const newBaseMiles = handDef.baseMiles + stats.milesPerLevel * (newLevel - 1);
    const newBaseMult = handDef.baseMult + stats.multPerLevel * (newLevel - 1);

    // Update Guide Lantern xMult
    for (const equip of player.equipment) {
      if (equip.def.effectType === 'TRAIL_GUIDE_XMULT') {
        const p = equip.def.effectParams as Record<string, unknown>;
        const gain = resolveEffectParam<number>(p, 'value', player.profession?.id) ?? 0.1;
        equip.state.xMult = (equip.state.xMult ?? 1) + gain;
      }
    }
    return {
      success: true,
      handUpgrade: {
        handType: ht,
        handName: handDef.name,
        oldLevel,
        newLevel,
        oldBaseMiles,
        newBaseMiles,
        oldBaseMult,
        newBaseMult,
      },
    };
  }

  // ─── Dice selection cards (shallow_grave, mirage, etc.) ───
  if (def.diceSelection) {
    return { success: true, diceSelection: def.diceSelection };
  }

  // ─── Instant effects ───
  if (def.instantEffect) {
    return applyConsumableInstantEffect(def.instantEffect, player);
  }

  // ─── Supply cards that create other consumables ───
  switch (def.id) {
    case 'doctor': {
      // Creates 2 medicine consumables
      const medicineDef = getSupplyDefById('medicine');
      if (!medicineDef) return { success: true, consumablesCreated: 0 };
      let created = 0;
      for (let i = 0; i < 2; i++) {
        if (player.addConsumable(medicineDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'compass': {
      // Creates 2 random trail guide consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const tgDef = getRandomTrailGuideDef();
        if (player.addConsumable(tgDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'supply_cache': {
      // Creates 2 random supply consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const sDef = getRandomSupplyDef();
        if (player.addConsumable(sDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'second_helpings': {
      // Creates last used consumable (excludes itself)
      if (!player.lastUsedConsumable || player.lastUsedConsumable.id === 'second_helpings') {
        return { success: false, failReason: 'No previous consumable used!' };
      }
      if (player.addConsumable(player.lastUsedConsumable)) {
        return { success: true, consumablesCreated: 1 };
      }
      return { success: false, failReason: 'No space!' };
    }
    case 'bless': {
      // 1 in 4 chance to bless a random unblessed equipment with an aura (weighted)
      const unblessed = player.equipment.filter((e) => !e.def.aura);
      if (unblessed.length === 0) return { success: false, failReason: 'All equipment already has auras!' };
      if (!checkLoadedChance([1, 4], player.equipment)) return { success: true };
      const blessableAuras = (['fire', 'icy', 'holy'] as const).map((id) => getItemAuraById(id)!);
      const totalWeight = blessableAuras.reduce((sum, a) => sum + a.chance, 0);
      const target = unblessed[Math.floor(Math.random() * unblessed.length)];
      const roll = Math.random() * totalWeight;
      let cumulative = 0;
      for (const aura of blessableAuras) {
        cumulative += aura.chance;
        if (roll < cumulative) {
          target.def = { ...target.def, aura: { ...aura } };
          break;
        }
      }
      return { success: true };
    }
    case 'priests_blessing': {
      // Holy aura on random item; destroy non-cursed others (cursed items survive)
      if (player.equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const holyAura = getItemAuraById('holy');
      if (!holyAura) return { success: true };
      const chosenIdx = Math.floor(Math.random() * player.equipment.length);
      const chosen = player.equipment[chosenIdx];
      chosen.def = { ...chosen.def, aura: holyAura };
      const survivors = player.equipment.filter((e, i) => i === chosenIdx || isEquipmentCursed(e));
      player.equipment.splice(0, player.equipment.length, ...survivors);
      return { success: true };
    }
    case 'blood_moon': {
      if (player.equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const ghostAura = getItemAuraById('ghost');
      if (!ghostAura) return { success: true };
      const chosenIdx = Math.floor(Math.random() * player.equipment.length);
      const chosen = player.equipment[chosenIdx];
      chosen.def = { ...chosen.def, aura: ghostAura };
      player.trailEventModifiers.rerollPenalty += 1;
      return { success: true };
    }
    case 'raid': {
      const visibleIds = new Set(context.visibleDiceIds ?? []);
      if (visibleIds.size === 0) {
        return { success: false, failReason: 'Raid can only be used when dice are visible!' };
      }
      const visibleDice = player.dice.filter((d) => visibleIds.has(d.id));
      if (visibleDice.length === 0) {
        return { success: false, failReason: 'No visible dice available for Raid!' };
      }

      const toDestroy = [...visibleDice].sort(() => Math.random() - 0.5).slice(0, Math.min(5, visibleDice.length));
      const destroyIds = new Set(toDestroy.map((d) => d.id));
      const enhancedCount = toDestroy.filter((d) => d.enhancement !== null).length;
      const before = player.dice.length;
      player.dice = player.dice.filter((d) => !destroyIds.has(d.id));
      for (const id of destroyIds) {
        player.spentDiceIds.delete(id);
      }
      const removed = before - player.dice.length;
      if (removed > 0) {
        processEquipmentOnDiceDestroyed(player.equipment, removed, enhancedCount);
      }
      player.economy.earn(20);
      return {
        success: true,
        consumableAnimEvents: [{ type: 'destroy_dice', diceIds: [...destroyIds] }],
      };
    }
    case 'skin_walker': {
      // Copy random item; destroy non-cursed others (cursed items survive, copy keeps modifiers)
      if (player.equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const source = player.equipment[Math.floor(Math.random() * player.equipment.length)];
      const duplicated: EquipmentInstance = {
        def: source.def.aura?.id === 'ghost' ? { ...source.def, aura: undefined } : { ...source.def },
        sellValue: source.sellValue,
        state: { ...source.state },
        modifiers: [...source.modifiers],
        perishableRoundsLeft: source.perishableRoundsLeft,
      };
      const survivors = player.equipment.filter((e) => isEquipmentCursed(e));
      const canAdd =
        player.usedEquipmentSlots < player.maxEquipmentSlots || duplicated.def.aura?.id === 'ghost';
      if (canAdd) survivors.push(duplicated);
      player.equipment.splice(0, player.equipment.length, ...survivors);
      return { success: true };
    }
  }

  // Fallback — no known effect
  return { success: true };
}

/**
 * Create a consumable instance from a def and execute its effect.
 * Handles lastUsedConsumable tracking (skips for second_helpings which reads the previous value).
 * Use this instead of manually setting lastUsedConsumable + calling executeConsumableEffect.
 */
export function useConsumableDirectly(
  def: ConsumableDef,
  player: PlayerState,
  context: UseConsumableContext = {},
): UseConsumableResult {
  const consumed = createConsumableInstance(def);
  if (def.id !== 'second_helpings') {
    player.lastUsedConsumable = def;
  }
  return executeConsumableEffect(consumed, player, context);
}

function applyConsumableInstantEffect(effect: InstantEffect, player: PlayerState): UseConsumableResult {
  switch (effect.type) {
    case 'CREATE_DICE': {
      const count = effect.count ?? 1;
      const enhancement = (effect.enhancement ?? null) as DiceEnhancement;
      for (let i = 0; i < count; i++) {
        player.addDie(createDie({ enhancement }));
      }
      return { success: true };
    }
    case 'DOUBLE_MONEY': {
      const gain = Math.min(player.economy.balance, effect.maxGain ?? 20);
      player.economy.earn(gain);
      return { success: true };
    }
    case 'TRADE_EQUIPMENT': {
      const totalValue = player.equipment.reduce((sum, eq) => sum + eq.sellValue, 0);
      const gain = Math.min(totalValue, effect.maxGain ?? 50);
      player.economy.earn(gain);
      return { success: true };
    }
    case 'CREATE_EQUIPMENT': {
      if (player.equipmentSlotsFree > 0) {
        const def = generateRandomEquipment({
          rarity: effect.rarity,
          excludeRarity: effect.excludeRarity,
        });
        player.equipment.push(acquireRewardEquipmentInstance(def, player.purchasedPermits));
      }
      if (effect.setMoneyZero) {
        player.economy.spend(player.economy.balance);
      }
      return { success: true };
    }
    case 'UPGRADE_ALL_HANDS': {
      return { success: true, handUpgrades: createAllHandUpgrades(player) };
    }
    default:
      return { success: true };
  }
}

function createAllHandUpgrades(player: PlayerState): HandUpgradeInfo[] {
  const upgrades: HandUpgradeInfo[] = [];
  for (const type of Object.values(HandType)) {
    const stats = player.getHandStats(type);
    const handDef = HAND_TABLE.find((h) => h.type === type)!;
    const oldLevel = stats.level;
    const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
    const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);
    player.upgradeHandLevel(type);
    const newLevel = stats.level;
    upgrades.push({
      handType: type,
      handName: handDef.name,
      oldLevel,
      newLevel,
      oldBaseMiles,
      newBaseMiles: handDef.baseMiles + stats.milesPerLevel * (newLevel - 1),
      oldBaseMult,
      newBaseMult: handDef.baseMult + stats.multPerLevel * (newLevel - 1),
    });
  }
  return upgrades;
}
