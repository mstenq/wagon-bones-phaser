// ─── on-hand-played lifecycle handlers ───

import { effectRegistry } from '../registry';
import { handTypeMatches } from '../helpers';

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
      const hasSix = (scoringDice as any[])?.some((d) => d.value === 6) ?? false;
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
  }
});
