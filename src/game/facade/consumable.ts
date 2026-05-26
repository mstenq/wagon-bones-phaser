// ─── Consumable facade (No Phaser imports) ───

import {
  executeConsumableEffect,
  type ConsumableInstance,
  type UseConsumableContext,
  type UseConsumableResult,
} from '../ConsumablesSystem';
import { enqueueConsumablePlayback } from '../store/uiEffectHelpers';

export type {
  ConsumableDef,
  ConsumableInstance,
  UseConsumableContext,
  UseConsumableResult,
} from '../ConsumablesSystem';

export {
  canUseConsumableInShop,
  getConsumableDefById,
  getConsumableTexturePrefix,
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  isSecondHelpingsCloneTarget,
} from '../ConsumablesSystem';

export const gameConsumable = {
  use(consumed: ConsumableInstance, context: UseConsumableContext = {}): UseConsumableResult {
    const result = executeConsumableEffect(consumed, context);
    enqueueConsumablePlayback(result);
    return result;
  },
};
