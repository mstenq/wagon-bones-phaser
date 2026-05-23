// ─── Dice grouping (visual identity) ───
// Shared by DicePouchModal, play-area stacks, and profession starting-dice previews.

import { getDiceEnhancementById } from '../../data/dice_enhancements';
import type { Die } from '../../game/types';

export interface DiceVisualGroup {
  key: string;
  dice: Die[];
  representative: Die;
}

/** Grouping key for dice with the same visual properties (ignores face value). */
export function getDiceGroupKey(die: Die): string {
  return `${die.enhancement || ''}|${die.aura || ''}|${die.sticker || ''}|${die.isGrimy}`;
}

/** Group dice by visual identity. Optional suffix splits groups (e.g. spent vs available). */
export function groupDiceByVisualIdentity(dice: Die[], keySuffix = ''): DiceVisualGroup[] {
  const groups = new Map<string, DiceVisualGroup>();

  for (const die of dice) {
    const key = getDiceGroupKey(die) + keySuffix;
    if (!groups.has(key)) {
      groups.set(key, { key, dice: [], representative: die });
    }
    groups.get(key)!.dice.push(die);
  }

  return [...groups.values()];
}

/** Display name for a die group, e.g. "Gold" or "×3 Gold". */
export function getDiceGroupDisplayLabel(die: Die, count: number): string {
  const name = die.enhancement ? (getDiceEnhancementById(die.enhancement)?.name ?? die.enhancement) : 'Standard';
  return count > 1 ? `×${count} ${name}` : name;
}
