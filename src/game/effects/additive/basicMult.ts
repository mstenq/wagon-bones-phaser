// ─── ADD_MULT, ADD_MULT_RISKY, RANDOM_MULT ───

import { effectRegistry } from '../registry';

effectRegistry.registerAdditive('ADD_MULT', (ctx, equip, index) => {
  const value = (equip.def.effectParams as Record<string, unknown>).value as number;
  ctx.bonusMult += value;
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value });
  console.log(`  [equip] ${equip.def.name}: ADD_MULT +${value} (bonusMult: ${ctx.bonusMult})`);
});

effectRegistry.registerAdditive('ADD_MULT_RISKY', (ctx, equip, index) => {
  const value = (equip.def.effectParams as Record<string, unknown>).value as number;
  ctx.bonusMult += value;
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value });
});

effectRegistry.registerAdditive('RANDOM_MULT', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const min = p.min as number;
  const max = p.max as number;
  const roll = Math.floor(Math.random() * (max - min + 1)) + min;
  ctx.bonusMult += roll;
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: roll });
  console.log(`  [equip] ${equip.def.name}: +${roll} mult (random ${min}-${max}) (bonusMult: ${ctx.bonusMult})`);
});
