// ─── Zustand store types (No Phaser imports) ───
// Plain data shapes that will replace PlayerState, GameState, and scene-local buffers.

import type { ConsumableAnimEvent } from '../ConsumablesSystem';
import type { DiceSelectionConfig } from '../DiceSelectionSystem';
import type { InstantEffect } from '../BoosterPackSystem';
import type { TrailEventModifiers, TrailRoundEffects } from '../trailEventDefaults';
import {
  HandType,
  type Die,
  type DifficultyLevel,
  type EquipmentModifier,
  type GameConfig,
  type HandStats,
  type PhaseState,
  type ScoreAnimEvent,
  type ScoreResult,
} from '../types';
import type { Decimal } from '../decimal';
import type { RoundSkipPreviewMeta } from '../../data/trail_tags';
import trailGuidesData from '../../data/trail_guides';

export type { RoundSkipPreviewMeta };

// ─── Active scene keys ───

export type ActiveSceneKey = 'none' | 'Game' | 'Shop' | 'BoosterPack' | 'TrailEvent' | 'RoundSelect' | 'Payout';

export interface PayoutBreakdown {
  roundReward: number;
  dayBonus: number;
  /** Base interest ($1 per $5 held, capped by interestCap). */
  interest: number;
  /** Extra interest from Savings Account (and profession override rate). */
  savingsAccountInterest: number;
  /** Dollars earned per chunk when savingsAccountInterest > 0 (for payout UI label). */
  savingsAccountRate: number;
  /** Chunk size in dollars when savingsAccountInterest > 0 (for payout UI label). */
  savingsAccountChunk: number;
  equipmentMoney: number;
  rerollBonus: number;
  total: number;
}

// ─── Serialized instance shapes (definition IDs, not def objects) ───

export interface StoredEquipmentInstance {
  defId: string;
  sellValue: number;
  state: Record<string, number>;
  modifiers: EquipmentModifier[];
  perishableRoundsLeft?: number;
  /** Baked shop/reward aura (base def is resolved by defId). */
  auraId?: string | null;
}

export interface StoredConsumableInstance {
  defId: string;
  sellValue: number;
  auraId?: string | null;
}

export interface StoredTagInstance {
  tagId: string;
  copies: number;
  /** Pre-rolled upgrade target for Surveyor's Mark. */
  surveyorHand?: HandType;
}

// ─── Boss round runtime state (stored on run slice) ───

export interface BossRoundState {
  disabledEquipmentIndices: number[];
  lockedDiceIds: string[];
  preacherLockedHand: HandType | null;
  handsPlayedThisRound: HandType[];
  equipmentDisplayOrder: number[] | null;
  equipmentHidden: boolean;
  landSlideRevealed: boolean;
  diceScoringReenabledBySell: boolean;
}

export const EMPTY_BOSS_ROUND_STATE: BossRoundState = {
  disabledEquipmentIndices: [],
  lockedDiceIds: [],
  preacherLockedHand: null,
  handsPlayedThisRound: [],
  equipmentDisplayOrder: null,
  equipmentHidden: false,
  landSlideRevealed: false,
  diceScoringReenabledBySell: false,
};

// ─── Run state (replaces PlayerState fields) ───

export interface RunState {
  balance: number;
  dice: Die[];
  loadedDieTarget: number | null;
  loadedDieSyncLucky: boolean;
  spentDiceIds: string[];
  equipment: StoredEquipmentInstance[];
  maxEquipmentSlots: number;
  consumables: StoredConsumableInstance[];
  maxConsumableSlots: number;
  lastUsedConsumableId: string | null;
  shopSlots: number;
  shopRerollCount: number;
  leg: number;
  round: number;
  /** Numbered background (1..ROUND_BACKGROUND_COUNT) for the current round; set at round start */
  roundBackgroundIndex: number | null;
  interestCap: number;
  handStats: Record<HandType, HandStats>;
  professionId: string | null;
  difficulty: DifficultyLevel;
  handSize: number;
  purchasedPermits: string[];
  currentLegPermitId: string | null;
  permitPurchasedThisLeg: boolean;
  permitDayBonus: number;
  permitRerollBonus: number;
  permitDayPenalty: number;
  permitRerollPenalty: number;
  permitScoreReduction: number;
  trailEventModifiers: TrailEventModifiers;
  trailRoundEffects: TrailRoundEffects;
  pendingTrailEventId: string | null;
  seenTrailEventIds: string[];
  skipNextShop: boolean;
  trailGuidesUsed: number;
  startingDiceCount: number;
  bossEffectDisabled: boolean;
  bossRoundState: BossRoundState;
  pendingNewDiceIds: string[];
  pendingHandDiceIds: string[];
  pendingAnimatedDestructions: { sourceIdx: number; victimIdx: number }[];
  pendingJunkDealerCount: number;
  pendingTags: StoredTagInstance[];
  storedAuraTags: StoredTagInstance[];
  roundsSkipped: number;
  daysScored: number;
  unusedRerollsTotal: number;
  twinWagonCount: number;
  wideSaddleBonus: number;
  tagFreeReroll: boolean;
  bonusShopPermitId: string | null;
  skippedRoundsThisLeg: number[];
  skippedRoundTags: Partial<Record<number, string>>;
  skippedRoundTagMeta: Partial<Record<number, RoundSkipPreviewMeta>>;
  roundSkipPreviewTags: Partial<Record<number, string>>;
  roundSkipPreviewMeta: Partial<Record<number, RoundSkipPreviewMeta>>;
  bossRerollsUsedThisLeg: number;
  dynamiteSelfDestructed: boolean;
  endlessMode: boolean;
  storyVictoryPending: boolean;
  bossAssignmentIds: string[];
  nextDieId: number;
  uiEffects: UiEffect[];
}

