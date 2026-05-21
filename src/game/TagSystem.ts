// ─── TagSystem (No Phaser imports) ───
// Tag pool selection, random tag generation, and immediate effect dispatch.

import { HandType } from './types';
import { getPlayerState } from './PlayerState';
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
  return category.startsWith('immediate_') || category === 'next_round';
}

/** Check if a tag is pending for the shop */
export function isShopTag(category: TagCategory): boolean {
  return category === 'shop' || category === 'shop_aura';
}
