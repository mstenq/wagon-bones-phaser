// ─── Trail Events System (No Phaser imports) ───
// Random narrative events that occur between rounds (after beating a leg, before the shop).
// Choose-your-own-adventure moments with risk/reward.

import trailEventsData, {
  getTrailEventById as findTrailEventById,
  getTrailEventMinimumLeg,
  type TrailEventChoice,
  type TrailEventCondition,
  type TrailEventDef,
  type TrailEventEffect,
  type TrailEventOutcome,
} from '../data/trail_events';
import type { PlayerState } from './PlayerState';
import type { DiceEnhancement, DiceAura, DiceSticker } from './types';
import {
  getRandomSupplyDef,
  getSupplyDefById,
  getRandomTrailGuideDef,
  getRandomFrontierDef,
  createConsumableInstance,
} from './ConsumablesSystem';
import { generateShopStock, isEquipmentCursed } from './ItemsSystem';
import { GAMEPLAY } from './Constants';
import { acquireRewardEquipmentInstance } from './EquipmentModifiers';
import { TRAIL_EVENT } from './Constants';
import { resolveEffectParam } from './effectParams';
import type { EquipmentInstance } from './ItemsSystem';
import { rngFloat, rngShuffle } from './RunRng';

export type {
  TrailEventCategory,
  TrailEventChoice,
  TrailEventCondition,
  TrailEventConditionType,
  TrailEventDef,
  TrailEventEffect,
  TrailEventEffectType,
  TrailEventOutcome,
} from '../data/trail_events';

export { getTrailEventMinimumLeg } from '../data/trail_events';

export interface TrailEventModifiers {
  dayPenalty: number;
  rerollPenalty: number;
  handSizePenalty: number;
  scoreMultiplier: number;
  disableRerollDay1: boolean;
  standardDiceDay1: boolean;
  moneyPerDayLoss: number;
  diamondCrackDoubled: boolean;
  luckyOddsHalved: boolean;
  scoredDiceDestroyChance: number;
  bossUpgradeMultiplier: number;
  flatMilesPenalty: number;
  skipNextShop: boolean;
  loseAllRerolls: boolean;
}

/** Round-duration trail penalties applied after startRound consumes trailEventModifiers. */
export interface TrailRoundEffects {
  disableRerollDay1: boolean;
  standardDiceDay1: boolean;
  moneyPerDayLoss: number;
  diamondCrackDoubled: boolean;
  luckyOddsHalved: boolean;
  scoredDiceDestroyChance: number;
}

export interface TrailEventResult {
  event: TrailEventDef;
  choiceId: string;
  outcomeIndex: number;
  effects: TrailEventEffect[];
  modifiers: TrailEventModifiers;
  message?: string;
}

// ─── Data Access ───

const ALL_EVENTS: TrailEventDef[] = trailEventsData;

/** Get all trail event definitions */
export function getAllTrailEvents(): TrailEventDef[] {
  return ALL_EVENTS;
}

/** Get a trail event by its id */
export function getTrailEventById(id: string): TrailEventDef | null {
  return findTrailEventById(id) ?? null;
}

/** Create a fresh (zeroed) modifiers object */
export function createEmptyModifiers(): TrailEventModifiers {
  return {
    dayPenalty: 0,
    rerollPenalty: 0,
    handSizePenalty: 0,
    scoreMultiplier: 1.0,
    disableRerollDay1: false,
    standardDiceDay1: false,
    moneyPerDayLoss: 0,
    diamondCrackDoubled: false,
    luckyOddsHalved: false,
    scoredDiceDestroyChance: 0,
    bossUpgradeMultiplier: 1.0,
    flatMilesPenalty: 0,
    skipNextShop: false,
    loseAllRerolls: false,
  };
}

export function createEmptyTrailRoundEffects(): TrailRoundEffects {
  return {
    disableRerollDay1: false,
    standardDiceDay1: false,
    moneyPerDayLoss: 0,
    diamondCrackDoubled: false,
    luckyOddsHalved: false,
    scoredDiceDestroyChance: 0,
  };
}

/** Copy round-duration fields from pending trail modifiers into active round effects. */
export function trailRoundEffectsFromModifiers(mods: TrailEventModifiers): TrailRoundEffects {
  return {
    disableRerollDay1: mods.disableRerollDay1,
    standardDiceDay1: mods.standardDiceDay1,
    moneyPerDayLoss: mods.moneyPerDayLoss,
    diamondCrackDoubled: mods.diamondCrackDoubled,
    luckyOddsHalved: mods.luckyOddsHalved,
    scoredDiceDestroyChance: mods.scoredDiceDestroyChance,
  };
}

