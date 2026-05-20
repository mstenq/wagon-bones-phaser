// ─── GOLD_DICE_MONEY, ENHANCED_SCORE_MONEY, LUCKY_DICE_MONEY, BONE_DICE_XMULT_CHANCE, WOODEN_DICE_MILES, IRON_DICE_MULT, ENHANCEMENT_SCORED_MILES ───

import { effectRegistry } from '../registry';
import { getPlayerState } from '../../PlayerState';
import { checkLoadedChance } from '../../Constants';

effectRegistry.registerPerDie('GOLD_DICE_MONEY', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement === 'gold') {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    getPlayerState().economy.earn(value);
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'money', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +$${value}`);
  }
});

effectRegistry.registerPerDie('ENHANCED_SCORE_MONEY', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement !== null) {
    const p = equip.def.effectParams as Record<string, unknown>;
    if (checkLoadedChance(p.chance as [number, number], ctx.equipment)) {
      const value = p.value as number;
      getPlayerState().economy.earn(value);
      ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'money', value, dieId: die.id });
      console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +$${value}`);
    }
  }
});

effectRegistry.registerPerDie('LUCKY_DICE_MONEY', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement === 'lucky') {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    getPlayerState().economy.earn(value);
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'money', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +$${value}`);
  }
});

effectRegistry.registerPerDie('BONE_DICE_XMULT_CHANCE', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement === 'bone') {
    const p = equip.def.effectParams as Record<string, unknown>;
    if (checkLoadedChance(p.chance as [number, number], ctx.equipment)) {
      const xVal = p.value as number;
      ctx.xMult *= xVal;
      ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'xmult', value: xVal, dieId: die.id });
      console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: x${xVal}`);
    }
  }
});

effectRegistry.registerPerDie('WOODEN_DICE_MILES', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement === 'wooden') {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    ctx.totalValue += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'miles', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} miles (totalValue: ${ctx.totalValue})`);
  }
});

effectRegistry.registerPerDie('IRON_DICE_MULT', (ctx, equip, _idx, die, _t) => {
  if (die.enhancement === 'steel') {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: _idx }, popupType: 'mult', value, dieId: die.id });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: +${value} mult (bonusMult: ${ctx.bonusMult})`);
  }
});

effectRegistry.registerPerDie('ENHANCEMENT_SCORED_MILES', (_ctx, equip, _idx, die, _t) => {
  if (die.enhancement === (equip.def.effectParams as Record<string, unknown>).enhancement) {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    equip.state.miles = (equip.state.miles ?? 0) + value;
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: gained +${value} miles (now ${equip.state.miles})`);
  }
});
