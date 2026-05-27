// ─── on-pack-skipped lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { replaceEquipmentList } from '../../store/resolve';
import { economyActions } from '../../store/actions/economyActions';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

effectRegistry.registerLifecycle('on-pack-skipped', (equip) => {
  if (equip.def.effectType === 'STATEFUL_ADD_MULT' && equip.def.effectParams.gainOnPackSkip) {
    equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.gainOnPackSkip as number);
  }
  if (equip.def.effectType === 'PENNY_PINCHER') {
    const value = (equip.def.effectParams.value as number) ?? 5;
    economyActions.earn(value);
  }
});

export function processEquipmentOnPackSkipped(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-pack-skipped', equip);
  }
  replaceEquipmentList(equipment);
}
