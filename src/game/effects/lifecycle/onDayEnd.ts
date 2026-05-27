// ─── on-day-end lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';
import { rngPick } from '../../RunRng';

effectRegistry.registerLifecycle('on-day-end', (equip) => {
  switch (equip.def.effectType) {
    case 'SCORED_RETRIGGER_TIMED':
      if ((equip.state.daysRemaining ?? 0) > 0) {
        equip.state.daysRemaining--;
      }
      break;
    case 'TRAIL_TAX': {
      const multPerDay = (equip.def.effectParams as Record<string, unknown>).multPerDay as number;
      equip.state.mult = (equip.state.mult ?? 0) + multPerDay;
      break;
    }
    case 'ROULETTE_WHEEL': {
      const options = (
        ((equip.def.effectParams as Record<string, unknown>).values as number[]) ?? [2.5, 1.5, 1.5]
      ).filter((v) => v > 0);
      if (options.length > 0) {
        equip.state.xMult = rngPick('equipment', options);
      }
      break;
    }
  }
});

export function processEquipmentOnDayEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-day-end', equip);
  }
}
