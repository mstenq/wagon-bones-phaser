// ─── Shared Utility Functions ───

import { EquipmentInstance } from '../ItemsSystem';
import { resolveCopyTarget } from '../Constants';
import { HandType } from '../types';

export function getScoredRetriggerCount(equipment: EquipmentInstance[], context?: { currentDay: number; maxDays: number }): number {
  let count = 0;
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    let equip = equipment[i];
    // Resolve copy items
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED' && (equip.state.daysRemaining ?? 0) > 0) {
      count++;
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_FINAL_DAY' && context && context.currentDay >= context.maxDays) {
      count++;
    }
  }
  return count;
}

export function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND || required === HandType.TWO_PAIR)
      return true;
  }
  if (played === HandType.TWO_PAIR && required === HandType.PAIR) return true;
  if (played === HandType.THREE_OF_A_KIND && required === HandType.PAIR) return true;
  if (played === HandType.FOUR_OF_A_KIND) {
    if (required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  if (played === HandType.FIVE_OF_A_KIND) {
    if (
      required === HandType.FOUR_OF_A_KIND ||
      required === HandType.THREE_OF_A_KIND ||
      required === HandType.PAIR ||
      required === HandType.TWO_PAIR ||
      required === HandType.FULL_HOUSE
    )
      return true;
  }
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT) return true;
  }

  return false;
}
