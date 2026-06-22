// ─── Spirit Path: gap-straight rule modifier ───

import type { EquipmentInstance } from './ItemsSystem';
import { isEquipmentDisabledByBoss } from './BossEffectsSystem';

export function hasSpiritPath(equipment: EquipmentInstance[]): boolean {
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    if (equipment[i].def.effectType === 'SPIRIT_PATH') return true;
  }
  return false;
}
