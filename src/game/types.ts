import type { DiceStickerId } from '../data/dice_stickers';
import { GAMEPLAY } from './Constants';
import type { ScoringMutations } from './effects/types';
import type { Decimal, DecimalSource } from './decimal';
import { D } from './decimal';

export type PhaseState = 'SELECT' | 'ROLL' | 'SCORE' | 'DAY_END' | 'ROUND_END';

export enum HandType {
  HIGH_VALUE = 'HIGH_VALUE',
  PAIR = 'PAIR',
  TWO_PAIR = 'TWO_PAIR',
  THREE_OF_A_KIND = 'THREE_OF_A_KIND',
  FOUR_STRAIGHT = 'FOUR_STRAIGHT',
  FULL_HOUSE = 'FULL_HOUSE',
  FOUR_OF_A_KIND = 'FOUR_OF_A_KIND',
  FIVE_STRAIGHT = 'FIVE_STRAIGHT',
  FIVE_OF_A_KIND = 'FIVE_OF_A_KIND',
}

export interface HandStats {
  level: number; // starts at 1, increased by trail guide cards
  timesPlayed: number;
  milesPerLevel: number; // miles added per level (from trail guide data)
  multPerLevel: number; // mult added per level (from trail guide data)
}

export type DiceEnhancement = 'bone' | 'lucky' | 'wooden' | 'steel' | 'gold' | 'loaded' | 'diamond' | 'stone' | null;

export type DiceSticker = DiceStickerId | null;

export type DiceAura = 'holy' | 'fire' | 'arcane' | null;

export interface Die {
  id: string;
  value: number; // 1-12, or 0 for stone dice
  enhancement: DiceEnhancement;
  sticker: DiceSticker; // whole-die effect (like Balatro seals)
  aura: DiceAura;
  bonusMiles: number; // permanent miles bonus (e.g. from Cowboy Boots)
}

export type { HandDef as HandDefinition } from '../data/hands';

export interface HandResult {
  type: HandType;
  name: string;
  baseMiles: Decimal;
  baseMult: Decimal;
  rank: number;
  scoringDice: Die[]; // the dice that form the hand
}

// ─── Score Animation Event System ───
// Game logic emits these events during scoring. The Phaser animation layer
// plays them back sequentially — no logic duplication.

export type ScoreAnimTarget =
  | { kind: 'die'; dieId: string }
  | { kind: 'equip'; equipIndex: number }
  | { kind: 'both'; dieId: string; equipIndex: number }
  | { kind: 'consumable'; consumableIndex: number }
  | { kind: 'balance' };

export type ScoreAnimPopupType =
  | 'miles'
  | 'mult'
  | 'xmult'
  | 'money'
  | 'supply'
  | 'trail_guide'
  | 'strip'
  | 'enhance'
  | 'crack'
  | 'balance'
  | 'again';

export interface ScoreAnimEvent {
  /** Target to animate (die, equip card, or both) */
  target: ScoreAnimTarget;
  /** Type of popup to show */
  popupType: ScoreAnimPopupType;
  /** Value to display in popup (+5 mult, x2, $3, etc.) */
  value: number;
  /** Precise value for balance step (when number `value` is insufficient) */
  decimalValue?: DecimalSource;
  /** Optional: which die is currently being "scored" (for per-die grouping) */
  dieId?: string;
  /** Enhancement applied (for enhance popup) */
  enhancement?: DiceEnhancement;
  /** Aura applied with enhance popup (e.g. Lucky Find) */
  aura?: DiceAura;
  /** Sticker applied with enhance popup (e.g. Lucky Find) */
  sticker?: DiceSticker;
  /** Consumable def id when granting supply/trail guide (for bar fly-in animation) */
  consumableId?: string;
}

export interface HandUpgradeInfo {
  handType: HandType;
  handName: string;
  oldLevel: number;
  newLevel: number;
  oldBaseMiles: number;
  newBaseMiles: number;
  oldBaseMult: number;
  newBaseMult: number;
}

/** Pre-score hand upgrade chance failed (Surveyor's Transit, Stew day 1). */
export interface HandUpgradeMissInfo {
  equipIndex: number;
}

export interface ScoreResult {
  handResult: HandResult;
  totalValue: number; // sum of scoring dice values (base miles from dice)
  miles: Decimal; // (handBaseMiles + totalValue) * mult
  mult: Decimal;
  // Animation event stack — populated by game logic during scoring
  animEvents: ScoreAnimEvent[];
  roundScoreBefore?: Decimal;
  /** Hand upgrades from this score (pre-score: Surveyor's Transit, Stew day 1; post-score: Trickster) */
  handUpgrades?: HandUpgradeInfo[];
  /** Scoring mutations (deferred to applyScoringMutations) */
  mutations: ScoringMutations;
}

export interface GameConfig {
  maxDays: number;
  maxRerolls: number; // rerolls per day (resets each day)
  rollSize: number; // dice drawn from pouch and rolled (default 8)
  scoreSize: number; // max dice player selects to score (default 5)
  targetMiles: Decimal; // miles to beat this leg
}

export const DEFAULT_CONFIG: GameConfig = {
  maxDays: GAMEPLAY.MAX_DAYS,
  maxRerolls: GAMEPLAY.MAX_REROLLS,
  rollSize: GAMEPLAY.ROLL_SIZE,
  scoreSize: GAMEPLAY.SCORE_SIZE,
  targetMiles: D(300), // leg 1 base; rounds set player.targetMiles via computeTargetMiles
};

export interface RoundState {
  phase: PhaseState;
  day: number;
  rerollsRemaining: number;
  totalMiles: Decimal;
  spent: Die[]; // dice already used this cycle (persist across days)
  hand: Die[]; // all available dice shown in SELECT phase
  selectedForRoll: Die[];
  rolledDice: Die[]; // dice after rolling
  selectedForScore: Die[];
  currentHandType: HandType | null; // hand type from most recent scoring (for hint display)
  handHistory: HandType[]; // all hand types scored this round (for cards that check history)
}

export type GameEventType =
  | 'phase-change'
  | 'hand-updated'
  | 'dice-rolled'
  | 'score-calculated'
  | 'day-ended'
  | 'round-won'
  | 'round-lost'
  | 'reroll-updated'
  | 'spent-refreshed'
  | 'death-prevented';

export type GameEventCallback = (data?: unknown) => void;

// ─── Difficulty ───
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface DifficultyDef {
  level: DifficultyLevel;
  id: string;
  name: string;
  description: string;
  color: number; // Hex color for UI badge/icon
  effects: string[]; // Human-readable list of cumulative effects
}

// ─── Equipment Modifiers ───
export type EquipmentModifier = 'cursed' | 'perishable' | 'leased';

// ─── Trail Tags (re-export from data layer) ───
export type { TagCategory, TrailTagDef, TrailTagInstance } from '../data/trail_tags';

// ─── Bosses (re-export from data layer) ───
export type { BossDef, BossEffectType } from '../data/bosses';

// ─── Data definitions (re-export from data layer) ───
export type { HandDef } from '../data/hands';
export type { ItemAura } from '../data/item_auras';
export type { DiceAuraDef } from '../data/dice_auras';
export type { DiceEnhancementDef } from '../data/dice_enhancements';
export type { DiceStickerDef } from '../data/dice_stickers';
