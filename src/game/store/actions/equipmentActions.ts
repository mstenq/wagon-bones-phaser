// ─── Run equipment actions ───

import type { EquipmentDef, EquipmentInstance } from '../../ItemsSystem';
import { isEquipmentCursed } from '../../ItemsSystem';
import { acquireRewardEquipmentInstance, getEquipmentPurchasePrice } from '../../EquipmentModifiers';
import {
  processEquipmentOnSell,
  processEquipmentOnShopReroll,
  processEquipmentOnDiceAdded,
} from '../../EquipmentEffects';
import { onBossRoundEquipmentSold } from '../../BossEffectsSystem';
import { getTrailTagById } from '../../../data/trail_tags';
import { rngPick } from '../../RunRng';
import { GAMEPLAY } from '../../Constants';
import { getRunState, runStore } from '../runStore';
import { replaceEquipmentList, resolveEquipmentList } from '../resolve';
import { canAfford } from '../economy';
import { selectProfession, selectUsedEquipmentSlots } from '../selectors/runSelectors';
import { economyActions } from './economyActions';
import { tagActions } from './tagActions';

function equipment(): EquipmentInstance[] {
  return resolveEquipmentList();
}

function writeEquipment(next: EquipmentInstance[]): void {
  replaceEquipmentList(next);
}

export const equipmentActions = {
  canBuy(def: EquipmentDef, state = getRunState()): boolean {
    if (!canAfford(state, def.cost)) return false;
    if (def.aura?.id !== 'ghost' && selectUsedEquipmentSlots(state) >= state.maxEquipmentSlots) return false;
    return true;
  },

  buyEquipment(def: EquipmentDef): boolean {
    const state = getRunState();
    if (def.aura?.id !== 'ghost' && selectUsedEquipmentSlots(state) >= state.maxEquipmentSlots) return false;
    const instance = acquireRewardEquipmentInstance(def, state.purchasedPermits);
    const cost = getEquipmentPurchasePrice(def, instance.modifiers, def.cost, state.purchasedPermits);
    if (!canAfford(state, cost)) return false;
    economyActions.trySpend(cost);
    writeEquipment([...equipment(), instance]);
    return true;
  },

  destroyEquipment(index: number): boolean {
    const list = equipment();
    if (index < 0 || index >= list.length) return false;
    writeEquipment(list.filter((_, i) => i !== index));
    return true;
  },

  sellEquipment(index: number): boolean {
    const state = getRunState();
    const list = equipment();
    if (index < 0 || index >= list.length) return false;
    const item = list[index]!;
    if (isEquipmentCursed(item)) return false;

    economyActions.earn(item.sellValue);

    let bossEffectDisabled = state.bossEffectDisabled;
    if (item.def.effectType === 'SELL_DISABLE_BOSS' && state.round === GAMEPLAY.ROUNDS_PER_LEG) {
      bossEffectDisabled = true;
    }

    if (item.def.effectType === 'SELL_GRANT_TAG') {
      const tagId = (item.def.effectParams.tagId as string) ?? 'tag_twin_wagon';
      const tagDef = getTrailTagById(tagId);
      if (tagDef) tagActions.addTag(tagDef);
    }

    const profession = selectProfession(state);
    if (item.def.effectType === 'BANK_NOTE' && profession?.id === 'banker' && getRunState().balance < 0) {
      economyActions.setBalance(0);
    }

    if (item.def.effectType === 'PHANTOM_WAGON') {
      const roundsNeeded = (item.def.effectParams.roundsNeeded as number) ?? 2;
      if ((item.state.roundsHeld ?? 0) >= roundsNeeded) {
        const others = list.filter((_, idx) => idx !== index);
        if (others.length > 0) {
          const source = rngPick('equipment', others);
          const duplicated: EquipmentInstance = {
            def: source.def.aura?.id === 'ghost' ? { ...source.def, aura: undefined } : { ...source.def },
            sellValue: source.sellValue,
            state: { ...source.state },
            modifiers: [...source.modifiers],
            perishableRoundsLeft: source.perishableRoundsLeft,
          };
          const remaining = list.filter((_, i) => i !== index);
          const usedAfterRemove = remaining.filter((inst) => inst.def.aura?.id !== 'ghost').length;
          const nextEquipment = [...remaining];
          if (usedAfterRemove < state.maxEquipmentSlots || duplicated.def.aura?.id === 'ghost') {
            nextEquipment.push(duplicated);
          }
          processEquipmentOnSell(nextEquipment);
          onBossRoundEquipmentSold();
          writeEquipment(nextEquipment);
          runStore.setState({ bossEffectDisabled });
          return true;
        }
      }
    }

    const nextEquipment = list.filter((_, i) => i !== index);
    processEquipmentOnSell(nextEquipment);
    onBossRoundEquipmentSold();
    writeEquipment(nextEquipment);
    runStore.setState({ bossEffectDisabled });
    return true;
  },

  reorderEquipment(fromIndex: number, toIndex: number): void {
    const list = [...equipment()];
    if (fromIndex < 0 || fromIndex >= list.length) return;
    if (toIndex < 0 || toIndex >= list.length) return;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item!);
    writeEquipment(list);
  },

  setEquipment(instances: EquipmentInstance[]): void {
    writeEquipment(instances);
  },

  processOnShopReroll(): void {
    const list = equipment();
    processEquipmentOnShopReroll(list);
    writeEquipment(list);
  },

  processOnDiceAdded(): void {
    const list = equipment();
    processEquipmentOnDiceAdded(list);
    writeEquipment(list);
  },
};