/** True when any round-duration trail penalty is active. */
export function hasActiveTrailRoundEffects(effects: TrailRoundEffects): boolean {
  return (
    effects.moneyPerDayLoss > 0 ||
    effects.disableRerollDay1 ||
    effects.standardDiceDay1 ||
    effects.diamondCrackDoubled ||
    effects.luckyOddsHalved ||
    effects.scoredDiceDestroyChance > 0
  );
}

/** Sidebar debuffs: active round effects, or pending modifiers before the next Game startRound. */
export function getPlayerTrailDebuffLines(player: PlayerState): string[] {
  if (hasActiveTrailRoundEffects(player.trailRoundEffects)) {
    return getTrailDebuffLines(player.trailRoundEffects);
  }
  return getTrailDebuffLines(trailRoundEffectsFromModifiers(player.trailEventModifiers));
}

/** Human-readable debuff lines for the GameScene sidebar (whole round). */
export function getTrailDebuffLines(effects: TrailRoundEffects): string[] {
  const lines: string[] = [];
  if (effects.moneyPerDayLoss > 0) {
    lines.push(`−$${effects.moneyPerDayLoss}/day`);
  }
  if (effects.disableRerollDay1) {
    lines.push('No rerolls on Day 1');
  }
  if (effects.standardDiceDay1) {
    lines.push('Standard dice on Day 1');
  }
  if (effects.diamondCrackDoubled) {
    lines.push('Diamond crack chance doubled');
  }
  if (effects.luckyOddsHalved) {
    lines.push('Lucky odds halved');
  }
  if (effects.scoredDiceDestroyChance > 0) {
    lines.push(`${Math.round(effects.scoredDiceDestroyChance * 100)}% scored dice destroyed`);
  }
  return lines;
}

// ─── Event Selection ───

/** Demon hunter pool draw chance */
const DEMON_HUNTER_POOL_CHANCE = 0.3;

/** Whether the player has Scout's Spyglass equipped. */
export function hasScoutsSpyglass(player: PlayerState): boolean {
  return player.equipment.some((e) => e.def.id === 'scouts_spyglass');
}

/** Skip the pending trail event (no miles). */
export function applySpyglassAvoid(player: PlayerState): void {
  player.pendingTrailEvent = null;
}

/** Miles granted when investigating with Scout's Spyglass equipped. */
export function getScoutsSpyglassInvestigateMiles(player: PlayerState): number {
  const spyglass = player.equipment.find((e) => e.def.id === 'scouts_spyglass');
  if (!spyglass) return 0;
  return resolveEffectParam<number>(spyglass.def.effectParams, 'investigateMiles', player.profession?.id);
}

/** Commit to the pending trail event; store investigate miles on the spyglass item. */
export function applySpyglassInvestigate(player: PlayerState): void {
  const spyglass = player.equipment.find((e) => e.def.id === 'scouts_spyglass');
  if (spyglass) {
    const gain = getScoutsSpyglassInvestigateMiles(player);
    spyglass.state.miles = (spyglass.state.miles ?? 0) + gain;
  }
}

export function findTrailRepairKit(player: PlayerState): EquipmentInstance | undefined {
  return player.equipment.find((e) => e.def.id === 'trail_repair_kit');
}

/** True when shield or Trail Repair Kit negates a negative trail effect. */
export function isTrailNegativeNegated(player: PlayerState): boolean {
  return player.equipment.some((e) => e.def.id === 'saint_elmos_shield') || findTrailRepairKit(player) !== undefined;
}

/** Filter events eligible for the current leg (mirrors boss minimumLeg). */
export function filterEventsByLeg(pool: TrailEventDef[], leg: number): TrailEventDef[] {
  const eligible = pool.filter((e) => getTrailEventMinimumLeg(e) <= leg);
  return eligible.length > 0 ? eligible : pool;
}

/** Exclude events the player has already encountered this run. */
export function filterUnseenEvents(pool: TrailEventDef[], player: PlayerState): TrailEventDef[] {
  if (player.seenTrailEventIds.size === 0) return pool;
  const unseen = pool.filter((e) => !player.seenTrailEventIds.has(e.id));
  return unseen.length > 0 ? unseen : pool;
}

