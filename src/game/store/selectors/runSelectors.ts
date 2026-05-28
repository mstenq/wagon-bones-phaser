// ─── Run store selectors (No Phaser imports) ───
// Derived values from RunState; accept state explicitly for testability.

import type { Die, HandStats, HandType, TagCategory } from '../../types';
import { GAMEPLAY } from '../../Constants';
import bosses from '../../../data/bosses';
import type { BossDef } from '../../types';
import { getProfessionById } from '../../../data/professions';
import { getTrailTagById } from '../../../data/trail_tags';
import type { RoundSkipPreviewMeta, TrailTagDef, TrailTagInstance } from '../../../data/trail_tags';
import { getTrailEventById } from '../../TrailEventsSystem';
import type { TrailEventDef } from '../../../data/trail_events';
import { getPermitBossRerollLimit, getPermitShopRerollDiscount } from '../../PermitsSystem';
import { getConfigModifiers } from '../../EquipmentEffects';
import { computeRoundReward, computeTargetMiles } from '../../runProgression';
import { resolveConsumableList, resolveEquipmentList } from '../resolve';
import type { RunState } from '../types';
import { canAfford, hasBankNote, selectDebtLimit, selectMinBalance } from '../economy';

export function selectProfession(state: RunState) {
  return state.professionId ? getProfessionById(state.professionId) : null;
}

/** True when the item id is the active profession's signature special equipment. */
export function selectIsProfessionSpecialEquipment(state: RunState, itemId: string): boolean {
  const specialId = selectProfession(state)?.specialEquipment?.id;
  return specialId !== undefined && specialId === itemId;
}

export function selectAvailableDice(state: RunState): Die[] {
  const spent = new Set(state.spentDiceIds);
  return state.dice.filter((d) => !spent.has(d.id));
}

export function selectSpentDice(state: RunState): Die[] {
  const spent = new Set(state.spentDiceIds);
  return state.dice.filter((d) => spent.has(d.id));
}

export function selectAllDiceSpent(state: RunState): boolean {
  return state.dice.length > 0 && state.spentDiceIds.length >= state.dice.length;
}

export function selectRefreshCost(state: RunState): number {
  return selectAvailableDice(state).length;
}

export function selectEffectiveDays(state: RunState): number {
  const prof = selectProfession(state);
  const profMods = prof?.modifiers as Record<string, unknown> | undefined;
  const profDays = typeof profMods?.days === 'number' ? profMods.days : 0;
  const days =
    GAMEPLAY.MAX_DAYS + state.permitDayBonus - state.permitDayPenalty + profDays - state.trailEventModifiers.dayPenalty;
  return Math.max(1, days);
}

export function selectEffectiveRerolls(state: RunState): number {
  if (state.trailEventModifiers.loseAllRerolls) return 0;
  const prof = selectProfession(state);
  const profMods = prof?.modifiers as Record<string, unknown> | undefined;
  const profRerolls = typeof profMods?.rerolls === 'number' ? profMods.rerolls : 0;
  let rerolls =
    GAMEPLAY.MAX_REROLLS +
    state.permitRerollBonus -
    state.permitRerollPenalty +
    profRerolls -
    state.trailEventModifiers.rerollPenalty;
  if (state.difficulty >= 5) rerolls -= 1;
  return Math.max(0, rerolls);
}

export function selectUsedEquipmentSlots(state: RunState): number {
  return resolveEquipmentList(state).filter((e) => e.def.aura?.id !== 'ghost').length;
}

export function selectEquipmentSlotsFree(state: RunState): number {
  return state.maxEquipmentSlots - selectUsedEquipmentSlots(state);
}

export function selectUsedConsumableSlots(state: RunState): number {
  return resolveConsumableList(state).filter((c) => c.def.aura?.id !== 'ghost').length;
}

export function selectConsumableSlotsFree(state: RunState): number {
  return state.maxConsumableSlots - selectUsedConsumableSlots(state);
}

export function selectHasLuckyNumberEquipment(state: RunState): boolean {
  return resolveEquipmentList(state).some((e) => e.def.id === 'lucky_number');
}

export function selectLuckyNumberPip(state: RunState): number | null {
  const lucky =
    resolveEquipmentList(state).find((e) => e.def.id === 'lucky_number') ??
    resolveEquipmentList(state).find((e) => e.def.id === 'lucky_number');
  const pip = lucky?.state.pip;
  if (typeof pip !== 'number' || pip < 1 || pip > 12) return null;
  return pip;
}

