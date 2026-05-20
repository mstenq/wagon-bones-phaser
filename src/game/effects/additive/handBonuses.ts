// ─── HAND_MULT, HAND_MILES, HAND_TIMES_PLAYED_MULT ───

import { effectRegistry } from '../registry';
import { handTypeMatches } from '../helpers';
import { getPlayerState } from '../../PlayerState';

effectRegistry.registerAdditive('HAND_MULT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (handTypeMatches(ctx.handResult.type, p.handType as string)) {
    const value = p.value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value });
  }
});

effectRegistry.registerAdditive('HAND_MILES', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (handTypeMatches(ctx.handResult.type, p.handType as string)) {
    const value = p.value as number;
    ctx.bonusMiles += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value });
  }
});

effectRegistry.registerAdditive('HAND_TIMES_PLAYED_MULT', (ctx, equip, index) => {
  // Trail Journal: add times this hand type has been played as mult
  if (ctx.handType) {
    const player = getPlayerState();
    const stats = player.getHandStats(ctx.handType);
    const val = stats.timesPlayed;
    if (val > 0) {
      ctx.bonusMult += val;
      ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    }
    console.log(`  [equip] ${equip.def.name}: +${val} mult (${ctx.handType} played ${val} times)`);
  }
});
