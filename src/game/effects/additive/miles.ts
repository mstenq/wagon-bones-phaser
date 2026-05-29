// ─── Miles-granting effects ───

import { effectRegistry } from '../registry';
import { addScore } from '../../scoreMath';
import { getRunState } from '../../store/runStore';

effectRegistry.registerAdditive('MILES_PER_UNUSED_REROLL', (ctx, equip, index) => {
  const p = equip.def.effectParams as Record<string, unknown>;
  const total = (p.value as number) * ctx.rerollsRemaining;
  if (total > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
  }
});

effectRegistry.registerAdditive('PIP_BONUS_MILES', (_ctx, _equip) => {
  // Handled in per-die pass
});

effectRegistry.registerAdditive('PIP_SCORED_MILES_GAIN', (ctx, equip, index) => {
  // 5 Mile Marker: accumulated miles from pip scoring
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
  }
});

effectRegistry.registerAdditive('EXACT_DICE_COUNT_MILES', (ctx, equip, index) => {
  // Square Dance: accumulated miles apply during scoring
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
  }
});

effectRegistry.registerAdditive('SUPPLY_USED_MULT', (ctx, equip, index) => {
  // Campfire Stories: +mult per supply card used this journey (run-wide counter)
  const p = equip.def.effectParams as Record<string, unknown>;
  const perUse = (p.value as number) ?? 1;
  const val = getRunState().supplyCardsUsed * perUse;
  if (val > 0) {
    ctx.bonusMult = addScore(ctx.bonusMult, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: val });
  }
});

effectRegistry.registerAdditive('ENHANCEMENT_COUNT_MILES', (ctx, equip, index) => {
  // Quarry Mine: +miles per matching enhancement in collection
  const p = equip.def.effectParams as Record<string, unknown>;
  const enhancement = p.enhancement as string;
  const perValue = p.value as number;
  const enhCount = ctx.allDice.filter((d) => d.enhancement === enhancement).length;
  if (enhCount > 0) {
    const total = enhCount * perValue;
    ctx.bonusMiles = addScore(ctx.bonusMiles, total);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: total });
  }
});

effectRegistry.registerAdditive('HAND_MILES_GAIN', (ctx, equip, index) => {
  // Manifest Destiny: accumulated miles apply during scoring
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
  }
});

effectRegistry.registerAdditive('ENHANCEMENT_SCORED_MILES', (ctx, equip, index) => {
  // Covered Wagon: accumulated miles apply during scoring
  const val = equip.state.miles ?? 0;
  if (val > 0) {
    ctx.bonusMiles = addScore(ctx.bonusMiles, val);
    ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
  }
});

effectRegistry.registerAdditive('EXPRESS_TRAIN', (ctx, equip, index) => {
  // Express Train: flat +miles bonus (reroll penalty handled in getConfigModifiers)
  const val = (equip.def.effectParams as Record<string, unknown>).miles as number;
  ctx.bonusMiles = addScore(ctx.bonusMiles, val);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'miles', value: val });
});
