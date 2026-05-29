// ─── TagSystem (No Phaser imports) ───
// Tag pool selection, random tag generation, and immediate effect dispatch.

import { buildHandUpgradeInfo } from './handStatsHelpers';
import { HandType, type HandUpgradeInfo } from './types';
import { getRunState, runActions, runStore } from './store/runStore';
import {
  selectHandStats,
  selectPendingTags,
  selectStoredAuraTags,
  selectTagsByCategory,
  selectEquipmentSlotsFree,
} from './store/selectors/runSelectors';
import { tagActions } from './store/actions/tagActions';
import { economyActions } from './store/actions/economyActions';
import { progressionActions } from './store/actions/progressionActions';
import { equipmentActions } from './store/actions/equipmentActions';
import { bossActions } from './store/actions/bossActions';
import { resolveEquipmentList } from './store/resolve';
import type { RunState } from './store/types';
import { generateRandomEquipment, EquipmentDef, getItemAuraById } from './ItemsSystem';
import { acquireRewardEquipmentInstance } from './EquipmentModifiers';
import { getTrailTagById } from '../data/trail_tags';
import trailTags, { TrailTagDef, TrailTagInstance, TagCategory, type RoundSkipPreviewMeta } from '../data/trail_tags';
import { rngFloat, rngPick } from './RunRng';

const ALL_TAGS: TrailTagDef[] = trailTags;

/** Run store is the source of truth; legacy PlayerState args are ignored. */
function currentRun(_legacy?: unknown): RunState {
  void _legacy;
  return getRunState();
}

/** Get the weighted tag pool for the current leg */
export function getTagPool(leg: number): TrailTagDef[] {
  return ALL_TAGS.filter((t) => t.minLeg <= leg);
}

/** Select a random tag from the pool using weights */
export function selectRandomTag(leg: number): TrailTagDef {
  const pool = getTagPool(leg);
  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = rngFloat('tags') * totalWeight;

  for (const tag of pool) {
    roll -= tag.weight;
    if (roll <= 0) return tag;
  }

  return pool[pool.length - 1];
}

/** Roll skip-preview tag id + metadata (e.g. Surveyor's Mark hand target). */
export function rollSkipPreviewForLeg(leg: number): { tagId: string; meta: RoundSkipPreviewMeta } {
  const tag = selectRandomTag(leg);
  const meta: RoundSkipPreviewMeta = {};
  if (tag.id === 'tag_surveyor') {
    meta.surveyorHand = rngPick('tags', Object.values(HandType));
  }
  return { tagId: tag.id, meta };
}

/** Roll skip-reward tags for each remaining skippable round (1–2) this leg. */
export function refreshRoundSkipPreviewTags(_legacy?: unknown): void {
  const run = currentRun(_legacy);
  const roundSkipPreviewTags: Partial<Record<number, string>> = {};
  const roundSkipPreviewMeta: Partial<Record<number, RoundSkipPreviewMeta>> = {};
  for (let r = run.round; r <= 2; r++) {
    if (!run.skippedRoundsThisLeg.includes(r)) {
      const preview = rollSkipPreviewForLeg(run.leg);
      roundSkipPreviewTags[r] = preview.tagId;
      if (preview.meta.surveyorHand) {
        roundSkipPreviewMeta[r] = preview.meta;
      }
    }
  }
  runActions.patch({ roundSkipPreviewTags, roundSkipPreviewMeta });
}

/** Fill in any missing skip previews (e.g. opening Journey Info mid-leg). */
export function ensureRoundSkipPreviewTags(_legacy?: unknown): void {
  const run = currentRun(_legacy);
  const roundSkipPreviewTags = { ...run.roundSkipPreviewTags };
  const roundSkipPreviewMeta = { ...run.roundSkipPreviewMeta };
  for (let r = run.round; r <= 2; r++) {
    if (!run.skippedRoundsThisLeg.includes(r) && !roundSkipPreviewTags[r]) {
      const preview = rollSkipPreviewForLeg(run.leg);
      roundSkipPreviewTags[r] = preview.tagId;
      if (preview.meta.surveyorHand) {
        roundSkipPreviewMeta[r] = preview.meta;
      }
    }
  }
  for (const key of Object.keys(roundSkipPreviewTags)) {
    const r = Number(key);
    if (r < run.round || run.skippedRoundsThisLeg.includes(r)) {
      delete roundSkipPreviewTags[r];
      delete roundSkipPreviewMeta[r];
    }
  }
  runActions.patch({ roundSkipPreviewTags, roundSkipPreviewMeta });
}

