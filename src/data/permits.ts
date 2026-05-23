// ─── Frontier Permit Definitions ───
// Typed permit data following the trail_tags.ts pattern.
// Each permit has two stages per pair; stage 2 requires its stage 1 prerequisite.

// ─── Types ───

export type PermitStage = 1 | 2;

export type PermitEffect =
  | { type: 'SHOP_SLOTS'; value: number }
  | { type: 'SHOP_DISCOUNT'; value: number }
  | { type: 'AURA_MULTIPLIER'; value: number }
  | { type: 'SHOP_REROLL_DISCOUNT'; value: number }
  | { type: 'CONSUMABLE_SLOTS'; value: number }
  | { type: 'FRONTIER_IN_PACKS'; value: number }
  | { type: 'TRAIL_GUIDE_TARGETING'; value: boolean }
  | { type: 'TRAIL_GUIDE_MULT'; value: number }
  | { type: 'DAY_BONUS'; value: number }
  | { type: 'REROLL_BONUS'; value: number }
  | { type: 'SHOP_WEIGHT_SUPPLY'; value: number }
  | { type: 'SHOP_WEIGHT_TRAIL_GUIDE'; value: number }
  | { type: 'INTEREST_CAP'; value: number }
  | { type: 'NONE'; value: number }
  | { type: 'EQUIPMENT_SLOTS'; value: number }
  | { type: 'DICE_IN_SHOP'; value: 'enhanced' | 'stickered' }
  | { type: 'SHORTCUT'; scoreLegReduction: number; dayPenalty?: number; rerollPenalty?: number }
  | { type: 'BOSS_REROLL'; value: number }
  | { type: 'HAND_SIZE'; value: number };

export interface PermitDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  stage: PermitStage;
  pairId: string;
  prerequisiteId: string | null;
  effect: PermitEffect;
}

// ─── Permit Definitions ───

