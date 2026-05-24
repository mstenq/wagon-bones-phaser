// ─── Run consumable actions ───

import type { ConsumableDef, ConsumableInstance } from '../../ConsumablesSystem';
import { createConsumableInstance, isSecondHelpingsCloneTarget } from '../../ConsumablesSystem';
import { processEquipmentOnSell } from '../../EquipmentEffects';
import { getRunState, runStore } from '../runStore';
import { replaceConsumableList, replaceEquipmentList, resolveConsumableList, resolveEquipmentList } from '../resolve';
import { selectUsedConsumableSlots } from '../selectors/runSelectors';
import { economyActions } from './economyActions';

function consumables(): ConsumableInstance[] {
  return resolveConsumableList();
}

function writeConsumables(next: ConsumableInstance[]): void {
  replaceConsumableList(next);
}

export const consumableActions = {
  canAddConsumable(def: ConsumableDef, state = getRunState()): boolean {
    if (def.aura?.id === 'ghost') return true;
    return selectUsedConsumableSlots(state) < state.maxConsumableSlots;
  },

  addConsumable(def: ConsumableDef): boolean {
    if (!consumableActions.canAddConsumable(def)) return false;
    const inst = createConsumableInstance(def);
    writeConsumables([...consumables(), inst]);
    return true;
  },

  sellConsumable(index: number): boolean {
    const list = consumables();
    if (index < 0 || index >= list.length) return false;
    const item = list[index]!;
    economyActions.earn(item.sellValue);
    const nextConsumables = list.filter((_, i) => i !== index);
    const equipment = resolveEquipmentList();
    processEquipmentOnSell(equipment);
    writeConsumables(nextConsumables);
    replaceEquipmentList(equipment);
    return true;
  },

  useConsumable(index: number): ConsumableInstance | null {
    const state = getRunState();
    const list = consumables();
    if (index < 0 || index >= list.length) return null;
    const item = list[index]!;
    writeConsumables(list.filter((_, i) => i !== index));
    const lastUsedConsumableId = isSecondHelpingsCloneTarget(item.def) ? item.def.id : state.lastUsedConsumableId;
    runStore.setState({ lastUsedConsumableId });
    return item;
  },

  reorderConsumable(fromIndex: number, toIndex: number): void {
    const list = [...consumables()];
    if (fromIndex < 0 || fromIndex >= list.length) return;
    if (toIndex < 0 || toIndex >= list.length) return;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item!);
    writeConsumables(list);
  },

  setConsumables(instances: ConsumableInstance[]): void {
    writeConsumables(instances);
  },
};