/** Grant a tag to the player. Handles Twin Wagon stacking.
 *  Returns the granted tag instance (with copies reflecting Twin Wagon).
 *  Immediate tags are NOT auto-fired here — caller must dispatch them. */
export function grantTag(tagDef: TrailTagDef, meta?: RoundSkipPreviewMeta): TrailTagInstance {
  tagActions.addTag(tagDef, meta);

  if (tagDef.id === 'tag_twin_wagon') {
    return { def: tagDef, copies: 1 };
  }

  const pending = selectPendingTags(getRunState());
  return pending[pending.length - 1]!;
}

export interface ImmediateTagResult {
  tagDef: TrailTagDef;
  copies: number;
  type: 'money' | 'upgrade';
  amount?: number;
  handType?: HandType;
  levelsGained?: number;
  handUpgrade?: HandUpgradeInfo;
}

/** Process all immediate tags (money, packs, equipment, upgrades).
 *  Returns an array of effect results for the UI to animate. */
export function processImmediateTags(_legacy?: unknown): ImmediateTagResult[] {
  const run = currentRun(_legacy);
  const results: ImmediateTagResult[] = [];

  const moneyTags = tagActions.consumeTagsByCategory('immediate_money');
  for (const tag of moneyTags) {
    const result = processImmediateMoneyTag(tag, run);
    if (result) results.push(result);
  }

  const upgradeTags = tagActions.consumeTagsByCategory('immediate_upgrade');
  for (const tag of upgradeTags) {
    const result = processImmediateUpgradeTag(tag);
    if (result) results.push(result);
  }

  return results;
}

function processImmediateMoneyTag(tag: TrailTagInstance, run: RunState): ImmediateTagResult | null {
  let amount = 0;

  for (let c = 0; c < tag.copies; c++) {
    switch (tag.def.id) {
      case 'tag_well_traveled':
        amount += run.daysScored;
        break;
      case 'tag_pack_rat':
        amount += run.unusedRerollsTotal;
        break;
      case 'tag_shortcut':
        amount += Math.max(5, run.roundsSkipped * 5);
        break;
      case 'tag_bank_deposit': {
        if (run.balance < 0) {
          economyActions.setBalance(0);
        } else {
          amount += Math.min(run.balance, 40);
        }
        break;
      }
    }
  }

  if (amount > 0) {
    economyActions.earn(amount);
  }

  return { tagDef: tag.def, copies: tag.copies, type: 'money', amount };
}

function processImmediateUpgradeTag(tag: TrailTagInstance): ImmediateTagResult | null {
  if (tag.def.id !== 'tag_surveyor') return null;

  const run = getRunState();
  const handTypes = Object.values(HandType);
  const targetHand = tag.surveyorHand ?? rngPick('tags', handTypes);
  const levels = 3 * tag.copies;
  const stats = selectHandStats(run, targetHand);
  const oldLevel = stats.level;
  progressionActions.upgradeHandLevel(targetHand, levels);
  const newLevel = selectHandStats(getRunState(), targetHand).level;
  const handUpgrade = buildHandUpgradeInfo(targetHand, oldLevel, newLevel, stats);

  return {
    tagDef: tag.def,
    copies: tag.copies,
    type: 'upgrade',
    handType: targetHand,
    levelsGained: levels,
    handUpgrade: handUpgrade ?? undefined,
  };
}

/** Flatten consumed immediate_pack tags into pack opens (honors Twin Wagon copies). */
export function expandImmediatePackTagsToPackDefIds(tags: TrailTagInstance[]): string[] {
  const packDefIds: string[] = [];
  for (const tag of tags) {
    const packDefId = getPackDefIdForTag(tag.def.id);
    if (!packDefId) continue;
    for (let c = 0; c < tag.copies; c++) {
      packDefIds.push(packDefId);
    }
  }
  return packDefIds;
}

/** Get the pack definition ID for a pack tag */
export function getPackDefIdForTag(tagId: string): string | null {
  switch (tagId) {
    case 'tag_dice_mega':
      return 'dice_mega';
    case 'tag_supply_mega':
      return 'supply_mega';
    case 'tag_trail_guide_mega':
      return 'trail_guide_mega';
    case 'tag_equipment_mega':
      return 'equipment_mega';
    case 'tag_frontier':
      return 'frontier_standard';
    default:
      return null;
  }
}

/** Check if a tag fires immediately (no shop/boss wait) */
export function isImmediateTag(category: TagCategory): boolean {
  return category.startsWith('immediate_');
}

