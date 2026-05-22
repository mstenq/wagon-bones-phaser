// ─── on-dice-added lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

effectRegistry.registerLifecycle('on-dice-added', (equip) => {
  if (equip.def.effectType === 'STATEFUL_XMULT' && equip.def.effectParams.gainOnDiceAdded) {
    equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.gainOnDiceAdded as number);
  }
});

export function processEquipmentOnDiceAdded(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-dice-added', equip);
  }
}
