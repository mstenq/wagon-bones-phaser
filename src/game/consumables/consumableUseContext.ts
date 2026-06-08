// ─── Consumable use eligibility (pure, no Phaser) ───

import type { ConsumableDef } from '../ConsumablesSystem';
import { isSecondHelpingsCloneTarget } from '../ConsumablesSystem';
import { resolveLastUsedConsumableDef } from '../store/resolve';
import type { ConsumableEligibilityContext, ConsumableUseEligibility } from './consumableTypes';

export type {
  ConsumableEligibilityContext,
  ConsumableUseEligibility,
  ConsumableUseMode,
  ConsumableUseSource,
} from './consumableTypes';

function hasVisibleDice(context: ConsumableEligibilityContext): boolean {
  if (context.scene === 'booster_pack' || context.scene === 'game') {
    return context.visibleDieIds.length > 0;
  }
  return false;
}

export function canUseConsumable(def: ConsumableDef, context: ConsumableEligibilityContext): ConsumableUseEligibility {
  const { useMode } = def;

  if (useMode === 'any_time') {
    return { allowed: true };
  }

  if (useMode === 'visible_dice') {
    if (context.scene === 'shop' || context.scene === 'other') {
      return { allowed: false, reason: 'No visible dice' };
    }
    if (!hasVisibleDice(context)) {
      return { allowed: false, reason: 'No visible dice' };
    }
    return { allowed: true };
  }

  if (useMode === 'scored_dice') {
    if (context.scene !== 'game') {
      return { allowed: false, reason: 'Only usable on scored dice in game' };
    }
    if (context.phase !== 'ROLL') {
      return { allowed: false, reason: 'Use after rolling dice' };
    }
    if (!context.isScoreActionVisible) {
      return { allowed: false, reason: 'Score action not available' };
    }
    if (context.scoreableDieIds.length === 0) {
      return { allowed: false, reason: 'No scored dice' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown use mode' };
}

/** Shop context has no natural dice board; block dice-targeting cards there. */
export function canUseConsumableInShop(def: ConsumableDef): boolean {
  return canUseConsumable(def, { scene: 'shop', source: 'bar' }).allowed;
}

/** Check if a consumable can be used immediately via shop "Buy & Use". */
export function canBuyAndUseConsumableInShop(
  def: ConsumableDef,
  lastUsedDef: ConsumableDef | null = resolveLastUsedConsumableDef(),
): boolean {
  if (!def.shopBuyAndUse) return false;
  const eligibility = canUseConsumable(def, { scene: 'shop', source: 'shop_buy_use' });
  if (!eligibility.allowed) return false;
  if (def.useMode !== 'any_time') return false;
  if (def.id === 'second_helpings') {
    return isSecondHelpingsCloneTarget(lastUsedDef);
  }
  return true;
}