/** Check if a tag is pending for the shop */
export function isShopTag(category: TagCategory): boolean {
  return category === 'shop' || category === 'shop_aura';
}

export interface ShopTagModifications {
  freeShop: boolean;
  freeFirstReroll: boolean;
  extraPermits: number;
}

const INJECT_TAG_RARITY: Record<string, 'uncommon' | 'rare'> = {
  tag_uncommon: 'uncommon',
  tag_rare: 'rare',
};

/** Remove up to `copies` from pending shop tags with a given id. */
export function consumeShopTagCopies(tagId: string, copies: number, _legacy?: unknown): number {
  const run = currentRun(_legacy);
  let remaining = copies;
  const pendingTags = run.pendingTags.flatMap((t) => {
    if (remaining <= 0 || t.tagId !== tagId) return [t];
    const def = getTrailTagById(t.tagId);
    if (!def || def.category !== 'shop') return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ tagId: t.tagId, copies: left }] : [];
  });
  runActions.patch({ pendingTags });
  return copies - remaining;
}

/** Shop stock row used when applying aura tags */
export interface ShopStockRow {
  type: string;
  def: EquipmentDef;
}

/** Remove up to `copies` from stored aura tags and/or pending shop_aura tags. */
export function consumeShopAuraTagCopies(tagId: string, copies: number, _legacy?: unknown): number {
  const run = currentRun(_legacy);
  let remaining = copies;

  const storedAuraTags = run.storedAuraTags.flatMap((t) => {
    if (remaining <= 0 || t.tagId !== tagId) return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ tagId: t.tagId, copies: left }] : [];
  });

  const pendingTags = run.pendingTags.flatMap((t) => {
    if (remaining <= 0 || t.tagId !== tagId) return [t];
    const def = getTrailTagById(t.tagId);
    if (!def || def.category !== 'shop_aura') return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ tagId: t.tagId, copies: left }] : [];
  });

  runActions.patch({ storedAuraTags, pendingTags });
  return copies - remaining;
}

/** Collect pending + stored aura tags for display (grouped by id). */
export function getQueuedAuraTags(_legacy?: unknown): TrailTagInstance[] {
  const run = currentRun(_legacy);
  const grouped = new Map<string, TrailTagInstance>();
  for (const tag of [...selectStoredAuraTags(run), ...selectTagsByCategory(run, 'shop_aura')]) {
    const existing = grouped.get(tag.def.id);
    if (existing) {
      existing.copies += tag.copies;
    } else {
      grouped.set(tag.def.id, { def: tag.def, copies: tag.copies });
    }
  }
  return [...grouped.values()];
}

/** Replace shop stock slots with free uncommon/rare equipment, up to shopSlots per visit. */
export function applyInjectTagsToShopStock(stockItems: ShopStockRow[], _legacy?: unknown): number {
  let run = currentRun(_legacy);
  const maxSlots = Math.max(1, Math.min(run.shopSlots, stockItems.length));
  let applied = 0;

  while (applied < maxSlots) {
    const injectTags = selectTagsByCategory(run, 'shop').filter((t) => t.def.id in INJECT_TAG_RARITY);
    if (injectTags.length === 0) break;

    const tag = injectTags[0];
    const rarity = INJECT_TAG_RARITY[tag.def.id];
    const item = generateRandomEquipment({ rarity });
    if (!item) break;

    stockItems[applied] = { type: 'equipment', def: { ...item, cost: 0 } };
    consumeShopTagCopies(tag.def.id, 1, run);
    applied++;
    run = getRunState();
  }

  return applied;
}

const AURA_TAG_IDS: Record<string, string> = {
  tag_ghost: 'ghost',
  tag_icy: 'icy',
  tag_fire: 'fire',
  tag_holy: 'holy',
};

/** Apply aura tags to base shop equipment, consuming only copies actually used. */
export function applyAuraTagsToShopStock(stockItems: ShopStockRow[], _legacy?: unknown): number {
  let run = currentRun(_legacy);
  const queue: TrailTagInstance[] = [...selectStoredAuraTags(run), ...selectTagsByCategory(run, 'shop_aura')];
  runActions.patch({ storedAuraTags: [] });

  let totalApplied = 0;

  for (const tag of queue) {
    const auraId = AURA_TAG_IDS[tag.def.id];
    if (!auraId) continue;

    const aura = getItemAuraById(auraId);
    if (!aura) continue;

    let applied = 0;
    for (const stockItem of stockItems) {
      if (applied >= tag.copies) break;
      if (stockItem.type === 'equipment' && !stockItem.def.aura) {
        stockItem.def = { ...stockItem.def, aura, cost: 0 };
        applied++;
      }
    }

    if (applied > 0) {
      consumeShopAuraTagCopies(tag.def.id, applied, run);
      totalApplied += applied;
      run = getRunState();
    }

    const leftover = tag.copies - applied;
    if (leftover > 0 && applied === 0) {
      runStore.setState((s) => ({
        storedAuraTags: [...s.storedAuraTags, { tagId: tag.def.id, copies: leftover }],
      }));
      consumeShopAuraTagCopies(tag.def.id, leftover, getRunState());
    }
  }

  return totalApplied;
}

