// ─── Constants (No Phaser imports) ───
// All magic numbers, colors, sizing, and config values in one file.
// When tuning gameplay or visuals, change values here — not in game logic.

import type { DifficultyDef } from './types';
import { rngFloat, type RngStream } from './RunRng';

// ─── Game Canvas ───
export const GAME = {
  WIDTH: 1024,
  HEIGHT: 768,
  BACKGROUND_COLOR: '#1a1a2e',
  BACKGROUND_HEX: 0x1a1a2e,
};

// ─── Gameplay Defaults ───
export const GAMEPLAY = {
  MAX_DAYS: 4,
  MAX_REROLLS: 4,
  ROLL_SIZE: 8,
  SCORE_SIZE: 5,
  TARGET_MILES: 600,
  STARTING_DICE: 25,
  STARTING_MONEY: 10,
  MAX_EQUIPMENT_SLOTS: 5,
  MAX_CONSUMABLE_SLOTS: 2,
  SHOP_SLOTS: 2,
  SHOP_REROLL_COST: 5,
  BOSS_REROLL_COST: 10,
  LEGS: 8,
  ROUNDS_PER_LEG: 3,
  // Target miles per leg (index 0 = leg 1). Base value — multiplied by round multiplier.
  TARGET_MILES_BY_LEG: [300, 800, 2000, 5000, 11_000, 20_000, 35_000, 50_000], // for Normal difficulty
  TARGET_MILES_BY_LEG_ROUGH: [300, 900, 2600, 8000, 20000, 36000, 60000, 100_000], // for Rough Trail difficulty
  TARGET_MILES_BY_LEG_DEADLY: [300, 1000, 3200, 9000, 25000, 60000, 110_000, 200_000], // for Deadly Frontier difficulty
  // Round difficulty multiplier within a leg (round 1 = 1x, round 2 = 1.5x, round 3/boss = 2x)
  ROUND_MULTIPLIERS: [1, 1.5, 2],
  // Money earned for completing each round (index 0 = round 1)
  ROUND_REWARDS: [3, 4, 5],
  // Interest: $1 per INTEREST_PER dollars held, capped at INTEREST_CAP
  INTEREST_PER: 5,
  INTEREST_CAP: 25, // default cap; vouchers can raise this
  /** Miles/score at or above this use Balatro-style scientific notation (e.g. 1.27e9) */
  SCORE_SCIENTIFIC_THRESHOLD: 1_000_000_000_000,
  /** Decimal places for mult/miles products (avoids float drift in scoring math) */
  SCORE_MATH_DECIMALS: 2,
  /** Money earned per trigger when a gold die is held (not scored) at round end */
  GOLD_DICE_HELD_MONEY: 3,
  /** Auto-save interval while a run is in progress (localStorage, ms) */
  AUTOSAVE_INTERVAL_MS: 10_000,
  /** localStorage key for the auto-save snapshot */
  AUTOSAVE_STORAGE_KEY: 'wagon-bones-autosave',
  /** localStorage key for user preferences (audio, etc.) — not part of auto-save */
  PREFERENCES_STORAGE_KEY: 'wagon-bones-preferences',
};

