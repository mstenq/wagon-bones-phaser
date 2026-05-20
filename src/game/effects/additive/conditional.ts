// ─── CONDITIONAL_MULT, MULT_PER_EQUIPMENT, MILES_PER_DOLLAR, etc. ───

import { effectRegistry } from '../registry';

effectRegistry.registerAdditive('CONDITIONAL_MULT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const condition = p.condition as string;
  let met = false;
  if (condition === 'SCORED_DICE_LTE') {
    met = ctx.scoringDice.length <= (p.threshold as number);
  } else if (condition === 'NO_REROLLS') {
    met = ctx.rerollsRemaining === 0;
  }
  if (met) {
    const value = p.value as number;
    ctx.bonusMult += value;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value });
  }
});

effectRegistry.registerAdditive('MULT_PER_EQUIPMENT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const total = (p.value as number) * ctx.equipment.length;
  if (total > 0) {
    ctx.bonusMult += total;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: total });
  }
});

effectRegistry.registerAdditive('MILES_PER_DOLLAR', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const milesGain = (p.value as number) * ctx.playerBalance;
  if (milesGain > 0) {
    ctx.bonusMiles += milesGain;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: milesGain });
  }
  console.log(
    `  [equip] ${equip.def.name}: +${milesGain} miles ($${ctx.playerBalance} × ${p.value}) (bonusMiles: ${ctx.bonusMiles})`,
  );
});

effectRegistry.registerAdditive('MILES_PER_EQUIPMENT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const total = (p.value as number) * ctx.equipment.length;
  if (total > 0) {
    ctx.bonusMiles += total;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
  }
});

effectRegistry.registerAdditive('SELL_VALUE_AS_MULT', (ctx, equip, index) => {
  let totalSellValue = 0;
  for (const other of ctx.equipment) {
    if (other !== equip) totalSellValue += other.sellValue;
  }
  if (totalSellValue > 0) {
    ctx.bonusMult += totalSellValue;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: totalSellValue });
  }
  console.log(`  [equip] ${equip.def.name}: +${totalSellValue} mult (sell values) (bonusMult: ${ctx.bonusMult})`);
});

effectRegistry.registerAdditive('MARKED_NO_SIX_MULT', (ctx, equip, index) => {
  // Marked: accumulated mult (resets when a 6 is scored)
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult += val;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (no 6s streak) (bonusMult: ${ctx.bonusMult})`);
  }
});
