// ─── HELD_LOWEST_MULT, HELD_PIP_XMULT, HELD_PIP_MULT, HELD_ENHANCED_MONEY ───

import { effectRegistry } from '../registry';
import { dieMatchesPip, multiplyCtxXMult } from '../helpers';
import { rngFloat } from '../../RunRng';
import { addScore } from '../../scoreMath';

effectRegistry.registerHeldDie('HELD_LOWEST_MULT', (ctx, equip, _idx, die, _t) => {
  // Compute lowest value from held dice
  const lowestValue = Math.min(...ctx.heldDice.map((d) => d.value));
  if (die.value === lowestValue && die === ctx.heldDice.find((d) => d.value === lowestValue)) {
    const value = lowestValue * 2;
    ctx.bonusMult = addScore(ctx.bonusMult, value);
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'mult', value });
    console.log(`  [held] Die ${die.id} → ${equip.def.name}: +${value} mult (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerHeldDie('HELD_PIP_XMULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, p.pip as number, ctx.equipment, ctx.hasStackedDeck)) {
    const xVal = p.value as number;
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'xmult', value: xVal });
    console.log(`  [held] Die ${die.id} → ${equip.def.name}: x${xVal} mult (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerHeldDie('HELD_PIP_MULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, p.pip as number, ctx.equipment, ctx.hasStackedDeck)) {
    const value = p.value as number;
    ctx.bonusMult = addScore(ctx.bonusMult, value);
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'mult', value });
    console.log(`  [held] Die ${die.id} → ${equip.def.name}: +${value} mult (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerHeldDie('HELD_ENHANCED_MONEY', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement !== null) {
    const p = equip.def.effectParams as Record<string, unknown>;
    const [num, den] = p.chance as [number, number];
    if (rngFloat('equipment') < num / den) {
      const value = p.value as number;
      ctx.mutations.moneyEarned += value;
      ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'money', value });
      console.log(`  [held] Die ${die.id} → ${equip.def.name}: +$${value} (total: $${ctx.mutations.moneyEarned})`);
    }
  }
});
