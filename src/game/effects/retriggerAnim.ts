import type { Die, HandType, ScoreAnimEvent } from '../types';
import type { EquipmentInstance } from '../ItemsSystem';
import { resolveCopyTarget } from '../equipmentUtils';
import { isEquipmentDisabledByBoss } from '../BossEffectsSystem';
import { dieMatchesPip, hasStackedDeck } from './helpers';
import { enhancementHeldSteelXMult, hasAlchemyKit } from '../alchemyKit';

export type RetriggerEquipSource = { equipIndex: number };

/** Equipment indices for held-in-hand / round-end held retriggers (Silver Bullets, Seventh Trumpet). */
export function buildHeldRetriggerSources(equipment: EquipmentInstance[]): RetriggerEquipSource[] {
  const sources: RetriggerEquipSource[] = [];
  const maxCopyDepth = equipment.length;

  for (let ei = 0; ei < equipment.length; ei++) {
    if (isEquipmentDisabledByBoss(ei)) continue;
    let equip = equipment[ei];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, ei, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType === 'HELD_RETRIGGER' || equip.def.effectType === 'ALL_RETRIGGER') {
      const extra = (equip.def.effectParams.value as number) ?? 1;
      for (let i = 0; i < extra; i++) sources.push({ equipIndex: ei });
    }
  }

  return sources;
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
  if (enhancementHeldSteelXMult(die.enhancement, hasAlchemyKit(equipment))) return true;

  const stackedDeck = hasStackedDeck(equipment);
  const maxCopyDepth = equipment.length;

  for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
    if (isEquipmentDisabledByBoss(eIdx)) continue;
    let equip = equipment[eIdx];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, eIdx, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }

    if (equip.def.effectType === 'HELD_LOWEST_MULT') {
      const lowestValue = Math.min(...heldDice.map((d) => d.value));
      if (die.value === lowestValue && die === heldDice.find((d) => d.value === lowestValue)) {
        return true;
      }
    }
    if (equip.def.effectType === 'HELD_PIP_XMULT' || equip.def.effectType === 'HELD_PIP_MULT') {
      const pip = equip.def.effectParams.pip as number;
      if (dieMatchesPip(die, pip, equipment, stackedDeck)) return true;
    }
    if (equip.def.effectType === 'HELD_ENHANCED_MONEY' && die.enhancement !== null) {
      return true;
    }
  }

  return false;
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
