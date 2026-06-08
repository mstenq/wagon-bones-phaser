// ─── Shop purchase actions (No Phaser imports) ───

import type { Die } from '../../types';
import type { EquipmentDef, EquipmentInstance } from '../../ItemsSystem';
import type { ConsumableDef } from '../../ConsumablesSystem';
import {
  isSecondHelpingsCloneTarget,
  useConsumableDirectly,
  type ConsumableEffectContext,
  type UseConsumableResult,
} from '../../ConsumablesSystem';
import type { PermitDef } from '../../PermitsSystem';
import { applyPermitEffectToRun } from '../../PermitsSystem';
import { getEquipmentListPrice } from '../../ItemsSystem';
import { acquireEquipmentInstance, getEquipmentPurchasePrice } from '../../EquipmentModifiers';
import { getRunState, runActions } from '../runStore';
import { replaceEquipmentList, resolveEquipmentList, resolveLastUsedConsumableDef } from '../resolve';
import { economyActions } from './economyActions';
import { diceActions } from './diceActions';
import { consumableActions } from './consumableActions';
import { selectTrailGuidesFree, selectUsedEquipmentSlots } from '../selectors/runSelectors';
import { sceneActions } from '../sceneStore';

export type ShopBuyFailReason = 'cant_afford' | 'no_space' | 'no_effect';

export type ShopBuyResult = { ok: true } | { ok: false; reason: ShopBuyFailReason };

export const shopBuyActions = {
  buyPack(cost: number): ShopBuyResult {
    if (!economyActions.trySpend(cost)) return { ok: false, reason: 'cant_afford' };
    return { ok: true };
  },

  buyEquipment(
    def: EquipmentDef,
    preview: EquipmentInstance,
    listPrice: number = getEquipmentListPrice(def),
  ): ShopBuyResult {
    const state = getRunState();
    if (def.aura?.id !== 'ghost' && selectUsedEquipmentSlots(state) >= state.maxEquipmentSlots) {
      return { ok: false, reason: 'no_space' };
    }
    const instance = acquireEquipmentInstance(def, state.purchasedPermits, preview.modifiers);
    const cost = getEquipmentPurchasePrice(def, instance.modifiers, listPrice, state.purchasedPermits);
    if (!economyActions.trySpend(cost)) return { ok: false, reason: 'cant_afford' };
    replaceEquipmentList([...resolveEquipmentList(state), instance]);
    return { ok: true };
  },

  buyDie(die: Die, cost: number): ShopBuyResult {
    if (!economyActions.trySpend(cost)) return { ok: false, reason: 'cant_afford' };
    diceActions.addDie(die);
    return { ok: true };
  },

  buyConsumable(def: ConsumableDef, cost: number): ShopBuyResult {
    const state = getRunState();
    if (!consumableActions.canAddConsumable(def, state)) {
      return { ok: false, reason: 'no_space' };
    }
    if (!economyActions.trySpend(cost)) return { ok: false, reason: 'cant_afford' };
    if (!consumableActions.addConsumable(def)) return { ok: false, reason: 'no_space' };
    return { ok: true };
  },

  buyAndUseConsumable(def: ConsumableDef, cost: number, context: ConsumableEffectContext = {}): UseConsumableResult {
    if (def.id === 'second_helpings' && !isSecondHelpingsCloneTarget(resolveLastUsedConsumableDef())) {
      return { success: false, failReason: 'No previous consumable used!' };
    }
    if (!economyActions.trySpend(cost)) {
      return { success: false, failReason: "Can't afford!" };
    }
    return useConsumableDirectly(def, context);
  },

  buyPermit(permit: PermitDef, cost: number, isPrimary: boolean): ShopBuyResult {
    if (!economyActions.trySpend(cost)) return { ok: false, reason: 'cant_afford' };
    const state = getRunState();
    runActions.patch({
      purchasedPermits: [...state.purchasedPermits, permit.id],
      ...(isPrimary ? { currentLegPermitId: null, permitPurchasedThisLeg: true } : { bonusShopPermitId: null }),
    });
    applyPermitEffectToRun(permit);
    return { ok: true };
  },

  consumableCost(def: ConsumableDef, discountedCost: number): number {
    if (def.category === 'trail_guide' && selectTrailGuidesFree(getRunState())) return 0;
    return discountedCost;
  },

  markPackOpened(packIndex: number): void {
    sceneActions.markShopPackOpened(packIndex);
  },
};