// ─── Round runtime state (replaces GameState) ───

export interface RolledDieRef {
  id: string;
  value: number;
}

/** Ephemeral HUD overlay during roll/score (not persisted in saves). */
export interface RoundSidebarOverlay {
  title?: string;
  handName?: string;
  handLevel?: number;
  /** Serialized decimal strings for miles/mult pills during scoring preview. */
  milesBaseSave?: string;
  multSave?: string;
}

export interface RoundRuntimeState {
  config: GameConfig;
  phase: PhaseState;
  day: number;
  rerollsRemaining: number;
  totalMiles: Decimal;
  spentDiceIds: string[];
  handDiceIds: string[];
  /** Round-local face values (rolled dice, carryover between days). */
  dieValuesByDieId: Record<string, number>;
  selectedForRollIds: string[];
  rolledDice: RolledDieRef[];
  selectedForScoreIds: string[];
  currentHandType: HandType | null;
  handHistory: HandType[];
  lastScoreResult: ScoreResult | null;
  /** Transient scoring/phase title overlay for Sidebar (cleared after animations). */
  sidebarOverlay?: RoundSidebarOverlay | null;
}

// ─── Scene runtime state ───

export type StoredShopItem =
  | { type: 'equipment'; defId: string; preview: StoredEquipmentInstance; sold?: boolean }
  | { type: 'consumable'; defId: string; sold?: boolean }
  | { type: 'dice'; die: Die; sold?: boolean };

export interface ShopSceneState {
  stock: StoredShopItem[];
  packs: { defId: string; instanceId: string; opened?: boolean }[];
  shopRerollCount: number;
}

export interface StoredPackItem {
  id: string;
  name: string;
  description: string;
  category: string;
  die?: Die;
  equipmentDefId?: string;
  equipmentPreview?: StoredEquipmentInstance;
  supplyCardId?: string;
  trailGuideId?: string;
  frontierEncounterId?: string;
  diceSelection?: DiceSelectionConfig;
  instantEffect?: InstantEffect;
}

export interface BoosterPackSceneState {
  packDefId: string;
  returnScene: string;
  contents: StoredPackItem[];
  picksRemaining: number;
  usedCardIndices: number[];
}

export interface TrailEventSceneState {
  eventId: string;
  resolved: boolean;
  spyglassRevealed: boolean;
  /** Choice picked before result animation completes (autosave during resolve). */
  selectedChoiceId?: string | null;
}

export interface PayoutPresentationState {
  totalMilesSave: string;
  targetMilesSave: string;
  daysRemaining: number;
  rerollsRemaining: number;
  leg: number;
  round: number;
  isVictory: boolean;
  investmentBonus: number;
}

export interface PayoutSceneState {
  breakdown: PayoutBreakdown;
  presentation: PayoutPresentationState;
}

export interface RoundSelectSceneState {
  /** Tag ID offered if each round number is skipped (preview UI). */
  roundSkipPreviewTags: Partial<Record<number, string>>;
}

export interface SceneRuntimeState {
  activeScene: ActiveSceneKey;
  shop: ShopSceneState | null;
  boosterPack: BoosterPackSceneState | null;
  trailEvent: TrailEventSceneState | null;
  payout: PayoutSceneState | null;
  roundSelect: RoundSelectSceneState | null;
}

// ─── One-shot UI effects (not authoritative state) ───

export type UiEffect =
  | { kind: 'dice-added'; dieIds: string[] }
  | { kind: 'equipment-destroyed'; sourceIdx: number; victimIdx: number }
  | { kind: 'round-start-destructions'; entries: { sourceIdx: number; victimIdx: number }[] }
  | { kind: 'round-start-equipment-created'; count: number }
  | { kind: 'equipment-created'; equipmentIndices: number[] }
  | { kind: 'equipment-created-count'; count: number }
  | { kind: 'consumable-used'; consumableId: string }
  | {
      kind: 'consumable-anim';
      events: ConsumableAnimEvent[];
      equipmentCreatedCount?: number;
    }
  | { kind: 'score-anim'; events: ScoreAnimEvent[] }
  | { kind: 'tag-earned'; tagId: string };

// ─── Initial state helpers ───

export function createDefaultHandStats(): Record<HandType, HandStats> {
  const tgLookup = new Map<string, { milesPerLevel: number; multPerLevel: number }>();
  for (const tg of trailGuidesData) {
    tgLookup.set(tg.handType, { milesPerLevel: tg.milesPerLevel, multPerLevel: tg.multPerLevel });
  }

  const stats = {} as Record<HandType, HandStats>;
  for (const type of Object.values(HandType)) {
    const tg = tgLookup.get(type);
    stats[type] = {
      level: 1,
      timesPlayed: 0,
      milesPerLevel: tg?.milesPerLevel ?? 10,
      multPerLevel: tg?.multPerLevel ?? 1,
    };
  }
  return stats;
}
