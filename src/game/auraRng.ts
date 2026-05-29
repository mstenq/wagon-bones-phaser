// ─── Aura spawn RNG (No Phaser imports) ───
// Sequential independent rolls per aura type; permit multiplier scales holy/fire/icy only.

import { DICE_AURA_ORDER, getDiceAuraById } from '../data/dice_auras';
import itemAuras, { EQUIPMENT_AURA_ORDER, getItemAuraDefById, type ItemAura } from '../data/item_auras';
import type { DiceAura } from './types';
import { rngFloat, type RngStream } from './RunRng';

const UNSCALED_AURA_IDS = new Set(['ghost']);

export function scaleAuraChance(base: number, multiplier: number): number {
  return Math.min(1, Math.max(0, base) * Math.max(0, multiplier));
}

function rollSequentialAuras(
  order: readonly string[],
  getBaseChance: (aura: ItemAura) => number | undefined,
  multiplier: number,
  stream: RngStream,
): ItemAura | null {
  for (const id of order) {
    const aura = getItemAuraDefById(id);
    if (!aura) continue;
    const base = getBaseChance(aura);
    if (base === undefined) continue;
    const effectiveMultiplier = UNSCALED_AURA_IDS.has(id) ? 1 : multiplier;
    const scaledChance = scaleAuraChance(base, effectiveMultiplier);
    if (rngFloat(stream) < scaledChance) return { ...aura };
  }
  return null;
}

/** Roll equipment shop aura (holy → fire → icy → ghost). Ghost ignores permit multiplier. */
export function rollEquipmentAura(auraMultiplier: number = 1, stream: RngStream = 'shop'): ItemAura | null {
  return rollSequentialAuras(EQUIPMENT_AURA_ORDER, (a) => a.equipmentChance, auraMultiplier, stream);
}

/** Roll dice aura (holy → fire → icy). Returns null when no type succeeds. */
export function rollDiceAura(auraMultiplier: number = 1, stream: RngStream = 'shop'): DiceAura | null {
  for (const id of DICE_AURA_ORDER) {
    const aura = getDiceAuraById(id);
    if (!aura) continue;
    const scaledChance = scaleAuraChance(aura.diceChance, auraMultiplier);
    if (rngFloat(stream) < scaledChance) return aura.id as DiceAura;
  }
  return null;
}

/** Weighted dice aura for guaranteed-aura effects (e.g. Spirit Shaman, Lucky Find). */
export function pickDiceAuraWeighted(auraMultiplier: number = 1, stream: RngStream = 'consumables'): DiceAura {
  const candidates = DICE_AURA_ORDER.map((id) => getDiceAuraById(id)!);
  const weights = candidates.map((a) => scaleAuraChance(a.diceChance, auraMultiplier));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 'icy';

  const roll = rngFloat(stream) * total;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i]!;
    if (roll < cumulative) return candidates[i]!.id as DiceAura;
  }
  return candidates[candidates.length - 1]!.id as DiceAura;
}

/** Bless and similar: weighted pick among equipment auras using equipmentChance. */
export function pickEquipmentAuraWeighted(auraIds: readonly string[], stream: RngStream = 'consumables'): ItemAura {
  const candidates = auraIds.map((id) => getItemAuraDefById(id)!);
  const weights = candidates.map((a) => a.equipmentChance);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return { ...candidates[0]! };

  const roll = rngFloat(stream) * total;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i]!;
    if (roll < cumulative) return { ...candidates[i]! };
  }
  return { ...candidates[candidates.length - 1]! };
}

/** All aura defs (dev tools, re-exports). */
export function getAllItemAuraDefs(): ItemAura[] {
  return itemAuras.map((a) => ({ ...a }));
}
