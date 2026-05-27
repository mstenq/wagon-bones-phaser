// ─── Equipment helpers (loaded dice, copy targets) ───
// Pure logic — no Phaser. Kept separate from Constants.ts (values only).

import { COPY_INCOMPATIBLE_EFFECTS } from './Constants';
import { rngFloat, type RngStream } from './RunRng';
import type { DiceEnhancement } from './types';

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

export function hasGamblersDiceCup(equipment: { def: { effectType: string } }[]): boolean {
  return equipment.some((equip) => equip.def.effectType === 'GAMBLERS_DICE_CUP');
}

/**
 * Probability that a die rolls the selected loaded-face value.
 * Loaded enhancement uses 1-in-3 base (× Loaded Dice item); cup gives other dice 1-in-6.
 */
export function getLoadedFaceRollChance(
  equipment: { def: { effectType: string } }[],
  dieEnhancement: DiceEnhancement,
): number {
  const ldm = getLoadedDiceMultiplier(equipment);
  if (dieEnhancement === 'loaded') {
    return Math.min(1, ldm / 3);
  }
  if (hasGamblersDiceCup(equipment)) {
    return Math.min(1, ldm / 6);
  }
  return 0;
}

function formatLoadedFaceOdds(chance: number): string {
  if (chance >= 1) return 'guaranteed';
  if (Math.abs(chance - 2 / 3) < 1e-9) return '2 in 3';
  if (Math.abs(chance - 1 / 3) < 1e-9) return '1 in 3';
  if (Math.abs(chance - 1 / 2) < 1e-9) return '1 in 2';
  if (Math.abs(chance - 1 / 6) < 1e-9) return '1 in 6';
  const denom = Math.round(1 / chance);
  return `1 in ${denom}`;
}

/** Human-readable odds for loaded-face rolling (picker UI). */
export function formatLoadedDieOddsNote(equipment: { def: { effectType: string } }[]): string {
  const loadedChance = getLoadedFaceRollChance(equipment, 'loaded');
  if (!hasGamblersDiceCup(equipment)) {
    if (loadedChance >= 1) return 'Selected face is guaranteed to roll.';
    if (loadedChance === 2 / 3) return 'Selected face rolls at 2 in 3.';
    if (loadedChance === 1 / 3) return 'Selected face rolls at 1 in 3.';
    return 'Selected face rolls at 1 in 6.';
  }

  const otherChance = getLoadedFaceRollChance(equipment, null);
  if (loadedChance >= 1 && otherChance >= 1) {
    return 'All dice always roll the selected face.';
  }
  return `Loaded dice: ${formatLoadedFaceOdds(loadedChance)} · Other dice: ${formatLoadedFaceOdds(otherChance)}`;
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
