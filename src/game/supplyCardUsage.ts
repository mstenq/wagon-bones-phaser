// ─── Supply card usage tracking ───

import type { ConsumableDef } from './ConsumablesSystem';
import { getRunState, runActions } from './store/runStore';
import type { RunState } from './store/types';

export function buildSupplyConsumedPatch(def: ConsumableDef, run: RunState = getRunState()) {
  if (def.category !== 'supply') return null;
  const nextCounts = { ...run.supplyCardUseCounts };
  nextCounts[def.id] = (nextCounts[def.id] ?? 0) + 1;
  return {
    supplyCardsUsed: run.supplyCardsUsed + 1,
    supplyCardUseCounts: nextCounts,
  };
}

/** Atomically increment run-wide supply use counters when a supply card is consumed. */
export function recordSupplyCardConsumed(def: ConsumableDef): void {
  const patch = buildSupplyConsumedPatch(def);
  if (patch) runActions.patch(patch);
}