export const DIFFICULTIES: DifficultyDef[] = [
  {
    level: 1,
    id: 'clear_skies',
    name: 'Clear Skies',
    description: 'Base difficulty. The trail is calm.',
    color: 0xffffff,
    effects: [],
  },
  {
    level: 2,
    id: 'thin_supplies',
    name: 'Thin Supplies',
    description: 'Round 1 of each leg gives no money reward.',
    color: 0xff6666,
    effects: ['No reward for Round 1'],
  },
  {
    level: 3,
    id: 'rough_trail',
    name: 'Rough Trail',
    description: 'Target miles escalate faster each leg.',
    color: 0x66cc66,
    effects: ['No reward for Round 1', 'Increased mile targets'],
  },
  {
    level: 4,
    id: 'cursed_relics',
    name: 'Cursed Relics',
    description: 'equipment can be Cursed (cannot sell).',
    color: 0x333333,
    effects: ['No reward for Round 1', 'Increased mile targets', 'Cursed equipment'],
  },
  {
    level: 5,
    id: 'harsh_rations',
    name: 'Harsh Rations',
    description: 'Lose 1 reroll per round.',
    color: 0x6688ff,
    effects: ['No reward for Round 1', 'Increased mile targets', 'Cursed equipment', '-1 Reroll'],
  },
  {
    level: 6,
    id: 'deadly_frontier',
    name: 'Deadly Frontier',
    description: 'Mile targets become brutal.',
    color: 0xaa44ff,
    effects: ['No reward for Round 1', 'Brutal mile targets', 'Cursed equipment', '-1 Reroll'],
  },
  {
    level: 7,
    id: 'spoiled_goods',
    name: 'Spoiled Goods',
    description: 'Perishable equipment (destroyed after 5 rounds).',
    color: 0xff8800,
    effects: ['No reward for Round 1', 'Brutal mile targets', 'Cursed equipment', '-1 Reroll', 'Perishable equipment'],
  },
  {
    level: 8,
    id: 'debt_to_company_store',
    name: 'Debt to the Company Store',
    description: 'Leased equipment requires $3/round upkeep.',
    color: 0xffd700,
    effects: [
      'No reward for Round 1',
      'Brutal mile targets',
      'Cursed equipment',
      '-1 Reroll',
      'Perishable equipment',
      'Leased equipment',
    ],
  },
];

export const EQUIPMENT_MODIFIER = {
  CURSED_RATE: 0.3,
  PERISHABLE_RATE: 0.3,
  PERISHABLE_ROUNDS: 5,
  LEASED_RATE: 0.3,
  LEASED_UPKEEP: 3,
  LEASED_BUY_PRICE: 1,
} as const;

// ─── RNG / Chance Tuning ───
export const CHANCES = {
  STICKER_EFFECT: 0.08,
  DICE_AURA: 0.1,
  AURA_HOLY: 0.03,
  AURA_FIRE: 0.14,
  AURA_ICY: 0.2,
  RARE: 0.05,
  UNCOMMON: 0.25,
  COMMON: 0.7,
  /** Pandora's Box / Spiritual Journey spawn rate in eligible booster packs */
  RARE_PACK_CARD: 3 / 1000,
};

/** Frontier cards that only appear in booster packs — never shop, trail events, or random grants. */
export const PACK_ONLY_FRONTIER_IDS = new Set(['pandoras_box', 'spiritual_journey']);

// ─── Shop Stock Category Weights ───
// Controls the mix of equipment vs consumables in shop slots.
// Each slot rolls independently from this weighted pool.
export const SHOP_WEIGHTS = {
  equipment: 20, // ~71%
  supply: 4, // ~14%
  trail_guide: 4, // ~14%
  frontier: 2, // added when Demon Hunter profession is active
};

// ─── Pack Weight Multipliers ───
// Multiply against each pack's base JSON weight to control shop generation.
// Set a category to 0 to never see it, or crank it up for testing.
export const PACK_WEIGHTS = {
  // Category multipliers
  dice: 1.0,
  supply: 1.0,
  trail_guide: 1.0,
  frontier: 1.0,
  equipment: 1.0,
  // Tier multipliers (stacks with category)
  normal: 1.0,
  jumbo: 1.0,
  mega: 1.0,
};

