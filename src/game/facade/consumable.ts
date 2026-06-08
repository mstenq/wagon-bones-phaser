// ─── Consumable facade (No Phaser imports) ───

import {
  executeConsumableEffect,
  type ConsumableEffectContext,
  type ConsumableInstance,
  type UseConsumableResult,
} from '../ConsumablesSystem';
import {
  beginConsumableTargeting,
  cancelConsumableTargeting,
  commitConsumableTargeting,
  getActiveConsumableTargeting,
  getConsumableTargetingSnapshot,
  setBumpDirection,
  toggleTargetDie,
} from '../consumables/consumableTargetingSession';
import { applyConsumableTargetingCommit } from '../consumables/applyConsumableTargeting';
import { enqueueConsumablePlayback } from '../store/uiEffectHelpers';

export type {
  ConsumableDef,
  ConsumableEffectContext,
  ConsumableInstance,
  UseConsumableResult,
} from '../ConsumablesSystem';

export {
  getConsumableAtlasKey,
  getConsumableDefById,
  getConsumableTexturePrefix,
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  isSecondHelpingsCloneTarget,
} from '../ConsumablesSystem';

export type {
  ConsumableEligibilityContext,
  ConsumableUseEligibility,
  ConsumableUseMode,
  ConsumableUseSource,
} from '../consumables/consumableUseContext';

export {
  canBuyAndUseConsumableInShop,
  canUseConsumable,
  canUseConsumableInShop,
} from '../consumables/consumableUseContext';

export type {
  ApplyConsumableTargetingOptions,
  ApplyConsumableTargetingResult,
  ConsumableTargetSurface,
} from '../consumables/applyConsumableTargeting';

export type {
  BeginConsumableTargetingResult,
  CommitConsumableTargetingResult,
  ConsumableTargetingCommit,
  ConsumableTargetingSession,
  ConsumableTargetingSnapshot,
  ConsumableTargetingSource,
  ToggleTargetDieResult,
} from '../consumables/consumableTargetingSession';

export {
  getActiveConsumableTargeting,
  getConsumableTargetingSnapshot,
  getTargetableDieIds,
  getValidationReason,
  isTargetingCommitReady,
} from '../consumables/consumableTargetingSession';

export { getPackLineupSelectedDieIds, setPackLineupSelectedDieIds } from '../consumables/packLineupSelection';
export { resolvePackItemDefId } from '../consumables/packCardDefId';

export const gameConsumable = {
  use(consumed: ConsumableInstance, context: ConsumableEffectContext = {}): UseConsumableResult {
    const result = executeConsumableEffect(consumed, context);
    enqueueConsumablePlayback(result);
    return result;
  },

  targeting: {
    begin: beginConsumableTargeting,
    toggleDie: toggleTargetDie,
    setBumpDirection,
    snapshot: getConsumableTargetingSnapshot,
    active: getActiveConsumableTargeting,
    cancel: cancelConsumableTargeting,
    commit: commitConsumableTargeting,
    applyCommit: applyConsumableTargetingCommit,
  },
};
