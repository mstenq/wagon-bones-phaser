// ─── Hand Stats Helpers (No Phaser imports) ───

import { getHandByType } from '../data/hands';
import type { HandStats, HandType, HandUpgradeInfo } from './types';

/** Build animation payload for a hand level change (trail guide, Surveyor's Mark, etc.). */
export function buildHandUpgradeInfo(
  handType: HandType,
  oldLevel: number,
  newLevel: number,
  stats: HandStats,
): HandUpgradeInfo | null {
  const handDef = getHandByType(handType);
  if (!handDef) return null;
  return {
    handType,
    handName: handDef.name,
    oldLevel,
    newLevel,
    oldBaseMiles: handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1),
    newBaseMiles: handDef.baseMiles + stats.milesPerLevel * (newLevel - 1),
    oldBaseMult: handDef.baseMult + stats.multPerLevel * (oldLevel - 1),
    newBaseMult: handDef.baseMult + stats.multPerLevel * (newLevel - 1),
  };
}

/** Hand types tied for the highest timesPlayed count. Empty when nothing has been played. */
export function getMostPlayedHandTypes(handStats: Map<HandType, HandStats> | Record<HandType, HandStats>): HandType[] {
  const entries =
    handStats instanceof Map ? [...handStats.entries()] : (Object.entries(handStats) as [HandType, HandStats][]);
  let max = 0;
  for (const [, stats] of entries) {
    max = Math.max(max, stats.timesPlayed);
  }
  if (max === 0) return [];
  const types: HandType[] = [];
  for (const [type, stats] of entries) {
    if (stats.timesPlayed === max) types.push(type);
  }
  return types;
}
