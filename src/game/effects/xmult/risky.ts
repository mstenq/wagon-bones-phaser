// ─── XMULT_RISKY, EMPTY_SLOT_XMULT, UNCOMMON_EQUIP_XMULT, ENHANCEMENT_COUNT_XMULT, REPEAT_HAND_XMULT, RAINBOW_TRAIL_XMULT ───

import { effectRegistry } from '../registry';
import { getPlayerState } from '../../PlayerState';

effectRegistry.registerXMult('XMULT_RISKY', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  ctx.xMult *= xVal;
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
  console.log(`  [xmult] ${equip.def.name}: x${xVal} (xMult: ${ctx.xMult})`);
});

effectRegistry.registerXMult('EMPTY_SLOT_XMULT', (ctx, equip, index) => {
  const player = getPlayerState();
  const emptySlots = player.maxEquipmentSlots - player.usedEquipmentSlots;
  if (emptySlots > 0) {
    const xVal = 1 + emptySlots * ((equip.def.effectParams as Record<string, unknown>).value as number);
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${emptySlots} empty slots) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('UNCOMMON_EQUIP_XMULT', (ctx, equip, index) => {
  const uncommonCount = ctx.equipment.filter((e) => e.def.rarity === 'uncommon').length;
  if (uncommonCount > 0) {
    const xVal = Math.pow(1.5, uncommonCount);
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x1.5 × ${uncommonCount} uncommon items (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ENHANCEMENT_COUNT_XMULT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const enhancement = p.enhancement as string;
  const perValue = p.value as number;
  const enhCount = ctx.allDice.filter((d) => d.enhancement === enhancement).length;
  if (enhCount > 0) {
    const xVal = 1 + enhCount * perValue;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal.toFixed(1)} (${enhCount} ${enhancement} dice) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('REPEAT_HAND_XMULT', (ctx, equip, index) => {
  const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
  const handKey = `round_${ctx.handType}`;
  if (ctx.handType && ctx.equipment.some((e) => e.state[handKey])) {
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (repeat hand) (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('RAINBOW_TRAIL_XMULT', (ctx, equip, index) => {
  const enhTypes = new Set(
    ctx.scoringDice
      .filter((d) => d.enhancement !== null)
      .map((d) => d.enhancement),
  );
  if (enhTypes.size >= 2) {
    const xVal = enhTypes.size;
    ctx.xMult *= xVal;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xVal });
    console.log(`  [xmult] ${equip.def.name}: x${xVal} (${enhTypes.size} enhancement types) (xMult: ${ctx.xMult})`);
  }
});
