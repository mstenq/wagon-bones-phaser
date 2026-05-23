// ─── Save / Load (No Phaser imports) ───
// Versioned JSON snapshots for debugging and sharing game state.

import type { Die, DifficultyLevel, GameConfig, HandStats, RoundState } from './types';
import type { EquipmentModifier } from './types';
import { HandType as HandTypeEnum } from './types';
import { getPlayerState, resetPlayerState, type PlayerState } from './PlayerState';
import { getEquipmentDefById } from './ItemsSystem';
import type { EquipmentInstance } from './ItemsSystem';
import { acquireEquipmentInstance } from './EquipmentModifiers';
import { createConsumableInstance, getConsumableDefById, type ConsumableInstance } from './ConsumablesSystem';
import { getPermitById } from './PermitsSystem';
import { getProfessionById } from '../data/professions';
import { getTrailTagById } from '../data/trail_tags';
import { getTrailEventById } from './TrailEventsSystem';
import { createEmptyTrailRoundEffects, type TrailEventModifiers, type TrailRoundEffects } from './TrailEventsSystem';
import type { BossRoundState } from './BossEffectsSystem';
import type { TrailTagInstance } from '../data/trail_tags';
import bosses from '../data/bosses';
import { type PackItem, type PackCategory } from './BoosterPackSystem';
import { getRunRngState, getRunSeed, restoreRunRng, type RunRngState } from './RunRng';

export const SAVE_VERSION = 2;

export type ActiveScene = 'Game' | 'Shop' | 'BoosterPack' | 'TrailEvent' | 'RoundSelect';

export interface SerializedEquipmentInstance {
  defId: string;
  sellValue: number;
  state: Record<string, number>;
  modifiers: EquipmentModifier[];
  perishableRoundsLeft?: number;
}

export interface SerializedTagInstance {
  tagId: string;
  copies: number;
}

export interface PlayerSaveData {
  balance: number;
  dice: Die[];
  loadedDieTarget: number | null;
  spentDiceIds: string[];
  equipment: SerializedEquipmentInstance[];
  maxEquipmentSlots: number;
  maxConsumableSlots: number;
  consumables: { defId: string; sellValue: number }[];
  lastUsedConsumableId: string | null;
  shopSlots: number;
  leg: number;
  round: number;
  interestCap: number;
  handStats: Record<string, HandStats>;
  professionId: string | null;
  difficulty: DifficultyLevel;
  handSize: number;
  shopRerollCount: number;
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
  pendingTags: SerializedTagInstance[];
  storedAuraTags: SerializedTagInstance[];
  roundsSkipped: number;
  daysScored: number;
  unusedRerollsTotal: number;
  twinWagonCount: number;
  wideSaddleBonus: number;
  tagFreeReroll: boolean;
  bonusShopPermitId: string | null;
  skippedRoundsThisLeg: number[];
  skippedRoundTags: Record<number, string>;
  roundSkipPreviewTags: Record<number, string>;
  bossRerollsUsedThisLeg: number;
  dynamiteSelfDestructed: boolean;
  endlessMode?: boolean;
  storyVictoryPending?: boolean;
  bossAssignmentIds: string[];
  nextDieId: number;
}

export interface GameRoundSaveData {
  config: GameConfig;
  state: RoundState;
}

export interface ShopSaveData {
  stock: SerializedShopItem[];
  packs: { defId: string; instanceId: string }[];
  shopRerollCount: number;
}

export type SerializedShopItem =
  | { type: 'equipment'; defId: string; preview: SerializedEquipmentInstance; sold?: boolean }
  | { type: 'consumable'; defId: string; sold?: boolean }
  | { type: 'dice'; die: Die; sold?: boolean };

export interface SerializedPackItem {
  id: string;
  name: string;
  description: string;
  category: string;
  die?: Die;
  equipmentDefId?: string;
  equipmentPreview?: SerializedEquipmentInstance;
  supplyCardId?: string;
  trailGuideId?: string;
  frontierEncounterId?: string;
  diceSelection?: import('./DiceSelectionSystem').DiceSelectionConfig;
  instantEffect?: import('./BoosterPackSystem').InstantEffect;
}

export interface BoosterPackSaveData {
  packDefId: string;
  returnScene: string;
  contents: SerializedPackItem[];
  picksRemaining: number;
  usedCardIndices: number[];
}

