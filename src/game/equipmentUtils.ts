// ─── Equipment helpers (loaded dice, copy targets) ───
// Pure logic — no Phaser. Kept separate from Constants.ts (values only).

import { COPY_INCOMPATIBLE_EFFECTS, LIFECYCLE_MIRROR_DOUBLES } from './Constants';
import { resolveChance } from './effectParams';
import { EquipmentInstance } from './ItemsSystem';
import { isEquipmentDisabledByBoss } from './BossEffectsSystem';
import { rngFloat, type RngStream } from './RunRng';
import type { Die, DiceEnhancement } from './types';

export type UnresolvedCopyBehavior = 'none' | 'skip';

export type ResolvedEquipmentSlot = {
  /** Effect source after copy resolution (may be a shared instance when copied). */
  equip: EquipmentInstance;
  /** Card occupying this bar slot (Mirror Lake / Echo Chamber when isCopy). */
  original: EquipmentInstance;
  index: number;
  isCopy: boolean;
};

/**
 * How to walk the equipment bar when dispatching effects.
 *
 * - **perSlot** — every slot dispatches after copy resolution. Mirror Lake doubles by
 *   visiting both the copy slot and the source slot. Handlers use `slot.isCopy` to guard
 *   index-sensitive effects (round start/end destruction, risky item self-destruct).
 *
 * - **lifecycleDedupe** — copy slot always dispatches; the source slot is skipped when a
 *   copy to its left already targets the same instance, unless the effect type is listed
 *   in `LIFECYCLE_MIRROR_DOUBLES` (rare one-shot grants). Use for day-end, sell, reroll,
 *   and similar hooks where most copied effects should fire once via the copy slot only.
 *   Round boundaries and scoring use perSlot instead — see `LIFECYCLE_MIRROR_DOUBLES` comment.
 *
 * - **scoring** — perSlot with empty-copy NONE stubs and resolution logging enabled.
 */
export type EquipmentWalkPolicy = 'perSlot' | 'lifecycleDedupe' | 'scoring';

export type ResolveEquipmentSlotOptions = {
  unresolvedCopy?: UnresolvedCopyBehavior;
  maxCopyDepth?: number;
  logResolution?: boolean;
  /** Apply canonical defaults for this walk policy when options are omitted. */
  policy?: EquipmentWalkPolicy;
  /** When true, Jinx-disabled slots still dispatch (round-start lifecycle only). */
  ignoreBossDisable?: boolean;
};

type WalkPreset = Required<Pick<ResolveEquipmentSlotOptions, 'unresolvedCopy' | 'logResolution'>>;

export const EQUIPMENT_WALK_PRESETS: Record<EquipmentWalkPolicy, WalkPreset> = {
  perSlot: { unresolvedCopy: 'skip', logResolution: false },
  lifecycleDedupe: { unresolvedCopy: 'skip', logResolution: false },
  scoring: { unresolvedCopy: 'none', logResolution: true },
};

function resolveWalkOptions(options: ResolveEquipmentSlotOptions = {}): WalkPreset {
  const preset = EQUIPMENT_WALK_PRESETS[options.policy ?? 'perSlot'];
  return {
    unresolvedCopy: options.unresolvedCopy ?? preset.unresolvedCopy,
    logResolution: options.logResolution ?? preset.logResolution,
  };
}

/**
 * Resolve one equipment bar slot for effect dispatch: boss skip, copy target, unresolved copy policy.
 * Returns null when the slot is skipped (boss-disabled or unresolved copy with `skip`).
 */