const STANDOFF_BLOCKED_EFFECTS: TrailEventEffect['type'][] = ['DISABLE_REROLL_DAY1', 'LOSE_ALL_REROLLS'];

/** True if any choice outcome on the event includes the given effect type. */
export function eventHasEffect(event: TrailEventDef, effectType: TrailEventEffect['type']): boolean {
  for (const choice of event.choices) {
    for (const outcome of choice.outcomes) {
      if (outcome.effects?.some((e) => e.type === effectType)) return true;
    }
  }
  return false;
}

/** True when the next round is The Standoff boss (trail event fires after round 3 payout). */
export function isStandoffBossRound(player: PlayerState): boolean {
  return player.round === GAMEPLAY.ROUNDS_PER_LEG && player.getBossForLeg(player.leg)?.id === 'the_standoff';
}

function filterStandoffBlockedEvents(pool: TrailEventDef[]): TrailEventDef[] {
  const filtered = pool.filter((e) => !STANDOFF_BLOCKED_EFFECTS.some((effectType) => eventHasEffect(e, effectType)));
  return filtered.length > 0 ? filtered : pool;
}

/**
 * Select a random trail event from the weighted pool.
 * Filters demon_hunter events based on profession and minimumLeg.
 * When playing as demon_hunter, ~30% chance to draw from exclusive pool.
 */
export function selectTrailEvent(player: PlayerState, rng: () => number = () => rngFloat('trail')): TrailEventDef {
  const isDemonHunter = player.profession?.id === 'demon_hunter';
  const leg = player.leg;

  // Decide which pool to draw from
  if (isDemonHunter && rng() < DEMON_HUNTER_POOL_CHANCE) {
    const demonPool = filterUnseenEvents(
      filterEventsByLeg(
        ALL_EVENTS.filter((e) => e.demonHunterOnly),
        leg,
      ),
      player,
    );
    return weightedRandomPick(demonPool, rng);
  }

  let standardPool = filterUnseenEvents(
    filterEventsByLeg(
      ALL_EVENTS.filter((e) => !e.demonHunterOnly),
      leg,
    ),
    player,
  );
  if (isStandoffBossRound(player)) {
    standardPool = filterStandoffBlockedEvents(standardPool);
  }
  return weightedRandomPick(standardPool, rng);
}

/** Pick a random element from a weighted pool */
function weightedRandomPick(pool: TrailEventDef[], rng: () => number): TrailEventDef {
  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * totalWeight;
  for (const event of pool) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  // Fallback (shouldn't happen)
  return pool[pool.length - 1];
}

// ─── Choice Availability ───

/**
 * Get choices available to the player for a given event.
 * Filters out choices whose conditions are not met.
 */
export function getAvailableChoices(event: TrailEventDef, player: PlayerState): TrailEventChoice[] {
  return event.choices.filter((choice) => {
    if (!choice.condition) return true;
    return checkCondition(choice.condition, player);
  });
}

/** Check if a condition is met by the player */
export function checkCondition(condition: TrailEventCondition, player: PlayerState): boolean {
  switch (condition.type) {
    case 'HAS_MONEY':
      return player.economy.balance >= (condition.amount ?? 0);

    case 'HAS_EQUIPMENT':
      return player.equipment.some((e) => e.def.id === condition.id);

    case 'HAS_EQUIPMENT_ANY':
      return player.equipment.length > 0;

    case 'HAS_MEDICINE':
      // Check for medicine-type supply card in consumables
      return player.consumables.some(
        (c) => c.def.id === 'medicine' || c.def.id === 'wild_vegetables' || c.def.category === 'supply',
      );

    case 'HAS_WEAPON':
      // Check for weapon-type equipment (rifle, etc.)
      return player.equipment.some((e) => {
        const id = e.def.id;
        return id === '22_rifle' || id === 'shotgun' || id === 'revolver' || id === 'hunting_rifle';
      });

    case 'HAS_SUPPLY_CARDS':
      return player.consumables.some((c) => c.def.category === 'supply');

    case 'HAS_CONSUMABLE_ANY':
      return player.consumables.length > 0;

    case 'NOT_HAS_CONSUMABLE_ANY':
      return player.consumables.length === 0;

    case 'IS_PROFESSION':
      return player.profession?.id === condition.id;

    default:
      return true;
  }
}