export function selectResolvedLoadedDieTarget(state: RunState): number | null {
  if (state.loadedDieSyncLucky && selectHasLuckyNumberEquipment(state)) {
    return selectLuckyNumberPip(state) ?? state.loadedDieTarget;
  }
  return state.loadedDieTarget;
}

export function selectTrailGuidesFree(state: RunState): boolean {
  return resolveEquipmentList(state).some((e) => e.def.effectType === 'EXPLORER_GUILD');
}

type ShopFreeRerollSource = 'tag' | 'shop_pass' | 'coupon';
type ShopFreeRerollSlot = ShopFreeRerollSource | null;

/** Build the free reroll queue for the current shop visit (tag → shop pass → coupon books). */
export function buildShopFreeRerollPlan(state: RunState): ShopFreeRerollSlot[] {
  const plan: ShopFreeRerollSlot[] = [];
  if (state.tagFreeReroll) plan.push('tag');
  const shopPassCopies = state.statusTraitTokens.find((t) => t.id === 'shop_pass')?.copies ?? 0;
  for (let i = 0; i < shopPassCopies; i++) plan.push('shop_pass');
  const coupons = getConfigModifiers(resolveEquipmentList(state)).freeShopRerolls;
  for (let i = 0; i < coupons; i++) plan.push('coupon');
  return plan;
}

function resolveShopFreeRerollPlan(state: RunState): ShopFreeRerollSlot[] {
  // Past indices (< shopRerollCount) are persisted on `state.shopFreeRerollPlan`
  // by `payShopReroll`. Any missing entries are treated as paid (null).
  const pastSlots: ShopFreeRerollSlot[] = Array.from({ length: state.shopRerollCount }, (_, i) => {
    return state.shopFreeRerollPlan[i] ?? null;
  });

  // Remaining future sources are derived from current run flags/tokens.
  const tagRemaining: ShopFreeRerollSource[] = state.tagFreeReroll && !pastSlots.includes('tag') ? ['tag'] : [];

  const shopPassCopies = state.statusTraitTokens.find((t) => t.id === 'shop_pass')?.copies ?? 0;
  const shopPassRemaining = Array.from({ length: shopPassCopies }, () => 'shop_pass' as const);

  // Coupons are equipment-driven and don't decrement in state, so infer "used" from
  // what we've already persisted for earlier rerolls.
  const totalCoupons = getConfigModifiers(resolveEquipmentList(state)).freeShopRerolls;
  const usedCoupons = pastSlots.filter((s) => s === 'coupon').length;
  const couponRemainingCount = Math.max(0, totalCoupons - usedCoupons);
  const couponsRemaining = Array.from({ length: couponRemainingCount }, () => 'coupon' as const);

  // Priority: tag → shop pass → coupon books.
  return [...pastSlots, ...tagRemaining, ...shopPassRemaining, ...couponsRemaining];
}

/** Which free reroll source applies at the current shopRerollCount (paid rerolls return null). */
export function selectShopRerollFreeSource(state: RunState): ShopFreeRerollSource | null {
  const plan = resolveShopFreeRerollPlan(state);
  if (state.shopRerollCount < plan.length) {
    return plan[state.shopRerollCount] ?? null;
  }
  return null;
}

export function selectShopRerollCost(state: RunState): number {
  if (selectShopRerollFreeSource(state) !== null) return 0;
  const plan = resolveShopFreeRerollPlan(state);
  const discount = getPermitShopRerollDiscount(state.purchasedPermits);
  const freeSoFar = plan.slice(0, state.shopRerollCount).filter((s) => s !== null).length;
  const paidRerollIndex = state.shopRerollCount - freeSoFar;
  return Math.max(0, GAMEPLAY.SHOP_REROLL_COST + paidRerollIndex - discount);
}

export function selectIsBossRound(state: RunState): boolean {
  return state.round === GAMEPLAY.ROUNDS_PER_LEG;
}

export function selectTotalRound(state: RunState): number {
  return (state.leg - 1) * GAMEPLAY.ROUNDS_PER_LEG + state.round;
}

export function selectRoundReward(state: RunState): number {
  return computeRoundReward(state.round, state.difficulty);
}

