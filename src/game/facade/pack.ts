// ─── Booster pack facade (No Phaser imports) ───

import { generatePackContents, getPackDefById, type PackDefinition, type PackItem } from '../BoosterPackSystem';
import {
  applyRunInstantEffect,
  getRandomSupplyDef,
  useConsumableDirectly,
  type ConsumableDef,
  type UseConsumableContext,
  type UseConsumableResult,
} from '../ConsumablesSystem';
import { applyDiceSelectionEffect, type DiceSelectionConfig } from '../DiceSelectionSystem';
import { acquireEquipmentInstance } from '../EquipmentModifiers';
import { processEquipmentOnPackOpened, processEquipmentOnPackSkipped } from '../EquipmentEffects';
import type { EquipmentDef, EquipmentInstance } from '../ItemsSystem';
import type { Die } from '../types';
import { consumableActions, diceActions } from '../store';
import { replaceEquipmentList, resolveEquipmentList } from '../store/resolve';
import { getRunState, runActions } from '../store/runStore';
import { enqueueConsumablePlayback, enqueueHandUpgrades } from '../store/uiEffectHelpers';
import { gameConsumable } from './consumable';
import type { ConsumableInstance } from './consumable';

export type {
  PackDefinition,
  PackItem,
  ConsumableDef,
  UseConsumableContext,
  UseConsumableResult,
  DiceSelectionConfig,
  ConsumableInstance,
};

export {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  getConsumableTexturePrefix,
} from '../ConsumablesSystem';

export { getPackDefById };

export type PackOpenResult = {
  contents: PackItem[];
  picksRemaining: number;
};

export const gamePack = {
  generateContents(packDef: PackDefinition): PackItem[] {
    return generatePackContents(packDef);
  },

  /** Roll contents and run pack-opened equipment hooks (e.g. Leftovers supply grant). */
  openPack(packDef: PackDefinition): PackOpenResult {
    const contents = generatePackContents(packDef);
    const equipment = resolveEquipmentList();
    const grantSupply = processEquipmentOnPackOpened(equipment);
    replaceEquipmentList(equipment);
    if (grantSupply) {
      consumableActions.addConsumable(getRandomSupplyDef());
    }
    return { contents, picksRemaining: packDef.pickCount };
  },

  skipPack(): void {
    const equipment = resolveEquipmentList();
    processEquipmentOnPackSkipped(equipment);
    replaceEquipmentList(equipment);
  },

  acquireEquipment(def: EquipmentDef, modifiers?: EquipmentInstance['modifiers']): EquipmentInstance {
    const run = getRunState();
    return acquireEquipmentInstance(def, run.purchasedPermits, modifiers);
  },

  addEquipmentInstance(instance: EquipmentInstance): void {
    replaceEquipmentList([...resolveEquipmentList(), instance]);
  },

  addDie(die: Die): void {
    diceActions.addDie(die);
  },

  applyDiceSelection(config: DiceSelectionConfig, selectedDice: Die[]): string {
    return applyDiceSelectionEffect(config, selectedDice);
  },

  useConsumableDirectly(def: ConsumableDef, context: UseConsumableContext = {}): UseConsumableResult {
    const result = useConsumableDirectly(def, context);
    enqueueConsumablePlayback(result);
    return result;
  },

  applyInstantEffect(effect: NonNullable<PackItem['instantEffect']>): ReturnType<typeof applyRunInstantEffect> {
    const result = applyRunInstantEffect(effect);
    enqueueHandUpgrades(result.handUpgrades);
    return result;
  },

  useFromPouch(consumed: ConsumableInstance, context: UseConsumableContext = {}): UseConsumableResult {
    return gameConsumable.use(consumed, context);
  },

  enqueueEquipmentPopIn(count: number): void {
    if (count > 0) {
      runActions.enqueuePlayback({ kind: 'equipment-created-count', count });
    }
  },
};
