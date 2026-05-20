// ─── FINAL_DAY_XMULT, EVERY_NTH_HAND_XMULT, HAND_CONTAINS_XMULT, ENHANCED_DICE_COUNT_XMULT, ROUNDS_SKIPPED_XMULT ───

import { effectRegistry } from '../registry';
import { handTypeMatches } from '../helpers';

effectRegistry.registerXMult('FINAL_DAY_XMULT', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  if (ctx.currentDay >= ctx.maxDays) {
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (final day ${ctx.currentDay}/${ctx.maxDays}) (xMult: ${ctx.xMult})`);
  } else {
    console.log(`  [xmult] ${equip.def.name}: inactive (day ${ctx.currentDay}/${ctx.maxDays})`);
  }
});

effectRegistry.registerXMult('EVERY_NTH_HAND_XMULT', (ctx, equip, index) => {
  const n = (equip.def.effectParams as Record<string, unknown>).n as number;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const hands = equip.state.handsPlayed ?? 0;
  if (hands > 0 && hands % n === 0) {
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (hand #${hands}, every ${n}th) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('HAND_CONTAINS_XMULT', (ctx, equip, index) => {
  const requiredHand = (equip.def.effectParams as Record<string, unknown>).handType as string;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  if (ctx.handType && handTypeMatches(ctx.handResult.type, requiredHand)) {
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (hand contains ${requiredHand}) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ENHANCED_DICE_COUNT_XMULT', (ctx, equip, index) => {
  const threshold = (equip.def.effectParams as Record<string, unknown>).threshold as number;
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const enhCount = ctx.allDice.filter((d) => d.enhancement !== null).length;
  if (enhCount >= threshold) {
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${enhCount} enhanced dice >= ${threshold}) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('TRAILBLAZER_XMULT', (ctx, equip, index) => {
  const perHand = (equip.def.effectParams as Record<string, unknown>).value as number;
  const streak = equip.state.streak ?? 0;
  if (streak > 0) {
    const xVal = 1 + streak * perHand;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal.toFixed(1)} (${streak} off-meta hands) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ROUNDS_SKIPPED_XMULT', (ctx, equip, index) => {
  const skipped = equip.state.roundsSkipped ?? 0;
  if (skipped > 0) {
    const xVal = 1 + skipped * ((equip.def.effectParams as Record<string, unknown>).value as number);
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${skipped} rounds skipped) (xMult: ${ctx.xMult})`);
  }
});
