// ─── Phaser store subscription helpers ───
// Binds vanilla Zustand stores to Phaser scenes and game objects; unsubscribes on shutdown/destroy.

import type Phaser from 'phaser';
import type { StoreApi } from 'zustand/vanilla';

/** Store with zustand subscribeWithSelector middleware (selector + listener overload). */
type SelectorSubscribableStore<TState> = StoreApi<TState> & {
  subscribe<U>(
    selector: (state: TState) => U,
    listener: (value: U, prevValue: U) => void,
    options?: { equalityFn?: (a: U, b: U) => boolean; fireImmediately?: boolean },
  ): () => void;
};

export interface BindStoreOptions<T> {
  /** When true (default), listener runs once immediately with the current selected value. */
  fireImmediately?: boolean;
  equalityFn?: (a: T, b: T) => boolean;
}

type Unsubscribe = () => void;

/**
 * Subscribe a Phaser scene to a store selector. Unsubscribes on scene shutdown.
 */
export function bindStore<TState, TSelected>(
  scene: Phaser.Scene,
  store: SelectorSubscribableStore<TState>,
  selector: (state: TState) => TSelected,
  listener: (value: TSelected, prevValue: TSelected) => void,
  options: BindStoreOptions<TSelected> = {},
): Unsubscribe {
  const { fireImmediately = true, equalityFn } = options;
  const unsubscribe = store.subscribe(selector, listener, { equalityFn, fireImmediately });
  scene.events.once('shutdown', unsubscribe);
  return unsubscribe;
}

/**
 * Subscribe a Phaser game object to a store selector. Unsubscribes on destroy.
 */
export function bindGameObject<TState, TSelected>(
  gameObject: Phaser.GameObjects.GameObject,
  store: SelectorSubscribableStore<TState>,
  selector: (state: TState) => TSelected,
  listener: (value: TSelected, prevValue: TSelected) => void,
  options: BindStoreOptions<TSelected> = {},
): Unsubscribe {
  const { fireImmediately = true, equalityFn } = options;
  const unsubscribe = store.subscribe(selector, listener, { equalityFn, fireImmediately });
  gameObject.once('destroy', unsubscribe);
  return unsubscribe;
}
