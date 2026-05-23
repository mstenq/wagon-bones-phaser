// ─── on-sell lifecycle handlers ───

import type { Die } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';

effectRegistry.registerLifecycle('on-sell', (equip) => {
  switch (equip.def.effectType) {
    case 'SELL_XMULT_GAIN':
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
      break;
  }
});

effectRegistry.registerLifecycle('on-boss-defeat', (equip) => {
  switch (equip.def.effectType) {
    case 'SELL_XMULT_GAIN':
      equip.state.xMult = 1;
      break;
    case 'END_ROUND_MONEY_SCALING':
      equip.state.bossesDefeated = (equip.state.bossesDefeated ?? 0) + 1;
      break;
  }
});

effectRegistry.registerLifecycle('on-dice-spent', (equip, spentDice) => {
  switch (equip.def.effectType) {
    case 'ENHANCED_SPENT_MILES_GAIN':
      const enhancedCount = (spentDice as any[]).filter((d) => d.enhancement !== null).length;
      if (enhancedCount > 0) {
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number) * enhancedCount;
      }
      break;
  }
});

effectRegistry.registerLifecycle('on-lucky-trigger', (equip) => {
  switch (equip.def.effectType) {
    case 'LUCKY_TRIGGER_XMULT':
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
      break;
  }
});

effectRegistry.registerLifecycle('on-diamond-destroyed', (equip) => {
  switch (equip.def.effectType) {
    case 'DIAMOND_DESTROYED_XMULT':
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
      break;
  }
});

export function processEquipmentOnSell(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-sell', equip);
  }
}

export function processEquipmentOnBossDefeat(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-boss-defeat', equip);
  }
}

export function processEquipmentOnDiceSpent(equipment: EquipmentInstance[], spentDice: Die[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-dice-spent', equip, spentDice);
  }
}

export function processEquipmentOnLuckyTrigger(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-lucky-trigger', equip);
  }
}

export function processEquipmentOnDiamondDestroyed(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    dispatchLifecycle('on-diamond-destroyed', equip);
  }
}
