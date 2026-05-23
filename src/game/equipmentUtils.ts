// ─── Equipment helpers (loaded dice, copy targets) ───
// Pure logic — no Phaser. Kept separate from Constants.ts (values only).

import { COPY_INCOMPATIBLE_EFFECTS } from './Constants';
import { rngFloat, type RngStream } from './RunRng';

/**
 * Count how many Loaded Dice are equipped and return the probability multiplier.
 * Each Loaded Dice doubles all listed probabilities, so 2 copies = 4x multiplier.
 * Returns 2^n where n = number of Loaded Dice equipped.
 */
export function getLoadedDiceMultiplier(equipment: { def: { effectType: string } }[]): number {
  let count = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'LOADED_DICE') count++;
  }
  return count > 0 ? Math.pow(2, count) : 1;
}

/**
 * Roll a probability check with Loaded Dice support.
 * Takes a [numerator, denominator] chance tuple and the equipment array.
 * Returns true if the check succeeds.
 */
export function checkLoadedChance(
  chance: [number, number],
  equipment: { def: { effectType: string } }[],
  stream: RngStream = 'loadedDice',
): boolean {
  const [num, den] = chance;
  const ldm = getLoadedDiceMultiplier(equipment);
  return rngFloat(stream) < (num * ldm) / den;
}

/**
 * Resolve the effective equipment that a copy item should emulate.
 * Returns the resolved item, or null if nothing valid to copy.
 * Uses a visited set to prevent infinite loops between Mirror Lake and Echo Chamber.
 */
export function resolveCopyTarget<T extends { def: { effectType: string } }>(
  equipment: T[],
  sourceIndex: number,
  maxDepth: number,
  visited: Set<number> = new Set(),
): T | null {
  if (maxDepth <= 0) return null;
  visited.add(sourceIndex);

  const equip = equipment[sourceIndex];
  let targetIndex: number | null = null;

  if (equip.def.effectType === 'COPY_RIGHT') {
    targetIndex = sourceIndex + 1;
  } else if (equip.def.effectType === 'COPY_LEFTMOST') {
    if (sourceIndex === 0) return null;
    targetIndex = 0;
  } else {
    if (COPY_INCOMPATIBLE_EFFECTS.has(equip.def.effectType)) return null;
    return equip;
  }

  if (targetIndex === null || targetIndex < 0 || targetIndex >= equipment.length) return null;
  if (visited.has(targetIndex)) return null;

  const target = equipment[targetIndex];

  if (target.def.effectType === 'COPY_RIGHT' || target.def.effectType === 'COPY_LEFTMOST') {
    return resolveCopyTarget(equipment, targetIndex, maxDepth - 1, visited);
  }

  if (COPY_INCOMPATIBLE_EFFECTS.has(target.def.effectType)) return null;

  return target;
}