/** Apply per-visit shop flags (free shop, reroll, permit). One copy consumed per effect. */
export function processShopTags(_legacy?: unknown): ShopTagModifications {
  let run = currentRun(_legacy);
  const mods: ShopTagModifications = {
    freeShop: false,
    freeFirstReroll: false,
    extraPermits: 0,
  };

  for (const tag of selectTagsByCategory(run, 'shop')) {
    switch (tag.def.id) {
      case 'tag_company_store':
        if (!mods.freeShop) {
          mods.freeShop = true;
          consumeShopTagCopies(tag.def.id, 1, run);
          run = getRunState();
        }
        break;
      case 'tag_free_reroll':
        if (!mods.freeFirstReroll) {
          mods.freeFirstReroll = true;
          consumeShopTagCopies(tag.def.id, 1, run);
          run = getRunState();
        }
        break;
      case 'tag_permit':
        mods.extraPermits += 1;
        consumeShopTagCopies(tag.def.id, 1, run);
        run = getRunState();
        break;
      default:
        break;
    }
  }

  return mods;
}

/** Map aura override id back to trail tag def for banking unapplied copies. */
export function getAuraTagDefForAuraId(auraId: string): TrailTagDef | undefined {
  const tagId = Object.entries(AURA_TAG_IDS).find(([, id]) => id === auraId)?.[0];
  return tagId ? getTrailTagById(tagId) : undefined;
}

/** Junk Pile: create up to 2 Common equipment per copy (if space allows). */
export function processJunkPileTag(tag: TrailTagInstance, _legacy?: unknown): EquipmentDef[] {
  let run = currentRun(_legacy);
  const created: EquipmentDef[] = [];
  const count = 2 * tag.copies;

  for (let i = 0; i < count; i++) {
    if (selectEquipmentSlotsFree(run) <= 0) break;
    const item = generateRandomEquipment({ rarity: 'common' });
    if (item) {
      const list = resolveEquipmentList();
      equipmentActions.setEquipment([...list, acquireRewardEquipmentInstance(item, run.purchasedPermits)]);
      created.push(item);
      run = getRunState();
    }
  }

  return created;
}

/** Consume next-round tags and apply bonuses before the round starts. */
export function consumeNextRoundTags(_legacy?: unknown): void {
  void _legacy;
  const tags = tagActions.consumeTagsByCategory('next_round');
  let wideSaddleBonus = getRunState().wideSaddleBonus;
  for (const tag of tags) {
    if (tag.def.id === 'tag_wide_saddle') {
      wideSaddleBonus += 3 * tag.copies;
    }
  }
  if (wideSaddleBonus !== getRunState().wideSaddleBonus) {
    runActions.patch({ wideSaddleBonus });
  }
}

/** Change of Guard: immediately reroll this leg's boss and consume tag_boss copies. */
export function processChangeOfGuardTags(_legacy?: unknown): number {
  const run = currentRun(_legacy);
  const bossTags = run.pendingTags.filter((t) => t.tagId === 'tag_boss');
  if (bossTags.length === 0) return 0;

  runActions.patch({ pendingTags: run.pendingTags.filter((t) => t.tagId !== 'tag_boss') });

  let rerolls = 0;
  for (const tag of bossTags) {
    for (let c = 0; c < tag.copies; c++) {
      if (bossActions.rerollBossForLeg()) rerolls++;
    }
  }
  return rerolls;
}

/** Bounty Payout: consume investment boss tags and return bonus money. */
export function processBossPayoutTags(_legacy?: unknown): number {
  const run = currentRun(_legacy);
  let bonus = 0;
  const pendingTags = run.pendingTags.filter((t) => {
    const def = getTrailTagById(t.tagId);
    if (def?.category === 'boss' && t.tagId === 'tag_investment') {
      bonus += 25 * t.copies;
      return false;
    }
    return true;
  });

  runActions.patch({ pendingTags });
  return bonus;
}
