// ─── Booster pack card-use category dispatch (game facade only, no Phaser) ───

import { gameFacade } from '../../../game/facade';
import type { PackItem, UseConsumableResult } from '../../../game/facade/pack';
import {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
} from '../../../game/facade/pack';
import { getRunState } from '../../../game/store';
import { resolveEquipmentList } from '../../../game/store/resolve';
import { selectEquipmentSlotsFree } from '../../../game/store/selectors/runSelectors';
import { isDiceSelectionReady } from '../../../game/facade/diceSelection';

import trailGuidesData from '../../../data/trail_guides';
import supplyCardsData from '../../../data/supply_cards';
import frontierEncountersData from '../../../data/frontier_encounters';

export type PackCardUseContext = {
  selectedDiceIds: Set<string>;
  equipmentCountBefore: number;
  cardNeedsDiceSelection: (item: PackItem) => boolean;
};

export type PackCardUseOutcome = {
  equipmentPopInCount: number;
  consumableResult?: UseConsumableResult;
  feedbackText?: string;
};

export type PackCardUseResult = { status: 'blocked' } | { status: 'ready'; outcome: PackCardUseOutcome };

export function resolvePackCardUse(item: PackItem, ctx: PackCardUseContext): PackCardUseResult {
  const run = getRunState();
  let equipmentPopInCount = 0;
  let consumableResult: UseConsumableResult | undefined;
  let feedbackText: string | undefined;

  if (ctx.cardNeedsDiceSelection(item)) {
    const config = item.diceSelection!;
    if (!isDiceSelectionReady(config, ctx.selectedDiceIds.size)) {
      return { status: 'blocked' };
    }

    const lineupDice = gameFacade.pack.getLineupDice();
    const selectedDice = lineupDice.filter((d) => ctx.selectedDiceIds.has(d.id));
    const diceSelectionResult = gameFacade.pack.applyDiceSelectionToLineup(config, selectedDice);
    feedbackText = diceSelectionResult.message;
    return {
      status: 'ready',
      outcome: { equipmentPopInCount, feedbackText },
    };
  }

  if (item.category === 'equipment' && item.equipmentDef) {
    if (item.equipmentDef.aura?.id === 'ghost' || selectEquipmentSlotsFree(run) > 0) {
      const instance = gameFacade.pack.acquireEquipment(item.equipmentDef, item.equipmentPreview?.modifiers);
      gameFacade.pack.addEquipmentInstance(instance);
      equipmentPopInCount = 1;
    }
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
    const instantResult = gameFacade.pack.applyInstantEffect(item.instantEffect);
    equipmentPopInCount = Math.max(
      equipmentPopInCount,
      instantResult.equipmentCreatedCount ?? resolveEquipmentList().length - ctx.equipmentCountBefore,
    );
    return { status: 'ready', outcome: { equipmentPopInCount } };
  }

  return { status: 'blocked' };
}
