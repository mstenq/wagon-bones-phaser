// ─── on-day-end lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

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
  }
});

export function processEquipmentOnDayEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-day-end', equip);
  }
}