export interface TrailEventSaveData {
  eventId: string;
  resolved: boolean;
  spyglassRevealed: boolean;
}

export type SceneSaveData =
  | GameRoundSaveData
  | ShopSaveData
  | BoosterPackSaveData
  | TrailEventSaveData
  | Record<string, never>;

export interface GameSaveSnapshot {
  version: number;
  exportedAt: string;
  activeScene: ActiveScene;
  runSeed: string;
  rngState: RunRngState;
  player: PlayerSaveData;
  scene?: SceneSaveData;
}

export type SceneSaveContext =
  | { activeScene: 'Game'; data: GameRoundSaveData }
  | { activeScene: 'Shop'; data: ShopSaveData }
  | { activeScene: 'BoosterPack'; data: BoosterPackSaveData }
  | { activeScene: 'TrailEvent'; data: TrailEventSaveData }
  | { activeScene: 'RoundSelect' };

const ACTIVE_SCENES: ActiveScene[] = ['Game', 'Shop', 'BoosterPack', 'TrailEvent', 'RoundSelect'];

export function serializeEquipmentInstance(inst: EquipmentInstance): SerializedEquipmentInstance {
  return {
    defId: inst.def.id,
    sellValue: inst.sellValue,
    state: { ...inst.state },
    modifiers: [...inst.modifiers],
    ...(inst.perishableRoundsLeft !== undefined ? { perishableRoundsLeft: inst.perishableRoundsLeft } : {}),
  };
}

export function deserializeEquipmentInstance(data: SerializedEquipmentInstance): EquipmentInstance {
  const def = getEquipmentDefById(data.defId);
  if (!def) throw new Error(`Unknown equipment id: ${data.defId}`);
  const inst = acquireEquipmentInstance(def, getPlayerState().purchasedPermits, data.modifiers);
  inst.sellValue = data.sellValue;
  inst.state = { ...data.state };
  if (data.perishableRoundsLeft !== undefined) {
    inst.perishableRoundsLeft = data.perishableRoundsLeft;
  }
  return inst;
}

