// ─── Misc lifecycle handlers (day-end, round-start, dice-added, supply-used, pack-skipped, pack-opened) ───

import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-day-end', (equip) => {
  switch (equip.def.effectType) {
    case 'SCORED_RETRIGGER_TIMED':
      if ((equip.state.daysRemaining ?? 0) > 0) {
        // Don't decrement here, decrement per-day in processEquipmentOnDayEnd
      }
      break;
    case 'TRAIL_TAX':
      // Handled in processEquipmentOnDayEnd
      break;
  }
});

effectRegistry.registerLifecycle('on-round-start', (equip) => {
  switch (equip.def.effectType) {
    case 'STATEFUL_XMULT':
      if (equip.def.effectParams.gainOnDiceAdded) {
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.gainOnDiceAdded as number);
      }
      break;
    case 'STATEFUL_ADD_MULT':
      if (equip.def.effectParams.gainOnPackSkip) {
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.gainOnPackSkip as number);
      }
      break;
    case 'PACK_OPEN_SUPPLY_CHANCE':
      break;
    case 'PHANTOM_WAGON':
      equip.state.roundsHeld = (equip.state.roundsHeld ?? 0) + 1;
      break;
    case 'FLOUR_SACK':
      equip.state.handSizeBonus = Math.max(0, (equip.state.handSizeBonus ?? 0) - (equip.def.effectParams.decayPerRound as number));
      break;
    case 'ROUND_START_SUPPLY':
      break;
  }
});

effectRegistry.registerLifecycle('on-dice-added', (equip) => {
  switch (equip.def.effectType) {
    case 'STATEFUL_XMULT':
      if (equip.def.effectParams.gainOnDiceAdded) {
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.gainOnDiceAdded as number);
      }
      break;
  }
});

effectRegistry.registerLifecycle('on-supply-used', (equip) => {
  switch (equip.def.effectType) {
    case 'SUPPLY_USED_MULT':
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
      break;
  }
});

effectRegistry.registerLifecycle('on-pack-skipped', (equip) => {
  switch (equip.def.effectType) {
    case 'STATEFUL_ADD_MULT':
      if (equip.def.effectParams.gainOnPackSkip) {
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.gainOnPackSkip as number);
      }
      break;
  }
});

effectRegistry.registerLifecycle('on-pack-opened', (equip) => {
  switch (equip.def.effectType) {
    case 'PACK_OPEN_SUPPLY_CHANCE':
      break;
  }
});
