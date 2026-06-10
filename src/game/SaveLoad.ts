// ─── Save / Load (No Phaser imports) ───
// Versioned JSON snapshots read from and hydrate Zustand stores directly.

import type { Die, DifficultyLevel, GameConfig, HandStats, RoundState, HandType } from './types';
import type { EquipmentModifier } from './types';
import { HandType as HandTypeEnum } from './types';
import { getEquipmentDefById } from './ItemsSystem';
import type { EquipmentInstance } from './ItemsSystem';
import { acquireEquipmentInstance } from './EquipmentModifiers';
import { type PackItem, type PackCategory, type InstantEffect } from './BoosterPackSystem';
import type { DiceSelectionConfig } from './DiceSelectionSystem';
import { getRunRngState, getRunSeed, restoreRunRng, type RunRngState } from './RunRng';
import { milesToSave, milesFromSave } from './scoreMath';
import { getRunState, runActions } from './store/runStore';
import { getRoundState, roundStore } from './store/roundStore';
import { getSceneState, sceneActions } from './store/sceneStore';
import { roundActions } from './store/actions/roundActions';
import { legacyRoundStateToRuntime } from './store/roundResolve';
import type { StoredTagInstance } from './store/types';
import {
  deserializeRunState,
  deserializeRoundState,
  deserializeSceneState,
  serializeRunState,
  serializeRoundState,
  serializeSceneState,
  type SerializedRunState,
  type SerializedRoundRuntimeState,
  type SerializedSceneRuntimeState,
} from './store/serialization';
import type {
  ActiveSceneKey,
  BoosterPackSceneState,
  SceneRuntimeState,
  ShopSceneState,
  StoredShopItem,
  StoredPackItem,
  TrailEventSceneState,
} from './store/types';
import { createEmptyTrailRoundEffects } from './TrailEventsSystem';
import { normalizeShopSceneState } from './store/shopStock';
import { getTrailTagById } from '../data/trail_tags';
import bosses from '../data/bosses';

export const SAVE_VERSION = 4;

export type ActiveScene = Exclude<ActiveSceneKey, 'none' | 'Payout'>;

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
  surveyorHand?: HandType;
}

/** @deprecated v3 save payload — migrated on load only. */
export interface PlayerSaveData {
  balance: number;
  dice: Die[];
  loadedDieTarget: number | null;
  loadedDieSyncLucky?: boolean;
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
  trailEventModifiers: import('./TrailEventsSystem').TrailEventModifiers;
  trailRoundEffects: import('./TrailEventsSystem').TrailRoundEffects;
  pendingTrailEventId: string | null;
  seenTrailEventIds: string[];
  seenTrailTagIds?: string[];
  skipNextShop: boolean;
  trailGuidesUsed: number;
  supplyCardsUsed?: number;
  supplyCardUseCounts?: Record<string, number>;
  equipmentObtainedIds?: string[];
  startingDiceCount: number;
  bossEffectDisabled: boolean;
  bossRoundState: import('./store/types').BossRoundState;
  pendingNewDiceIds: string[];
  priorityHandDiceIds?: string[];
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
  skippedRoundTagMeta?: Record<number, { surveyorHand?: HandType }>;
  roundSkipPreviewTags: Record<number, string>;
  roundSkipPreviewMeta?: Record<number, { surveyorHand?: HandType }>;
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

/** JSON-safe game round snapshot (miles as strings). */
export interface SerializedGameRoundSaveData {
  config: Omit<GameConfig, 'targetMiles'> & { targetMiles: string };
  state: Omit<RoundState, 'totalMiles'> & { totalMiles: string };
}

export function serializeGameRound(data: GameRoundSaveData): SerializedGameRoundSaveData {
  return {
    config: { ...data.config, targetMiles: milesToSave(data.config.targetMiles) },
    state: { ...data.state, totalMiles: milesToSave(data.state.totalMiles) },
  };
}

export function deserializeGameRound(data: SerializedGameRoundSaveData): GameRoundSaveData {
  return {
    config: { ...data.config, targetMiles: milesFromSave(data.config.targetMiles) },
    state: { ...data.state, totalMiles: milesFromSave(data.state.totalMiles) },
  };
}

export interface ShopSaveData {
  stock: SerializedShopItem[];
  packs: { defId: string; instanceId: string; opened?: boolean }[];
  shopRerollCount: number;
  visitMods?: { freeShop: boolean };
  bonusPermitIds?: string[];
}

export type SerializedShopItem = StoredShopItem;

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
  diceSelection?: DiceSelectionConfig;
  instantEffect?: InstantEffect;
}

