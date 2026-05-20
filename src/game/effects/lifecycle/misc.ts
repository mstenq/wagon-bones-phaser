// ─── Misc equipment lifecycle helpers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../Constants';

export function processEquipmentOnDayEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED') {
      if ((equip.state.daysRemaining ?? 0) > 0) {
        equip.state.daysRemaining--;
      }
    }
    if (equip.def.effectType === 'TRAIL_TAX') {
      const multPerDay = (equip.def.effectParams as Record<string, unknown>).multPerDay as number;
      equip.state.mult = (equip.state.mult ?? 0) + multPerDay;
    }
  }
}

export function processEquipmentOnDiceAdded(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'STATEFUL_XMULT' && equip.def.effectParams.gainOnDiceAdded) {
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.gainOnDiceAdded as number);
    }
  }
}

export function processEquipmentOnSupplyUsed(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'SUPPLY_USED_MULT') {
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
    }
  }
}

export function processEquipmentOnPackSkipped(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'STATEFUL_ADD_MULT' && equip.def.effectParams.gainOnPackSkip) {
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.gainOnPackSkip as number);
    }
  }
}

export function processEquipmentOnPackOpened(equipment: EquipmentInstance[]): boolean {
  for (const equip of equipment) {
    if (equip.def.effectType === 'PACK_OPEN_SUPPLY_CHANCE') {
      if (checkLoadedChance(equip.def.effectParams.chance as [number, number], equipment)) {
        return true;
      }
    }
  }

  return false;
}
