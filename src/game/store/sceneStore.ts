// ─── Scene store (No Phaser imports) ───
// Save/load-relevant scene runtime data (shop stock, packs, trail events, etc.).

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ConsumableTargetingSession } from '../consumables/consumableTargetingSession';
import type {
  ActiveSceneKey,
  BoosterPackSceneState,
  PayoutSceneState,
  RoundSelectSceneState,
  SceneRuntimeState,
  ShopSceneState,
  TrailEventSceneState,
} from './types';
import { normalizeShopSceneState } from './shopStock';

export function createInitialSceneState(): SceneRuntimeState {
  return {
    activeScene: 'none',
    shop: null,
    boosterPack: null,
    trailEvent: null,
    payout: null,
    roundSelect: null,
    consumableTargeting: null,
    consumableSeedDieIds: undefined,
  };
}

function mergeSceneState(partial: Partial<SceneRuntimeState>): (state: SceneRuntimeState) => SceneRuntimeState {
  return (state) => ({ ...state, ...partial });
}

export const sceneStore = createStore<SceneRuntimeState>()(subscribeWithSelector(() => createInitialSceneState()));

export const sceneActions = {
  reset(): void {
    sceneStore.setState(createInitialSceneState(), true);
  },

  hydrate(state: SceneRuntimeState): void {
    sceneStore.setState(state, true);
  },

  patch(partial: Partial<SceneRuntimeState>): void {
    sceneStore.setState(mergeSceneState(partial));
  },

  setActiveScene(activeScene: SceneRuntimeState['activeScene']): void {
    sceneStore.setState({ activeScene });
  },

  enterScene(activeScene: ActiveSceneKey): void {
    sceneStore.setState((state) => ({ ...state, activeScene }));
  },

  leaveScene(): void {
    sceneStore.setState({
      activeScene: 'none',
      shop: null,
      boosterPack: null,
      trailEvent: null,
      payout: null,
      roundSelect: null,
      consumableTargeting: null,
    });
  },

  setConsumableTargeting(consumableTargeting: ConsumableTargetingSession | null): void {
    sceneStore.setState({ consumableTargeting });
  },

  enterShop(shop: ShopSceneState): void {
    sceneStore.setState((state) => ({ ...state, activeScene: 'Shop', shop: normalizeShopSceneState(shop) }));
  },

  patchShop(partial: Partial<ShopSceneState>): void {
    sceneStore.setState((state) => {
      if (!state.shop) return state;
      return { ...state, shop: { ...state.shop, ...partial } };
    });
  },

  markShopStockSold(index: number): void {
    sceneStore.setState((state) => {
      const shop = state.shop;
      if (!shop || index < 0 || index >= shop.stock.length) return state;
      const stock = shop.stock.map((item, i) => (i === index ? { ...item, sold: true } : item));
      return { ...state, shop: { ...shop, stock } };
    });
  },

  markShopPackOpened(index: number): void {
    sceneStore.setState((state) => {
      const shop = state.shop;
      if (!shop || index < 0 || index >= shop.packs.length) return state;
      const packs = shop.packs.map((pack, i) => (i === index ? { ...pack, opened: true } : pack));
      return { ...state, shop: { ...shop, packs } };
    });
  },

  clearShop(): void {
    sceneStore.setState((state) => ({ ...state, shop: null }));
  },

  enterBoosterPack(pack: BoosterPackSceneState): void {
    sceneStore.setState((state) => ({
      ...state,
      activeScene: 'BoosterPack',
      boosterPack: { ...pack, lineupDieIds: pack.lineupDieIds ?? [] },
    }));
  },

  patchBoosterPack(partial: Partial<BoosterPackSceneState>): void {
    sceneStore.setState((state) => {
      if (!state.boosterPack) return state;
      const next = { ...state.boosterPack, ...partial };
      return { ...state, boosterPack: { ...next, lineupDieIds: next.lineupDieIds ?? [] } };
    });
  },

  markBoosterCardUsed(index: number): void {
    sceneStore.setState((state) => {
      const pack = state.boosterPack;
      if (!pack) return state;
      const used = pack.usedCardIndices.includes(index) ? pack.usedCardIndices : [...pack.usedCardIndices, index];
      return { ...state, boosterPack: { ...pack, usedCardIndices: used } };
    });
  },

  clearBoosterPack(): void {
    sceneStore.setState((state) => ({ ...state, boosterPack: null }));
  },

  patchPackLineupSelection(lineupSelectedDieIds: string[]): void {
    sceneActions.patchBoosterPack({ lineupSelectedDieIds });
  },

  patchConsumableSeedSelection(consumableSeedDieIds: string[]): void {
    sceneStore.setState({ consumableSeedDieIds });
  },

  enterTrailEvent(trail: TrailEventSceneState): void {
    sceneStore.setState((state) => ({ ...state, activeScene: 'TrailEvent', trailEvent: trail }));
  },

  patchTrailEvent(partial: Partial<TrailEventSceneState>): void {
    sceneStore.setState((state) => {
      if (!state.trailEvent) return state;
      return { ...state, trailEvent: { ...state.trailEvent, ...partial } };
    });
  },

  clearTrailEvent(): void {
    sceneStore.setState((state) => ({ ...state, trailEvent: null }));
  },

  enterPayout(payout: PayoutSceneState): void {
    sceneStore.setState((state) => ({ ...state, activeScene: 'Payout', payout }));
  },

  clearPayout(): void {
    sceneStore.setState((state) => ({ ...state, payout: null }));
  },

  enterRoundSelect(roundSelect: RoundSelectSceneState): void {
    sceneStore.setState((state) => ({ ...state, activeScene: 'RoundSelect', roundSelect }));
  },

  syncRoundSelectFromRun(roundSkipPreviewTags: RoundSelectSceneState['roundSkipPreviewTags']): void {
    const tags = { ...roundSkipPreviewTags };
    sceneStore.setState((state) => {
      if (state.roundSelect) {
        return { ...state, roundSelect: { ...state.roundSelect, roundSkipPreviewTags: tags } };
      }
      return { activeScene: 'RoundSelect', roundSelect: { roundSkipPreviewTags: tags } };
    });
  },

  clearRoundSelect(): void {
    sceneStore.setState((state) => ({ ...state, roundSelect: null }));
  },
};

/** @deprecated Import sceneActions from sceneStore directly. */
export const sceneLifecycleActions = sceneActions;

export function getSceneState(): SceneRuntimeState {
  return sceneStore.getState();
}

export function subscribeSceneState(
  listener: (state: SceneRuntimeState, prevState: SceneRuntimeState) => void,
): () => void {
  return sceneStore.subscribe(listener);
}
