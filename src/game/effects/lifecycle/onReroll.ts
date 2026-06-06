// ─── on-reroll lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { walkEquipmentLifecycle } from '../../equipmentUtils';
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
    case 'REROLL_COUNT_XMULT': {
      const perThreshold = (equip.def.effectParams.threshold as number) ?? 23;
      const gainPerThreshold = (equip.def.effectParams.value as number) ?? 1;
      const prevTotal = equip.state.rerollsTotal ?? 0;
      const newTotal = prevTotal + (diceCount as number);
      equip.state.rerollsTotal = newTotal;
      const prevMultiples = Math.floor(prevTotal / perThreshold);
      const newMultiples = Math.floor(newTotal / perThreshold);
      if (newMultiples > prevMultiples) {
        equip.state.xMult = (equip.state.xMult ?? 1) + gainPerThreshold * (newMultiples - prevMultiples);
      }
      break;
    }
  }
});

export function processEquipmentOnReroll(equipment: EquipmentInstance[], diceCount: number): void {
  walkEquipmentLifecycle(equipment, ({ equip }) => {
    dispatchLifecycle('on-reroll', equip, diceCount);
  });
}
