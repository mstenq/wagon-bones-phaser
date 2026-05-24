// ─── Scene store selectors (No Phaser imports) ───

import { getRunState } from '../runStore';
import { getSceneState } from '../sceneStore';
import { selectShopRerollCost, selectTrailGuidesFree, selectUsedEquipmentSlots } from './runSelectors';
import { canAfford } from '../economy';
import type { RunState, SceneRuntimeState, ShopSceneState, StoredShopItem } from '../types';

function shopStockRevisionKey(stock: StoredShopItem[]): string {
  return stock
    .map((s) => {
      if (s.type === 'equipment') {
        return `e:${s.defId}:${s.sold ? 1 : 0}:${JSON.stringify(s.preview.modifiers)}:${JSON.stringify(s.preview.state)}`;
      }
      if (s.type === 'consumable') {
        return `c:${s.defId}:${s.sold ? 1 : 0}`;
      }
      const d = s.die;
      return `d:${d.id}:${d.value}:${d.enhancement ?? ''}:${d.sticker ?? ''}:${s.sold ? 1 : 0}`;
    })
    .join('|');
}

/** Revision token for shop stock identity + sold/opened flags (scene store). */
export function selectShopStockRevision(state: SceneRuntimeState = getSceneState()): string {
  const shop = state.shop;
  if (!shop) return '';
  const packFlags = shop.packs.map((p) => (p.opened ? '1' : '0')).join('');
  return `${shop.shopRerollCount}|${shopStockRevisionKey(shop.stock)}|${packFlags}`;
}

/** Run + scene inputs that drive shop card/pack/reroll affordability. */
export function selectShopAffordabilityInputs(state: RunState = getRunState()): {
  balance: number;
  canRerollShop: boolean;
  shopRerollCost: number;
  trailGuidesFree: boolean;
  usedEquipmentSlots: number;
  maxEquipmentSlots: number;
  ownedEquipmentDefIds: string[];
  ownedConsumableDefIds: string[];
} {
  return {
    balance: state.balance,
    canRerollShop: canAfford(state, selectShopRerollCost(state)),
    shopRerollCost: selectShopRerollCost(state),
    trailGuidesFree: selectTrailGuidesFree(state),
    usedEquipmentSlots: selectUsedEquipmentSlots(state),
    maxEquipmentSlots: state.maxEquipmentSlots,
    ownedEquipmentDefIds: state.equipment.map((e) => e.defId),
    ownedConsumableDefIds: state.consumables.map((c) => c.defId),
  };
}

export function selectShopState(state: SceneRuntimeState = getSceneState()): ShopSceneState | null {
  return state.shop;
}

export function selectBoosterPackState(state: SceneRuntimeState = getSceneState()) {
  return state.boosterPack;
}

export function selectTrailEventState(state: SceneRuntimeState = getSceneState()) {
  return state.trailEvent;
}
