// ─── on-pack-opened lifecycle handlers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { getRunState } from '../../store/runStore';
import { selectProfession } from '../../store/selectors/runSelectors';
import { checkLoadedChance } from '../../equipmentUtils';
import { resolveChance } from '../helpers';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

export interface PackOpenedContext {
  equipment: EquipmentInstance[];
  triggered: boolean;
}

effectRegistry.registerLifecycle('on-pack-opened', (equip, ctxUnknown) => {
  const ctx = ctxUnknown as PackOpenedContext;
  if (equip.def.effectType === 'PACK_OPEN_SUPPLY_CHANCE') {
    const p = equip.def.effectParams as Record<string, unknown>;
    const chance = resolveChance(p, selectProfession(getRunState())?.id);
    if (checkLoadedChance(chance, ctx.equipment)) {
      ctx.triggered = true;
    }
  }
});

export function processEquipmentOnPackOpened(equipment: EquipmentInstance[]): boolean {
  const ctx: PackOpenedContext = { equipment, triggered: false };
  for (const equip of equipment) {
    dispatchLifecycle('on-pack-opened', equip, ctx);
    if (ctx.triggered) return true;
  }
  return false;
}
