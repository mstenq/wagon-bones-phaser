// ─── Run dice actions ───

import type { Die } from '../../types';
import { processEquipmentOnDiceAdded } from '../../EquipmentEffects';
import { getRunState, runStore } from '../runStore';
import { replaceEquipmentList, resolveEquipmentList } from '../resolve';
import { storedFromEquipmentInstances } from '../resolve';
import { selectAllDiceSpent } from '../selectors/runSelectors';
import { economyActions } from './economyActions';
import { selectRefreshCost } from '../selectors/runSelectors';

export const diceActions = {
  addDie(die: Die): Die {
    const state = getRunState();
    const added: Die = { ...die, id: `die_player_${state.nextDieId}` };
    const nextDieId = state.nextDieId + 1;
    const equipment = resolveEquipmentList();
    processEquipmentOnDiceAdded(equipment);
    runStore.setState({
      dice: [...state.dice, added],
      nextDieId,
      equipment: storedFromEquipmentInstances(equipment),
    });
    replaceEquipmentList(equipment);
    return added;
  },

  markDiceSpent(ids: string[]): boolean {
    const state = getRunState();
    const spentSet = new Set(state.spentDiceIds);
    ids.forEach((id) => spentSet.add(id));
    const spentDiceIds = [...spentSet];
    const patched = { ...state, spentDiceIds };
    if (selectAllDiceSpent(patched)) {
      runStore.setState({ spentDiceIds: [] });
      return true;
    }
    runStore.setState({ spentDiceIds });
    return false;
  },

  refreshSpentDice(): boolean {
    const state = getRunState();
    if (state.spentDiceIds.length === 0) return false;
    const cost = selectRefreshCost(state);
    if (cost > 0 && !economyActions.trySpend(cost)) return false;
    runStore.setState({ spentDiceIds: [] });
    return true;
  },

  setLoadedDieTarget(value: number | null): void {
    if (value === null) {
      runStore.setState({ loadedDieTarget: null, loadedDieSyncLucky: false });
      return;
    }
    runStore.setState({
      loadedDieSyncLucky: false,
      loadedDieTarget: Math.max(1, Math.min(12, Math.floor(value))),
    });
  },

  setLoadedDieSyncLucky(sync: boolean): void {
    const state = getRunState();
    if (!sync) {
      runStore.setState({ loadedDieSyncLucky: false });
      return;
    }
    const equipment = resolveEquipmentList();
    if (!equipment.some((e) => e.def.id === 'lucky_number')) return;
    const lucky = equipment.find((e) => e.def.id === 'lucky_number');
    const pip = lucky?.state.pip;
    const loadedDieTarget = typeof pip === 'number' && pip >= 1 && pip <= 12 ? pip : state.loadedDieTarget;
    runStore.setState({ loadedDieSyncLucky: true, loadedDieTarget });
  },

  applyLoadedDieFromLuckyNumber(pip: number): void {
    const state = getRunState();
    if (!state.loadedDieSyncLucky) return;
    runStore.setState({
      loadedDieTarget: Math.max(1, Math.min(12, Math.floor(pip))),
    });
  },
};