export interface BoosterPackSaveData {
  packDefId: string;
  returnScene: string;
  queuedPackDefIds?: string[];
  contents: SerializedPackItem[];
  picksRemaining: number;
  effectivePickCount?: number;
  usedCardIndices: number[];
  lineupDieIds?: string[];
  lineupSelectedDieIds?: string[];
}

export interface TrailEventSaveData {
  eventId: string;
  resolved: boolean;
  spyglassRevealed: boolean;
  selectedChoiceId?: string | null;
  resolvedDisplay?: TrailEventSceneState['resolvedDisplay'];
}

export interface GameSaveSnapshot {
  version: number;
  exportedAt: string;
  activeScene: ActiveScene;
  runSeed: string;
  rngState: RunRngState;
  run: SerializedRunState;
  round: SerializedRoundRuntimeState | null;
  scene: SerializedSceneRuntimeState;
}

export interface BuildSaveSnapshotOptions {
  activeScene?: ActiveScene;
  scene?: Partial<SceneRuntimeState>;
}

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

export function deserializeEquipmentInstance(
  data: SerializedEquipmentInstance,
  purchasedPermitIds: string[] = getRunState().purchasedPermits,
): EquipmentInstance {
  const def = getEquipmentDefById(data.defId);
  if (!def) throw new Error(`Unknown equipment id: ${data.defId}`);
  const inst = acquireEquipmentInstance(def, purchasedPermitIds, data.modifiers);
  inst.sellValue = data.sellValue;
  inst.state = { ...data.state };
  if (data.perishableRoundsLeft !== undefined) {
    inst.perishableRoundsLeft = data.perishableRoundsLeft;
  }
  return inst;
}

function deserializeTags(items: SerializedTagInstance[]): StoredTagInstance[] {
  return items.map(({ tagId, copies, surveyorHand }) => {
    const def = getTrailTagById(tagId);
    if (!def) throw new Error(`Unknown trail tag id: ${tagId}`);
    const stored: StoredTagInstance = { tagId, copies };
    if (surveyorHand) stored.surveyorHand = surveyorHand;
    return stored;
  });
}

