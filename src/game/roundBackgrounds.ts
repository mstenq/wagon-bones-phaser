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

function normalizeGameRoundBackgroundIndex(index: number): number {
  const count = GAMEPLAY.ROUND_BACKGROUND_COUNT;
  if (index >= 1 && index <= count) {
    return index;
  }
  return ((index - 1) % count) + 1;
}

/**
 * Background index for the current round. Set in roundActions.startRound; persisted in saves.
 * Legacy saves without a stored index pick once and patch the run store.
 * Out-of-range stored indices (e.g. from when ROUND_BACKGROUND_COUNT was higher) remap into range.
 */
export function getRunRoundBackgroundIndex(run: RunState): number {
  if (run.roundBackgroundIndex != null) {
    const normalized = normalizeGameRoundBackgroundIndex(run.roundBackgroundIndex);
    if (normalized !== run.roundBackgroundIndex) {
      runActions.patch({ roundBackgroundIndex: normalized });
    }
    return normalized;
  }
  const index = pickGameRoundBackgroundIndex();
  runActions.patch({ roundBackgroundIndex: index });
  return index;
}