// ─── Colors (hex numbers for Phaser tints/fills) ───
export const COLORS = {
  // Backgrounds
  BG_PRIMARY: 0x1a1a2e,
  BG_DARK: 0x0a0a1a,
  BG_FELT: 0x2a4a2a,
  BG_CARD: 0x2a2a3a,
  BG_PANEL: 0x1e1e3a,
  BG_WIN: 0x1a3a1a,
  BG_LOSE: 0x3a1a1a,

  // Button
  BTN_DEFAULT: 0x3a3a5c,
  BTN_HOVER: 0x5a5a8c,
  BTN_DISABLED: 0x2a2a3a,

  // Tooltip
  TOOLTIP_BG: 0x1a1a2e,
  TOOLTIP_BORDER: 0x555588,
  /** Plain glue text on tooltips (brighter than card-hint default for dark bg) */
  TOOLTIP_BODY_TEXT: '#d8dce8',

  // Accents
  GOLD: 0xffd700,
  SELECTION: 0xffcc00,
  SELECTION_BORDER: 0x44ff44,
  SCORE_GREEN: 0x44ff44,
  ERROR_RED: 0xff4444,
  PANEL_BORDER: 0x6666aa,

  // Sidebar sections
  SIDEBAR_BG: 0x111122,
  SIDEBAR_SECTION: 0x1a1a30,
  SIDEBAR_SECTION_BORDER: 0x2a2a4a,

  // Score display (Balatro-style chips/mult)
  MILES_BG: 0x2266cc,
  MULT_BG: 0xcc3333,
};

// ─── Text Colors (CSS strings for Phaser Text objects) ───
export const TEXT_COLORS = {
  PRIMARY: '#ffffff',
  SECONDARY: '#ebebeb',
  MUTED: '#c0c0c0',
  DISABLED: '#b0b0b0',
  GOLD: '#ffcc00',
  MONEY: '#ffd700',
  SCORE_GREEN: '#44ff44',
  ERROR_RED: '#ff4444',
  WIN: '#44ff44',
  LOSE: '#ff4444',
  LABEL: '#888888',
};

// ─── Fonts ───
export const FONTS = {
  PRIMARY: 'sans-serif',
  HEADING: 'Arial Black',
};

// ─── UI Layout ───
export const UI = {
  // Sidebar (Balatro-style left panel)
  SIDEBAR_WIDTH_RATIO: 0.24, // 24% of screen width
  SIDEBAR_PADDING: 12,
  SIDEBAR_BG: 0x111122,
  SIDEBAR_BORDER: 0x333355,
  SIDEBAR_SECTION_GAP: 8,

  // Equipment bar (top of main area, left 80%)
  EQUIP_BAR_HEIGHT: 250,
  EQUIP_BAR_RATIO: 0.8,
  EQUIP_CARD_SCALE: 0.9,
  EQUIP_CARD_SPACING: 160,

  // Consumable bar (top of main area, right 20%)
  CONSUMABLE_CARD_SCALE: 0.75,
  CONSUMABLE_CARD_SPACING: 130,

  // Dice pouch (bottom-right indicator)
  POUCH_SIZE: 56,
  POUCH_MARGIN: 16,

  // HUD (legacy — replaced by sidebar)
  HUD_HEIGHT: 56,
  HUD_Y: 20,
  HUD_ALPHA: 0.85,

  // Buttons
  BTN_RADIUS: 8,
  BTN_FONT_SIZE: '18px',

  // Cards
  /** Equipment modifier badges (cursed / perishable / leased) */
  MODIFIER_BADGE_SIZE: 30,
  MODIFIER_BADGE_GAP: 2,
  MODIFIER_BADGE_OFFSET: 4,

  CARD_W: 133,
  CARD_H: 200,
  CARD_RADIUS: 10,
  CARD_SHADOW_OFFSET: 4,
  CARD_SHADOW_ALPHA: 0.35,
  CARD_PRICE_TAG_H: 26,
  CARD_PRICE_TAG_GAP: 6,
  CARD_TOOLTIP_PAD: 10,
  CARD_TOOLTIP_TITLE_FONT_SIZE: 16,
  CARD_TOOLTIP_FONT_SIZE: 14,
  CARD_TOOLTIP_META_FONT_SIZE: 14,

  // Game scene (main content area — right of sidebar)
  HAND_Y_RATIO: 0.72,
  ROLL_Y_RATIO: 0.5,
  DICE_SPACING: 96,
  DICE_ARC_HEIGHT: 12, // max Y lift at center of arc (px)
  DICE_ARC_ROTATION: 0.04, // max rotation at edges (radians, ~2.3°)
  FELT_PADDING: 12,
  FELT_ALPHA: 0.4,
  FELT_RADIUS: 16,

  // Modal
  MODAL_DIM_ALPHA: 0.7,
  MODAL_BG: 0x151528,
  MODAL_BORDER: 0x555588,
  MODAL_RADIUS: 12,
} as const;