function playerSaveToRunState(data: PlayerSaveData): SerializedRunState {
  const handStats = {} as Record<HandType, HandStats>;
  for (const type of Object.values(HandTypeEnum)) {
    const stats = data.handStats[type];
    if (stats) handStats[type] = { ...stats };
  }

  return {
    balance: data.balance,
    dice: data.dice.map((d) => ({ ...d })),
    loadedDieTarget: data.loadedDieTarget,
    loadedDieSyncLucky: data.loadedDieSyncLucky ?? false,
    spentDiceIds: [...data.spentDiceIds],
    equipment: data.equipment.map((eq) => ({ ...eq })),
    maxEquipmentSlots: data.maxEquipmentSlots,
    maxConsumableSlots: data.maxConsumableSlots,
    consumables: data.consumables.map((c) => ({ ...c })),
    lastUsedConsumableId: data.lastUsedConsumableId,
    shopSlots: data.shopSlots,
    shopRerollCount: data.shopRerollCount,
    leg: data.leg,
    round: data.round,
    interestCap: data.interestCap,
    handStats,
    professionId: data.professionId,
    difficulty: data.difficulty,
    handSize: data.handSize,
    purchasedPermits: [...data.purchasedPermits],
    currentLegPermitId: data.currentLegPermitId,
    permitPurchasedThisLeg: data.permitPurchasedThisLeg,
    permitDayBonus: data.permitDayBonus,
    permitRerollBonus: data.permitRerollBonus,
    permitDayPenalty: data.permitDayPenalty,
    permitRerollPenalty: data.permitRerollPenalty,
    permitScoreReduction: data.permitScoreReduction,
    trailEventModifiers: { ...data.trailEventModifiers },
    trailRoundEffects: data.trailRoundEffects ? { ...data.trailRoundEffects } : createEmptyTrailRoundEffects(),
    pendingTrailEventId: data.pendingTrailEventId,
    seenTrailEventIds: [...data.seenTrailEventIds],
    seenTrailTagIds: [...(data.seenTrailTagIds ?? [])],
    skipNextShop: data.skipNextShop,
    trailGuidesUsed: data.trailGuidesUsed,
    supplyCardsUsed: data.supplyCardsUsed ?? 0,
    supplyCardUseCounts: data.supplyCardUseCounts ?? {},
    equipmentObtainedIds: data.equipmentObtainedIds ?? [],
    startingDiceCount: data.startingDiceCount,
    bossEffectDisabled: data.bossEffectDisabled,
    bossRoundState: {
      ...data.bossRoundState,
      disabledEquipmentIndices: [...data.bossRoundState.disabledEquipmentIndices],
      lockedDiceIds: [...data.bossRoundState.lockedDiceIds],
      handsPlayedThisRound: [...data.bossRoundState.handsPlayedThisRound],
      equipmentDisplayOrder: data.bossRoundState.equipmentDisplayOrder
        ? [...data.bossRoundState.equipmentDisplayOrder]
        : null,
    },
    pendingNewDiceIds: [...data.pendingNewDiceIds],
    priorityHandDiceIds: [...(data.priorityHandDiceIds ?? [])],
    pendingHandDiceIds: [...data.pendingHandDiceIds],
    pendingAnimatedDestructions: data.pendingAnimatedDestructions.map((d) => ({ ...d })),
    pendingJunkDealerCount: data.pendingJunkDealerCount,
    pendingTags: deserializeTags(data.pendingTags),
    storedAuraTags: deserializeTags(data.storedAuraTags),
    roundsSkipped: data.roundsSkipped,
    daysScored: data.daysScored,
    unusedRerollsTotal: data.unusedRerollsTotal,
    twinWagonCount: data.twinWagonCount,
    wideSaddleBonus: data.wideSaddleBonus,
    tagFreeReroll: data.tagFreeReroll,
    bonusShopPermitId: data.bonusShopPermitId,
    skippedRoundsThisLeg: [...data.skippedRoundsThisLeg],
    skippedRoundTags: { ...data.skippedRoundTags },
    skippedRoundTagMeta: { ...(data.skippedRoundTagMeta ?? {}) },
    roundSkipPreviewTags: { ...data.roundSkipPreviewTags },
    roundSkipPreviewMeta: { ...(data.roundSkipPreviewMeta ?? {}) },
    bossRerollsUsedThisLeg: data.bossRerollsUsedThisLeg,
    dynamiteSelfDestructed: data.dynamiteSelfDestructed,
    endlessMode: data.endlessMode ?? false,
    storyVictoryPending: data.storyVictoryPending ?? false,
    bossAssignmentIds: [...data.bossAssignmentIds],
    nextDieId: data.nextDieId,
    roundBackgroundIndex: null,
    statusTraitTokens: [],
    shopFreeRerollPlan: [],
  };
}

