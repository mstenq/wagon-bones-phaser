// ─── Supply card weighting from equipment effectParams.weightSupply ───

import type { EquipmentInstance } from './ItemsSystem';
import { parseWeightSupplyFromParams } from './effectParams';
import { rngFloat, type RngStream } from './RunRng';
import { resolveEquipmentList } from './store/resolve';

/**
 * Expected ratio of pick rates: (weighted pool) / (uniform pool).
 *
 * Models one target card with combined weight `weightMultiplier` and every other
 * card at weight 1 in a pool of `poolSize` distinct ids (shop roll, Supply Cache, etc.).
 *
 * @example
 * // 23 supply cards, 2× weight on target → ~1.92× pick rate (not exactly 2.0)
 * expectedRelativeRate(2, 23) // ≈ 1.92
 * @example
 * // Wood Axe + Covered Wagon → 4× weight → ~3.54× pick rate
 * expectedRelativeRate(4, 23) // ≈ 3.54
 * @example
 * // Iron Furnace + Iron Spurs + Alchemy Kit → 8× coffee_tin weight (2×2×2)
 * expectedRelativeRate(8, 23) // ≈ 6.96
 */
export function expectedRelativeRate(weightMultiplier: number, poolSize: number): number {
  if (poolSize < 1) return weightMultiplier;
  if (weightMultiplier <= 0) return 0;
  return (weightMultiplier * poolSize) / (poolSize - 1 + weightMultiplier);
}

/** Combined weight multiplier for a supply card id (product of all equipment entries). */
export function getSupplyCardWeightMultiplier(
  supplyId: string,
  equipment: EquipmentInstance[] = resolveEquipmentList(),
): number {
  let multiplier = 1;
  for (const equip of equipment) {
    for (const entry of parseWeightSupplyFromParams(equip.def.effectParams)) {
      if (entry.supplyId === supplyId) {
        multiplier *= entry.multiplier;
      }
    }
  }
  return multiplier;
}

export function getSupplyCardWeightForItem<T extends { id: string }>(
  item: T,
  equipment: EquipmentInstance[] = resolveEquipmentList(),
): number {
  return getSupplyCardWeightMultiplier(item.id, equipment);
}

/** Weighted pick from a pool; uniform when all weights are 1. */
export function pickWeightedSupplyCard<T extends { id: string }>(
  pool: T[],
  stream: RngStream,
  options?: { excludeIds?: string[]; equipment?: EquipmentInstance[] },
): T {
  if (pool.length === 0) {
    throw new Error(`Cannot pick from empty supply pool for stream "${stream}"`);
  }

  let candidates = pool;
  const excludeIds = options?.excludeIds;
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    const filtered = pool.filter((c) => !excluded.has(c.id));
    if (filtered.length > 0) candidates = filtered;
  }

  const equipment = options?.equipment ?? resolveEquipmentList();
  const weights = candidates.map((c) => getSupplyCardWeightForItem(c, equipment));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return candidates[0]!;

  let roll = rngFloat(stream) * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/** Pick N distinct supply cards without replacement using equipment weights. */
export function pickWeightedSupplyCardsWithoutReplacement<T extends { id: string }>(
  pool: T[],
  count: number,
  stream: RngStream,
  options?: { excludeIds?: string[]; equipment?: EquipmentInstance[] },
): T[] {
  let remaining = [...pool];
  const excludeIds = options?.excludeIds;
  if (excludeIds && excludeIds.length > 0) {
    const excluded = new Set(excludeIds);
    const filtered = remaining.filter((c) => !excluded.has(c.id));
    if (filtered.length > 0) remaining = filtered;
  }

  const picks: T[] = [];
  const n = Math.min(count, remaining.length);
  const equipment = options?.equipment;

  for (let i = 0; i < n; i++) {
    const picked = pickWeightedSupplyCard(remaining, stream, { equipment });
    picks.push(picked);
    remaining = remaining.filter((c) => c.id !== picked.id);
  }
  return picks;
}