export function selectBossForLeg(state: RunState, leg: number): BossDef | null {
  if (state.bossAssignmentIds.length === 0) return null;
  const id = state.bossAssignmentIds[leg - 1];
  if (!id) return null;
  return bosses.find((b) => b.id === id) ?? null;
}

export function selectCurrentBoss(state: RunState): BossDef | null {
  if (!selectIsBossRound(state)) return null;
  return selectBossForLeg(state, state.leg);
}

export function selectBlindSizeMultiplier(state: RunState): number {
  return selectProfession(state)?.modifiers?.blindSizeMultiplier ?? 1;
}

export function selectTargetMiles(state: RunState) {
  const boss = state.round === GAMEPLAY.ROUNDS_PER_LEG ? selectBossForLeg(state, state.leg) : null;
  return computeTargetMiles(
    state.leg,
    state.round,
    state.permitScoreReduction,
    state.difficulty,
    boss,
    selectBlindSizeMultiplier(state),
  );
}

export function selectJourneyComplete(state: RunState): boolean {
  if (state.leg > GAMEPLAY.MAX_LEGS) return true;
  if (state.storyVictoryPending && !state.endlessMode) return true;
  return false;
}

export function selectStoryVictoryOffered(state: RunState): boolean {
  return state.storyVictoryPending && !state.endlessMode;
}

export function selectIsFirstShopVisit(state: RunState): boolean {
  return state.leg === 1 && state.round === 2;
}

export function selectHandStats(state: RunState, type: HandType): HandStats {
  return (
    state.handStats[type] ?? {
      level: 1,
      timesPlayed: 0,
      milesPerLevel: 10,
      multPerLevel: 1,
    }
  );
}

export function selectPendingTrailEvent(state: RunState): TrailEventDef | null {
  if (!state.pendingTrailEventId) return null;
  return getTrailEventById(state.pendingTrailEventId);
}

function storedTagToInstance({
  tagId,
  copies,
  surveyorHand,
}: RunState['pendingTags'][number]): TrailTagInstance | null {
  const def = getTrailTagById(tagId);
  if (!def) return null;
  const inst: TrailTagInstance = { def, copies };
  if (surveyorHand) inst.surveyorHand = surveyorHand;
  return inst;
}

export function selectPendingTags(state: RunState): TrailTagInstance[] {
  return state.pendingTags.map(storedTagToInstance).filter((t): t is TrailTagInstance => t !== null);
}

export function selectStoredAuraTags(state: RunState): TrailTagInstance[] {
  return state.storedAuraTags.map(storedTagToInstance).filter((t): t is TrailTagInstance => t !== null);
}

export function selectSkippedTagForRound(state: RunState, round: number): TrailTagDef | undefined {
  const id = state.skippedRoundTags[round];
  return id ? getTrailTagById(id) : undefined;
}

export function selectSkipPreviewTagForRound(state: RunState, round: number): TrailTagDef | undefined {
  const id = state.roundSkipPreviewTags[round];
  return id ? getTrailTagById(id) : undefined;
}

export function selectSkipPreviewMetaForRound(state: RunState, round: number): RoundSkipPreviewMeta | undefined {
  return state.roundSkipPreviewMeta[round];
}

export function selectSkippedTagMetaForRound(state: RunState, round: number): RoundSkipPreviewMeta | undefined {
  return state.skippedRoundTagMeta[round];
}

/** Description context for a skip-preview or skipped-round tag tooltip. */
export function selectTagDescriptionContextForRound(state: RunState, round: number): RoundSkipPreviewMeta {
  return state.roundSkipPreviewMeta[round] ?? state.skippedRoundTagMeta[round] ?? {};
}

export function selectTagsByCategory(state: RunState, category: TagCategory): TrailTagInstance[] {
  return selectPendingTags(state).filter((t) => t.def.category === category);
}

/** Revision token for purchased permit ids (store subscribers). */
export function selectPurchasedPermitsRevision(state: RunState): string {
  return state.purchasedPermits.join('|');
}

export function selectBossPermitRerollLimit(state: RunState): number {
  return getPermitBossRerollLimit(state.purchasedPermits);
}

export function selectCanBossPermitReroll(state: RunState): boolean {
  const limit = selectBossPermitRerollLimit(state);
  if (limit === 0) return false;
  if (limit === -1) return true;
  return state.bossRerollsUsedThisLeg < limit;
}

export { canAfford, hasBankNote, selectDebtLimit, selectMinBalance };
