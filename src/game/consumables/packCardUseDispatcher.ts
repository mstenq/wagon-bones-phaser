// ─── Booster pack card-use category dispatch (game facade only, no Phaser) ───

import { gameFacade } from '../facade';
import type { PackItem, UseConsumableResult } from '../facade/pack';
import { createFrontierConsumableDef, createSupplyConsumableDef, createTrailGuideConsumableDef } from '../facade/pack';
import { getRunState } from '../store';
import { resolveEquipmentList } from '../store/resolve';
import { selectEquipmentSlotsFree } from '../store/selectors/runSelectors';

import trailGuidesData from '../../data/trail_guides';
import supplyCardsData from '../../data/supply_cards';
import frontierEncountersData from '../../data/frontier_encounters';
export type PackCardUseContext = {
  equipmentCountBefore: number;
};

export type PackCardUseOutcome = {
  equipmentPopInCount: number;
  consumableResult?: UseConsumableResult;
  feedbackText?: string;
};

export type PackCardUseResult = { status: 'blocked' } | { status: 'ready'; outcome: PackCardUseOutcome };

export function packCardNeedsEquipSlot(item: PackItem): boolean {
  if (item.category === 'equipment' && item.equipmentDef) return true;
  if (item.instantEffect?.type === 'CREATE_EQUIPMENT') return true;
  return false;
}

export function canAcquirePackCardItem(item: PackItem, run = getRunState()): boolean {
  if (item.category === 'equipment' && item.equipmentDef) {
    if (item.equipmentDef.aura?.id === 'ghost') return true;
    return selectEquipmentSlotsFree(run) > 0;
  }
  if (item.instantEffect?.type === 'CREATE_EQUIPMENT') {
    return selectEquipmentSlotsFree(run) > 0;
  }
  return true;
}

export function resolvePackCardUse(item: PackItem, ctx: PackCardUseContext): PackCardUseResult {
  const run = getRunState();
  let equipmentPopInCount = 0;
  let consumableResult: UseConsumableResult | undefined;
  let feedbackText: string | undefined;

  if (item.diceSelection) {
    return { status: 'blocked' };
  }

  if (item.category === 'equipment' && item.equipmentDef) {
    if (!canAcquirePackCardItem(item, run)) {
      return { status: 'blocked' };
    }
    const instance = gameFacade.pack.acquireEquipment(item.equipmentDef, item.equipmentPreview?.modifiers);
    gameFacade.pack.addEquipmentInstance(instance);
    equipmentPopInCount = 1;
    return { status: 'ready', outcome: { equipmentPopInCount } };
  }

  if (item.category === 'dice' && item.die) {
    gameFacade.pack.addDie(item.die);
    return { status: 'ready', outcome: { equipmentPopInCount } };
  }

  if (item.category === 'trail_guide' && item.trailGuideId) {
    const tg = trailGuidesData.find((t) => t.id === item.trailGuideId);
    if (!tg) return { status: 'blocked' };

    const def = createTrailGuideConsumableDef(tg);
    const result = gameFacade.pack.useConsumableDirectly(def);
    if (!result.success && result.failReason) {
      feedbackText = result.failReason;
    }
    return { status: 'ready', outcome: { equipmentPopInCount, feedbackText } };
  }

  if (item.category === 'supply' && item.supplyCardId) {
    const cardData = supplyCardsData.find((c) => c.id === item.supplyCardId);
    if (!cardData) return { status: 'blocked' };

    const def = createSupplyConsumableDef(cardData);
    const result = gameFacade.pack.useConsumableDirectly(def);
    if (!result.success && result.failReason) {
      feedbackText = result.failReason;
    }
    return { status: 'ready', outcome: { equipmentPopInCount, feedbackText } };
  }

  if (item.category === 'frontier' && item.frontierEncounterId) {
    const fe = frontierEncountersData.find((f) => f.id === item.frontierEncounterId);
    if (!fe) return { status: 'blocked' };

    const def = createFrontierConsumableDef(fe);
    consumableResult = gameFacade.pack.useConsumableDirectly(def, {
      visibleDiceIds: gameFacade.pack.getLineupDice().map((d) => d.id),
    });
    if (!consumableResult.success && consumableResult.failReason) {
      feedbackText = consumableResult.failReason;
    }
    return {
      status: 'ready',
      outcome: { equipmentPopInCount, consumableResult, feedbackText },
    };
  }

  if (item.instantEffect) {
    if (!canAcquirePackCardItem(item, run)) {
      return { status: 'blocked' };
    }
    const instantResult = gameFacade.pack.applyInstantEffect(item.instantEffect);
    equipmentPopInCount = Math.max(
      equipmentPopInCount,
      instantResult.equipmentCreatedCount ?? resolveEquipmentList().length - ctx.equipmentCountBefore,
    );
    return { status: 'ready', outcome: { equipmentPopInCount } };
  }

  return { status: 'blocked' };
}
