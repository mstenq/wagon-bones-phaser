// ─── Hand Stats Helpers (No Phaser imports) ───

import type { HandStats, HandType } from './types';

/** Hand types tied for the highest timesPlayed count. Empty when nothing has been played. */
export function getMostPlayedHandTypes(handStats: Map<HandType, HandStats>): HandType[] {
  let max = 0;
  for (const [, stats] of handStats) {
    max = Math.max(max, stats.timesPlayed);
  }
  if (max === 0) return [];
  const types: HandType[] = [];
  for (const [type, stats] of handStats) {
    if (stats.timesPlayed === max) types.push(type);
  }
  return types;
}
