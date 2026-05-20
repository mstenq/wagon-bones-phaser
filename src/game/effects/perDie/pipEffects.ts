// ─── PIP_MULT, PIP_MILES, PIP_SUPPLY_CHANCE, LUCKY_NUMBER_PIP_XMULT ───

import { effectRegistry } from '../registry';
import { checkLoadedChance } from '../../Constants';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import { dieMatchesPip } from '../helpers';

effectRegistry.registerPerDie('PIP_MULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, p.pip as number, ctx.equipment)) {
    const value = p.value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'mult', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} mult (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerPerDie('PIP_MILES', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, p.pip as number, ctx.equipment)) {
    const value = p.value as number;
    ctx.totalValue += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'miles', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} miles (totalValue: ${ctx.totalValue})`);
  }
});

effectRegistry.registerPerDie('LUCKY_NUMBER_PIP_XMULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, equip.state.pip ?? 0, ctx.equipment)) {
    const xVal = p.value as number;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'xmult', value: xVal, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: x${xVal} (lucky number ${equip.state.pip})`);
  }
});

effectRegistry.registerPerDie('PIP_SUPPLY_CHANCE', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (dieMatchesPip(die, p.pip as number, ctx.equipment)) {
    const chance = p.chance as [number, number];
    if (checkLoadedChance(chance, ctx.equipment)) {
      const supplyDef = getRandomSupplyDef();
      ctx.mutations.consumablesGranted.push(supplyDef.id);
      ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'supply', value: 0, dieId: die.id });
      console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: granted supply card '${supplyDef.name}'`);
    }
  }
});

effectRegistry.registerPerDie('FIRST_PIP_XMULT', (ctx, equip, equipIdx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const pip = p.pip as number;
  const xVal = p.value as number;
  const firstPipDieId = ctx.scoringDice.find((d) => dieMatchesPip(d, pip, ctx.equipment))?.id;
  if (!firstPipDieId || die.id !== firstPipDieId) return;
  ctx.xMult *= xVal;
  ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: equipIdx }, popupType: 'xmult', value: xVal, dieId: die.id });
  console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: x${xVal} (first ${pip})`);
});

effectRegistry.registerPerDie('CONSECUTIVE_PIP_XMULT', (ctx, equip, equipIdx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const pip = p.pip as number;
  const increment = (p.increment as number) ?? 0.5;
  if (dieMatchesPip(die, pip, ctx.equipment)) {
    const count = (equip.state.consecutiveCount ?? 0) + 1;
    equip.state.consecutiveCount = count;
    const xVal = 1 + (count - 1) * increment;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: equipIdx }, popupType: 'xmult', value: xVal, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: x${xVal} (${count} consecutive ${pip}s)`);
  } else {
    equip.state.consecutiveCount = 0;
  }
});