// ─── Tag Stack ───
export const TAG_STACK = {
  BADGE_SIZE: 40,
  BADGE_GAP: 4,
  BADGE_RADIUS: 6,
  TOOLTIP_WIDTH: 200,
  /** Gap between dice pouch top edge and bottom of tag stack */
  POUCH_CLEARANCE: 12,
} as const;

// ─── Dice ───
export const DICE = {
  SIZE: 80,
  RADIUS: 10,
  /** Vertical offset for pip value text on the front face (negative = up) */
  VALUE_Y_OFFSET: -3,
  FONT_SIZE: 30,
  FONT_SIZE_TWO_DIGIT: 26,
  STICKER_OFFSET: 12,
  STICKER_SIZE: 22,
  BG_COLOR: 0xf5f0e1,
  PIP_COLOR: 0x222222,
  SELECTED_STROKE: 0xffcc00,
  FORCED_STROKE: 0xff4444,
  DEFAULT_STROKE: 0x444444,
  GRIMY_COLOR: 0x6b5a3e,
};

// ─── Animations ───
export const ANIM = {
  ROLL_DURATION: 600,
  ROLL_INTERVAL: 60,
  ROLL_BOUNCE_DURATION: 80,
  SCORE_HIGHLIGHT_DURATION: 150,
  SCORE_STEP_DELAY: 200, // ms between each scoring step (dice, equip, held)
  SCORE_SUBSTEP_DELAY: 200, // ms between sub-events on the same die (miles → mult → etc)
  SCORE_FINAL_FLASH_DELAY: 300,
  SCORE_COMPLETE_DELAY: 400,
  HOVER_DURATION: 100,
  CARD_HOVER_SCALE: 1.05,

  // Card wobble / tilt / drag swing
  CARD_WOBBLE_ANGLE: 0.022, // radians, ~1°
  CARD_WOBBLE_DURATION_MIN: 1800, // ms per half-cycle
  CARD_WOBBLE_DURATION_MAX: 2600,
  CARD_TILT_MAX: 0.08, // radians, ~4.5° max rotation on hover
  CARD_TILT_SCALE_AMOUNT: 0.06, // scaleX foreshortening at max tilt
  CARD_TILT_LIFT: 1.05, // scale-up when hovered (card "lifts" toward you)
  CARD_TILT_LERP: 0.15, // lerp speed toward target tilt (0-1, lower = smoother)
  CARD_DRAG_SWING_FACTOR: 0.04, // rotation per px of velocity
  CARD_DRAG_SWING_MAX: 0.35, // radians, ~20° max swing
  CARD_DRAG_SWING_DAMPING: 0.75, // velocity damping per frame (lower = more responsive)
  CARD_DRAG_SETTLE_DURATION: 500, // ms to settle back after drop
  CARD_DRAG_LIFT_Y: -6, // Y offset while dragging (card lifts up)
};

export const TRAIL_EVENT = {
  AMOUNT_PER_MISSING_DIE: 3, // $ lost per missing die for LOSE_RANDOM_DICE
  AMOUNT_PER_MISSING_EQUIP: 4, // $ lost per missing equipment for LOSE_RANDOM_EQUIPMENT
  SPYGLASS_VIEW_RADIUS: 180, // radius of the static circular spy preview
};

