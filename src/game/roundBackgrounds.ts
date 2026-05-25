// ─── Round background selection (No Phaser imports) ───

import { GAMEPLAY } from './Constants';
import { rngInt } from './RunRng';
import { runActions } from './store/runStore';
import type { RunState } from './store/types';

export function gameRoundBackgroundTextureKey(index: number): string {
  return `bg_round_${index}`;
}

export function gameRoundBackgroundPath(index: number): string {
  return `assets/backgrounds/${index}.png`;
}

/** Rolls a numbered background (1..ROUND_BACKGROUND_COUNT) on the run RNG meta stream. */
export function pickGameRoundBackgroundIndex(): number {
  return rngInt('meta', 1, GAMEPLAY.ROUND_BACKGROUND_COUNT);
}

/**
 * Background index for the current round. Set in roundActions.startRound; persisted in saves.
 * Legacy saves without a stored index pick once and patch the run store.
 */
export function getRunRoundBackgroundIndex(run: RunState): number {
  if (run.roundBackgroundIndex != null) {
    return run.roundBackgroundIndex;
  }
  const index = pickGameRoundBackgroundIndex();
  runActions.patch({ roundBackgroundIndex: index });
  return index;
}