export function resolveEquipmentSlotAtIndex(
  equipment: EquipmentInstance[],
  index: number,
  options: ResolveEquipmentSlotOptions = {},
): ResolvedEquipmentSlot | null {
  if (!options.ignoreBossDisable && isEquipmentDisabledByBoss(index)) return null;

  const original = equipment[index];
  const { unresolvedCopy, logResolution } = resolveWalkOptions(options);
  const maxCopyDepth = options.maxCopyDepth ?? equipment.length;

  if (original.def.effectType !== 'COPY_RIGHT' && original.def.effectType !== 'COPY_LEFTMOST') {
    return { equip: original, original, index, isCopy: false };
  }

  const resolved = resolveCopyTarget(equipment, index, maxCopyDepth);
  if (!resolved) {
    if (logResolution) {
      console.log(`  [equip] ${original.def.name}: nothing to copy`);
    }
    if (unresolvedCopy === 'skip') return null;
    return {
      equip: { ...original, def: { ...original.def, effectType: 'NONE' } } as EquipmentInstance,
      original,
      index,
      isCopy: true,
    };
  }

  if (logResolution) {
    console.log(`  [equip] ${original.def.name}: copying ${resolved.def.name}`);
  }
  return { equip: resolved, original, index, isCopy: true };
}

function walkEquipmentWithPolicy(
  equipment: EquipmentInstance[],
  policy: EquipmentWalkPolicy,
  fn: (slot: ResolvedEquipmentSlot) => boolean | void,
  overrides: ResolveEquipmentSlotOptions = {},
): void {
  const options: ResolveEquipmentSlotOptions = { ...overrides, policy };
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    const slot = resolveEquipmentSlotAtIndex(equipment, i, { ...options, maxCopyDepth });
    if (!slot) continue;
    if (fn(slot) === false) break;
  }
}

/**
 * Walk every bar slot after copy resolution. Use for scoring-like passes, pack-open rolls,
 * economy hooks, and round boundaries (round start/end) where handlers rely on `slot.isCopy`.
 */
export function walkEquipmentPerSlot(
  equipment: EquipmentInstance[],
  fn: (slot: ResolvedEquipmentSlot) => boolean | void,
  overrides: ResolveEquipmentSlotOptions = {},
): void {
  walkEquipmentWithPolicy(equipment, 'perSlot', fn, overrides);
}

/**
 * Walk bar slots with copy/source dedupe. See `EquipmentWalkPolicy.lifecycleDedupe`.
 */
export function walkEquipmentLifecycle(
  equipment: EquipmentInstance[],
  fn: (slot: ResolvedEquipmentSlot) => boolean | void,
): void {
  const copiedInstances = new Set<EquipmentInstance>();
  walkEquipmentPerSlot(equipment, (slot) => {
    if (slot.isCopy) copiedInstances.add(slot.equip);
  });

  walkEquipmentPerSlot(equipment, (slot) => {
    if (!slot.isCopy && copiedInstances.has(slot.equip)) {
      if (!LIFECYCLE_MIRROR_DOUBLES.has(slot.equip.def.effectType)) return;
    }
    return fn(slot);
  });
}

/**
 * Scoring pipeline walk — per-slot with NONE stubs for empty copies and resolution logging.
 */
export function walkEquipmentScoring(
  equipment: EquipmentInstance[],
  fn: (slot: ResolvedEquipmentSlot) => boolean | void,
  overrides: ResolveEquipmentSlotOptions = {},
): void {
  walkEquipmentWithPolicy(equipment, 'scoring', fn, overrides);
}

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

/** Human-readable "N in D" odds label accounting for Loaded Dice multiplier. */
export function formatLoadedOddsLabel(
  baseNumerator: number,
  denominator: number,
  equipment: { def: { effectType: string } }[],
): string {
  return `${baseNumerator * getLoadedDiceMultiplier(equipment)} in ${denominator}`;
}

export function hasGamblersDiceCup(equipment: { def: { effectType: string } }[]): boolean {
  return equipment.some((equip) => equip.def.effectType === 'GAMBLERS_DICE_CUP');
}

/**
 * Probability that a die rolls the selected loaded-face value.
 * Loaded enhancement uses 1-in-3 base (× Loaded Dice item); cup gives other dice 1-in-6.
 */
