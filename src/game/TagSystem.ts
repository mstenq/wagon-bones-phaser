// ─── TagSystem (No Phaser imports) ───
// Tag pool selection, random tag generation, and immediate effect dispatch.

import { HandType } from './types';
import { getPlayerState } from './PlayerState';
import {
  generateRandomEquipment,
  createEquipmentInstance,
  EquipmentDef,
  getItemAuraById,
} from './ItemsSystem';
import { getTrailTagById } from '../data/trail_tags';
import trailTags, { TrailTagDef, TrailTagInstance, TagCategory } from '../data/trail_tags';

const ALL_TAGS: TrailTagDef[] = trailTags;

/** Get the weighted tag pool for the current leg */
export function getTagPool(leg: number): TrailTagDef[] {
  return ALL_TAGS.filter((t) => t.minLeg <= leg);
}

/** Select a random tag from the pool using weights */
export function selectRandomTag(leg: number): TrailTagDef {
  const pool = getTagPool(leg);
  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const tag of pool) {
    roll -= tag.weight;
    if (roll <= 0) return tag;
  }

  return pool[pool.length - 1];
}

/** Roll skip-reward tags for each remaining skippable round (1–2) this leg. */
export function refreshRoundSkipPreviewTags(player = getPlayerState()): void {
  player.roundSkipPreviewTags = {};
  for (let r = player.round; r <= 2; r++) {
    if (!player.skippedRoundsThisLeg.includes(r)) {
      player.roundSkipPreviewTags[r] = selectRandomTag(player.leg);
    }
  }
}

/** Fill in any missing skip previews (e.g. opening Journey Info mid-leg). */
export function ensureRoundSkipPreviewTags(player = getPlayerState()): void {
  for (let r = player.round; r <= 2; r++) {
    if (!player.skippedRoundsThisLeg.includes(r) && !player.roundSkipPreviewTags[r]) {
      player.roundSkipPreviewTags[r] = selectRandomTag(player.leg);
    }
  }
  for (const key of Object.keys(player.roundSkipPreviewTags)) {
    const r = Number(key);
    if (r < player.round || player.skippedRoundsThisLeg.includes(r)) {
      delete player.roundSkipPreviewTags[r];
    }
  }
}

/** Grant a tag to the player. Handles Twin Wagon stacking.
 *  Returns the granted tag instance (with copies reflecting Twin Wagon).
 *  Immediate tags are NOT auto-fired here — caller must dispatch them. */
export function grantTag(tagDef: TrailTagDef): TrailTagInstance {
  const player = getPlayerState();
  player.addTag(tagDef);

  if (tagDef.id === 'tag_twin_wagon') {
    return { def: tagDef, copies: 1 };
  }

  return player.pendingTags[player.pendingTags.length - 1];
}

export interface ImmediateTagResult {
  tagDef: TrailTagDef;
  copies: number;
  type: 'money' | 'upgrade';
  amount?: number;
  handType?: HandType;
  levelsGained?: number;
}

/** Process all immediate tags (money, packs, equipment, upgrades).
 *  Returns an array of effect results for the UI to animate. */
export function processImmediateTags(player = getPlayerState()): ImmediateTagResult[] {
  const results: ImmediateTagResult[] = [];

  const moneyTags = player.consumeTagsByCategory('immediate_money');
  for (const tag of moneyTags) {
    const result = processImmediateMoneyTag(tag, player);
    if (result) results.push(result);
  }

  const upgradeTags = player.consumeTagsByCategory('immediate_upgrade');
  for (const tag of upgradeTags) {
    const result = processImmediateUpgradeTag(tag, player);
    if (result) results.push(result);
  }

  return results;
}

function processImmediateMoneyTag(
  tag: TrailTagInstance,
  player = getPlayerState(),
): ImmediateTagResult | null {
  let amount = 0;

  for (let c = 0; c < tag.copies; c++) {
    switch (tag.def.id) {
      case 'tag_well_traveled':
        amount += player.daysScored;
        break;
      case 'tag_pack_rat':
        amount += player.unusedRerollsTotal;
        break;
      case 'tag_shortcut':
        amount += Math.max(5, player.roundsSkipped * 5);
        break;
      case 'tag_bank_deposit': {
        if (player.economy.balance < 0) {
          player.economy.setBalance(0);
        } else {
          amount += Math.min(player.economy.balance, 40);
        }
        break;
      }
    }
  }

  if (amount > 0) {
    player.economy.earn(amount);
  }

  return { tagDef: tag.def, copies: tag.copies, type: 'money', amount };
}

function processImmediateUpgradeTag(
  tag: TrailTagInstance,
  player = getPlayerState(),
): ImmediateTagResult | null {
  if (tag.def.id !== 'tag_surveyor') return null;

  const handTypes = Object.values(HandType);
  const randomHand = handTypes[Math.floor(Math.random() * handTypes.length)];
  const levels = 3 * tag.copies;
  player.upgradeHandLevel(randomHand, levels);

  return {
    tagDef: tag.def,
    copies: tag.copies,
    type: 'upgrade',
    handType: randomHand,
    levelsGained: levels,
  };
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
  /** Whether all initial stock should be $0 */
  freeShop: boolean;
  /** Whether first shop reroll is free */
  freeFirstReroll: boolean;
  /** Extra permit count to add */
  extraPermits: number;
}

const INJECT_TAG_RARITY: Record<string, 'uncommon' | 'rare'> = {
  tag_uncommon: 'uncommon',
  tag_rare: 'rare',
};

