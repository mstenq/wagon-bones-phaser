// ─── on-shop-end lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { getItemAuraById } from '../../ItemsSystem';
import { getPlayerState } from '../../PlayerState';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { rngPick } from '../../RunRng';

effectRegistry.registerLifecycle('on-shop-end', (equip) => {
  if (equip.def.effectType !== 'SHOP_END_GHOST_CONSUMABLE') return;

  const player = getPlayerState();
  if (player.consumables.length === 0) return;

  const source = rngPick('equipment', player.consumables);
  const ghostAura = getItemAuraById('ghost');
  if (!ghostAura) return;

  player.addConsumable({ ...source.def, aura: ghostAura });
});

export function processEquipmentOnShopEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-shop-end', equip);
  }
}
