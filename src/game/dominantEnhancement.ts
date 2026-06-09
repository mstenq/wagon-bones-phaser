// ─── Dominant dice enhancement helpers (No Phaser imports) ───

import { getDiceEnhancementById } from '../data/dice_enhancements';
import type { Die } from './types';

/** Supply cards that apply each enhancement (mirrors supply_cards ENHANCE defs). */
export const ENHANCEMENT_SUPPLY_CARD_ID: Record<string, string> = {
  bone: 'buzzards',
  lucky: 'rabbits_foot',
  wooden: 'firewood',
  steel: 'coffee_tin',
  gold: 'pan_for_gold',
  loaded: 'loaded',
  diamond: 'pick_axe',
  stone: 'chisel',
};

/** Count dice per enhancement id; unenhanced dice are skipped. */
export function countEnhancementsByType(dice: Die[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const die of dice) {
    if (!die.enhancement) continue;
    counts.set(die.enhancement, (counts.get(die.enhancement) ?? 0) + 1);
  }
  return counts;
}

/** Enhancement ids tied for the highest count. Empty when no enhanced dice. */
export function getDominantEnhancements(dice: Die[]): string[] {
  const counts = countEnhancementsByType(dice);
  let max = 0;
  for (const count of counts.values()) {
    max = Math.max(max, count);
  }
  if (max === 0) return [];

  const dominant: string[] = [];
  for (const [enhancement, count] of counts) {
    if (count === max) dominant.push(enhancement);
  }
  return dominant.sort();
}

/** Supply card id that creates the given enhancement, when one exists. */
export function getSupplyIdForEnhancement(enhancement: string): string | undefined {
  return ENHANCEMENT_SUPPLY_CARD_ID[enhancement];
}

/** Supply card ids for dominant enhancements in the player's collection. */
export function getDominantEnhancementSupplyIds(dice: Die[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const enhancement of getDominantEnhancements(dice)) {
    const supplyId = getSupplyIdForEnhancement(enhancement);
    if (supplyId && !seen.has(supplyId)) {
      seen.add(supplyId);
      ids.push(supplyId);
    }
  }
  return ids;
}

/** Display names for dominant enhancements (sorted). */
export function getDominantEnhancementDisplayNames(dice: Die[]): string[] {
  return getDominantEnhancements(dice)
    .map((id) => getDiceEnhancementById(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
}

const SUPPLY_CARD_DISPLAY_NAMES: Record<string, string> = {
  buzzards: 'Buzzards',
  rabbits_foot: "Rabbit's Foot",
  firewood: 'Firewood',
  coffee_tin: 'Coffee Tin',
  pan_for_gold: 'Pan for Gold',
  loaded: 'Loaded',
  pick_axe: 'Pick Axe',
  chisel: 'Chisel',
};

/** Display names for supply cards matching dominant enhancements (sorted). */
export function getDominantEnhancementSupplyNames(dice: Die[]): string[] {
  return getDominantEnhancementSupplyIds(dice)
    .map((id) => SUPPLY_CARD_DISPLAY_NAMES[id])
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