const permits: PermitDef[] = [
  {
    id: 'supply_wagon',
    name: 'Supply Wagon',
    description: '+1 card slot available in shop (3 total)',
    cost: 10,
    stage: 1,
    pairId: 'supply_wagon_pair',
    prerequisiteId: null,
    effect: { type: 'SHOP_SLOTS', value: 1 },
  },
  {
    id: 'freight_caravan',
    name: 'Freight Caravan',
    description: '+1 additional card slot available in shop (4 total)',
    cost: 10,
    stage: 2,
    pairId: 'supply_wagon_pair',
    prerequisiteId: 'supply_wagon',
    effect: { type: 'SHOP_SLOTS', value: 1 },
  },
  {
    id: 'bargain_bin',
    name: 'Bargain Bin',
    description: 'All cards/dice/packs/permits are 25% off',
    cost: 10,
    stage: 1,
    pairId: 'bargain_pair',
    prerequisiteId: null,
    effect: { type: 'SHOP_DISCOUNT', value: 0.25 },
  },
  {
    id: 'estate_auction',
    name: 'Estate Auction',
    description: 'All cards/dice/packs/permits are 50% off',
    cost: 10,
    stage: 2,
    pairId: 'bargain_pair',
    prerequisiteId: 'bargain_bin',
    effect: { type: 'SHOP_DISCOUNT', value: 0.5 },
  },
  {
    id: 'spirit_ritual',
    name: 'Spirit Ritual',
    description: 'Ghost/Holy/Fire/Ice aura is 2x more likely to appear',
    cost: 10,
    stage: 1,
    pairId: 'aura_pair',
    prerequisiteId: null,
    effect: { type: 'AURA_MULTIPLIER', value: 2 },
  },
  {
    id: 'sacred_ceremony',
    name: 'Sacred Ceremony',
    description: 'Ghost/Holy/Fire/Ice aura is 4x more likely to appear',
    cost: 10,
    stage: 2,
    pairId: 'aura_pair',
    prerequisiteId: 'spirit_ritual',
    effect: { type: 'AURA_MULTIPLIER', value: 4 },
  },
  {
    id: 'lucky_streak',
    name: 'Lucky Streak',
    description: 'Shop rerolls cost $2 less',
    cost: 10,
    stage: 1,
    pairId: 'reroll_cost_pair',
    prerequisiteId: null,
    effect: { type: 'SHOP_REROLL_DISCOUNT', value: 2 },
  },
  {
    id: 'devils_luck',
    name: "Devil's Luck",
    description: 'Shop rerolls cost an additional $2 less',
    cost: 10,
    stage: 2,
    pairId: 'reroll_cost_pair',
    prerequisiteId: 'lucky_streak',
    effect: { type: 'SHOP_REROLL_DISCOUNT', value: 2 },
  },
  {
    id: 'devils_eye',
    name: "Devil's Eye",
    description: '+1 consumable slot',
    cost: 10,
    stage: 1,
    pairId: 'consumable_pair',
    prerequisiteId: null,
    effect: { type: 'CONSUMABLE_SLOTS', value: 1 },
  },
  {
    id: 'infernal_vision',
    name: 'Infernal Vision',
    description: 'Frontier Experience cards may appear in supply packs (20% chance)',
    cost: 10,
    stage: 2,
    pairId: 'consumable_pair',
    prerequisiteId: 'devils_eye',
    effect: { type: 'FRONTIER_IN_PACKS', value: 0.2 },
  },
  {
    id: 'binoculars',
    name: 'Binoculars',
    description: 'Trail guide packs always contain the trail guide for your most played hand',
    cost: 10,
    stage: 1,
    pairId: 'trail_guide_target_pair',
    prerequisiteId: null,
    effect: { type: 'TRAIL_GUIDE_TARGETING', value: true },
  },
  {
    id: 'surveyors_scope',
    name: "Surveyor's Scope",
    description: 'Trail guide cards in consumable area give x1.5 mult for their specified hand',
    cost: 10,
    stage: 2,
    pairId: 'trail_guide_target_pair',
    prerequisiteId: 'binoculars',
    effect: { type: 'TRAIL_GUIDE_MULT', value: 1.5 },
  },
  {
    id: 'extra_rations',
    name: 'Extra Rations',
    description: 'Permanently gain +1 day per round',
    cost: 10,
    stage: 1,
    pairId: 'day_bonus_pair',
    prerequisiteId: null,
    effect: { type: 'DAY_BONUS', value: 1 },
  },
  {
    id: 'supply_cache',
    name: 'Supply Cache',
    description: 'Permanently gain an additional +1 day per round',
    cost: 10,
    stage: 2,
    pairId: 'day_bonus_pair',
    prerequisiteId: 'extra_rations',
    effect: { type: 'DAY_BONUS', value: 1 },
  },
  {
    id: 'second_chance',
    name: 'Second Chance',
    description: 'Permanently gain +1 reroll per round',
    cost: 10,
    stage: 1,
    pairId: 'reroll_bonus_pair',
    prerequisiteId: null,
    effect: { type: 'REROLL_BONUS', value: 1 },
  },
  {
    id: 'third_times_charm',
    name: "Third Time's Charm",
    description: 'Permanently gain an additional +1 reroll per round',
    cost: 10,
    stage: 2,
    pairId: 'reroll_bonus_pair',
    prerequisiteId: 'second_chance',
    effect: { type: 'REROLL_BONUS', value: 1 },
  },
  {
    id: 'camp_merchant',
    name: 'Camp Merchant',
    description: 'Supply cards appear 2x more frequently in the shop',
    cost: 10,
    stage: 1,
    pairId: 'supply_weight_pair',
    prerequisiteId: null,
    effect: { type: 'SHOP_WEIGHT_SUPPLY', value: 2 },
  },
  {
    id: 'supply_baron',
    name: 'Supply Baron',
    description: 'Supply cards appear 4x more frequently in the shop',
    cost: 10,
    stage: 2,
    pairId: 'supply_weight_pair',
    prerequisiteId: 'camp_merchant',
    effect: { type: 'SHOP_WEIGHT_SUPPLY', value: 4 },
  },
  {
    id: 'trail_cartographer',
    name: 'Trail Cartographer',
    description: 'Trail guide cards appear 2x more frequently in the shop',
    cost: 10,
    stage: 1,
    pairId: 'trail_weight_pair',
    prerequisiteId: null,
    effect: { type: 'SHOP_WEIGHT_TRAIL_GUIDE', value: 2 },
  },
  {
    id: 'frontier_pathfinder',
    name: 'Frontier Pathfinder',
    description: 'Trail guide cards appear 4x more frequently in the shop',
    cost: 10,
    stage: 2,
    pairId: 'trail_weight_pair',
    prerequisiteId: 'trail_cartographer',
    effect: { type: 'SHOP_WEIGHT_TRAIL_GUIDE', value: 4 },
  },
  {
    id: 'savings_bond',
    name: 'Savings Bond',
    description: 'Raise the cap on interest earned each round to $10',
    cost: 10,
    stage: 1,
    pairId: 'interest_pair',
    prerequisiteId: null,
    effect: { type: 'INTEREST_CAP', value: 50 },
  },
  {
    id: 'railroad_investment',
    name: 'Railroad Investment',
    description: 'Raise the cap on interest earned each round to $20',
    cost: 10,
    stage: 2,
    pairId: 'interest_pair',
    prerequisiteId: 'savings_bond',
    effect: { type: 'INTEREST_CAP', value: 100 },
  },
  {
    id: 'strange_coin',
    name: 'Strange Coin',
    description: 'Does nothing... or does it?',
    cost: 10,
    stage: 1,
    pairId: 'strange_pair',
    prerequisiteId: null,
    effect: { type: 'NONE', value: 0 },
  },
  {
    id: 'bottomless_satchel',
    name: 'Bottomless Satchel',
    description: '+1 equipment slot',
    cost: 10,
    stage: 2,
    pairId: 'strange_pair',
    prerequisiteId: 'strange_coin',
    effect: { type: 'EQUIPMENT_SLOTS', value: 1 },
  },
  {
    id: 'dice_carver',
    name: 'Dice Carver',
    description: 'Enhanced Dice can be purchased from the shop',
    cost: 10,
    stage: 1,
    pairId: 'dice_shop_pair',
    prerequisiteId: null,
    effect: { type: 'DICE_IN_SHOP', value: 'enhanced' },
  },
  {
    id: 'master_engraver',
    name: 'Master Engraver',
    description: 'Enhanced Dice with stickers may appear in the shop',
    cost: 10,
    stage: 2,
    pairId: 'dice_shop_pair',
    prerequisiteId: 'dice_carver',
    effect: { type: 'DICE_IN_SHOP', value: 'stickered' },
  },
  {
    id: 'shortcut_trail',
    name: 'Shortcut Trail',
    description: 'Reduce required score by one leg, but -1 day of travel per round',
    cost: 10,
    stage: 1,
    pairId: 'shortcut_pair',
    prerequisiteId: null,
    effect: { type: 'SHORTCUT', scoreLegReduction: 1, dayPenalty: 1 },
  },
  {
    id: 'hidden_pass',
    name: 'Hidden Pass',
    description: 'Reduce required score by another leg, but -1 reroll per round',
    cost: 10,
    stage: 2,
    pairId: 'shortcut_pair',
    prerequisiteId: 'shortcut_trail',
    effect: { type: 'SHORTCUT', scoreLegReduction: 1, rerollPenalty: 1 },
  },
  {
    id: 'bounty_board',
    name: 'Bounty Board',
    description: 'Reroll boss 1 time per leg for $10',
    cost: 10,
    stage: 1,
    pairId: 'boss_reroll_pair',
    prerequisiteId: null,
    effect: { type: 'BOSS_REROLL', value: 1 },
  },
  {
    id: 'wanted_dead_or_alive',
    name: 'Wanted Dead or Alive',
    description: 'Reroll boss unlimited times, $10 per roll',
    cost: 10,
    stage: 2,
    pairId: 'boss_reroll_pair',
    prerequisiteId: 'bounty_board',
    effect: { type: 'BOSS_REROLL', value: -1 },
  },
  {
    id: 'supply_pouch',
    name: 'Supply Pouch',
    description: '+1 hand size',
    cost: 10,
    stage: 1,
    pairId: 'hand_size_pair',
    prerequisiteId: null,
    effect: { type: 'HAND_SIZE', value: 1 },
  },
  {
    id: 'pack_mule',
    name: 'Pack Mule',
    description: '+1 hand size',
    cost: 10,
    stage: 2,
    pairId: 'hand_size_pair',
    prerequisiteId: 'supply_pouch',
    effect: { type: 'HAND_SIZE', value: 1 },
  },
];

export default permits;

// ─── Lookup Helpers ───

/** Find a permit definition by ID */
export function getPermitById(id: string): PermitDef | undefined {
  return permits.find((p) => p.id === id);
}
