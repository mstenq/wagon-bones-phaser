// ─── on-shop-reroll lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-shop-reroll', (equip) => {
  switch (equip.def.effectType) {
    case 'SHOP_REROLL_MULT_GAIN':
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
      break;
  }
});

export function processEquipmentOnShopReroll(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-shop-reroll', equip);
  }
}
