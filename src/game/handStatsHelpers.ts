// ─── Hand Stats Helpers (No Phaser imports) ───

import { getHandByType } from '../data/hands';
import type { HandStats, HandUpgradeInfo } from './types';
import { HandType } from './types';
import { getSupplyDefById } from './ConsumablesSystem';
import { getRunState } from './store/runStore';
import { selectHandStats } from './store/selectors/runSelectors';
import { progressionActions } from './store/actions/progressionActions';

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

/** Upgrade a hand's trail guide level and return animation metadata. */
export function applyHandLevelUpgrade(handType: HandType, amount: number = 1): HandUpgradeInfo {
  const run = getRunState();
  const stats = selectHandStats(run, handType);
  const oldLevel = stats.level;
  progressionActions.upgradeHandLevel(handType, amount);
  const newStats = selectHandStats(getRunState(), handType);
  const info = buildHandUpgradeInfo(handType, oldLevel, newStats.level, newStats);
  if (!info) {
    throw new Error(`applyHandLevelUpgrade: unknown hand type ${handType}`);
  }
  return info;
}

/** Non-secret hands, plus secret hands scored at least once this run. */
export function isHandTypeSpawnableThisRun(handType: HandType, handStats: Record<HandType, HandStats>): boolean {
  if (!getHandByType(handType)?.secret) return true;
  return (handStats[handType]?.timesPlayed ?? 0) > 0;
}

export function getSpawnableHandTypes(handStats: Record<HandType, HandStats>): HandType[] {
  return Object.values(HandType).filter((ht) => isHandTypeSpawnableThisRun(ht, handStats));
}

export function resolveWantedPosterTargetHand(
  targetHandIdx: number,
  handStats: Record<HandType, HandStats>,
): HandType {
  const handTypes = getSpawnableHandTypes(handStats);
  return handTypes[targetHandIdx % handTypes.length];
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

/** Supply card ids tied for the highest use count. Empty when nothing has been used. */
export function getMostUsedSupplyIds(counts: Record<string, number>): string[] {
  let max = 0;
  for (const count of Object.values(counts)) {
    max = Math.max(max, count);
  }
  if (max === 0) return [];
  const ids: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count === max) ids.push(id);
  }
  return ids;
}

/** Display names for supply cards tied for the highest use count. */
export function getMostUsedSupplyNames(counts: Record<string, number>): string[] {
  return getMostUsedSupplyIds(counts)
    .map((id) => getSupplyDefById(id)?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
