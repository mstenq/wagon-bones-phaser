// ─── Equipment card-bar timing alert (No Phaser imports) ───
// Evaluates when an item's alertType condition is met for aggressive idle wiggle.

import type { EquipmentAlertType } from '../data/items';
import type { RoundHintContext } from './displayContextTypes';
import type { EquipmentInstance } from './ItemsSystem';

function isAlertTypeActive(
  alertType: EquipmentAlertType,
  equip: EquipmentInstance,
  round: RoundHintContext | null,
): boolean {
  switch (alertType) {
    case 'firstDay':
      return round?.day === 1;
    case 'lastDay':
      return round != null && round.day >= round.maxDays;
    case 'readyToSell': {
      const roundsNeeded = (equip.def.effectParams.roundsNeeded as number | undefined) ?? 2;
      return (equip.state.roundsHeld ?? 0) >= roundsNeeded;
    }
    case 'everyNthHand': {
      const n = (equip.def.effectParams.n as number | undefined) ?? 6;
      const hands = equip.state.handsPlayed ?? 0;
      return hands > 0 && hands % n === 0;
    }
  }
}

/** True when the equipment def opts in via alertType and its timing condition is currently met. */
export function isEquipmentTimingAlertActive(equip: EquipmentInstance, round: RoundHintContext | null): boolean {
  const alertType = equip.def.alertType;
  if (!alertType) return false;
  return isAlertTypeActive(alertType, equip, round);
}