// ─── Copy Equipment Incompatibility ───
/** Effect types that cannot be copied by Mirror Lake / Echo Chamber */
export const COPY_INCOMPATIBLE_EFFECTS = new Set([
  'FREE_SHOP_REROLL', // Coupon Book
  'PREVENT_DEATH', // Guardian Totem, Saint Elmo's Shield
  'BANK_NOTE', // Bank Note
  'MODIFY_REROLLS', // Spare Holster
  'END_ROUND_MONEY', // Payday
  'END_ROUND_MONEY_PER_REROLL', // Rainy Day Fund
  'ROUND_START_SELL_VALUE', // Antique Revolver
  'END_ROUND_SELL_VALUE_ALL', // Raffle Ticket
  'LOADED_DICE', // Loaded Dice
  'STACKED_DECK', // Stacked Deck
  'END_ROUND_MONEY_SCALING', // Railroad Bonds
  'SELL_DISABLE_BOSS', // Sheriff's Badge
  'SELL_GRANT_TAG', // Bounty Contract
  'TRAIL_ALMANAC_MONEY', // Trail Almanac
  'ALLOW_DUPLICATES', // Counterfeit Goods
  'HELLFIRE_ROUND', // Hellfire Round
  'OPEN_PALM', // Open Palm
  'SAVINGS_ACCOUNT_INTEREST', // Savings Account
  'EXPLORER_GUILD', // Explorer's Guild
  'PHANTOM_WAGON', // Phantom Wagon
  'PACK_SADDLE', // Pack Saddle
  'COFFEE', // Coffee
  'FLOUR_SACK', // Flour Sack
  'COPY_RIGHT', // Mirror Lake (prevent self-reference)
  'COPY_LEFTMOST', // Echo Chamber (prevent self-reference)
  'TRAIL_BACKPACK', // Trail Backpack
]);

/**
 * Count how many Loaded Dice are equipped and return the probability multiplier.
 * Each Loaded Dice doubles all listed probabilities, so 2 copies = 4x multiplier.
 * Returns 2^n where n = number of Loaded Dice equipped.
 */
export function getLoadedDiceMultiplier(equipment: { def: { effectType: string } }[]): number {
  let count = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'LOADED_DICE') count++;
  }
  return count > 0 ? Math.pow(2, count) : 1;
}

/**
 * Roll a probability check with Loaded Dice support.
 * Takes a [numerator, denominator] chance tuple and the equipment array.
 * Returns true if the check succeeds.
 */
export function checkLoadedChance(
  chance: [number, number],
  equipment: { def: { effectType: string } }[],
  stream: RngStream = 'loadedDice',
): boolean {
  const [num, den] = chance;
  const ldm = getLoadedDiceMultiplier(equipment);
  return rngFloat(stream) < (num * ldm) / den;
}

/**
 * Resolve the effective equipment that a copy item should emulate.
 * Returns the resolved item, or null if nothing valid to copy.
 * Uses a visited set to prevent infinite loops between Mirror Lake and Echo Chamber.
 */
export function resolveCopyTarget<T extends { def: { effectType: string } }>(
  equipment: T[],
  sourceIndex: number,
  maxDepth: number,
  visited: Set<number> = new Set(),
): T | null {
  if (maxDepth <= 0) return null;
  visited.add(sourceIndex);

  const equip = equipment[sourceIndex];
  let targetIndex: number | null = null;

  if (equip.def.effectType === 'COPY_RIGHT') {
    targetIndex = sourceIndex + 1;
  } else if (equip.def.effectType === 'COPY_LEFTMOST') {
    if (sourceIndex === 0) return null;
    targetIndex = 0;
  } else {
    if (COPY_INCOMPATIBLE_EFFECTS.has(equip.def.effectType)) return null;
    return equip;
  }

  if (targetIndex === null || targetIndex < 0 || targetIndex >= equipment.length) return null;
  if (visited.has(targetIndex)) return null;

  const target = equipment[targetIndex];

  if (target.def.effectType === 'COPY_RIGHT' || target.def.effectType === 'COPY_LEFTMOST') {
    return resolveCopyTarget(equipment, targetIndex, maxDepth - 1, visited);
  }

  if (COPY_INCOMPATIBLE_EFFECTS.has(target.def.effectType)) return null;

  return target;
}
