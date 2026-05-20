// ─── PERMANENT_DIE_MILES_GAIN, PIP_SCORED_MILES_GAIN, GRAVEROBBER_XMULT ───

import { effectRegistry } from '../registry';

effectRegistry.registerPerDie('PERMANENT_DIE_MILES_GAIN', (ctx, equip, _idx, die, _t) => {
  // Only first trigger
  if (_t === 0) {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    die.bonusMiles = (die.bonusMiles ?? 0) + value;
    ctx.mutations.dieBonusMilesAdded.push({ id: die.id, amount: value });
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: permanently +${value} miles (now ${die.bonusMiles})`);
  }
});

effectRegistry.registerPerDie('PIP_SCORED_MILES_GAIN', (_ctx, equip, _idx, die, _t) => {
  // Only first trigger
  if (_t === 0 && die.value === (equip.def.effectParams as Record<string, unknown>).pip) {
    const value = (equip.def.effectParams as Record<string, unknown>).value as number;
    equip.state.miles = (equip.state.miles ?? 0) + value;
    console.log(`  [perDie] Die ${die.id} → ${equip.def.name}: gained +${value} miles (now ${equip.state.miles})`);
  }
});

effectRegistry.registerPerDie('GRAVEROBBER_XMULT', () => {
  // Graverobber: handled in pre-scoring pass (enhancements already stripped)
});
