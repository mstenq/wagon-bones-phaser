// ─── FINAL_DAY_XMULT, EVERY_NTH_HAND_XMULT, HAND_CONTAINS_XMULT, ENHANCED_DICE_COUNT_XMULT, ROUNDS_SKIPPED_XMULT ───

import { effectRegistry } from '../registry';
import { checkLoadedChance } from '../../equipmentUtils';
import { handTypeMatches, multiplyCtxXMult } from '../helpers';
import { HandType } from '../../types';

effectRegistry.registerXMult('FINAL_DAY_XMULT', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  if (ctx.currentDay >= ctx.maxDays) {
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(
      `  [xmult] ${equip.def.name}: x${xVal} (final day ${ctx.currentDay}/${ctx.maxDays}) (xMult: ${ctx.xMult})`,
    );
  } else {
    console.log(`  [xmult] ${equip.def.name}: inactive (day ${ctx.currentDay}/${ctx.maxDays})`);
  }
});

effectRegistry.registerXMult('EVERY_NTH_HAND_XMULT', (ctx, equip, index) => {
  const n = (equip.def.effectParams as Record<string, unknown>).n as number;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const hands = equip.state.handsPlayed ?? 0;
  if (hands > 0 && hands % n === 0) {
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (hand #${hands}, every ${n}th) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('HAND_CONTAINS_XMULT', (ctx, equip, index) => {
  const requiredHand = (equip.def.effectParams as Record<string, unknown>).handType as string;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  if (ctx.handType && handTypeMatches(ctx.handResult.type, requiredHand)) {
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (hand contains ${requiredHand}) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ENHANCED_DICE_COUNT_XMULT', (ctx, equip, index) => {
  const threshold = (equip.def.effectParams as Record<string, unknown>).threshold as number;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const enhCount = ctx.allDice.filter((d) => d.enhancement !== null).length;
  if (enhCount >= threshold) {
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(
      `  [xmult] ${equip.def.name}: x${xVal} (${enhCount} enhanced dice >= ${threshold}) (xMult: ${ctx.xMult})`,
    );
  }
});

effectRegistry.registerXMult('TRAILBLAZER_XMULT', (ctx, equip, index) => {
  const perHand = (equip.def.effectParams as Record<string, unknown>).value as number;
  const streak = equip.state.streak ?? 0;
  if (streak > 0) {
    const xVal = 1 + streak * perHand;
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal.toFixed(1)} (${streak} off-meta hands) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ROUNDS_SKIPPED_XMULT', (ctx, equip, index) => {
  const skipped = equip.state.roundsSkipped ?? 0;
  if (skipped > 0) {
    const xVal = 1 + skipped * ((equip.def.effectParams as Record<string, unknown>).value as number);
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${skipped} rounds skipped) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('CHANCE_HAND_XMULT_MONEY', (ctx, equip, index) => {
  const p = equip.def.effectParams as { chance: [number, number]; xMult: number; money: number };
  if (!checkLoadedChance(p.chance, ctx.equipment)) return;

  multiplyCtxXMult(ctx, p.xMult);
  ctx.mutations.moneyEarned += p.money;
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: p.xMult });
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'money', value: p.money });
  console.log(`  [xmult] ${equip.def.name}: x${p.xMult} + $${p.money} (xMult: ${ctx.xMult})`);
});

effectRegistry.registerXMult('SILVER_RESERVE', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const chunk = (p.chunk as number) ?? 25;
  const perChunk = (p.value as number) ?? 0.4;
  const chunks = Math.floor(ctx.playerBalance / chunk);
  if (chunks <= 0) return;
  const xVal = 1 + chunks * perChunk;
  multiplyCtxXMult(ctx, xVal);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
});

effectRegistry.registerXMult('SPLIT_TRAIL', (ctx, equip, index) => {
  if (
    ctx.handResult.type !== HandType.FOUR_STRAIGHT &&
    ctx.handResult.type !== HandType.FIVE_STRAIGHT &&
    ctx.handResult.type !== HandType.TWO_PAIR &&
    ctx.handResult.type !== HandType.FULL_HOUSE
  ) {
    return;
  }
  const hasEven = ctx.scoringDice.some((die) => die.value % 2 === 0);
  const hasOdd = ctx.scoringDice.some((die) => die.value % 2 === 1);
  if (!hasEven || !hasOdd) return;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  multiplyCtxXMult(ctx, xVal);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
});
