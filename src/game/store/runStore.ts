// ─── Run store (No Phaser imports) ───
// Cross-scene run state; replaces PlayerState ownership in later migration steps.

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { GAMEPLAY } from '../Constants';
import { createEmptyModifiers, createEmptyTrailRoundEffects } from '../trailEventDefaults';
import { createDefaultHandStats, EMPTY_BOSS_ROUND_STATE, type RunState } from './types';

export function createInitialRunState(): RunState {
  return {
    balance: GAMEPLAY.STARTING_MONEY,
    dice: [],
    loadedDieTarget: null,
    loadedDieSyncLucky: false,
    spentDiceIds: [],
    equipment: [],
    maxEquipmentSlots: GAMEPLAY.MAX_EQUIPMENT_SLOTS,
    consumables: [],
    maxConsumableSlots: GAMEPLAY.MAX_CONSUMABLE_SLOTS,
    lastUsedConsumableId: null,
    shopSlots: GAMEPLAY.SHOP_SLOTS,
    shopRerollCount: 0,
    leg: 1,
    round: 1,
    roundBackgroundIndex: null,
    interestCap: GAMEPLAY.INTEREST_CAP,
    handStats: createDefaultHandStats(),
    professionId: null,
    difficulty: 1,
    handSize: GAMEPLAY.ROLL_SIZE,
    purchasedPermits: [],
    currentLegPermitId: null,
    permitPurchasedThisLeg: false,
    permitDayBonus: 0,
    permitRerollBonus: 0,
    permitDayPenalty: 0,
    permitRerollPenalty: 0,
    permitScoreReduction: 0,
    trailEventModifiers: createEmptyModifiers(),
    trailRoundEffects: createEmptyTrailRoundEffects(),
    pendingTrailEventId: null,
    seenTrailEventIds: [],
    skipNextShop: false,
    trailGuidesUsed: 0,
    startingDiceCount: GAMEPLAY.STARTING_DICE,
    bossEffectDisabled: false,
    bossRoundState: { ...EMPTY_BOSS_ROUND_STATE },
    pendingNewDiceIds: [],
    pendingHandDiceIds: [],
    pendingAnimatedDestructions: [],
    pendingJunkDealerCount: 0,
    pendingTags: [],
    storedAuraTags: [],
    roundsSkipped: 0,
    daysScored: 0,
    unusedRerollsTotal: 0,
    twinWagonCount: 0,
    wideSaddleBonus: 0,
    tagFreeReroll: false,
    bonusShopPermitId: null,
    skippedRoundsThisLeg: [],
    skippedRoundTags: {},
    skippedRoundTagMeta: {},
    roundSkipPreviewTags: {},
    roundSkipPreviewMeta: {},
    bossRerollsUsedThisLeg: 0,
    dynamiteSelfDestructed: false,
    endlessMode: false,
    storyVictoryPending: false,
    bossAssignmentIds: [],
    nextDieId: 0,
    uiEffects: [],
    playbackQueue: [],
  };
}

type RunStoreState = RunState;

const resetListeners = new Set<() => void>();

export function onRunStoreReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => resetListeners.delete(listener);
}

function mergeRunState(partial: Partial<RunState>): (state: RunStoreState) => RunStoreState {
  return (state) => ({ ...state, ...partial });
}

export const runStore = createStore<RunStoreState>()(subscribeWithSelector(() => createInitialRunState()));

export const runActions = {
  reset(): void {
    runStore.setState(createInitialRunState(), true);
    for (const listener of resetListeners) listener();
  },

  hydrate(state: RunState): void {
    runStore.setState(state, true);
    for (const listener of resetListeners) listener();
  },

  patch(partial: Partial<RunState>): void {
    runStore.setState(mergeRunState(partial));
  },

  setBalance(balance: number): void {
    runStore.setState({ balance });
  },

  enqueueUiEffect(effect: RunState['uiEffects'][number]): void {
    runStore.setState((state) => ({
      uiEffects: [...state.uiEffects, effect],
    }));
  },

  clearUiEffects(): void {
    runStore.setState({ uiEffects: [] });
  },

  /** Remove and return effects matching the predicate (one-shot animation consumption). */
  takeUiEffects(predicate: (effect: RunState['uiEffects'][number]) => boolean): RunState['uiEffects'] {
    const taken: RunState['uiEffects'] = [];
    const remaining: RunState['uiEffects'] = [];
    for (const effect of getRunState().uiEffects) {
      if (predicate(effect)) taken.push(effect);
      else remaining.push(effect);
    }
    if (taken.length > 0) {
      runStore.setState({ uiEffects: remaining });
    }
    return taken;
  },
};

export function getRunState(): RunState {
  return runStore.getState();
}

export function subscribeRunState(listener: (state: RunState, prevState: RunState) => void): () => void {
  return runStore.subscribe(listener);
}
