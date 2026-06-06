// ─── Run economy actions ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { walkEquipmentPerSlot } from '../../equipmentUtils';
import { canAfford, trySpendBalance, earnBalance } from '../economy';
import { getRunState, runStore } from '../runStore';
import { replaceEquipmentList, resolveEquipmentList } from '../resolve';

/**
 * After earn() updates pawn_broker sell value in the store, copy those values onto
 * in-memory equipment arrays so a later replaceEquipmentList() does not clobber them.
 */
export function syncPawnBrokerSellValueFromStore(equipment: EquipmentInstance[]): void {
  const stored = getRunState().equipment;
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i].def.effectType !== 'PAWN_BROKER') continue;
    const row = stored[i];
    if (row) equipment[i].sellValue = row.sellValue;
  }
}

export const economyActions = {
  canAfford(amount: number, state = getRunState()): boolean {
    return canAfford(state, amount);
  },

  earn(amount: number): void {
    if (amount === 0) return;
    runStore.setState((s) => ({ balance: earnBalance(s.balance, amount) }));
    const equipment = resolveEquipmentList();
    let changed = false;
    walkEquipmentPerSlot(equipment, ({ equip }) => {
      if (equip.def.effectType !== 'PAWN_BROKER') return;
      equip.sellValue += 1;
      changed = true;
    });
    if (changed) replaceEquipmentList(equipment);
  },

  spend(amount: number): boolean {
    const state = getRunState();
    const result = trySpendBalance(state, amount);
    if (!result.ok) return false;
    runStore.setState({ balance: result.balance });
    return true;
  },

  setBalance(balance: number): void {
    runStore.setState({ balance });
  },

  trySpend(amount: number): boolean {
    return economyActions.spend(amount);
  },
};
