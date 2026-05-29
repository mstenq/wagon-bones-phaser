// ─── XMULT_RISKY, EMPTY_SLOT_XMULT, UNCOMMON_EQUIP_XMULT, ENHANCEMENT_COUNT_XMULT, REPEAT_HAND_XMULT, RAINBOW_TRAIL_XMULT ───

import { effectRegistry } from '../registry';
import { getRunState } from '../../store/runStore';
import { selectUsedEquipmentSlots } from '../../store/selectors/runSelectors';
import { multiplyCtxXMult } from '../helpers';
import { enhancementMatchesTarget, hasAlchemyKit } from '../../alchemyKit';
import type { DiceEnhancement } from '../../types';

effectRegistry.registerXMult('XMULT_RISKY', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  multiplyCtxXMult(ctx, xVal);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
  console.log(`  [xmult] ${equip.def.name}: x${xVal} (xMult: ${ctx.xMult})`);
});

effectRegistry.registerXMult('EMPTY_SLOT_XMULT', (ctx, equip, index) => {
  const run = getRunState();
  const emptySlots = run.maxEquipmentSlots - selectUsedEquipmentSlots(run);
  if (emptySlots > 0) {
    const xVal = 1 + emptySlots * ((equip.def.effectParams as Record<string, unknown>).value as number);
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${emptySlots} empty slots) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('UNCOMMON_EQUIP_XMULT', (ctx, equip, index) => {
  const uncommonCount = ctx.equipment.filter((e) => e.def.rarity === 'uncommon').length;
  if (uncommonCount > 0) {
    const xVal = Math.pow(1.5, uncommonCount);
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x1.5 × ${uncommonCount} uncommon items (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ENHANCEMENT_COUNT_XMULT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const enhancement = p.enhancement as DiceEnhancement;
  const perValue = p.value as number;
  const alchemy = hasAlchemyKit(ctx.equipment);
  const enhCount = ctx.allDice.filter((d) => enhancementMatchesTarget(d.enhancement, enhancement, alchemy)).length;
  if (enhCount > 0) {
    const xVal = 1 + enhCount * perValue;
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(
      `  [xmult] ${equip.def.name}: x${xVal.toFixed(1)} (${enhCount} ${enhancement} dice) (xMult: ${ctx.xMult})`,
    );
  }
});

effectRegistry.registerXMult('REPEAT_HAND_XMULT', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const handKey = `round_${ctx.handType}`;
  if (ctx.handType && (equip.state[handKey] ?? 0) > 0) {
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (repeat hand ${ctx.handType}) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('RAINBOW_TRAIL_XMULT', (ctx, equip, index) => {
  const enhTypes = new Set(ctx.scoringDice.filter((d) => d.enhancement !== null).map((d) => d.enhancement));
  if (enhTypes.size >= 2) {
    const xVal = enhTypes.size;
    multiplyCtxXMult(ctx, xVal);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${enhTypes.size} enhancement types) (xMult: ${ctx.xMult})`);
  }
});
