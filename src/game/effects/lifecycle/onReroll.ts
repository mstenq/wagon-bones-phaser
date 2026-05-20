// ─── on-reroll lifecycle handlers ───

import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-reroll', (equip, diceCount) => {
  switch (equip.def.effectType) {
    case 'DECAYING_XMULT':
      equip.state.xMult = Math.max(
        0,
        (equip.state.xMult ?? 1) - (equip.def.effectParams.decayPerDie as number) * (diceCount as number),
      );
      break;
    case 'TRAIL_TAX': {
      const loss = (equip.def.effectParams as Record<string, unknown>).multLostPerReroll as number;
      equip.state.mult = Math.max(0, (equip.state.mult ?? 0) - loss);
      break;
    }
  }
});

effectRegistry.registerLifecycle('on-shop-reroll', (equip) => {
  switch (equip.def.effectType) {
    case 'SHOP_REROLL_MULT_GAIN':
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
      break;
  }
});
