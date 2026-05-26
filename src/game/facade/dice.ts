// ─── Loaded-die / dice config facade (No Phaser imports) ───

import { getLoadedDiceMultiplier } from '../equipmentUtils';
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
    const chance = Math.min(1, getLoadedDiceMultiplier(resolveEquipmentList()) / 6);
    if (chance >= 1) return 'Selected face is guaranteed to roll.';
    if (chance === 2 / 3) return 'Selected face rolls at 2 in 3.';
    if (chance === 1 / 3) return 'Selected face rolls at 1 in 3.';
    return 'Selected face rolls at 1 in 6.';
  },
};