/** Remove up to `copies` from pending shop tags with a given id. */
export function consumeShopTagCopies(
  tagId: string,
  copies: number,
  player = getPlayerState(),
): number {
  let remaining = copies;

  player.pendingTags = player.pendingTags.flatMap((t) => {
    if (remaining <= 0 || t.def.id !== tagId || t.def.category !== 'shop') return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ def: t.def, copies: left }] : [];
  });

  return copies - remaining;
}

/** Shop stock row used when applying aura tags */
export interface ShopStockRow {
  type: string;
  def: EquipmentDef;
}

/** Remove up to `copies` from stored aura tags and/or pending shop_aura tags. */
export function consumeShopAuraTagCopies(
  tagId: string,
  copies: number,
  player = getPlayerState(),
): number {
  let remaining = copies;

  player.storedAuraTags = player.storedAuraTags.flatMap((t) => {
    if (remaining <= 0 || t.def.id !== tagId) return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ def: t.def, copies: left }] : [];
  });

  player.pendingTags = player.pendingTags.flatMap((t) => {
    if (remaining <= 0 || t.def.id !== tagId || t.def.category !== 'shop_aura') return [t];
    const take = Math.min(remaining, t.copies);
    remaining -= take;
    const left = t.copies - take;
    return left > 0 ? [{ def: t.def, copies: left }] : [];
  });

  return copies - remaining;
}

/** Collect pending + stored aura tags for display (grouped by id). */
export function getQueuedAuraTags(player = getPlayerState()): TrailTagInstance[] {
  const grouped = new Map<string, TrailTagInstance>();
  for (const tag of [...player.storedAuraTags, ...player.getTagsByCategory('shop_aura')]) {
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
export function applyInjectTagsToShopStock(
  stockItems: ShopStockRow[],
  player = getPlayerState(),
): number {
  const maxSlots = Math.max(1, Math.min(player.shopSlots, stockItems.length));
  let applied = 0;

  while (applied < maxSlots) {
    const injectTags = player
      .getTagsByCategory('shop')
      .filter((t) => t.def.id in INJECT_TAG_RARITY);
    if (injectTags.length === 0) break;

    const tag = injectTags[0];
    const rarity = INJECT_TAG_RARITY[tag.def.id];
    const item = generateRandomEquipment({ rarity });
    if (!item) break;

    stockItems[applied] = { type: 'equipment', def: { ...item, cost: 0 } };
    consumeShopTagCopies(tag.def.id, 1, player);
    applied++;
  }

  return applied;
}

/** Apply aura tags to base shop equipment, consuming only copies actually used. */
export function applyAuraTagsToShopStock(
  stockItems: ShopStockRow[],
  player = getPlayerState(),
): number {
  const queue: TrailTagInstance[] = [
    ...player.storedAuraTags,
    ...player.getTagsByCategory('shop_aura'),
  ];
  player.storedAuraTags = [];

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
      consumeShopAuraTagCopies(tag.def.id, applied, player);
      totalApplied += applied;
    }

    const leftover = tag.copies - applied;
    if (leftover > 0) {
      if (applied === 0) {
        player.storedAuraTags.push({ def: tag.def, copies: leftover });
        consumeShopAuraTagCopies(tag.def.id, leftover, player);
      }
      // Partial apply: remainder stays in pendingTags via consumeShopAuraTagCopies only taking `applied`
    }
  }

  return totalApplied;
}

const AURA_TAG_IDS: Record<string, string> = {
  tag_ghost: 'ghost',
  tag_icy: 'icy',
  tag_fire: 'fire',
  tag_holy: 'holy',
};

/** Apply per-visit shop flags (free shop, reroll, permit). One copy consumed per effect. */
export function processShopTags(player = getPlayerState()): ShopTagModifications {
  const mods: ShopTagModifications = {
    freeShop: false,
    freeFirstReroll: false,
    extraPermits: 0,
  };

  for (const tag of player.getTagsByCategory('shop')) {
    switch (tag.def.id) {
      case 'tag_company_store':
        if (!mods.freeShop) {
          mods.freeShop = true;
          consumeShopTagCopies(tag.def.id, 1, player);
        }
        break;
      case 'tag_free_reroll':
        if (!mods.freeFirstReroll) {
          mods.freeFirstReroll = true;
          consumeShopTagCopies(tag.def.id, 1, player);
        }
        break;
      case 'tag_permit':
        mods.extraPermits += 1;
        consumeShopTagCopies(tag.def.id, 1, player);
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
export function processJunkPileTag(
  tag: TrailTagInstance,
  player = getPlayerState(),
): EquipmentDef[] {
  const created: EquipmentDef[] = [];
  const count = 2 * tag.copies;

  for (let i = 0; i < count; i++) {
    if (player.equipmentSlotsFree <= 0) break;
    const item = generateRandomEquipment({ rarity: 'common' });
    if (item) {
      player.equipment.push(createEquipmentInstance(item, player.purchasedPermits));
      created.push(item);
    }
  }

  return created;
}

/** Consume next-round tags and apply bonuses before the round starts. */
export function consumeNextRoundTags(player = getPlayerState()): void {
  const tags = player.consumeTagsByCategory('next_round');
  for (const tag of tags) {
    if (tag.def.id === 'tag_wide_saddle') {
      player.wideSaddleBonus += 3 * tag.copies;
    }
  }
}

/** Bounty Payout: consume investment boss tags and return bonus money. */
export function processBossPayoutTags(player = getPlayerState()): number {
  let bonus = 0;
  const remaining: TrailTagInstance[] = [];

  for (const tag of player.pendingTags) {
    if (tag.def.category === 'boss' && tag.def.id === 'tag_investment') {
      bonus += 25 * tag.copies;
    } else {
      remaining.push(tag);
    }
  }

  player.pendingTags = remaining;
  return bonus;
}
