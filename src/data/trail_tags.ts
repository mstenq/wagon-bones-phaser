// ─── Trail Tag Definitions ───
// Typed tag data following the items.ts pattern.
// Each tag defines its pool weight, unlock leg, and category for dispatch.

import type { HandType } from '../game/types';
import { getHandByType } from './hands';

// ─── Types ───

export type TagCategory =
  | 'shop' // fires when entering next shop
  | 'shop_aura' // applies aura to shop equipment (may bank if no base equipment)
  | 'boss' // fires at next boss round
  | 'immediate_pack' // opens a free pack immediately
  | 'immediate_money' // grants money immediately
  | 'immediate_equipment' // creates equipment immediately
  | 'immediate_upgrade' // upgrades a hand immediately
  | 'next_round' // applies to the next round played
  | 'meta'; // modifies the next tag (Twin Wagon)

/** Context for dynamic tag descriptions (skip preview, pending tags, tooltips). */
export interface TagDescriptionContext {
  /** Pre-rolled hand for Surveyor's Mark (skip preview or pending tag). */
  surveyorHand?: HandType;
}

export type TagDescription = string | ((ctx: TagDescriptionContext) => string);

export interface TrailTagDef {
  id: string;
  name: string;
  description: TagDescription;
  category: TagCategory;
  minLeg: number; // earliest leg this tag can appear
  weight: number; // selection weight in the pool
}

export interface TrailTagInstance {
  def: TrailTagDef;
  /** Number of copies (Twin Wagon stacking) */
  copies: number;
  /** Pre-rolled upgrade target for Surveyor's Mark. */
  surveyorHand?: HandType;
}

/** Metadata rolled with a skip-preview tag (e.g. Surveyor's Mark hand target). */
export interface RoundSkipPreviewMeta {
  surveyorHand?: HandType;
}

export function resolveTagDescription(def: TrailTagDef, ctx: TagDescriptionContext = {}): string {
  if (typeof def.description === 'function') {
    return def.description(ctx);
  }
  return def.description;
}

// ─── Tag Definitions ───

const trailTags: TrailTagDef[] = [
  // ─── Shop Tags ───
  {
    id: 'tag_uncommon',
    name: "Outfitter's Pick",
    description: 'Next camp shop includes one free Uncommon equipment.',
    category: 'shop',
    minLeg: 1,
    weight: 4,
  },
  {
    id: 'tag_rare',
    name: 'Saloon Find',
    description: 'Next camp shop includes one free Rare equipment.',
    category: 'shop',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_permit',
    name: 'Permit Stamp',
    description: 'Adds a Frontier Permit to the next shop.',
    category: 'shop',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_company_store',
    name: 'On the House',
    description: 'Next shop: initial equipment, consumables, and booster packs cost $0.',
    category: 'shop',
    minLeg: 1,
    weight: 1.5,
  },
  {
    id: 'tag_free_reroll',
    name: 'Coupon Book',
    description: 'Next shop: first camp reroll costs $0.',
    category: 'shop',
    minLeg: 1,
    weight: 3,
  },

  // ─── Shop Aura Tags ───
  {
    id: 'tag_ghost',
    name: 'Haunted Relic',
    description: 'Next base equipment in shop becomes Ghost aura and is free.',
    category: 'shop_aura',
    minLeg: 2,
    weight: 1.5,
  },
  {
    id: 'tag_arcane',
    name: 'Arcane Tin',
    description: 'Next base equipment in shop becomes Arcane aura (+50 miles) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_fire',
    name: 'Branded Iron',
    description: 'Next base equipment in shop becomes Fire aura (+10 mult) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_holy',
    name: 'Gilded Cross',
    description: 'Next base equipment in shop becomes Holy aura (×1.5 mult) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 2,
  },

  // ─── Boss Tags ───
  {
    id: 'tag_investment',
    name: 'Bounty Payout',
    description: 'Gain $25 after defeating the next boss.',
    category: 'boss',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_boss',
    name: 'Change of Guard',
    description: "Reroll the boss assigned to this leg's Showdown.",
    category: 'boss',
    minLeg: 1,
    weight: 2,
  },

  // ─── Immediate Pack Tags ───
  {
    id: 'tag_dice_mega',
    name: 'Wagon Load',
    description: 'Immediately open a free Mega Dice Grab Bag (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_supply_mega',
    name: 'Supply Drop',
    description: 'Immediately open a free Mega Supply Pack (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_trail_guide_mega',
    name: "Surveyor's Cache",
    description: 'Immediately open a free Mega Trail Guide Pack (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_equipment_mega',
    name: "Outfitter's Wagon",
    description: 'Immediately open a free Mega Equipment Pack (pick 2 of 4).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 1.5,
  },
  {
    id: 'tag_frontier',
    name: 'Spirit Walk',
    description: 'Immediately open a free Frontier Pack (pick 1 of 2).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 1.5,
  },

  // ─── Immediate Money Tags ───
  {
    id: 'tag_well_traveled',
    name: 'Well-Traveled',
    description: 'Gain $1 for each day scored this run.',
    category: 'immediate_money',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_pack_rat',
    name: 'Pack Rat',
    description: 'Gain $1 for each unused reroll remaining across the whole run.',
    category: 'immediate_money',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_shortcut',
    name: 'Shortcut',
    description: 'Gain $5 for each round skipped this run.',
    category: 'immediate_money',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_bank_deposit',
    name: 'Bank Deposit',
    description: 'Double your money (adds at most $40).',
    category: 'immediate_money',
    minLeg: 1,
    weight: 2,
  },

  // ─── Immediate Equipment Tags ───
  {
    id: 'tag_top_up',
    name: 'Junk Pile',
    description: 'Create up to 2 Common equipment (if you have space).',
    category: 'immediate_equipment',
    minLeg: 2,
    weight: 2,
  },

  // ─── Immediate Upgrade Tags ───
  {
    id: 'tag_surveyor',
    name: "Surveyor's Mark",
    description: (ctx) => {
      const handName = ctx.surveyorHand ? getHandByType(ctx.surveyorHand)?.name : undefined;
      if (handName) {
        return `Upgrade ${handName} by 3 trail guide levels.`;
      }
      return 'Upgrade a random hand type by 3 trail guide levels.';
    },
    category: 'immediate_upgrade',
    minLeg: 2,
    weight: 1.5,
  },

  // ─── Next Round Tags ───
  {
    id: 'tag_wide_saddle',
    name: 'Wide Saddle',
    description: '+3 dice hand size for the next round only.',
    category: 'next_round',
    minLeg: 1,
    weight: 3,
  },

  // ─── Meta Tags ───
  {
    id: 'tag_twin_wagon',
    name: 'Twin Wagon',
    description: 'Duplicate the next tag earned (excluding Twin Wagon).',
    category: 'meta',
    minLeg: 1,
    weight: 2,
  },
];

export default trailTags;

// ─── Lookup Helpers ───

/** Find a tag definition by ID */
export function getTrailTagById(id: string): TrailTagDef | undefined {
  return trailTags.find((t) => t.id === id);
}
