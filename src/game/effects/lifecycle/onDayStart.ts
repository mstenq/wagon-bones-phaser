// ─── on-day-start lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { getDominantEnhancements } from '../../dominantEnhancement';
import { walkEquipmentLifecycle } from '../../equipmentUtils';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';
import { selectAvailableDice } from '../../store/selectors/runSelectors';
import { getRunState } from '../../store/runStore';

export interface DayStartResult {
  /** Dice ids to prefer when filling the hand up to roll size (Nightshard). */
  priorityHandDiceIds: string[];
}

effectRegistry.registerLifecycle('on-day-start', (equip, ctxUnknown) => {
  const ctx = ctxUnknown as DayStartResult;
  switch (equip.def.effectType) {
    case 'DAY_START_DOMINANT_ENHANCEMENT_HAND': {
      const params = equip.def.effectParams as Record<string, unknown>;
      const maxCount = typeof params.count === 'number' ? params.count : 3;
      const run = getRunState();
      const dominant = getDominantEnhancements(run.dice);
      if (dominant.length === 0) break;
      const matching = selectAvailableDice(run).filter((die) => die.enhancement && dominant.includes(die.enhancement));
      const toAdd = matching.slice(0, Math.max(0, maxCount)).map((die) => die.id);
      ctx.priorityHandDiceIds.push(...toAdd);
      break;
    }
  }
});

export function processEquipmentOnDayStart(equipment: EquipmentInstance[]): DayStartResult {
  const result: DayStartResult = { priorityHandDiceIds: [] };
  walkEquipmentLifecycle(equipment, ({ equip }) => {
    dispatchLifecycle('on-day-start', equip, result);
  });
  return result;
}