// ─── Outcome Resolution ───

/**
 * Resolve a player's choice for a trail event.
 * Rolls probability for multi-outcome choices, applies effects, returns result.
 */
export function resolveChoice(
  event: TrailEventDef,
  choiceId: string,
  player: PlayerState,
  rng: () => number = () => rngFloat('trail'),
): TrailEventResult {
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new Error(`Invalid choice "${choiceId}" for event "${event.id}"`);
  }

  const shieldEquip = player.equipment.find((e) => e.def.id === 'saint_elmos_shield');
  const trailRepairKit = player.equipment.find((e) => e.def.id === 'trail_repair_kit');

  // Roll for outcome
  const outcomeIndex = rollOutcome(choice.outcomes, rng);
  const outcome = choice.outcomes[outcomeIndex];
  const modifiers = createEmptyModifiers();

  let trailRepairKitNegatedEvent = false;

  // Apply effects
  for (const effect of outcome.effects) {
    if (isNegativeEffect(effect) && (shieldEquip || trailRepairKit)) {
      if (trailRepairKit) trailRepairKitNegatedEvent = true;
      continue;
    }
    applyEffect(effect, player, modifiers, rng);
  }

  if (trailRepairKit && trailRepairKitNegatedEvent) {
    const gain = resolveEffectParam<number>(
      trailRepairKit.def.effectParams,
      'xMultGainPerNegation',
      player.profession?.id,
    );
    trailRepairKit.state.xMult = (trailRepairKit.state.xMult ?? 1) + gain;
  }

  player.seenTrailEventIds.add(event.id);
  player.pendingTrailEvent = null;

  return {
    event,
    choiceId,
    outcomeIndex,
    effects: outcome.effects,
    modifiers,
    message: outcome.message,
  };
}

/** Roll for which outcome occurs based on probability weights */
function rollOutcome(outcomes: TrailEventOutcome[], rng: () => number): number {
  if (outcomes.length === 1) return 0;
  const roll = rng();
  let cumulative = 0;
  for (let i = 0; i < outcomes.length; i++) {
    cumulative += outcomes[i].probability;
    if (roll < cumulative) return i;
  }
  return outcomes.length - 1;
}

/** Determine if an effect is negative (for saint_elmos_shield check) */
export function isNegativeEffect(effect: TrailEventEffect): boolean {
  const negativeTypes = [
    'LOSE_MONEY',
    'LOSE_MONEY_PERCENT',
    'LOSE_DAYS',
    'LOSE_REROLLS',
    'LOSE_REROLLS_PER_DAY',
    'LOSE_HAND_SIZE',
    'LOSE_RANDOM_DICE',
    'LOSE_RANDOM_EQUIPMENT',
    'LOSE_ALL_SUPPLY_CARDS',
    'LOSE_EQUIPMENT_CHOICE',
    'LOSE_RANDOM_SUPPLY_CARD',
    'LOSE_MONEY_PER_DAY',
    'LOSE_ALL_REROLLS',
    'LOSE_EQUIPMENT_SLOT_PERMANENT',
    'DISABLE_REROLL_DAY1',
    'STANDARD_DICE_DAY1',
    'DIAMOND_CRACK_DOUBLED',
    'LUCKY_ODDS_HALVED',
    'SCORED_DICE_DESTROY_CHANCE',
    'BOSS_UPGRADE',
    'FLAT_MILES_PENALTY',
    'SCORE_MULTIPLIER', // x1.5 means you need more score, so it's negative
  ];
  return negativeTypes.includes(effect.type);
}

// ─── Effect Application ───

/**
 * Apply a single effect to the player state and/or accumulate modifiers.
 * Some effects are immediate (money, dice), others are deferred (day penalties for next round).
 */
