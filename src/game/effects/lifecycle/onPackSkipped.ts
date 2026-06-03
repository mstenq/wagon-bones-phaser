// ─── on-pack-skipped lifecycle handlers ───

import { isEquipmentDisabledByBoss } from '../../BossEffectsSystem';
import { resolveCopyTarget } from '../../equipmentUtils';
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
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;

    let equip = equipment[i];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }

    dispatchLifecycle('on-pack-skipped', equip);
  }
  replaceEquipmentList(equipment);
}