function serializePlayer(player: PlayerState): PlayerSaveData {
  const skippedRoundTags: Record<number, string> = {};
  for (const [k, v] of Object.entries(player.skippedRoundTags)) {
    if (v) skippedRoundTags[Number(k)] = v.id;
  }
  const roundSkipPreviewTags: Record<number, string> = {};
  for (const [k, v] of Object.entries(player.roundSkipPreviewTags)) {
    if (v) roundSkipPreviewTags[Number(k)] = v.id;
  }

  const handStats: Record<string, HandStats> = {};
  for (const [type, stats] of player.handStats) {
    handStats[type] = { ...stats };
  }

  return {
    balance: player.economy.balance,
    dice: player.dice.map((d) => ({ ...d })),
    loadedDieTarget: player.loadedDieTarget,
    spentDiceIds: [...player.spentDiceIds],
    equipment: player.equipment.map(serializeEquipmentInstance),
    maxEquipmentSlots: player.maxEquipmentSlots,
    maxConsumableSlots: player.maxConsumableSlots,
    consumables: player.consumables.map((c) => ({
      defId: c.def.id,
      sellValue: c.sellValue,
    })),
    lastUsedConsumableId: player.lastUsedConsumable?.id ?? null,
    shopSlots: player.shopSlots,
    leg: player.leg,
    round: player.round,
    interestCap: player.interestCap,
    handStats,
    professionId: player.profession?.id ?? null,
    difficulty: player.difficulty,
    handSize: player.handSize,
    shopRerollCount: player.shopRerollCount,
    purchasedPermits: [...player.purchasedPermits],
    currentLegPermitId: player.currentLegPermit?.id ?? null,
    permitPurchasedThisLeg: player.permitPurchasedThisLeg,
    permitDayBonus: player.permitDayBonus,
    permitRerollBonus: player.permitRerollBonus,
    permitDayPenalty: player.permitDayPenalty,
    permitRerollPenalty: player.permitRerollPenalty,
    permitScoreReduction: player.permitScoreReduction,
    trailEventModifiers: { ...player.trailEventModifiers },
    trailRoundEffects: { ...player.trailRoundEffects },
    pendingTrailEventId: player.pendingTrailEvent?.id ?? null,
    seenTrailEventIds: [...player.seenTrailEventIds],
    skipNextShop: player.skipNextShop,
    trailGuidesUsed: player.trailGuidesUsed,
    startingDiceCount: player.startingDiceCount,
    bossEffectDisabled: player.bossEffectDisabled,
    bossRoundState: {
      ...player.bossRoundState,
      disabledEquipmentIndices: [...player.bossRoundState.disabledEquipmentIndices],
      lockedDiceIds: [...player.bossRoundState.lockedDiceIds],
      handsPlayedThisRound: [...player.bossRoundState.handsPlayedThisRound],
      equipmentDisplayOrder: player.bossRoundState.equipmentDisplayOrder
        ? [...player.bossRoundState.equipmentDisplayOrder]
        : null,
    },
    pendingNewDiceIds: [...player.pendingNewDiceIds],
    pendingHandDiceIds: [...player.pendingHandDiceIds],
    pendingAnimatedDestructions: player.pendingAnimatedDestructions.map((d) => ({ ...d })),
    pendingJunkDealerCount: player.pendingJunkDealerCount,
    pendingTags: player.pendingTags.map((t) => ({ tagId: t.def.id, copies: t.copies })),
    storedAuraTags: player.storedAuraTags.map((t) => ({ tagId: t.def.id, copies: t.copies })),
    roundsSkipped: player.roundsSkipped,
    daysScored: player.daysScored,
    unusedRerollsTotal: player.unusedRerollsTotal,
    twinWagonCount: player.twinWagonCount,
    wideSaddleBonus: player.wideSaddleBonus,
    tagFreeReroll: player.tagFreeReroll,
    bonusShopPermitId: player.bonusShopPermit?.id ?? null,
    skippedRoundsThisLeg: [...player.skippedRoundsThisLeg],
    skippedRoundTags,
    roundSkipPreviewTags,
    bossRerollsUsedThisLeg: player.bossRerollsUsedThisLeg,
    dynamiteSelfDestructed: player.dynamiteSelfDestructed,
    endlessMode: player.endlessMode,
    storyVictoryPending: player.storyVictoryPending,
    bossAssignmentIds: player.getBossAssignmentIds(),
    nextDieId: player.getNextDieIdForSave(),
  };
}

function deserializeTags(items: SerializedTagInstance[]): TrailTagInstance[] {
  return items.map(({ tagId, copies }) => {
    const def = getTrailTagById(tagId);
    if (!def) throw new Error(`Unknown trail tag id: ${tagId}`);
    return { def, copies };
  });
}