function legacySceneToRuntime(activeScene: ActiveScene, scene: unknown): SerializedSceneRuntimeState {
  switch (activeScene) {
    case 'Game':
      return {
        activeScene: 'Game',
        shop: null,
        boosterPack: null,
        trailEvent: null,
        payout: null,
        roundSelect: null,
        consumableTargeting: null,
      };
    case 'Shop': {
      const data = scene as ShopSaveData;
      return {
        activeScene: 'Shop',
        shop: normalizeShopSceneState({
          stock: data.stock,
          packs: data.packs.map((p) => ({
            defId: p.defId,
            instanceId: p.instanceId,
            opened: p.opened,
          })),
          shopRerollCount: data.shopRerollCount,
          visitMods: data.visitMods,
          bonusPermitIds: data.bonusPermitIds,
        }),
        boosterPack: null,
        trailEvent: null,
        payout: null,
        roundSelect: null,
        consumableTargeting: null,
      };
    }
    case 'BoosterPack': {
      const data = scene as BoosterPackSaveData;
      return {
        activeScene: 'BoosterPack',
        shop: null,
        boosterPack: {
          packDefId: data.packDefId,
          returnScene: data.returnScene,
          queuedPackDefIds: [...(data.queuedPackDefIds ?? [])],
          contents: data.contents as StoredPackItem[],
          picksRemaining: data.picksRemaining,
          effectivePickCount: data.effectivePickCount ?? 0,
          usedCardIndices: [...data.usedCardIndices],
          lineupDieIds: [...(data.lineupDieIds ?? [])],
          lineupSelectedDieIds: data.lineupSelectedDieIds ? [...data.lineupSelectedDieIds] : undefined,
        },
        trailEvent: null,
        payout: null,
        roundSelect: null,
        consumableTargeting: null,
      };
    }
    case 'TrailEvent': {
      const data = scene as TrailEventSaveData;
      return {
        activeScene: 'TrailEvent',
        shop: null,
        boosterPack: null,
        trailEvent: {
          eventId: data.eventId,
          resolved: data.resolved,
          spyglassRevealed: data.spyglassRevealed,
          ...(data.selectedChoiceId != null ? { selectedChoiceId: data.selectedChoiceId } : {}),
          ...(data.resolvedDisplay ? { resolvedDisplay: data.resolvedDisplay } : {}),
        },
        payout: null,
        roundSelect: null,
        consumableTargeting: null,
      };
    }
    case 'RoundSelect':
      return {
        activeScene: 'RoundSelect',
        shop: null,
        boosterPack: null,
        trailEvent: null,
        payout: null,
        roundSelect: null,
        consumableTargeting: null,
      };
  }
}

function normalizeSnapshot(data: unknown): GameSaveSnapshot | null {
  if (!data || typeof data !== 'object') return null;
  const snap = data as Record<string, unknown>;

  if (snap.version === SAVE_VERSION && snap.run && typeof snap.run === 'object') {
    return snap as unknown as GameSaveSnapshot;
  }

  if (snap.version === 3 && snap.player && typeof snap.player === 'object') {
    const v3 = snap as {
      version: number;
      exportedAt: string;
      activeScene: ActiveScene;
      runSeed: string;
      rngState: RunRngState;
      player: PlayerSaveData;
      scene?: unknown;
    };
    if (!ACTIVE_SCENES.includes(v3.activeScene)) return null;

    let round: SerializedRoundRuntimeState | null = null;
    if (v3.activeScene === 'Game' && v3.scene) {
      const gameData = deserializeGameRound(v3.scene as SerializedGameRoundSaveData);
      round = serializeRoundState(legacyRoundStateToRuntime(gameData.config, gameData.state));
    }

    return {
      version: SAVE_VERSION,
      exportedAt: v3.exportedAt,
      activeScene: v3.activeScene,
      runSeed: v3.runSeed,
      rngState: v3.rngState,
      run: playerSaveToRunState(v3.player),
      round,
      scene: legacySceneToRuntime(v3.activeScene, v3.scene ?? {}),
    };
  }

  return null;
}

export function buildSaveSnapshot(options: BuildSaveSnapshotOptions = {}): GameSaveSnapshot {
  const run = getRunState();
  const round = getRoundState();
  const sceneState = getSceneState();

  const activeScene =
    options.activeScene ?? (sceneState.activeScene === 'none' ? 'RoundSelect' : sceneState.activeScene);
  const scene: SerializedSceneRuntimeState = serializeSceneState({
    ...sceneState,
    ...options.scene,
    activeScene,
  });

  return {
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    activeScene: activeScene as ActiveScene,
    runSeed: getRunSeed(),
    rngState: getRunRngState(),
    run: serializeRunState(run),
    round: serializeRoundState(round),
    scene,
  };
}

