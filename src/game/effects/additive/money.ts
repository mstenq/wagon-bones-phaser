// ─── Money-granting effects ───

import { effectRegistry } from '../registry';
import { getPlayerState } from '../../PlayerState';
import { HandType } from '../../types';

effectRegistry.registerAdditive('WANTED_HAND_MONEY', (ctx, equip) => {
  const handTypes = Object.values(HandType);
  const targetIdx = equip.state.targetHand ?? 0;
  const targetHand = handTypes[targetIdx % handTypes.length];
  const handType = ctx.handResult.type;
  if (handType === targetHand) {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    getPlayerState().economy.earn(value);
    ctx.mutations.moneyEarned += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: 0 }, popupType: 'money', value });
  }
});
