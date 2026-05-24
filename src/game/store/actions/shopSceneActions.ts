// ─── Shop scene actions (No Phaser imports) ───
// Opens / rerolls shop visits and writes sceneStore.shop.

import { generateShopPermit } from '../../PermitsSystem';
import { progressionActions } from './progressionActions';
import { generateNewShopState, generateRerolledShopStock } from '../shopStock';
import { getRunState, runActions } from '../runStore';
import { getSceneState, sceneActions, sceneStore } from '../sceneStore';
import type { ShopSceneState } from '../types';

export const shopSceneActions = {
  /** First visit or return with no existing shop slice — rolls stock, packs, and shop tags. */
  openShop(): ShopSceneState {
    progressionActions.resetShopRerolls();
    const { shop, tagMods } = generateNewShopState();
    if (tagMods.freeFirstReroll) {
      runActions.patch({ tagFreeReroll: true });
    }
    if (tagMods.extraPermits > 0) {
      const bonusPermit = generateShopPermit(getRunState().purchasedPermits);
      if (bonusPermit) runActions.patch({ bonusShopPermitId: bonusPermit.id });
    }
    sceneActions.enterShop(shop);
    return shop;
  },

  /** Paid reroll — replaces stock in the active shop slice. */
  rerollShop(): boolean {
    const shop = getSceneState().shop;
    if (!shop) return false;
    if (!progressionActions.payShopReroll()) return false;
    const stock = generateRerolledShopStock();
    sceneStore.setState((state) => {
      if (!state.shop) return state;
      return {
        ...state,
        shop: {
          ...state.shop,
          stock,
          shopRerollCount: getRunState().shopRerollCount,
        },
      };
    });
    return getSceneState().shop !== null;
  },

  restoreShop(shop: ShopSceneState): void {
    sceneActions.enterShop(shop);
  },
};