export function validateSaveSnapshot(data: unknown): GameSaveSnapshot | null {
  const normalized = normalizeSnapshot(data);
  if (!normalized) return null;
  if (normalized.version !== SAVE_VERSION) return null;
  if (!ACTIVE_SCENES.includes(normalized.activeScene)) return null;
  if (typeof normalized.runSeed !== 'string') return null;
  if (!normalized.rngState || typeof normalized.rngState !== 'object') return null;
  if (!normalized.run || typeof normalized.run !== 'object') return null;
  if (typeof normalized.run.balance !== 'number') return null;
  if (!Array.isArray(normalized.run.dice)) return null;
  if (!Array.isArray(normalized.run.bossAssignmentIds)) return null;
  if (!normalized.scene || typeof normalized.scene !== 'object') return null;
  return normalized;
}

export function applySaveSnapshot(snapshot: GameSaveSnapshot): { scene: ActiveScene } {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) {
    throw new Error(`Unsupported save version: ${(snapshot as GameSaveSnapshot).version}`);
  }

  assertSaveIntegrity(normalized);

  runActions.reset();
  roundStore.setState(null, true);
  sceneActions.reset();

  restoreRunRng(normalized.runSeed, normalized.rngState);

  const run = deserializeRunState(normalized.run);
  if (run.loadedDieSyncLucky) {
    const hasLucky = run.equipment.some((eq) => eq.defId === 'lucky_number');
    if (!hasLucky) run.loadedDieSyncLucky = false;
  }

  runActions.hydrate(run);

  const round = deserializeRoundState(normalized.round);
  if (round) {
    roundActions.hydrate(round);
  }

  sceneActions.hydrate(deserializeSceneState(normalized.scene));

  return { scene: normalized.activeScene };
}

export function getSaveFilename(snapshot: GameSaveSnapshot): string {
  const ts = snapshot.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  return `wagon-bones-L${snapshot.run.leg}R${snapshot.run.round}-${snapshot.activeScene}-${ts}.json`;
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
  for (const id of snapshot.run.bossAssignmentIds) {
    if (!bosses.find((b) => b.id === id)) {
      throw new Error(`Save references unknown boss: ${id}`);
    }
  }
  for (const eq of snapshot.run.equipment) {
    if (!getEquipmentDefById(eq.defId)) {
      throw new Error(`Save references unknown equipment: ${eq.defId}`);
    }
  }
}

export function shopSceneStateToSaveData(shop: ShopSceneState): ShopSaveData {
  return {
    stock: shop.stock,
    packs: shop.packs.map((p) => ({
      defId: p.defId,
      instanceId: p.instanceId,
      ...(p.opened ? { opened: true } : {}),
    })),
    shopRerollCount: shop.shopRerollCount,
    visitMods: shop.visitMods,
    bonusPermitIds: shop.bonusPermitIds,
  };
}

export function boosterPackSceneStateToSaveData(pack: BoosterPackSceneState): BoosterPackSaveData {
  return {
    packDefId: pack.packDefId,
    returnScene: pack.returnScene,
    ...(pack.queuedPackDefIds.length > 0 ? { queuedPackDefIds: [...pack.queuedPackDefIds] } : {}),
    contents: pack.contents as SerializedPackItem[],
    picksRemaining: pack.picksRemaining,
    effectivePickCount: pack.effectivePickCount,
    usedCardIndices: [...pack.usedCardIndices],
    ...((pack.lineupDieIds?.length ?? 0) > 0 ? { lineupDieIds: [...pack.lineupDieIds!] } : {}),
    ...(pack.lineupSelectedDieIds && pack.lineupSelectedDieIds.length > 0
      ? { lineupSelectedDieIds: [...pack.lineupSelectedDieIds] }
      : {}),
  };
}

export function trailEventSceneStateToSaveData(trail: TrailEventSceneState): TrailEventSaveData {
  return {
    eventId: trail.eventId,
    resolved: trail.resolved,
    spyglassRevealed: trail.spyglassRevealed,
    ...(trail.selectedChoiceId != null ? { selectedChoiceId: trail.selectedChoiceId } : {}),
    ...(trail.resolvedDisplay ? { resolvedDisplay: trail.resolvedDisplay } : {}),
  };
}
