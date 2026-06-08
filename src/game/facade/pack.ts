// ─── Booster pack facade (No Phaser imports) ───

import { generatePackContents, getPackDefById, type PackDefinition, type PackItem } from '../BoosterPackSystem';
import {
  applyRunInstantEffect,
  getRandomSupplyDef,
  useConsumableDirectly,
  type ConsumableDef,
  type ConsumableEffectContext,
  type UseConsumableResult,
} from '../ConsumablesSystem';
import { applyDiceSelectionEffect, type DiceSelectionConfig, type DiceSelectionResult } from '../DiceSelectionSystem';
import {
  initPackLineup,
  reorderPackLineup,
  selectPackLineupDice,
  syncPackLineupAfterSelection,
} from '../visibleDiceRow';
import { acquireEquipmentInstance } from '../EquipmentModifiers';
import { processEquipmentOnPackOpened, processEquipmentOnPackSkipped } from '../EquipmentEffects';
import { getBonusPackPicks } from '../effects/helpers';
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
  ConsumableEffectContext,
  UseConsumableResult,
  DiceSelectionConfig,
  ConsumableInstance,
};

export {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  getConsumableAtlasKey,
  getConsumableTexturePrefix,
} from '../ConsumablesSystem';

export { getPackDefById };

export type PackOpenResult = {
  contents: PackItem[];
  picksRemaining: number;
  effectivePickCount: number;
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
    const effectivePickCount = packDef.pickCount + getBonusPackPicks(equipment);
    return { contents, picksRemaining: effectivePickCount, effectivePickCount };
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

  applyDiceSelection(config: DiceSelectionConfig, selectedDice: Die[]): DiceSelectionResult {
    return applyDiceSelectionEffect(config, selectedDice);
  },

  applyDiceSelectionToLineup(config: DiceSelectionConfig, selectedDice: Die[]): DiceSelectionResult {
    const result = applyDiceSelectionEffect(config, selectedDice);
    syncPackLineupAfterSelection(result, selectedDice);
    return result;
  },

  initLineup(): Die[] {
    return initPackLineup();
  },

  reorderLineup(fromIndex: number, toIndex: number): void {
    reorderPackLineup(fromIndex, toIndex);
  },

  getLineupDice(): Die[] {
    return selectPackLineupDice();
  },

  syncLineupAfterSelection(result: DiceSelectionResult, selectedDice: Die[]): Die[] {
    return syncPackLineupAfterSelection(result, selectedDice);
  },

  useConsumableDirectly(def: ConsumableDef, context: ConsumableEffectContext = {}): UseConsumableResult {
    const result = useConsumableDirectly(def, context);
    enqueueConsumablePlayback(result);
    return result;
  },

  applyInstantEffect(effect: NonNullable<PackItem['instantEffect']>): ReturnType<typeof applyRunInstantEffect> {
    const result = applyRunInstantEffect(effect);
    enqueueHandUpgrades(result.handUpgrades);
    return result;
  },

  useFromPouch(consumed: ConsumableInstance, context: ConsumableEffectContext = {}): UseConsumableResult {
    return gameConsumable.use(consumed, context);
  },

  enqueueEquipmentPopIn(count: number): void {
    if (count > 0) {
      runActions.enqueuePlayback({ kind: 'equipment-created-count', count });
    }
  },
};
