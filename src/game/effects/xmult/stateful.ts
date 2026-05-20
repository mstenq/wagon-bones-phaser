// ─── STATEFUL_XMULT, LUCKY_TRIGGER_XMULT, SELL_XMULT_GAIN, TRAIL_GUIDE_XMULT, DECAYING_XMULT, ROUND_START_XMULT_DESTROY, DIAMOND_DESTROYED_XMULT, GRAVEROBBER_XMULT ───

import { effectRegistry } from '../registry';

effectRegistry.registerXMult('STATEFUL_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm !== 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('LUCKY_TRIGGER_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm !== 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  } else {
    console.log(`  [xmult] ${equip.def.name}: x1 (no bonus yet)`);
  }
});

effectRegistry.registerXMult('SELL_XMULT_GAIN', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm !== 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  } else {
    console.log(`  [xmult] ${equip.def.name}: x1 (no bonus yet)`);
  }
});

effectRegistry.registerXMult('TRAIL_GUIDE_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('DECAYING_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 0 && xm !== 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ROUND_START_XMULT_DESTROY', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('DIAMOND_DESTROYED_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('GRAVEROBBER_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('ENHANCED_DESTROYED_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});

effectRegistry.registerXMult('REROLL_COUNT_XMULT', (ctx, equip, index) => {
  const xm = equip.state.xMult ?? 1;
  if (xm > 1) {
    ctx.xMult *= xm;
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'xmult', value: xm });
    console.log(`  [xmult] ${equip.def.name}: x${xm} (xMult: ${ctx.xMult})`);
  }
});
