import type { Die } from '../types';
import type { EquipmentInstance } from '../ItemsSystem';
import { walkEquipmentPerSlot } from '../equipmentUtils';
import { collectPipRetriggerSources, hasStackedDeck } from './helpers';
import type { RetriggerEquipSource } from './retriggerAnim';

export type ScoredRetriggerScoreContext = { currentDay: number; maxDays: number };

export type ScoredDieRetriggerOptions = {
  die: Die;
  equipment: EquipmentInstance[];
  scoringDice?: Die[];
  firstDieId: string | null;
  lastDieId: string | null;
  scoreContext?: ScoredRetriggerScoreContext;
  stackedDeck?: boolean;
  /** Score-time enhancement (null on standard-dice day 1). */
  isEnhanced: boolean;
  /** Score-time enhancement is lucky (for Loaded Chamber). */
  isLucky: boolean;
  echoCopies?: number;
  bossDisabled?: boolean;
};

export type ScoredDieRetriggerResult = {
  triggerCount: number;
  equipSources: RetriggerEquipSource[];
};

/** Global scored-die retriggers (War Drums, Last Stand, Seventh Trumpet) in trigger/source order. */
function collectGlobalScoredRetriggerSources(
  equipment: EquipmentInstance[],
  context?: ScoredRetriggerScoreContext,
): RetriggerEquipSource[] {
  const sources: RetriggerEquipSource[] = [];
  walkEquipmentPerSlot(equipment, ({ equip, index }) => {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED' && (equip.state.daysRemaining ?? 0) > 0) {
      sources.push({ equipIndex: index });
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_FINAL_DAY' && context && context.currentDay >= context.maxDays) {
      sources.push({ equipIndex: index });
    }
    if (equip.def.effectType === 'ALL_RETRIGGER') {
      const extra = (equip.def.effectParams.value as number) ?? 1;
      for (let i = 0; i < extra; i++) sources.push({ equipIndex: index });
    }
  });
  return sources;
}

/**
 * Global scored-die retriggers applied to every scoring die (War Drums, Last Stand, Seventh Trumpet).
 * Canonical implementation for `getScoredRetriggerCount`.
 */
export function getGlobalScoredRetriggerCount(
  equipment: EquipmentInstance[],
  context?: ScoredRetriggerScoreContext,
): number {
  return collectGlobalScoredRetriggerSources(equipment, context).length;
}

type PerDieScoredRetriggerCollect = {
  equipSources: RetriggerEquipSource[];
  /** Retriggers with no equip card for "Again!" (Loaded Chamber only today). */
  unattributedTriggerCount: number;
};

function collectPerDieScoredRetriggerSources(options: {
  die: Die;
  equipment: EquipmentInstance[];
  scoringDice: Die[];
  firstDieId: string | null;
  lastDieId: string | null;
  stackedDeck: boolean;
  isEnhanced: boolean;
  isLucky: boolean;
}): PerDieScoredRetriggerCollect {
  const { die, equipment, firstDieId, lastDieId, stackedDeck, isEnhanced, isLucky } = options;
  const equipSources: RetriggerEquipSource[] = [];
  let unattributedTriggerCount = 0;

  const pipSources = collectPipRetriggerSources(die, equipment, stackedDeck);
  for (const source of pipSources) {
    equipSources.push(source);
  }

  walkEquipmentPerSlot(equipment, ({ equip, index }) => {
    if (equip.def.effectType === 'FIRST_DICE_RETRIGGER' && die.id === firstDieId) {
      const extra = equip.def.effectParams.value as number;
      for (let i = 0; i < extra; i++) equipSources.push({ equipIndex: index });
    }
    if (equip.def.effectType === 'LAST_DICE_RETRIGGER' && die.id === lastDieId) {
      const extra = equip.def.effectParams.value as number;
      for (let i = 0; i < extra; i++) equipSources.push({ equipIndex: index });
    }
    if (equip.def.effectType === 'ENHANCED_RETRIGGER' && isEnhanced) {
      equipSources.push({ equipIndex: index });
    }
    if (equip.def.effectType === 'LOADED_CHAMBER' && isLucky) {
      unattributedTriggerCount++;
    }
  });

  return { equipSources, unattributedTriggerCount };
}

/**
 * Single source of truth for scored-die retrigger count and "Again!" equipment attribution order.
 * Sticker (red_bullet), Echo of the Damned, and Loaded Chamber add triggers but are not equip sources.
 */
export function computeScoredDieRetriggers(options: ScoredDieRetriggerOptions): ScoredDieRetriggerResult {
  const {
    die,
    equipment,
    scoringDice = [],
    firstDieId,
    lastDieId,
    scoreContext,
    stackedDeck: stackedDeckOpt,
    isEnhanced,
    isLucky,
    echoCopies = 0,
    bossDisabled = false,
  } = options;

  if (bossDisabled) {
    return { triggerCount: 1, equipSources: [] };
  }

  const stackedDeck = stackedDeckOpt ?? hasStackedDeck(equipment);
  const { equipSources: perDieSources, unattributedTriggerCount } = collectPerDieScoredRetriggerSources({
    die,
    equipment,
    scoringDice,
    firstDieId,
    lastDieId,
    stackedDeck,
    isEnhanced,
    isLucky,
  });
  const globalSources = collectGlobalScoredRetriggerSources(equipment, scoreContext);
  const equipSources = [...perDieSources, ...globalSources];

  const stickerTriggers = die.sticker === 'red_bullet' ? 2 : 1;
  const triggerCount =
    stickerTriggers + perDieSources.length + unattributedTriggerCount + globalSources.length + echoCopies;

  return { triggerCount, equipSources };
}
