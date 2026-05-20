import { GAMEPLAY } from './Constants';
import type { ScoringMutations } from './effects/types';

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

export type DiceEnhancement =
  | 'bone'
  | 'lucky'
  | 'wooden'
  | 'steel'
  | 'gold'
  | 'loaded'
  | 'diamond'
  | 'stone'
  | null;

export type DiceSticker = 'purple_flower' | 'red_bullet' | 'golden_dollar' | 'blue_moon' | null;

export type DiceAura = 'holy' | 'fire' | 'icy' | null;

export interface Die {
  id: string;
  value: number; // 1-12, or 0 for stone dice
  enhancement: DiceEnhancement;
  sticker: DiceSticker; // whole-die effect (like Balatro seals)
  aura: DiceAura;
  isGrimy: boolean; // face hidden until selected
  bonusMiles: number; // permanent miles bonus (e.g. from Cowboy Boots)
}

export interface HandDefinition {
  type: string;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
}

export interface HandResult {
  type: HandType;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
  scoringDice: Die[]; // the dice that form the hand
}

// ─── Score Animation Event System ───
// Game logic emits these events during scoring. The Phaser animation layer
// plays them back sequentially — no logic duplication.

export type ScoreAnimTarget =
  | { kind: 'die'; dieId: string }
  | { kind: 'equip'; equipIndex: number }
  | { kind: 'both'; dieId: string; equipIndex: number };

export type ScoreAnimPopupType = 'miles' | 'mult' | 'xmult' | 'money' | 'supply' | 'strip' | 'enhance';

export interface ScoreAnimEvent {
  /** Target to animate (die, equip card, or both) */
  target: ScoreAnimTarget;
  /** Type of popup to show */
  popupType: ScoreAnimPopupType;
  /** Value to display in popup (+5 mult, x2, $3, etc.) */
  value: number;
  /** Optional: which die is currently being "scored" (for per-die grouping) */
  dieId?: string;
  /** Enhancement applied (for enhance popup) */
  enhancement?: DiceEnhancement;
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

export interface ScoreResult {
  handResult: HandResult;
  totalValue: number; // sum of scoring dice values (base miles from dice)
  miles: number; // (handBaseMiles + totalValue) * mult
  mult: number;
  // Animation event stack — populated by game logic during scoring
  animEvents: ScoreAnimEvent[];
  roundScoreBefore?: number;
  /** Hand upgrades that occurred during scoring (e.g. Surveyor's Transit) */
  handUpgrades?: HandUpgradeInfo[];
  /** Scoring mutations (deferred to applyScoringMutations) */
  mutations: ScoringMutations;
}

export interface GameConfig {
  maxDays: number;
  maxRerolls: number; // re-rolls per day (resets each day)
  rollSize: number; // dice drawn from pouch and rolled (default 8)
  scoreSize: number; // max dice player selects to score (default 5)
  targetMiles: number; // miles to beat this leg
}

export const DEFAULT_CONFIG: GameConfig = {
  maxDays: GAMEPLAY.MAX_DAYS,
  maxRerolls: GAMEPLAY.MAX_REROLLS,
  rollSize: GAMEPLAY.ROLL_SIZE,
  scoreSize: GAMEPLAY.SCORE_SIZE,
  targetMiles: GAMEPLAY.TARGET_MILES,
};

export interface RoundState {
  phase: PhaseState;
  day: number;
  rerollsRemaining: number;
  totalMiles: number;
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

export interface BossDef {
  id: string;
  name: string;
  description: string;
  effectType: string;
  effectParams: Record<string, unknown>;
}
