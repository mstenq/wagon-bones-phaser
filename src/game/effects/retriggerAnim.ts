import type { Die, HandType, ScoreAnimEvent } from '../types';
import type { EquipmentInstance } from '../ItemsSystem';
import { walkEquipmentPerSlot } from '../equipmentUtils';
import { isDiceScoringDisabledByBoss } from '../BossEffectsSystem';
import { collectPipRetriggerSources, dieMatchesPip, hasStackedDeck, isLowestHeldDieTarget } from './helpers';
import { enhancementHeldSteelXMult, hasAlchemyKit } from '../alchemyKit';

export type RetriggerEquipSource = { equipIndex: number };

/** Equipment indices for held-in-hand / round-end held retriggers (Silver Bullets, Seventh Trumpet). */
export function buildHeldRetriggerSources(equipment: EquipmentInstance[]): RetriggerEquipSource[] {
  const sources: RetriggerEquipSource[] = [];

  walkEquipmentPerSlot(equipment, (slot) => {
    if (slot.equip.def.effectType === 'HELD_RETRIGGER' || slot.equip.def.effectType === 'ALL_RETRIGGER') {
      const extra = (slot.equip.def.effectParams.value as number) ?? 1;
      for (let i = 0; i < extra; i++) sources.push({ equipIndex: slot.index });
    }
  });

  return sources;
}

export function computeHeldDieRetriggers(
  die: Die,
  equipment: EquipmentInstance[],
): { triggerCount: number; equipSources: RetriggerEquipSource[] } {
  const stackedDeck = hasStackedDeck(equipment);
  const pipSources = collectPipRetriggerSources(die, equipment, stackedDeck);
  const globalSources = buildHeldRetriggerSources(equipment);
  const equipSources = [...pipSources, ...globalSources];
  const stickerBonus = die.sticker === 'red_bullet' ? 1 : 0;
  const triggerCount = 1 + stickerBonus + equipSources.length;
  return { triggerCount, equipSources };
}

/**
 * True when a held die has something to retrigger during scoring (steel or held equipment).
 * Silver Bullets still adds trigger iterations for all held dice; "Again!" only shows when this is true.
 */
export function heldDieHasRetriggerableEffects(
  die: Die,
  heldDice: Die[],
  equipment: EquipmentInstance[],
  _scoredHandType?: HandType,
): boolean {
  if (isDiceScoringDisabledByBoss(die)) return false;

  if (enhancementHeldSteelXMult(die.enhancement, hasAlchemyKit(equipment))) return true;

  const stackedDeck = hasStackedDeck(equipment);
  let found = false;

  walkEquipmentPerSlot(equipment, (slot) => {
    if (found) return false;

    const equip = slot.equip;
    if (equip.def.effectType === 'HELD_LOWEST_MULT' && isLowestHeldDieTarget(die, heldDice)) {
      found = true;
      return false;
    }
    if (
      equip.def.effectType === 'HELD_PIP_XMULT' ||
      equip.def.effectType === 'HELD_PIP_MULT' ||
      equip.def.effectType === 'PIP_XMULT'
    ) {
      const pip = equip.def.effectParams.pip as number;
      if (dieMatchesPip(die, pip, equipment, stackedDeck)) {
        found = true;
        return false;
      }
    }
    if (equip.def.effectType === 'HELD_ENHANCED_MONEY' && die.enhancement !== null) {
      found = true;
      return false;
    }
  });

  return found;
}

/** Push an "Again!" popup on the equipment card that caused this retrigger iteration. */
export function pushRetriggerAgainEvent(
  animEvents: ScoreAnimEvent[],
  die: Die,
  triggerIndex: number,
  equipSources: RetriggerEquipSource[],
  options?: { dieId?: string },
): void {
  if (triggerIndex <= 0) return;

  let equipSourceIdx = triggerIndex - 1;
  if (die.sticker === 'red_bullet') equipSourceIdx--;
  if (equipSourceIdx < 0 || equipSourceIdx >= equipSources.length) return;

  const { equipIndex } = equipSources[equipSourceIdx];
  animEvents.push({
    target: { kind: 'equip', equipIndex },
    popupType: 'again',
    value: 0,
    dieId: options?.dieId ?? die.id,
  });
}
