// ─── Hand composition (No Phaser imports) ───

import type { Die } from './types';
import type { RunState } from './store/types';
import { selectAvailableDice } from './store/selectors/runSelectors';
import { drawFromPouch } from './DiceSystem';

export interface BuildHandDiceIdsOptions {
  run: RunState;
  rollSize: number;
  carryoverIds?: string[];
  priorityIds?: string[];
  extraHandIds?: string[];
}

/** Fill hand ids: carryover → priority → random draw → extras beyond roll size. */
export function buildHandDiceIds(options: BuildHandDiceIdsOptions): string[] {
  const { run, rollSize, carryoverIds = [], priorityIds = [], extraHandIds = [] } = options;
  const available = selectAvailableDice(run);
  const availableById = new Map(available.map((d) => [d.id, d]));
  const hand: Die[] = [];
  const usedIds = new Set<string>();

  for (const id of carryoverIds) {
    const die = availableById.get(id);
    if (die && !usedIds.has(id)) {
      hand.push(die);
      usedIds.add(id);
    }
  }

  for (const id of priorityIds) {
    if (hand.length >= rollSize) break;
    if (usedIds.has(id)) continue;
    const die = availableById.get(id);
    if (die) {
      hand.push(die);
      usedIds.add(id);
    }
  }

  const remainingSlots = rollSize - hand.length;
  if (remainingSlots > 0) {
    const pool = available.filter((d) => !usedIds.has(d.id));
    const drawn = drawFromPouch(pool, Math.min(remainingSlots, pool.length)).drawn;
    for (const die of drawn) {
      hand.push(die);
      usedIds.add(die.id);
    }
  }

  for (const id of extraHandIds) {
    if (usedIds.has(id)) continue;
    const die = availableById.get(id);
    if (die) {
      hand.push(die);
      usedIds.add(id);
    }
  }

  return hand.map((d) => d.id);
}
