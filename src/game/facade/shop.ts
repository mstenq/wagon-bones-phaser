// ─── Shop facade (No Phaser imports) ───

import type { PackInstance } from '../BoosterPackSystem';
import { getEquipmentPurchasePrice, rollShopEquipmentPreview } from '../EquipmentModifiers';
import { processEquipmentOnShopEnd } from '../EquipmentEffects';
import { generateShopStock, getEquipmentListPrice, type EquipmentDef, type EquipmentInstance } from '../ItemsSystem';
import type { ConsumableDef } from '../ConsumablesSystem';
import type { PermitDef } from '../PermitsSystem';
import type { Die } from '../types';
import { shopActions } from '../store/actions/shopActions';
import { shopBuyActions, type ShopBuyFailReason, type ShopBuyResult } from '../store/actions/shopBuyActions';
import { shopSceneActions } from '../store/actions/shopSceneActions';
import type { ConsumableEffectContext, UseConsumableResult } from '../ConsumablesSystem';
import { enqueueConsumablePlayback } from '../store/uiEffectHelpers';
import type { RunState, ShopSceneState } from '../store/types';
import { getRunState } from '../store/runStore';

export type { EquipmentDef, EquipmentInstance, PackInstance, ShopBuyFailReason, ShopBuyResult, ShopSceneState };
export { getEquipmentDefById } from '../ItemsSystem';
export { getPackDefById } from '../BoosterPackSystem';

export const gameShop = {
  openShop(): ShopSceneState {
    return shopSceneActions.openShop();
  },

  rerollShop(): boolean {
    return shopSceneActions.rerollShop();
  },

  restoreShop(shop: ShopSceneState): void {
    shopSceneActions.restoreShop(shop);
  },

  canRerollShop(state: RunState = getRunState()): boolean {
    return shopActions.canRerollShop(state);
  },

  buyPack(cost: number): ShopBuyResult {
    return shopBuyActions.buyPack(cost);
  },

  buyEquipment(
    def: EquipmentDef,
    preview: EquipmentInstance,
    listPrice: number = getEquipmentListPrice(def),
  ): ShopBuyResult {
    return shopBuyActions.buyEquipment(def, preview, listPrice);
  },

  buyDie(die: Die, cost: number): ShopBuyResult {
    return shopBuyActions.buyDie(die, cost);
  },

  buyConsumable(def: ConsumableDef, cost: number): ShopBuyResult {
    return shopBuyActions.buyConsumable(def, cost);
  },

  buyAndUseConsumable(def: ConsumableDef, cost: number, context: ConsumableEffectContext = {}): UseConsumableResult {
    const result = shopBuyActions.buyAndUseConsumable(def, cost, context);
    enqueueConsumablePlayback(result);
    return result;
  },

  buyPermit(permit: PermitDef, cost: number, isPrimary: boolean): ShopBuyResult {
    return shopBuyActions.buyPermit(permit, cost, isPrimary);
  },

  consumableCost(def: ConsumableDef, discountedCost: number): number {
    return shopBuyActions.consumableCost(def, discountedCost);
  },

  markPackOpened(packIndex: number): void {
    shopBuyActions.markPackOpened(packIndex);
  },

  processShopEnd(equipment: EquipmentInstance[]): void {
    processEquipmentOnShopEnd(equipment);
  },

  getEquipmentListPrice,
  getEquipmentPurchasePrice,
  rollShopEquipmentPreview,
  generateShopStock,
};
