// ─── on-shop-end lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { getItemAuraById } from '../../ItemsSystem';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { rngPick } from '../../RunRng';
import { resolveConsumableList } from '../../store/resolve';
import { consumableActions } from '../../store/actions/consumableActions';

effectRegistry.registerLifecycle('on-shop-end', (equip) => {
  if (equip.def.effectType !== 'SHOP_END_GHOST_CONSUMABLE') return;

  const consumables = resolveConsumableList();
  if (consumables.length === 0) return;

  const source = rngPick('equipment', consumables);
  const ghostAura = getItemAuraById('ghost');
  if (!ghostAura) return;

  consumableActions.addConsumable({ ...source.def, aura: ghostAura });
});

export function processEquipmentOnShopEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-shop-end', equip);
  }
}