export function getLoadedFaceRollChance(
  equipment: { def: { effectType: string; effectParams?: Record<string, unknown> } }[],
  dieEnhancement: DiceEnhancement,
  professionId?: string | null,
): number {
  const ldm = getLoadedDiceMultiplier(equipment);
  if (dieEnhancement === 'loaded') {
    return Math.min(1, ldm / 3);
  }
  const cup = equipment.find((equip) => equip.def.effectType === 'GAMBLERS_DICE_CUP');
  if (cup) {
    const chance = resolveChance(cup.def.effectParams ?? { chance: [1, 6] }, professionId);
    return Math.min(1, (chance[0] * ldm) / chance[1]);
  }
  return 0;
}

export function hasGravityEquipment(equipment: { def: { effectType: string } }[]): boolean {
  return equipment.some((equip) => equip.def.effectType === 'GRAVITY');
}

/** Most common face among selected and reroll-locked dice (stone excluded). Tie-break: highest pip. */
export function getGravityModeFace(selectedDice: Die[]): { face: number; count: number } | null {
  let bestFace = -1;
  let bestCount = 0;
  const freq = new Map<number, number>();
  for (const d of selectedDice) {
    if (d.enhancement === 'stone' || d.value < 1 || d.value > 12) continue;
    const count = (freq.get(d.value) ?? 0) + 1;
    freq.set(d.value, count);
    if (count > bestCount || (count === bestCount && d.value > bestFace)) {
      bestFace = d.value;
      bestCount = count;
    }
  }
  if (bestCount < 2) return null;
  return { face: bestFace, count: bestCount };
}

/** Per-die gravity chance from matching count (× Loaded Dice multiplier). */
export function getGravityRollChance(matchCount: number, equipment: { def: { effectType: string } }[]): number {
  if (matchCount < 2) return 0;
  if (matchCount >= 5) return 1;
  const base = (2 * matchCount - 2) / 12;
  return Math.min(1, base * getLoadedDiceMultiplier(equipment));
}

/** Human-readable gravity odds for card hints. */
export function formatGravityOddsLabel(matchCount: number, equipment: { def: { effectType: string } }[]): string {
  return formatLoadedFaceOdds(getGravityRollChance(matchCount, equipment));
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
export function formatLoadedDieOddsNote(
  equipment: { def: { effectType: string; effectParams?: Record<string, unknown> } }[],
  professionId?: string | null,
): string {
  const loadedChance = getLoadedFaceRollChance(equipment, 'loaded', professionId);
  if (!hasGamblersDiceCup(equipment)) {
    if (loadedChance >= 1) return 'Selected face is guaranteed to roll.';
    if (loadedChance === 2 / 3) return 'Selected face rolls at 2 in 3.';
    if (loadedChance === 1 / 3) return 'Selected face rolls at 1 in 3.';
    return 'Selected face rolls at 1 in 6.';
  }

  const otherChance = getLoadedFaceRollChance(equipment, null, professionId);
  if (loadedChance >= 1 && otherChance >= 1) {
    return 'All dice always roll the selected face.';
  }
  return `Loaded dice: ${formatLoadedFaceOdds(loadedChance)} · Other dice: ${formatLoadedFaceOdds(otherChance)}`;
}

export type CheckLoadedChanceOptions = {
  /**
   * When true, the roll is from a Mirror Lake / Echo Chamber copy of another item.
   * The Loaded Dice equipment item does not apply (LOADED_DICE is copy-incompatible).
   */
  triggeredViaEquipmentCopy?: boolean;
};

/**
 * Roll a probability check with Loaded Dice support.
 * Takes a [numerator, denominator] chance tuple and the equipment array.
 * Returns true if the check succeeds.
 */
export function checkLoadedChance(
  chance: [number, number],
  equipment: { def: { effectType: string } }[],
  stream: RngStream = 'loadedDice',
  options?: CheckLoadedChanceOptions,
): boolean {
  const [num, den] = chance;
  const pool = options?.triggeredViaEquipmentCopy
    ? equipment.filter((e) => e.def.effectType !== 'LOADED_DICE')
    : equipment;
  const ldm = getLoadedDiceMultiplier(pool);
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
