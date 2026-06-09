// ─── Permits System (No Phaser imports) ───
// Defines frontier permits (vouchers), their effects, and generation helpers.
// Permits are permanent upgrades purchased from the shop, one per leg.
// Each permit has 2 stages; stage 2 requires stage 1 to be purchased first.

import permitsData, { getPermitById as findPermitById, type PermitDef, type PermitEffect } from '../data/permits';
import type { ConsumableInstance } from './ConsumablesSystem';
import { divideScore, multiplyScore } from './scoreMath';
import type { HandType, ScoreResult } from './types';
import { getRunState, runActions } from './store/runStore';
import { rngPick } from './RunRng';

export type { PermitDef, PermitEffect };

// ─── Data Access ───

const ALL_PERMITS: PermitDef[] = permitsData;

/** Get all permit definitions */
export function getAllPermits(): PermitDef[] {
  return ALL_PERMITS;
}

/** Get a permit by its id */
export function getPermitById(id: string): PermitDef | null {
  return findPermitById(id) ?? null;
}

// ─── Availability Logic ───

/**
 * Get permits available for purchase given the set of already-purchased permit IDs.
 * Rules:
 * - Already-purchased permits are excluded
 * - Stage 2 permits only appear if their stage 1 prerequisite is purchased
 * - Stage 1 permits are always available (unless purchased)
 */
export function getAvailablePermits(purchasedIds: string[]): PermitDef[] {
  const purchased = new Set(purchasedIds);
  return ALL_PERMITS.filter((permit) => {
    // Already purchased — skip
    if (purchased.has(permit.id)) return false;
    // Stage 1 — always available
    if (permit.stage === 1) return true;
    // Stage 2 — only if prerequisite is purchased
    return permit.prerequisiteId != null && purchased.has(permit.prerequisiteId);
  });
}

/**
 * Generate a single random permit for the shop.
 * Returns null if all permits have been purchased.
 */
export function generateShopPermit(purchasedIds: string[]): PermitDef | null {
  const available = getAvailablePermits(purchasedIds);
  if (available.length === 0) return null;
  return rngPick('shop', available);
}

// ─── Effect Application ───

/**
 * Apply a permit's permanent effect to run store state.
 * Called immediately on purchase.
 */
export function applyPermitEffectToRun(permit: PermitDef, state = getRunState()): void {
  const effect = permit.effect;
  const patch: Partial<typeof state> = {};

  switch (effect.type) {
    case 'SHOP_SLOTS':
      patch.shopSlots = state.shopSlots + (effect.value as number);
      break;
    case 'CONSUMABLE_SLOTS':
      patch.maxConsumableSlots = state.maxConsumableSlots + (effect.value as number);
      break;
    case 'DAY_BONUS':
      patch.permitDayBonus = state.permitDayBonus + (effect.value as number);
      break;
    case 'REROLL_BONUS':
      patch.permitRerollBonus = state.permitRerollBonus + (effect.value as number);
      break;
    case 'INTEREST_CAP':
      patch.interestCap = effect.value as number;
      break;
    case 'EQUIPMENT_SLOTS':
      patch.maxEquipmentSlots = state.maxEquipmentSlots + (effect.value as number);
      break;
    case 'SHORTCUT':
      patch.permitDayPenalty = state.permitDayPenalty + (effect.dayPenalty ?? 0);
      patch.permitRerollPenalty = state.permitRerollPenalty + (effect.rerollPenalty ?? 0);
      patch.permitScoreReduction = state.permitScoreReduction + (effect.scoreLegReduction ?? 0);
      break;
    case 'HAND_SIZE':
      patch.handSize = state.handSize + (effect.value as number);
      break;
    default:
      break;
  }

  if (Object.keys(patch).length > 0) {
    runActions.patch(patch);
  }
}

// ─── Permit Query Helpers ───
// These check which permits the player has purchased and return derived values.

/** Get the current shop discount (0, 0.25, or 0.50) */
export function getPermitShopDiscount(purchasedIds: readonly string[]): number {
  if (purchasedIds.includes('estate_auction')) return 0.5;
  if (purchasedIds.includes('bargain_bin')) return 0.25;
  return 0;
}

