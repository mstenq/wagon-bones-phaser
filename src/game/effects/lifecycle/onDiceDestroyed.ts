// ─── on-dice-destroyed lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { walkEquipmentLifecycle } from '../../equipmentUtils';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-dice-destroyed', (equip, _count, enhancedCount) => {
  switch (equip.def.effectType) {
    case 'ENHANCED_DESTROYED_XMULT': {
      const enhanced = (enhancedCount as number) ?? 0;
      if (enhanced > 0) {
        const gain = (equip.def.effectParams.value as number) ?? 1;
        equip.state.xMult = (equip.state.xMult ?? 1) + gain * enhanced;
      }
      break;
    }
  }
});

export function processEquipmentOnDiceDestroyed(
  equipment: EquipmentInstance[],
  count: number = 1,
  enhancedCount: number = 0,
): void {
  walkEquipmentLifecycle(equipment, ({ equip }) => {
    dispatchLifecycle('on-dice-destroyed', equip, count, enhancedCount);
  });
}
