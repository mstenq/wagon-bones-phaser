// ─── Shop-related run actions ───

import { getRunState } from '../runStore';
import { selectShopRerollCost } from '../selectors/runSelectors';
import { canAfford } from '../economy';

export const shopActions = {
  canRerollShop(state = getRunState()): boolean {
    return canAfford(state, selectShopRerollCost(state));
  },
};
