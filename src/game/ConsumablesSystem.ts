// ─── Consumables System (No Phaser imports) ───
// Defines consumable card types, instances, and generation helpers.
// Consumables are one-time-use cards (supply cards, trail guides, frontier encounters)
// held in the consumable bar. They can be used, sold, or reordered.

import type { ItemAura, EquipmentInstance } from './ItemsSystem';
import { getItemAuraById, isEquipmentCursed } from './ItemsSystem';
import type { DiceSelectionConfig } from './DiceSelectionSystem';
import type { InstantEffect } from './BoosterPackSystem';
import { HandType, HandDefinition, HandUpgradeInfo } from './types';
import hands from '../data/hands';
import { PACK_ONLY_FRONTIER_IDS } from './Constants';
import { checkLoadedChance } from './equipmentUtils';
import { resolveEffectParam } from './effects/helpers';
import { rngFloat, rngPick, rngShuffle } from './RunRng';
import { enqueueToastFeedback } from './playback/feedback';

const HAND_TABLE: HandDefinition[] = hands;

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

import supplyCardsData, { type SupplyCardDef } from '../data/supply_cards';
import trailGuidesData, { type TrailGuideDef } from '../data/trail_guides';
import frontierEncountersData, { type FrontierEncounterDef } from '../data/frontier_encounters';
const SUPPLY_CARDS = supplyCardsData;
const TRAIL_GUIDES = trailGuidesData;
const FRONTIER_ENCOUNTERS = frontierEncountersData;

/** Create a ConsumableDef from a supply card definition */
export function createSupplyConsumableDef(cardData: SupplyCardDef, aura?: ItemAura | null): ConsumableDef {
  const def: ConsumableDef = {
    id: cardData.id,
    name: cardData.name,
    description: cardData.description,
    category: 'supply',
    cost: 3,
    aura: aura ?? null,
  };
  if (cardData.instantEffect) {
    def.instantEffect = cardData.instantEffect as InstantEffect;
  }
  if (cardData.diceSelection) {
    const ds = cardData.diceSelection;
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      minPickCount: ds.minPickCount,
      effectType: ds.effectType,
      effectParams: ds.effectParams,
      cardName: cardData.name,
      description: cardData.description,
      skippable: true,
    };
  }
  return def;
}