export function applyEffect(
  effect: TrailEventEffect,
  player: PlayerState,
  modifiers: TrailEventModifiers,
  rng: () => number = () => rngFloat('trail'),
): void {
  switch (effect.type) {
    case 'LOSE_MONEY':
      player.economy.spend(Math.min(effect.amount ?? 0, player.economy.balance));
      break;

    case 'LOSE_MONEY_PERCENT': {
      const amount = Math.floor(player.economy.balance * ((effect.percent ?? 0) / 100));
      player.economy.spend(amount);
      break;
    }

    case 'GAIN_MONEY':
      player.economy.earn(effect.amount ?? 0);
      break;

    case 'LOSE_DAYS':
      modifiers.dayPenalty += effect.amount ?? 0;
      break;

    case 'LOSE_REROLLS':
      modifiers.rerollPenalty += effect.amount ?? 0;
      break;

    case 'LOSE_REROLLS_PER_DAY':
      // This is modeled as a larger reroll penalty (amount per day * max days approximation)
      modifiers.rerollPenalty += (effect.amount ?? 0) * 4; // approximate — applied as flat penalty
      break;

    case 'LOSE_ALL_REROLLS':
      modifiers.loseAllRerolls = true;
      break;

    case 'LOSE_HAND_SIZE':
      modifiers.handSizePenalty += effect.amount ?? 0;
      break;

    case 'LOSE_RANDOM_DICE': {
      // Only target enhanced dice (has enhancement, sticker, or aura)
      const enhancedDice = player.dice.filter((d) => d.enhancement !== null || d.sticker !== null || d.aura !== null);
      if (enhancedDice.length === 0) {
        const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE; // $3 per missing die as penalty
        player.economy.setBalance(player.economy.balance - lostAmount);
        break;
      }
      const count = Math.min(effect.count ?? 0, enhancedDice.length);
      for (let i = 0; i < count; i++) {
        const remaining = player.dice.filter((d) => d.enhancement !== null || d.sticker !== null || d.aura !== null);
        if (remaining.length === 0) break;
        const pick = remaining[Math.floor(rng() * remaining.length)];
        const idx = player.dice.indexOf(pick);
        if (idx >= 0) player.dice.splice(idx, 1);
      }
      break;
    }

    case 'LOSE_RANDOM_EQUIPMENT': {
      if (player.equipment.length === 0) {
        // Fallback: lose $4 per missing equipment (can go negative)
        const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP;
        player.economy.setBalance(player.economy.balance - lostAmount);
        break;
      }
      const eligibleIndices = player.equipment.map((e, i) => (isEquipmentCursed(e) ? -1 : i)).filter((i) => i >= 0);
      if (eligibleIndices.length === 0) {
        const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP;
        player.economy.setBalance(player.economy.balance - lostAmount);
        break;
      }
      const count = Math.min(effect.count ?? 0, eligibleIndices.length);
      for (let i = 0; i < count; i++) {
        const remaining = player.equipment.map((e, idx) => (isEquipmentCursed(e) ? -1 : idx)).filter((idx) => idx >= 0);
        if (remaining.length === 0) break;
        const pick = remaining[Math.floor(rng() * remaining.length)];
        player.equipment.splice(pick, 1);
      }
      break;
    }

    case 'LOSE_EQUIPMENT_CHOICE': {
      // Deferred to UI — the scene will prompt the player to choose.
      // If no equipment, fallback $10 penalty applied here.
      if (player.equipment.length === 0) {
        const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP; // $4 per missing equipment as penalty
        player.economy.setBalance(player.economy.balance - lostAmount);
      }
      break;
    }

    case 'LOSE_ALL_SUPPLY_CARDS': {
      // Remove all supply-category consumables
      player.consumables = player.consumables.filter((c) => c.def.category !== 'supply');
      break;
    }

    case 'LOSE_RANDOM_SUPPLY_CARD': {
      const count = effect.count ?? 1;
      for (let i = 0; i < count; i++) {
        const supplyIndices = player.consumables
          .map((c, idx) => (c.def.category === 'supply' || c.def.category === 'trail_guide' ? idx : -1))
          .filter((idx) => idx >= 0);
        if (supplyIndices.length === 0) break;
        const removeIdx = supplyIndices[Math.floor(rng() * supplyIndices.length)];
        player.consumables.splice(removeIdx, 1);
      }
      break;
    }

    case 'LOSE_MONEY_PER_DAY':
      modifiers.moneyPerDayLoss += effect.amount ?? 0;
      break;

    case 'LOSE_EQUIPMENT_SLOT_PERMANENT':
      player.maxEquipmentSlots = Math.max(1, player.maxEquipmentSlots - 1);
      break;

    case 'GAIN_DICE': {
      const count = effect.count ?? 1;
      for (let i = 0; i < count; i++) {
        const enhancement = (effect.enhancement as DiceEnhancement) ?? null;
        player.addDie({
          id: '', // PlayerState.addDie assigns a proper id
          value: enhancement === 'stone' ? 0 : Math.floor(rng() * 12) + 1,
          enhancement,
          sticker: (effect.sticker as DiceSticker) ?? null,
          aura: (effect.aura as DiceAura) ?? null,
          bonusMiles: 0,
        });
      }
      break;
    }

    case 'GAIN_RANDOM_SUPPLY_CARD': {
      // Import handled dynamically — add a generic supply card
      // In the actual game this would use getRandomSupplyDef, but for logic
      // purposes we just mark that it should happen. The count is tracked.
      const count = effect.count ?? 1;
      for (let i = 0; i < count; i++) {
        const def = getRandomSupplyDef();
        const inst = createConsumableInstance(def);
        player.consumables.push(inst);
      }
      break;
    }

    case 'GAIN_SPECIFIC_SUPPLY_CARD': {
      const def = getSupplyDefById(effect.id ?? '');
      if (def) {
        const inst = createConsumableInstance(def);
        player.consumables.push(inst);
      }
      break;
    }

    case 'GAIN_RANDOM_EQUIPMENT': {
      // Generate a single equipment item of the requested rarity
      const stock = generateShopStock(20);
      const rarityFilter = effect.rarity ? stock.filter((e: any) => e.rarity === effect.rarity) : stock;
      const pick = rarityFilter.length > 0 ? rarityFilter[0] : stock[0];
      if (pick) {
        const def = effect.aura
          ? { ...pick, aura: { id: effect.aura, name: effect.aura, description: '', costIncrease: 0, chance: 0 } }
          : pick;
        player.equipment.push(acquireRewardEquipmentInstance(def, player.purchasedPermits));
      }
      break;
    }

    case 'GAIN_TRAIL_GUIDES': {
      const count = effect.count ?? 1;
      for (let i = 0; i < count; i++) {
        const def = getRandomTrailGuideDef();
        const inst = createConsumableInstance(def);
        player.consumables.push(inst);
      }
      break;
    }

    case 'GAIN_MEDICINE_CARD': {
      const def = getSupplyDefById('medicine');
      if (def) {
        player.consumables.push(createConsumableInstance(def));
      }
      break;
    }

    case 'GAIN_FRONTIER_ENCOUNTER': {
      const def = getRandomFrontierDef();
      player.consumables.push(createConsumableInstance(def));
      break;
    }

    case 'USE_MEDICINE': {
      // Remove one supply-category consumable (first found)
      const idx = player.consumables.findIndex((c) => c.def.category === 'supply');
      if (idx >= 0) player.consumables.splice(idx, 1);
      break;
    }

    case 'DESTROY_EQUIPMENT': {
      const idx = player.equipment.findIndex((e) => e.def.id === effect.id);
      if (idx >= 0 && !isEquipmentCursed(player.equipment[idx])) {
        player.equipment.splice(idx, 1);
      }
      break;
    }

    case 'ADD_AURA_TO_RANDOM_DICE': {
      const count = Math.min(effect.count ?? 0, player.dice.length);
      const shuffled = rngShuffle('trail', player.dice);
      for (let i = 0; i < count; i++) {
        if (shuffled[i]) {
          shuffled[i].aura = (effect.aura as DiceAura) ?? null;
        }
      }
      break;
    }

    case 'BOSS_UPGRADE':
      modifiers.bossUpgradeMultiplier *= effect.multiplier ?? 1.0;
      break;

    case 'SCORE_MULTIPLIER':
      modifiers.scoreMultiplier *= effect.multiplier ?? 1.0;
      break;

    case 'FLAT_MILES_PENALTY':
      modifiers.flatMilesPenalty += effect.amount ?? 0;
      break;

    case 'SKIP_NEXT_SHOP':
      modifiers.skipNextShop = true;
      break;

    case 'DISABLE_REROLL_DAY1':
      modifiers.disableRerollDay1 = true;
      break;

    case 'STANDARD_DICE_DAY1':
      modifiers.standardDiceDay1 = true;
      break;

    case 'DIAMOND_CRACK_DOUBLED':
      modifiers.diamondCrackDoubled = true;
      break;

    case 'LUCKY_ODDS_HALVED':
      modifiers.luckyOddsHalved = true;
      break;

    case 'SCORED_DICE_DESTROY_CHANCE':
      modifiers.scoredDiceDestroyChance = effect.chance ?? 0;
      break;

    default:
      console.warn(`[TrailEvents] Unknown effect type: ${effect.type}`);
  }
}
