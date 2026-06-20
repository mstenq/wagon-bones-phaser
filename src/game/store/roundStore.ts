// ─── Round store (No Phaser imports) ───
// Active round state; replaces GameState ownership in later migration steps.

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { DEFAULT_CONFIG } from '../types';
import { D, ZERO } from '../decimal';
import type { RoundRuntimeState } from './types';

export type RoundStoreState = RoundRuntimeState | null;

export function createInitialRoundState(): RoundRuntimeState {
  return {
    config: { ...DEFAULT_CONFIG, targetMiles: D(300) },
    phase: 'SELECT',
    day: 1,
    rerollsRemaining: DEFAULT_CONFIG.maxRerolls,
    totalMiles: ZERO,
    spentDiceIds: [],
    handDiceIds: [],
    dieValuesByDieId: {},
    selectedForRollIds: [],
    rolledDice: [],
    selectedForScoreIds: [],
    rerollLockedDiceIds: [],
    currentHandType: null,
    handHistory: [],
    lastScoreResult: null,
    sidebarOverlay: null,
  };
}

function mergeRoundState(partial: Partial<RoundRuntimeState>): (state: RoundRuntimeState) => RoundRuntimeState {
  return (state) => ({ ...state, ...partial });
}

export const roundStore = createStore<RoundStoreState>()(subscribeWithSelector((): RoundStoreState => null));

export function patchRoundStore(partial: Partial<RoundRuntimeState>): void {
  roundStore.setState((current) => {
    if (!current) return current;
    return mergeRoundState(partial)(current);
  });
}

export function getRoundState(): RoundStoreState {
  return roundStore.getState();
}

export function subscribeRoundState(
  listener: (state: RoundStoreState, prevState: RoundStoreState) => void,
): () => void {
  return roundStore.subscribe(listener);
}
