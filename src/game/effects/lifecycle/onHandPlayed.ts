// ─── on-hand-played lifecycle handlers ───

import type { Die, HandType } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { replaceEquipmentList } from '../../store/resolve';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { dieMatchesPip, handTypeMatches, hasStackedDeck, resolveEffectParam } from '../helpers';
import { checkLoadedChance } from '../../equipmentUtils';
import { getMostPlayedHandTypes } from '../../handStatsHelpers';
import { getRunState } from '../../store/runStore';
import { getRoundState } from '../../store/roundStore';
import { resolveEquipmentList } from '../../store/resolve';

effectRegistry.registerLifecycle('on-hand-played', (equip, handType, scoringDice) => {
  const run = getRunState();
  const equipment = resolveEquipmentList();
  switch (equip.def.effectType) {
    case 'HAND_MULT_GAIN': {
      const p = equip.def.effectParams as Record<string, unknown>;
      if (handTypeMatches(handType as HandType, p.handType as string)) {
        equip.state.mult =
          (equip.state.mult ?? 0) + resolveEffectParam<number>(p, 'value', run.professionId ?? undefined);
      }
      break;
    }
    case 'EVERY_NTH_HAND_XMULT':
      equip.state.handsPlayed = (equip.state.handsPlayed ?? 0) + 1;
      break;
    case 'MARKED_NO_SIX_MULT': {
      const stackedDeck = hasStackedDeck(equipment);
      const hasSix = (scoringDice as Die[])?.some((d) => dieMatchesPip(d, 6, equipment, stackedDeck)) ?? false;
      if (hasSix) {
        equip.state.mult = 0;
      } else {
        const p = equip.def.effectParams as Record<string, unknown>;
        const gain = resolveEffectParam<number>(p, 'multPerHand', run.professionId ?? undefined);
        equip.state.mult = (equip.state.mult ?? 0) + gain;
      }
      break;
    }
    case 'EXACT_DICE_COUNT_MILES': {
      const count = equip.def.effectParams.count as number;
      const diceCount = (scoringDice as Die[])?.length ?? 0;
      if (diceCount === count) {
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
      }
      break;
    }
    case 'HAND_MILES_GAIN': {
      if (handTypeMatches(handType as HandType, equip.def.effectParams.handType as string)) {
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
      }
      break;
    }
    case 'TRAILBLAZER_XMULT': {
      const mostPlayed = getMostPlayedHandTypes(run.handStats);
      if (mostPlayed.length > 0 && mostPlayed.includes(handType as HandType)) {
        equip.state.streak = 0;
      } else {
        equip.state.streak = (equip.state.streak ?? 0) + 1;
      }
      break;
    }
    case 'CONSECUTIVE_PIP_XMULT':
      equip.state.consecutiveCount = 0;
      break;
    case 'FRESH_TRAIL': {
      const handKey = `round_hand_${handType as string}`;
      const seen = (equip.state[handKey] ?? 0) > 0;
      if (!seen) {
        const gain = (equip.def.effectParams.value as number) ?? 5;
        equip.state.miles = (equip.state.miles ?? 0) + gain;
        equip.state.freshActive = 1;
        equip.state[handKey] = 1;
      } else {
        equip.state.freshActive = 0;
      }
      break;
    }
    case 'STEW':
      if ((equip.state.roundsRemaining ?? 0) > 0 && (getRoundState()?.day ?? 1) === 1) {
        const chance = (equip.def.effectParams.chance as [number, number]) ?? [1, 2];
        if (checkLoadedChance(chance, equipment)) {
          equip.state.stewUpgradePending = 1;
        } else {
          equip.state.stewUpgradePending = 0;
        }
      }
      break;
  }
});

export function processEquipmentOnHandPlayed(
  equipment: EquipmentInstance[],
  handType: HandType,
  scoringDice?: Die[],
): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-hand-played', equip, handType, scoringDice);
  }
  replaceEquipmentList(equipment);
}
