// ─── Loaded-die / dice config facade (No Phaser imports) ───

import { formatLoadedDieOddsNote } from '../equipmentUtils';
import { diceActions } from '../store/actions/diceActions';
import { getResolvedLoadedDieTarget, runHasLuckyNumberEquipment } from '../store/runReads';
import { resolveEquipmentList } from '../store/resolve';
import { getRunState } from '../store/runStore';

export const gameDice = {
  setLoadedDieTarget(value: number | null): void {
    diceActions.setLoadedDieTarget(value);
  },

  setLoadedDieSyncLucky(enabled: boolean): void {
    diceActions.setLoadedDieSyncLucky(enabled);
  },

  getLoadedDieDisplay(): {
    syncLucky: boolean;
    target: number | null;
    hasLuckyNumberGear: boolean;
    rawTarget: number | null;
  } {
    const run = getRunState();
    const hasLuckyNumberGear = runHasLuckyNumberEquipment(run);
    const syncLucky = run.loadedDieSyncLucky && hasLuckyNumberGear;
    const target = getResolvedLoadedDieTarget(run);
    return {
      syncLucky,
      target,
      hasLuckyNumberGear,
      rawTarget: run.loadedDieTarget,
    };
  },

  /** Human-readable loaded-die odds for the picker UI. */
  getLoadedDieOddsNote(): string {
    return formatLoadedDieOddsNote(resolveEquipmentList(), getRunState().professionId);
  },
};
