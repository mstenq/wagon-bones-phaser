// ─── PIP_MULT, PIP_MILES, PIP_SUPPLY_CHANCE, LUCKY_NUMBER_PIP_XMULT ───

import { effectRegistry } from '../registry';
import { checkLoadedChance } from '../../Constants';
import { getRandomSupplyDef } from '../../ConsumablesSystem';

effectRegistry.registerPerDie('PIP_MULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (die.value === (p.pip as number)) {
    const value = p.value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'mult', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} mult (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerPerDie('PIP_MILES', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (die.value === (p.pip as number)) {
    const value = p.value as number;
    ctx.totalValue += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'miles', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} miles (totalValue: ${ctx.totalValue})`);
  }
});

effectRegistry.registerPerDie('LUCKY_NUMBER_PIP_XMULT', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (die.value === (equip.state.pip ?? 0)) {
    const xVal = p.value as number;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'xmult', value: xVal, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: x${xVal} (lucky number ${equip.state.pip})`);
  }
});

effectRegistry.registerPerDie('PIP_SUPPLY_CHANCE', (ctx, equip, _idx, die, _t) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  if (die.value === (p.pip as number)) {
    const chance = p.chance as [number, number];
    if (checkLoadedChance(chance, ctx.equipment)) {
      const supplyDef = getRandomSupplyDef();
      ctx.mutations.consumablesGranted.push(supplyDef.id);
      ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'supply', value: 0, dieId: die.id });
      console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: granted supply card '${supplyDef.name}'`);
    }
  }
});
