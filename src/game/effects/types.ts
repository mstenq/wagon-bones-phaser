// ─── Effect Handler Types ───

import { Die, HandType, HandResult, ScoreAnimEvent } from '../types';
import { EquipmentInstance } from '../ItemsSystem';

/**
 * Mutable context passed through the scoring pipeline.
 * Handlers modify this in-place. Replaces scattered local variables.
 */
export interface ScoringPipelineContext {
  // ─── Inputs (read-only by convention) ───
  readonly handResult: HandResult;
  readonly scoringDice: Die[];
  readonly heldDice: Die[];
  readonly equipment: EquipmentInstance[];
  readonly rerollsRemaining: number;
  readonly currentDay: number;
  readonly maxDays: number;
  readonly allDice: Die[];
  readonly handType: HandType | undefined;
  readonly playerBalance: number;

  // ─── Accumulator State (mutated by handlers) ───
  totalValue: number;
  bonusMult: number;
  xMult: number;
  bonusMiles: number;
  animEvents: ScoreAnimEvent[];

  // ─── Mutation Collector (applied after scoring) ───
  mutations: ScoringMutations;
}

export interface ScoringMutations {
  moneyEarned: number;
  earnedMoney: number;
  lostMoney: number;
  earnedMiles: number;
  lostMiles: number;
  gainedDice: number;
  lostDice: number;
  gainedSupplyCards: number;
  gainedEquipment: number;
  lostEquipment: number;
  daysBonus: number;
  loseAllRerolls: boolean;
  burnBarrelMoney: number;
  burnBarrelTriggered: boolean;
  supplyCardsToAdd: number;
  diceDestroyed: string[];
  diceEnhanced: { id: string; enhancement: Die['enhancement'] }[];
  consumablesGranted: string[]; // consumable def IDs
  diceCopied: Partial<Die>[];
  dieBonusMilesAdded: { id: string; amount: number }[];
}

/**
 * Handler for an equipment effect during the "independent equipment pass"
 * (Step 5 of scoring: after per-die scoring and held-in-hand, before xMult).
 */
export interface AdditiveEffectHandler {
  (ctx: ScoringPipelineContext, equip: EquipmentInstance, equipIndex: number): void;
}

/**
 * Handler for an equipment effect during the xMult pass.
 */
export interface XMultEffectHandler {
  (ctx: ScoringPipelineContext, equip: EquipmentInstance, equipIndex: number): void;
}

/**
 * Handler for per-die equipment triggers (fires once per scoring die per trigger).
 */
export interface PerDieEffectHandler {
  (ctx: ScoringPipelineContext, equip: EquipmentInstance, equipIndex: number, die: Die, triggerIndex: number): void;
}

/**
 * Handler for held-in-hand equipment triggers (fires once per held die per trigger).
 */
export interface HeldDieEffectHandler {
  (ctx: ScoringPipelineContext, equip: EquipmentInstance, equipIndex: number, die: Die, triggerIndex: number): void;
}

/** Lifecycle hook phases */
export type LifecyclePhase =
  | 'on-hand-played'       // Before scoring starts
  | 'after-hand-scored'    // After scoring completes
  | 'on-reroll'            // When player rerolls dice
  | 'on-shop-reroll'       // When player rerolls the shop
  | 'on-sell'              // When player sells equipment
  | 'on-day-end'           // At end of each day
  | 'on-round-start'       // At start of each round
  | 'on-dice-spent'        // When dice are moved to spent pool
  | 'on-dice-added'        // When a new die is added
  | 'on-supply-used'       // When a supply card is consumed
  | 'on-pack-skipped'      // When a booster pack is skipped
  | 'on-pack-opened'       // When a booster pack is opened
  | 'on-lucky-trigger'     // When a lucky die triggers
  | 'on-diamond-destroyed' // When a diamond die is destroyed
  | 'on-dice-destroyed'    // When dice are removed from the collection
  | 'on-boss-defeat';      // When a boss is defeated

export interface LifecycleHandler {
  (equip: EquipmentInstance, ...args: unknown[]): unknown;
}