/** Create a ConsumableDef from a trail guide definition */
export function createTrailGuideConsumableDef(tgData: TrailGuideDef, aura?: ItemAura | null): ConsumableDef {
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

/** Create a ConsumableDef from a frontier encounter definition */
export function createFrontierConsumableDef(feData: FrontierEncounterDef, aura?: ItemAura | null): ConsumableDef {
  const def: ConsumableDef = {
    id: feData.id,
    name: feData.name,
    description: feData.description,
    category: 'frontier',
    cost: 4,
    aura: aura ?? null,
  };
  if (feData.instantEffect) {
    def.instantEffect = feData.instantEffect as InstantEffect;
  }
  if (feData.diceSelection) {
    const ds = feData.diceSelection;
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType,
      effectParams: ds.effectParams,
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
  const card = rngPick('consumables', pool);
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
  const tg = rngPick('consumables', pool);
  return createTrailGuideConsumableDef(tg, aura);
}

/** Trail guide for a specific hand type (blue moon held reward). */
export function getTrailGuideDefForHand(handType: HandType, aura?: ItemAura | null): ConsumableDef {
  const matching = TRAIL_GUIDES.filter((t) => t.handType === handType);
  const pool = matching.length > 0 ? matching : TRAIL_GUIDES;
  const tg = rngPick('consumables', pool);
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
  const fe = rngPick('consumables', pool);
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

/** Supply/trail guide consumables that Second Helpings can duplicate and track as "last used". */
export function isSecondHelpingsCloneTarget(def: ConsumableDef | null): boolean {
  if (!def || def.id === 'second_helpings') return false;
  return def.category === 'supply' || def.category === 'trail_guide';
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
  const shuffled = rngShuffle('consumables', pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ─── Use Execution (non-Phaser logic) ───

import { createDie } from './DiceSystem';
import { generateRandomEquipment } from './ItemsSystem';
import { acquireRewardEquipmentInstance } from './EquipmentModifiers';
import type { DiceEnhancement } from './types';
import { getRunState, runActions } from './store/runStore';
import { replaceEquipmentList, resolveEquipmentList, resolveLastUsedConsumableDef } from './store/resolve';
import { consumableActions } from './store/actions/consumableActions';
import { economyActions } from './store/actions/economyActions';
import { diceActions } from './store/actions/diceActions';
import { progressionActions } from './store/actions/progressionActions';
import { selectHandStats, selectProfession } from './store/selectors/runSelectors';
import { processEquipmentOnDiceDestroyed } from './EquipmentEffects';

function writeEquipment(list: EquipmentInstance[]): void {
  replaceEquipmentList(list);
}

/** Add a medicine supply card with ghost aura (Doctor profession, trail events, etc.). */
export function grantGhostMedicine(): boolean {
  const ghostAura = getItemAuraById('ghost');
  const def = getSupplyDefById('medicine', ghostAura);
  if (!def) return false;
  return consumableActions.addConsumable(def);
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
  handUpgrade?: HandUpgradeInfo;
  /** Multi-hand upgrade info for effects like Spiritual Journey */
  handUpgrades?: HandUpgradeInfo[];
  /** Optional animation events for non-scoring consumable effects */
  consumableAnimEvents?: ConsumableAnimEvent[];
  /** Equipment added immediately (e.g. Ingenuity) — Phaser plays pop-in for this many cards */
  equipmentCreatedCount?: number;
}

export interface UseConsumableContext {
  /** Dice IDs currently visible/targetable in the active scene */
  visibleDiceIds?: string[];
}

export type ConsumableAnimEvent =
  | {
      type: 'destroy_dice';
      diceIds: string[];
    }
  | {
      type: 'destroy_equipment';
      destructions: { sourceIdx: number; victimIdx: number }[];
      /** Equipment to add after all destruction animations (e.g. Skin Walker copy). */
      equipmentToAdd?: EquipmentInstance[];
    };

/** Increase sell value on all equipment and held consumables. */
export function bumpAllSellValues(delta: number): void {
  const equipment = resolveEquipmentList();
  for (const eq of equipment) {
    eq.sellValue += delta;
  }
  writeEquipment(equipment);
  const run = getRunState();
  if (run.consumables.length > 0) {
    runActions.patch({
      consumables: run.consumables.map((c) => ({ ...c, sellValue: c.sellValue + delta })),
    });
  }
}

/** Apply deferred equipment changes from consumable anim events (for tests / non-Phaser callers). */
export function finalizeConsumableEquipmentEvents(events: ConsumableAnimEvent[] | undefined): void {
  if (!events) return;
  for (const event of events) {
    if (event.type !== 'destroy_equipment') continue;
    const list = resolveEquipmentList();
    const sorted = [...event.destructions].sort((a, b) => b.victimIdx - a.victimIdx);
    for (const { victimIdx } of sorted) {
      list.splice(victimIdx, 1);
    }
    if (event.equipmentToAdd?.length) {
      list.push(...event.equipmentToAdd);
    }
    writeEquipment(list);
  }
}

/**
 * Execute a consumable's game-logic effect (non-Phaser).
 * Returns a result indicating what happened so the scene can animate/chain appropriately.
 */
export function executeConsumableEffect(
  consumed: ConsumableInstance,
  context: UseConsumableContext = {},
): UseConsumableResult {
  const def = consumed.def;
  const run = getRunState();
  const professionId = selectProfession(run)?.id;

  // Update Campfire Stories: +mult per supply card used
  if (def.category === 'supply') {
    const equipment = resolveEquipmentList();
    for (const equip of equipment) {
      if (equip.def.effectType === 'SUPPLY_USED_MULT') {
        equip.state.mult =
          (equip.state.mult ?? 0) + ((equip.def.effectParams as Record<string, unknown>).value as number);
      }
    }
    writeEquipment(equipment);
  }

  // ─── Trail guide → upgrade hand level ───
  if (def.category === 'trail_guide' && def.handType) {
    const ht = def.handType as HandType;
    const stats = selectHandStats(run, ht);
    const handDef = HAND_TABLE.find((h) => h.type === ht)!;
    const oldLevel = stats.level;
    const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
    const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);

    progressionActions.upgradeHandLevel(ht);
    runActions.patch({ trailGuidesUsed: run.trailGuidesUsed + 1 });

    const newStats = selectHandStats(getRunState(), ht);
    const newLevel = newStats.level;
    const newBaseMiles = handDef.baseMiles + stats.milesPerLevel * (newLevel - 1);
    const newBaseMult = handDef.baseMult + stats.multPerLevel * (newLevel - 1);

    const equipment = resolveEquipmentList();
    for (const equip of equipment) {
      if (equip.def.effectType === 'TRAIL_GUIDE_XMULT') {
        const p = equip.def.effectParams as Record<string, unknown>;
        const gain = resolveEffectParam<number>(p, 'value', professionId) ?? 0.1;
        equip.state.xMult = (equip.state.xMult ?? 1) + gain;
      }
    }
    writeEquipment(equipment);
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
    return applyRunInstantEffect(def.instantEffect);
  }

  // ─── Supply cards that create other consumables ───
  switch (def.id) {
    case 'doctor': {
      // Creates 2 medicine consumables
      const medicineDef = getSupplyDefById('medicine');
      if (!medicineDef) return { success: true, consumablesCreated: 0 };
      let created = 0;
      for (let i = 0; i < 2; i++) {
        if (consumableActions.addConsumable(medicineDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'compass': {
      // Creates 2 random trail guide consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const tgDef = getRandomTrailGuideDef();
        if (consumableActions.addConsumable(tgDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'supply_cache': {
      // Creates 2 random supply consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const sDef = getRandomSupplyDef();
        if (consumableActions.addConsumable(sDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'second_helpings': {
      const lastUsed = resolveLastUsedConsumableDef();
      if (!isSecondHelpingsCloneTarget(lastUsed)) {
        return { success: false, failReason: 'No previous consumable used!' };
      }
      if (lastUsed && consumableActions.addConsumable(lastUsed)) {
        return { success: true, consumablesCreated: 1 };
      }
      return { success: false, failReason: 'No space!' };
    }
    case 'bless': {
      const equipment = resolveEquipmentList();
      const unblessed = equipment.filter((e) => !e.def.aura);
      if (unblessed.length === 0) return { success: false, failReason: 'All equipment already has auras!' };
      if (!checkLoadedChance([1, 4], equipment)) {
        enqueueToastFeedback('Unlucky! No blessing', 'failure');
        return { success: true };
      }
      const blessableAuras = (['fire', 'icy', 'holy'] as const).map((id) => getItemAuraById(id)!);
      const totalWeight = blessableAuras.reduce((sum, a) => sum + a.chance, 0);
      const target = rngPick('consumables', unblessed);
      const roll = rngFloat('consumables') * totalWeight;
      let appliedAuraName: string | undefined;
      let cumulative = 0;
      for (const aura of blessableAuras) {
        cumulative += aura.chance;
        if (roll < cumulative) {
          target.def = { ...target.def, aura: { ...aura } };
          appliedAuraName = aura.name;
          break;
        }
      }
      writeEquipment(equipment);
      enqueueToastFeedback(
        appliedAuraName ? `Success! ${appliedAuraName} blessing` : 'Success! Equipment blessed',
        'success',
      );
      return { success: true };
    }
    case 'priests_blessing': {
      const equipment = resolveEquipmentList();
      if (equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const holyAura = getItemAuraById('holy');
      if (!holyAura) return { success: true };
      const chosenIdx = Math.floor(rngFloat('consumables') * equipment.length);
      equipment[chosenIdx]!.def = { ...equipment[chosenIdx]!.def, aura: holyAura };
      const destructions = equipment
        .map((_, i) => i)
        .filter((i) => i !== chosenIdx && !isEquipmentCursed(equipment[i]!))
        .map((victimIdx) => ({ sourceIdx: chosenIdx, victimIdx }));

      if (destructions.length === 0) {
        writeEquipment(equipment);
        return { success: true };
      }

      writeEquipment(equipment);
      return {
        success: true,
        consumableAnimEvents: [{ type: 'destroy_equipment', destructions }],
      };
    }
    case 'blood_moon': {
      const equipment = resolveEquipmentList();
      if (equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const ghostAura = getItemAuraById('ghost');
      if (!ghostAura) return { success: true };
      const chosenIdx = Math.floor(rngFloat('consumables') * equipment.length);
      equipment[chosenIdx]!.def = { ...equipment[chosenIdx]!.def, aura: ghostAura };
      writeEquipment(equipment);
      const mods = getRunState().trailEventModifiers;
      runActions.patch({ trailEventModifiers: { ...mods, rerollPenalty: mods.rerollPenalty + 1 } });
      return { success: true };
    }
    case 'raid': {
      const visibleIds = new Set(context.visibleDiceIds ?? []);
      if (visibleIds.size === 0) {
        return { success: false, failReason: 'Raid can only be used when dice are visible!' };
      }
      const visibleDice = getRunState().dice.filter((d) => visibleIds.has(d.id));
      if (visibleDice.length === 0) {
        return { success: false, failReason: 'No visible dice available for Raid!' };
      }

      const toDestroy = rngShuffle('consumables', visibleDice).slice(0, Math.min(5, visibleDice.length));
      const destroyIds = new Set(toDestroy.map((d) => d.id));
      const enhancedCount = toDestroy.filter((d) => d.enhancement !== null).length;
      const before = getRunState().dice.length;
      const nextDice = getRunState().dice.filter((d) => !destroyIds.has(d.id));
      const spentSet = new Set(getRunState().spentDiceIds);
      for (const id of destroyIds) spentSet.delete(id);
      runActions.patch({ dice: nextDice, spentDiceIds: [...spentSet] });
      const removed = before - nextDice.length;
      if (removed > 0) {
        const equipment = resolveEquipmentList();
        processEquipmentOnDiceDestroyed(equipment, removed, enhancedCount);
        writeEquipment(equipment);
      }
      economyActions.earn(20);
      return {
        success: true,
        consumableAnimEvents: [{ type: 'destroy_dice', diceIds: [...destroyIds] }],
      };
    }
    case 'omen_stone': {
      const state = getRunState();
      const existing = state.statusTraitTokens.find((t) => t.id === 'omen_stone');
      if (existing) {
        runActions.patch({
          statusTraitTokens: state.statusTraitTokens.map((t) =>
            t.id === 'omen_stone' ? { ...t, copies: t.copies + 1 } : t,
          ),
        });
      } else {
        runActions.patch({ statusTraitTokens: [...state.statusTraitTokens, { id: 'omen_stone', copies: 1 }] });
      }
      return { success: true };
    }
    case 'shop_pass': {
      const state = getRunState();
      const existing = state.statusTraitTokens.find((t) => t.id === 'shop_pass');
      if (existing) {
        runActions.patch({
          statusTraitTokens: state.statusTraitTokens.map((t) =>
            t.id === 'shop_pass' ? { ...t, copies: t.copies + 1 } : t,
          ),
        });
      } else {
        runActions.patch({ statusTraitTokens: [...state.statusTraitTokens, { id: 'shop_pass', copies: 1 }] });
      }
      return { success: true };
    }
    case 'fools_gold': {
      const balance = getRunState().balance;
      const roll = rngFloat('consumables');

      if (roll < 0.5) {
        economyActions.earn(30);
        enqueueToastFeedback('Success! Gained $30', 'success');
        return { success: true };
      }

      // When at/under $0 (including debt), "lose half" would effectively
      // move the balance toward zero. On the downside roll, apply no change.
      if (balance > 0) {
        const loss = Math.floor(balance / 2);
        if (loss > 0) {
          economyActions.spend(loss);
          enqueueToastFeedback(`Too bad. Lost $${loss}`, 'failure');
          return { success: true };
        }
      }
      enqueueToastFeedback('Too bad. No gold to lose', 'failure');
      return { success: true };
    }
    case 'trading_post': {
      bumpAllSellValues(1);
      return { success: true };
    }
    case 'all_in': {
      const balance = getRunState().balance;
      economyActions.earn(balance);
      const runAfter = getRunState();
      const alreadyHad = runAfter.statusTraitTokens.some((t) => t.id === 'all_in');
      const nextCopies = (runAfter.statusTraitTokens.find((t) => t.id === 'all_in')?.copies ?? 0) + 1;
      runActions.patch({
        statusTraitTokens: runAfter.statusTraitTokens
          .filter((t) => t.id !== 'all_in')
          .concat({ id: 'all_in', copies: nextCopies }),
        ...(alreadyHad ? {} : { trailEventModifiers: { ...runAfter.trailEventModifiers, loseAllRerolls: true } }),
      });
      return { success: true };
    }
    case 'echo_of_the_damned': {
      const state = getRunState();
      const existing = state.statusTraitTokens.find((t) => t.id === 'echo_of_the_damned');
      if (existing) {
        runActions.patch({
          statusTraitTokens: state.statusTraitTokens.map((t) =>
            t.id === 'echo_of_the_damned' ? { ...t, copies: t.copies + 1 } : t,
          ),
        });
      } else {
        runActions.patch({
          statusTraitTokens: [...state.statusTraitTokens, { id: 'echo_of_the_damned', copies: 1 }],
        });
      }
      return { success: true };
    }
    case 'skin_walker': {
      const equipment = resolveEquipmentList();
      if (equipment.length === 0) return { success: false, failReason: 'No equipment!' };
      const chosenIdx = Math.floor(rngFloat('consumables') * equipment.length);
      const source = equipment[chosenIdx]!;
      const duplicated: EquipmentInstance = {
        def: source.def.aura?.id === 'ghost' ? { ...source.def, aura: undefined } : { ...source.def },
        sellValue: source.sellValue,
        state: { ...source.state },
        modifiers: [...source.modifiers],
        perishableRoundsLeft: source.perishableRoundsLeft,
      };
      const destructions = equipment
        .map((_, i) => i)
        .filter((i) => i !== chosenIdx && !isEquipmentCursed(equipment[i]!))
        .map((victimIdx) => ({ sourceIdx: chosenIdx, victimIdx }));

      if (destructions.length === 0) {
        const survivors = equipment.filter((e, i) => i === chosenIdx || isEquipmentCursed(e));
        survivors.push(duplicated);
        writeEquipment(survivors);
        return { success: true };
      }

      return {
        success: true,
        consumableAnimEvents: [
          {
            type: 'destroy_equipment',
            destructions,
            equipmentToAdd: [duplicated],
          },
        ],
      };
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
export function useConsumableDirectly(def: ConsumableDef, context: UseConsumableContext = {}): UseConsumableResult {
  const consumed = createConsumableInstance(def);
  if (isSecondHelpingsCloneTarget(def)) {
    runActions.patch({ lastUsedConsumableId: def.id });
  }
  return executeConsumableEffect(consumed, context);
}

/** Apply a pack/instant effect directly against the run store. */
export function applyRunInstantEffect(effect: InstantEffect): UseConsumableResult {
  const run = getRunState();
  switch (effect.type) {
    case 'CREATE_DICE': {
      const count = effect.count ?? 1;
      const enhancement = (effect.enhancement ?? null) as DiceEnhancement;
      for (let i = 0; i < count; i++) {
        diceActions.addDie(createDie({ enhancement }));
      }
      return { success: true };
    }
    case 'DOUBLE_MONEY': {
      const gain = Math.min(run.balance, effect.maxGain ?? 20);
      economyActions.earn(gain);
      return { success: true };
    }
    case 'TRADE_EQUIPMENT': {
      const equipment = resolveEquipmentList();
      const totalValue = equipment.reduce((sum, eq) => sum + eq.sellValue, 0);
      const gain = Math.min(totalValue, effect.maxGain ?? 50);
      economyActions.earn(gain);
      return { success: true };
    }
    case 'CREATE_EQUIPMENT': {
      let equipmentCreatedCount = 0;
      const state = getRunState();
      const list = resolveEquipmentList();
      const usedSlots = list.filter((e) => e.def.aura?.id !== 'ghost').length;
      if (usedSlots < state.maxEquipmentSlots) {
        const def = generateRandomEquipment({
          rarity: effect.rarity,
          excludeRarity: effect.excludeRarity,
        });
        list.push(acquireRewardEquipmentInstance(def, state.purchasedPermits));
        writeEquipment(list);
        equipmentCreatedCount = 1;
      }
      if (effect.setMoneyZero) {
        economyActions.spend(getRunState().balance);
      }
      return { success: true, equipmentCreatedCount };
    }
    case 'UPGRADE_ALL_HANDS': {
      return { success: true, handUpgrades: createAllHandUpgrades() };
    }
    default:
      return { success: true };
  }
}

function createAllHandUpgrades(): HandUpgradeInfo[] {
  const upgrades: HandUpgradeInfo[] = [];
  for (const type of Object.values(HandType)) {
    const stats = selectHandStats(getRunState(), type);
    const handDef = HAND_TABLE.find((h) => h.type === type)!;
    const oldLevel = stats.level;
    const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
    const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);
    progressionActions.upgradeHandLevel(type);
    const newLevel = selectHandStats(getRunState(), type).level;
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
