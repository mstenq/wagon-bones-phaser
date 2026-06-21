// ─── Money-granting effects ───

import { effectRegistry } from '../registry';
import { resolveEffectParam } from '../helpers';
import { resolveWantedPosterTargetHand } from '../../handStatsHelpers';
import { getRunState } from '../../store/runStore';

effectRegistry.registerAdditive('WANTED_HAND_MONEY', (ctx, equip, index) => {
  const targetHand = resolveWantedPosterTargetHand(equip.state.targetHand ?? 0, getRunState().handStats);
  const handType = ctx.handResult.type;
  if (handType === targetHand) {
    const p = equip.def.effectParams as Record<string, unknown>;
    const value = resolveEffectParam<number>(p, 'value', ctx.professionId ?? undefined);
    ctx.mutations.moneyEarned += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'money', value });
    console.log(`  [equip] ${equip.def.name}: +$${value} (hand matched ${targetHand})`);
  }
});
