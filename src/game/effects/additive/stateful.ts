// ─── Stateful additive mult effects (read accumulated state) ───

import { effectRegistry } from '../registry';
import { addScore } from '../../scoreMath';

effectRegistry.registerAdditive('STATEFUL_ADD_MULT', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (stateful) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerAdditive('DECAYING_MULT', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (decaying) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerAdditive('HAND_MULT_GAIN', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerAdditive('SHOP_REROLL_MULT_GAIN', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (reroll gains) (bonusMult: ${ctx.bonusMult})`);
  }
});

// ─── Stateful xMult gain (adds to state during scoring) ───

effectRegistry.registerAdditive('STATEFUL_XMULT_GAIN', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const gain = p.value as number;
  equip.state.xMult = (equip.state.xMult ?? 1) + gain;
  ctx.bonusMult = addScore(ctx.bonusMult, gain);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: gain });
});

// ─── Miles stateful effects ───

effectRegistry.registerAdditive('STATEFUL_ADD_MILES', (ctx, equip, index) => {
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} miles (stateful) (bonusMiles: ${ctx.bonusMiles})`);
  }
});

effectRegistry.registerAdditive('TRAIL_TAX', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (trail tax) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerAdditive('ROUND_START_DESTROY_RIGHT', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerAdditive('ENHANCED_SPENT_MILES_GAIN', (ctx, equip, index) => {
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} miles (accumulated) (bonusMiles: ${ctx.bonusMiles})`);
  }
});

effectRegistry.registerAdditive('OLD_CALENDAR', (ctx, equip, index) => {
  const multVal = equip.state.mult ?? 0;
  const milesVal = equip.state.miles ?? 0;
  if (multVal > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, multVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: multVal });
  }
  if (milesVal > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, milesVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: milesVal });
  }
});

effectRegistry.registerAdditive('OFFERING_BOWL', (ctx, equip, index) => {
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
  }
});