function applyPlayerSaveData(data: PlayerSaveData): void {
  const player = getPlayerState();

  player.economy.setBalance(data.balance);
  player.dice = data.dice.map((d) => ({ ...d }));
  player.loadedDieTarget = data.loadedDieTarget;
  player.spentDiceIds = new Set(data.spentDiceIds);
  player.equipment = data.equipment.map(deserializeEquipmentInstance);
  player.maxEquipmentSlots = data.maxEquipmentSlots;
  player.maxConsumableSlots = data.maxConsumableSlots;
  player.consumables = data.consumables.map((c) => {
    const def = getConsumableDefById(c.defId);
    if (!def) throw new Error(`Unknown consumable id: ${c.defId}`);
    const inst = createConsumableInstance(def);
    inst.sellValue = c.sellValue;
    return inst;
  });
  if (data.lastUsedConsumableId) {
    player.lastUsedConsumable = getConsumableDefById(data.lastUsedConsumableId);
  } else {
    player.lastUsedConsumable = null;
  }
  player.shopSlots = data.shopSlots;
  player.leg = data.leg;
  player.round = data.round;
  player.interestCap = data.interestCap;

  player.handStats = new Map();
  for (const type of Object.values(HandTypeEnum)) {
    const stats = data.handStats[type];
    if (stats) {
      player.handStats.set(type, { ...stats });
    }
  }

  player.profession = data.professionId ? (getProfessionById(data.professionId) ?? null) : null;
  player.difficulty = data.difficulty;
  player.handSize = data.handSize;
  player.shopRerollCount = data.shopRerollCount;
  player.purchasedPermits = [...data.purchasedPermits];
  player.currentLegPermit = data.currentLegPermitId ? (getPermitById(data.currentLegPermitId) ?? null) : null;
  player.permitPurchasedThisLeg = data.permitPurchasedThisLeg;
  player.permitDayBonus = data.permitDayBonus;
  player.permitRerollBonus = data.permitRerollBonus;
  player.permitDayPenalty = data.permitDayPenalty;
  player.permitRerollPenalty = data.permitRerollPenalty;
  player.permitScoreReduction = data.permitScoreReduction;
  player.trailEventModifiers = { ...data.trailEventModifiers };
  player.trailRoundEffects = data.trailRoundEffects ? { ...data.trailRoundEffects } : createEmptyTrailRoundEffects();
  player.pendingTrailEvent = data.pendingTrailEventId ? getTrailEventById(data.pendingTrailEventId) : null;
  player.seenTrailEventIds = new Set(data.seenTrailEventIds);
  player.skipNextShop = data.skipNextShop;
  player.trailGuidesUsed = data.trailGuidesUsed;
  player.startingDiceCount = data.startingDiceCount;
  player.bossEffectDisabled = data.bossEffectDisabled;
  player.bossRoundState = {
    ...data.bossRoundState,
    disabledEquipmentIndices: [...data.bossRoundState.disabledEquipmentIndices],
    lockedDiceIds: [...data.bossRoundState.lockedDiceIds],
    handsPlayedThisRound: [...data.bossRoundState.handsPlayedThisRound],
    equipmentDisplayOrder: data.bossRoundState.equipmentDisplayOrder
      ? [...data.bossRoundState.equipmentDisplayOrder]
      : null,
  };
  player.pendingNewDiceIds = [...data.pendingNewDiceIds];
  player.pendingHandDiceIds = [...data.pendingHandDiceIds];
  player.pendingAnimatedDestructions = data.pendingAnimatedDestructions.map((d) => ({ ...d }));
  player.pendingJunkDealerCount = data.pendingJunkDealerCount;
  player.pendingTags = deserializeTags(data.pendingTags);
  player.storedAuraTags = deserializeTags(data.storedAuraTags);
  player.roundsSkipped = data.roundsSkipped;
  player.daysScored = data.daysScored;
  player.unusedRerollsTotal = data.unusedRerollsTotal;
  player.twinWagonCount = data.twinWagonCount;
  player.wideSaddleBonus = data.wideSaddleBonus;
  player.tagFreeReroll = data.tagFreeReroll;
  player.bonusShopPermit = data.bonusShopPermitId ? (getPermitById(data.bonusShopPermitId) ?? null) : null;
  player.skippedRoundsThisLeg = [...data.skippedRoundsThisLeg];
  player.skippedRoundTags = {};
  for (const [k, tagId] of Object.entries(data.skippedRoundTags)) {
    const def = getTrailTagById(tagId);
    if (def) player.skippedRoundTags[Number(k)] = def;
  }
  player.roundSkipPreviewTags = {};
  for (const [k, tagId] of Object.entries(data.roundSkipPreviewTags)) {
    const def = getTrailTagById(tagId);
    if (def) player.roundSkipPreviewTags[Number(k)] = def;
  }
  player.bossRerollsUsedThisLeg = data.bossRerollsUsedThisLeg;
  player.dynamiteSelfDestructed = data.dynamiteSelfDestructed;
  player.endlessMode = data.endlessMode ?? false;
  player.storyVictoryPending = data.storyVictoryPending ?? false;
  player.restoreBossAssignments(data.bossAssignmentIds);
  player.setNextDieIdForRestore(data.nextDieId);
}

export function buildSaveSnapshot(context: SceneSaveContext): GameSaveSnapshot {
  const player = getPlayerState();
  const snapshot: GameSaveSnapshot = {
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    activeScene: context.activeScene,
    runSeed: getRunSeed(),
    rngState: getRunRngState(),
    player: serializePlayer(player),
  };

  if (context.activeScene !== 'RoundSelect') {
    snapshot.scene = context.data;
  }

  return snapshot;
}

