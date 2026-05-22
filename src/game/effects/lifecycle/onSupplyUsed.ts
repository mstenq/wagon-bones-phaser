// ─── on-supply-used lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

effectRegistry.registerLifecycle('on-supply-used', (equip) => {
  if (equip.def.effectType === 'SUPPLY_USED_MULT') {
    equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
  }
});

export function processEquipmentOnSupplyUsed(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-supply-used', equip);
  }
}
