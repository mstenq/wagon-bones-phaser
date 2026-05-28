// ─── Alchemy Kit: gold ↔ steel enhancement swap ───

import type { DiceEnhancement } from './types';

export function hasAlchemyKit(equipment: { def: { effectType: string } }[]): boolean {
  return equipment.some((equip) => equip.def.effectType === 'ALCHEMY_KIT');
}

/** Scored dice: counts as gold (e.g. Gold Tooth). */
export function enhancementCountsAsGold(enhancement: DiceEnhancement | null, alchemy: boolean): boolean {
  if (enhancement === 'gold') return true;
  return alchemy && enhancement === 'steel';
}

/** Scored dice: counts as steel (e.g. Iron Spurs). */
export function enhancementCountsAsSteel(enhancement: DiceEnhancement | null, alchemy: boolean): boolean {
  if (enhancement === 'steel') return true;
  return alchemy && enhancement === 'gold';
}

/** Held in hand during scoring: steel x1.5 when die counts as steel (same rules as scored). */
export function enhancementHeldSteelXMult(enhancement: DiceEnhancement | null, alchemy: boolean): boolean {
  return enhancementCountsAsSteel(enhancement, alchemy);
}

/** Held at leg round end: $3 payout (gold always; steel when it counts as gold). */
export function enhancementHeldGoldPayout(enhancement: DiceEnhancement | null, alchemy: boolean): boolean {
  return enhancementCountsAsGold(enhancement, alchemy);
}