export function validateSaveSnapshot(data: unknown): GameSaveSnapshot | null {
  if (!data || typeof data !== 'object') return null;
  const snap = data as GameSaveSnapshot;
  if (snap.version !== SAVE_VERSION) return null;
  if (!ACTIVE_SCENES.includes(snap.activeScene)) return null;
  if (typeof snap.runSeed !== 'string') return null;
  if (!snap.rngState || typeof snap.rngState !== 'object') return null;
  if (!snap.player || typeof snap.player !== 'object') return null;
  if (typeof snap.player.balance !== 'number') return null;
  if (!Array.isArray(snap.player.dice)) return null;
  if (!Array.isArray(snap.player.bossAssignmentIds)) return null;
  return snap;
}

export function applySaveSnapshot(snapshot: GameSaveSnapshot): {
  scene: ActiveScene;
  sceneData: Record<string, unknown>;
} {
  if (snapshot.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${snapshot.version}`);
  }

  assertSaveIntegrity(snapshot);
  resetPlayerState();
  restoreRunRng(snapshot.runSeed, snapshot.rngState);
  applyPlayerSaveData(snapshot.player);

  const sceneData: Record<string, unknown> = {};

  switch (snapshot.activeScene) {
    case 'Game': {
      const data = snapshot.scene as GameRoundSaveData;
      sceneData.restore = data;
      break;
    }
    case 'Shop': {
      const data = snapshot.scene as ShopSaveData;
      sceneData.restoreShop = data;
      break;
    }
    case 'BoosterPack': {
      const data = snapshot.scene as BoosterPackSaveData;
      sceneData.restorePack = data;
      if (data.returnScene) sceneData.returnScene = data.returnScene;
      sceneData.packDefId = data.packDefId;
      break;
    }
    case 'TrailEvent': {
      const data = snapshot.scene as TrailEventSaveData;
      sceneData.restoreTrail = data;
      break;
    }
    case 'RoundSelect':
      break;
  }

  return { scene: snapshot.activeScene, sceneData };
}

export function getSaveFilename(snapshot: GameSaveSnapshot): string {
  const ts = snapshot.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  return `wagon-bones-L${snapshot.player.leg}R${snapshot.player.round}-${snapshot.activeScene}-${ts}.json`;
}

export function serializePackItem(item: PackItem): SerializedPackItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    ...(item.die ? { die: { ...item.die } } : {}),
    ...(item.equipmentDef ? { equipmentDefId: item.equipmentDef.id } : {}),
    ...(item.equipmentPreview ? { equipmentPreview: serializeEquipmentInstance(item.equipmentPreview) } : {}),
    ...(item.supplyCardId ? { supplyCardId: item.supplyCardId } : {}),
    ...(item.trailGuideId ? { trailGuideId: item.trailGuideId } : {}),
    ...(item.frontierEncounterId ? { frontierEncounterId: item.frontierEncounterId } : {}),
    ...(item.diceSelection ? { diceSelection: item.diceSelection } : {}),
    ...(item.instantEffect ? { instantEffect: item.instantEffect } : {}),
  };
}

export function deserializePackItem(s: SerializedPackItem): PackItem {
  const item: PackItem = {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category as PackCategory,
  };
  if (s.die) item.die = { ...s.die };
  if (s.equipmentDefId) {
    const def = getEquipmentDefById(s.equipmentDefId);
    if (!def) throw new Error(`Unknown equipment id: ${s.equipmentDefId}`);
    item.equipmentDef = def;
  }
  if (s.equipmentPreview) item.equipmentPreview = deserializeEquipmentInstance(s.equipmentPreview);
  if (s.supplyCardId) item.supplyCardId = s.supplyCardId;
  if (s.trailGuideId) item.trailGuideId = s.trailGuideId;
  if (s.frontierEncounterId) item.frontierEncounterId = s.frontierEncounterId;
  if (s.diceSelection) item.diceSelection = s.diceSelection;
  if (s.instantEffect) item.instantEffect = s.instantEffect;
  return item;
}

/** Verify boss IDs exist (called during validation). */
export function assertSaveIntegrity(snapshot: GameSaveSnapshot): void {
  for (const id of snapshot.player.bossAssignmentIds) {
    if (!bosses.find((b) => b.id === id)) {
      throw new Error(`Save references unknown boss: ${id}`);
    }
  }
  for (const eq of snapshot.player.equipment) {
    if (!getEquipmentDefById(eq.defId)) {
      throw new Error(`Save references unknown equipment: ${eq.defId}`);
    }
  }
}
