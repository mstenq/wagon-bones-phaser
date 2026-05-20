// ─── on-reroll lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-reroll', (equip, diceCount) => {
  switch (equip.def.effectType) {
    case 'DECAYING_XMULT':
      equip.state.xMult = Math.max(
        0,
        (equip.state.xMult ?? 1) - (equip.def.effectParams.decayPerDie as number) * (diceCount as number),
      );
      break;
    case 'TRAIL_TAX': {
      const loss = (equip.def.effectParams as Record<string, unknown>).multLostPerReroll as number;
      equip.state.mult = Math.max(0, (equip.state.mult ?? 0) - loss);
      break;
    }
  }
});

export function processEquipmentOnReroll(equipment: EquipmentInstance[], diceCount: number): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-reroll', equip, diceCount);
  }
}
