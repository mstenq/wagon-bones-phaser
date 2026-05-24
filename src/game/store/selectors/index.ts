// ─── Store selectors (No Phaser imports) ───
// Derived values and render-focused slices for subscribers.

import type { Die } from '../../types';
import { getRunState, runStore } from '../runStore';
import { roundStore, type RoundStoreState } from '../roundStore';
import { getSceneState, sceneStore } from '../sceneStore';
import type { RunState, SceneRuntimeState } from '../types';

export function selectBalance(state: RunState = getRunState()): number {
  return state.balance;
}

export function selectDiceCollection(state: RunState = getRunState()): Die[] {
  return state.dice;
}

export function selectAvailableDiceCount(state: RunState = getRunState()): number {
  const spent = new Set(state.spentDiceIds);
  return state.dice.filter((d) => !spent.has(d.id)).length;
}

export function selectTotalDiceCount(state: RunState = getRunState()): number {
  return state.dice.length;
}

export function selectEquipmentCount(state: RunState = getRunState()): number {
  return state.equipment.length;
}

export function selectConsumableCount(state: RunState = getRunState()): number {
  return state.consumables.length;
}

export function selectPendingTagCount(state: RunState = getRunState()): number {
  return state.pendingTags.length;
}

export * from './roundSelectors';

export function selectActiveScene(state: SceneRuntimeState = getSceneState()): SceneRuntimeState['activeScene'] {
  return state.activeScene;
}

export * from './runSelectors';
export * from './uiSelectors';
export * from './sceneSelectors';

export function selectShopStock(state: SceneRuntimeState = getSceneState()) {
  return state.shop?.stock ?? [];
}

type SelectorSubscribeOptions<T> = {
  equalityFn?: (a: T, b: T) => boolean;
  fireImmediately?: boolean;
};

function selectorSubscribeOptions<T>(options?: SelectorSubscribeOptions<T>) {
  return { fireImmediately: true, ...options };
}

/** Subscribe to a run-store slice (vanilla store + selector). */
export function subscribeRunSelector<T>(
  selector: (state: RunState) => T,
  listener: (value: T, prevValue: T) => void,
  options?: SelectorSubscribeOptions<T>,
): () => void {
  return runStore.subscribe(selector, listener, selectorSubscribeOptions(options));
}

/** Subscribe to a round-store slice. */
export function subscribeRoundSelector<T>(
  selector: (state: RoundStoreState) => T,
  listener: (value: T, prevValue: T) => void,
  options?: SelectorSubscribeOptions<T>,
): () => void {
  return roundStore.subscribe(selector, listener, selectorSubscribeOptions(options));
}

/** Subscribe to a scene-store slice. */
export function subscribeSceneSelector<T>(
  selector: (state: SceneRuntimeState) => T,
  listener: (value: T, prevValue: T) => void,
  options?: SelectorSubscribeOptions<T>,
): () => void {
  return sceneStore.subscribe(selector, listener, selectorSubscribeOptions(options));
}
