// ─── CONDITIONAL_MULT, MULT_PER_EQUIPMENT, MILES_PER_DOLLAR, etc. ───

import { effectRegistry } from '../registry';
import { getRunState } from '../../store/runStore';
import { addScore } from '../../scoreMath';
import { HandType } from '../../types';
import { selectHandStats } from '../../store/selectors/runSelectors';

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
    ctx.bonusMult = addScore(ctx.bonusMult, value);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value });
  }
});

effectRegistry.registerAdditive('MULT_PER_EQUIPMENT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const total = (p.value as number) * ctx.equipment.length;
  if (total > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: total });
  }
});

effectRegistry.registerAdditive('MILES_PER_DOLLAR', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const milesGain = (p.value as number) * ctx.playerBalance;
  if (milesGain > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, milesGain);
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
    ctx.bonusMiles = addScore(ctx.bonusMiles, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
  }
});

effectRegistry.registerAdditive('SELL_VALUE_AS_MULT', (ctx, equip, index) => {
  let totalSellValue = 0;
  for (const other of ctx.equipment) {
    if (other !== equip) totalSellValue += other.sellValue;
  }
  if (totalSellValue > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, totalSellValue);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: totalSellValue });
  }
  console.log(`  [equip] ${equip.def.name}: +${totalSellValue} mult (sell values) (bonusMult: ${ctx.bonusMult})`);
});

effectRegistry.registerAdditive('MULT_PER_MONEY_CHUNK', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const chunk = (p.chunk as number) ?? 5;
  const perChunk = (p.value as number) ?? 2;
  const total = Math.floor(ctx.playerBalance / chunk) * perChunk;
  if (total > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: total });
    console.log(
      `  [equip] ${equip.def.name}: +${total} mult ($${ctx.playerBalance} held) (bonusMult: ${ctx.bonusMult})`,
    );
  }
});

effectRegistry.registerAdditive('MULT_PER_MISSING_DICE', (ctx, equip, index) => {
  const run = getRunState();
  const p = equip.def.effectParams as Record<string, unknown>;
  const perDie = (p.value as number) ?? 10;
  const missing = Math.max(0, run.startingDiceCount - ctx.allDice.length);
  if (missing > 0) {
    const total = missing * perDie;
    ctx.bonusMult = addScore(ctx.bonusMult, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: total });
    console.log(
      `  [equip] ${equip.def.name}: +${total} mult (${missing} dice below start) (bonusMult: ${ctx.bonusMult})`,
    );
  }
});

effectRegistry.registerAdditive('DICE_DESTROYED_MILES_GAIN', (ctx, equip, index) => {
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
    console.log(`  [equip] ${equip.def.name}: +${val} miles (destroyed dice) (bonusMiles: ${ctx.bonusMiles})`);
  }
});

effectRegistry.registerAdditive('PIONEER_SPIRIT', (ctx, equip, index) => {
  const value = (equip.def.effectParams as Record<string, unknown>).value as number;
  const run = getRunState();
  let levelsAboveOne = 0;
  for (const handType of Object.values(HandType)) {
    const stats = selectHandStats(run, handType);
    levelsAboveOne += Math.max(0, stats.level - 1);
  }
  if (levelsAboveOne <= 0) return;
  const total = levelsAboveOne * value;
  ctx.bonusMiles = addScore(ctx.bonusMiles, total);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
});

effectRegistry.registerAdditive('FRESH_TRAIL', (ctx, equip, index) => {
  if ((equip.state.freshActive ?? 0) <= 0) return;
  const total = equip.state.miles ?? 0;
  if (total <= 0) return;
  ctx.bonusMiles = addScore(ctx.bonusMiles, total);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
});

effectRegistry.registerAdditive('MARKED_NO_SIX_MULT', (ctx, equip, index) => {
  // Marked: accumulated mult (resets when a 6 is scored)
  const val = equip.state.mult ?? 0;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({
      target: { kind: 'equip', equipIndex: index },
      popupType: 'mult',
      value: val,
    });
    console.log(`  [equip] ${equip.def.name}: +${val} mult (no 6s streak) (bonusMult: ${ctx.bonusMult})`);
  }
});
