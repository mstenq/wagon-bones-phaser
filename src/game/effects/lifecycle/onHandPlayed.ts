// ─── on-hand-played lifecycle handlers ───

import type { Die, HandType, HandStats } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { dieMatchesPip, handTypeMatches } from '../helpers';
import { getPlayerState } from '../../PlayerState';

function getMostPlayedHandTypes(handStats: Map<HandType, HandStats>): HandType[] {
  let max = 0;
  for (const [, stats] of handStats) {
    max = Math.max(max, stats.timesPlayed);
  }
  if (max === 0) return [];
  const types: HandType[] = [];
  for (const [type, stats] of handStats) {
    if (stats.timesPlayed === max) types.push(type);
  }
  return types;
}

effectRegistry.registerLifecycle('on-hand-played', (equip, handType, scoringDice) => {
  switch (equip.def.effectType) {
    case 'HAND_MULT_GAIN':
      if (handTypeMatches(handType as any, equip.def.effectParams.handType as string)) {
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
      }
      break;
    case 'EVERY_NTH_HAND_XMULT':
      equip.state.handsPlayed = (equip.state.handsPlayed ?? 0) + 1;
      break;
    case 'MARKED_NO_SIX_MULT': {
      const player = getPlayerState();
      const hasSix =
        (scoringDice as Die[])?.some((d) => dieMatchesPip(d, 6, player.equipment)) ?? false;
      if (hasSix) {
        equip.state.mult = 0;
      } else {
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.multPerHand as number);
      }
      break;
    }
    case 'EXACT_DICE_COUNT_MILES': {
      const count = equip.def.effectParams.count as number;
      const diceCount = (scoringDice as any[])?.length ?? 0;
      if (diceCount === count) {
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
      }
      break;
    }
    case 'HAND_MILES_GAIN': {
      if (handTypeMatches(handType as any, equip.def.effectParams.handType as string)) {
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
      }
      break;
    }
    case 'TRAILBLAZER_XMULT': {
      const player = getPlayerState();
      const mostPlayed = getMostPlayedHandTypes(player.handStats);
      if (mostPlayed.length > 0 && mostPlayed.includes(handType as HandType)) {
        equip.state.streak = 0;
      } else {
        equip.state.streak = (equip.state.streak ?? 0) + 1;
      }
      break;
    }
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
}
