// ─── Run permit actions ───

import type { PermitDef } from '../../PermitsSystem';
import { applyPermitEffectToRun } from '../../PermitsSystem';
import { getRunState, runStore } from '../runStore';
import { economyActions } from './economyActions';
import { canAfford } from '../economy';

export const permitActions = {
  hasPermit(id: string, state = getRunState()): boolean {
    return state.purchasedPermits.includes(id);
  },

  buyPermit(def: PermitDef): boolean {
    const state = getRunState();
    if (state.purchasedPermits.includes(def.id)) return false;
    if (!canAfford(state, def.cost)) return false;
    economyActions.trySpend(def.cost);
    const purchasedPermits = [...state.purchasedPermits, def.id];
    runStore.setState({
      purchasedPermits,
      currentLegPermitId: null,
      permitPurchasedThisLeg: true,
    });
    applyPermitEffectToRun(def);
    return true;
  },
};
