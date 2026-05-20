// ─── Money-granting effects ───

import { effectRegistry } from '../registry';
import { HandType } from '../../types';

effectRegistry.registerAdditive('WANTED_HAND_MONEY', (ctx, equip, index) => {
  const handTypes = Object.values(HandType);
  const targetIdx = equip.state.targetHand ?? 0;
  const targetHand = handTypes[targetIdx % handTypes.length];
  const handType = ctx.handResult.type;
  if (handType === targetHand) {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    ctx.mutations.moneyEarned += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'money', value });
    console.log(`  [equip] ${equip.def.name}: +$${value} (hand matched ${targetHand})`);
  }
});
