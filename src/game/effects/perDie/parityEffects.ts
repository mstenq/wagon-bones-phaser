// ─── PARITY_MULT, PARITY_MILES ───

import { effectRegistry } from '../registry';
import { dieMatchesParity } from '../helpers';

effectRegistry.registerPerDie('PARITY_MULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const parity = p.parity as 'even' | 'odd';
  if (dieMatchesParity(die, parity, ctx.equipment, ctx.hasStackedDeck)) {
    const value = p.value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({
      target: { kind: 'both', dieId: die.id, equipIndex: _idx },
      popupType: 'mult',
      value,
      dieId: die.id,
    });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} mult (parity) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerPerDie('PARITY_MILES', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const parity = p.parity as 'even' | 'odd';
  if (dieMatchesParity(die, parity, ctx.equipment, ctx.hasStackedDeck)) {
    const value = p.value as number;
    ctx.totalValue += value;
    ctx.animEvents.push({
      target: { kind: 'both', dieId: die.id, equipIndex: _idx },
      popupType: 'miles',
      value,
      dieId: die.id,
    });
    console.log(
      `  [perDie] Die ${die.id} → ${equip.def.name}: +${value} miles (parity) (totalValue: ${ctx.totalValue})`,
    );
  }
});