/** Apply permit shop discount to a list price (matches camp shop pricing). */
export function getDiscountedShopPrice(baseCost: number, purchasedIds: string[]): number {
  const discount = getPermitShopDiscount(purchasedIds);
  if (discount <= 0) return baseCost;
  return Math.max(1, Math.floor(baseCost * (1 - discount)));
}

/** Get the shop reroll cost reduction ($0, $2, or $4) */
export function getPermitShopRerollDiscount(purchasedIds: string[]): number {
  let discount = 0;
  if (purchasedIds.includes('lucky_streak')) discount += 2;
  if (purchasedIds.includes('devils_luck')) discount += 2;
  return discount;
}

/** Get the aura chance multiplier (1, 2, or 4) */
export function getPermitAuraMultiplier(purchasedIds: string[]): number {
  if (purchasedIds.includes('sacred_ceremony')) return 4;
  if (purchasedIds.includes('spirit_ritual')) return 2;
  return 1;
}

/** Get supply card shop weight multiplier (1, 2, or 4) */
export function getPermitSupplyWeightMultiplier(purchasedIds: string[]): number {
  if (purchasedIds.includes('supply_baron')) return 4;
  if (purchasedIds.includes('camp_merchant')) return 2;
  return 1;
}

/** Get trail guide shop weight multiplier (1, 2, or 4) */
export function getPermitTrailGuideWeightMultiplier(purchasedIds: string[]): number {
  if (purchasedIds.includes('frontier_pathfinder')) return 4;
  if (purchasedIds.includes('trail_cartographer')) return 2;
  return 1;
}

/** Whether frontier cards can appear in supply packs (and the chance) */
export function getPermitFrontierInPacksChance(purchasedIds: string[]): number {
  if (purchasedIds.includes('infernal_vision')) return 0.2;
  return 0;
}

/** Whether trail guide targeting is active (Binoculars) */
export function hasPermitTrailGuideTargeting(purchasedIds: string[]): boolean {
  return purchasedIds.includes('binoculars');
}

/** Get trail guide mult bonus from Surveyor's Scope (0 or 1.5) */
export function getPermitTrailGuideMult(purchasedIds: string[]): number {
  if (purchasedIds.includes('surveyors_scope')) return 1.5;
  return 0;
}

/** Surveyor's Scope: x1.5 mult per matching trail guide in the consumable bar when that hand is scored. */
export function applySurveyorsScopeScoring(
  result: ScoreResult,
  handType: HandType,
  consumables: ConsumableInstance[],
  purchasedPermits: string[],
): ScoreResult {
  const xMult = getPermitTrailGuideMult(purchasedPermits);
  if (xMult <= 0) return result;

  const animEvents = [...result.animEvents];
  let mult = result.mult;
  const oldMult = mult;

  for (let i = 0; i < consumables.length; i++) {
    const c = consumables[i]!;
    if (c.def.category !== 'trail_guide' || c.def.handType !== handType) continue;
    mult = multiplyScore(mult, xMult);
    animEvents.push({
      target: { kind: 'consumable', consumableIndex: i },
      popupType: 'xmult',
      value: xMult,
    });
  }

  if (animEvents.length === result.animEvents.length) return result;

  const miles = multiplyScore(result.miles, divideScore(mult, oldMult));
  return { ...result, mult, miles, animEvents };
}

/** Whether enhanced dice can appear in shop */
export function hasPermitDiceInShop(purchasedIds: string[]): 'none' | 'enhanced' | 'stickered' {
  if (purchasedIds.includes('master_engraver')) return 'stickered';
  if (purchasedIds.includes('dice_carver')) return 'enhanced';
  return 'none';
}

/** Get boss reroll limit (-1 = unlimited, 0 = none, 1+ = limited) */
export function getPermitBossRerollLimit(purchasedIds: string[]): number {
  if (purchasedIds.includes('wanted_dead_or_alive')) return -1;
  if (purchasedIds.includes('bounty_board')) return 1;
  return 0;
}
