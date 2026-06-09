// ─── Run setup actions ───

import type { DifficultyLevel } from '../../types';
import { createPouch, createRunStartingPouch } from '../../DiceSystem';
import { getItemAuraById } from '../../ItemsSystem';
import { getSupplyDefById } from '../../ConsumablesSystem';
import { getProfessionById } from '../../../data/professions';
import { getEquipmentDefById } from '../../equipmentCatalog';
import { acquireEquipmentInstance } from '../../EquipmentModifiers';
import { rngPick } from '../../RunRng';
import { GAMEPLAY } from '../../Constants';
import { getRunState, runActions, runStore } from '../runStore';
import { consumableActions } from './consumableActions';
import { replaceEquipmentList, resolveEquipmentList } from '../resolve';

export const setupActions = {
  reset(): void {
    runActions.reset();
  },

  setDifficulty(level: DifficultyLevel): void {
    runStore.setState({ difficulty: level });
  },

  applyProfession(professionId: string): void {
    const prof = getProfessionById(professionId);
    if (!prof) return;
    const m = prof.modifiers as Record<string, unknown>;
    const startingPermits = Array.isArray(m.startingPermits)
      ? (m.startingPermits as string[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    let dice =
      prof.startingDice.length > 0
        ? createRunStartingPouch(prof.startingDice, GAMEPLAY.STARTING_DICE)
        : createPouch(GAMEPLAY.STARTING_DICE);
    const nextDieId = dice.length;

    let balance = getRunState().balance;
    if (typeof m.startingMoney === 'number') {
      balance += m.startingMoney;
    }

    let maxEquipmentSlots = GAMEPLAY.MAX_EQUIPMENT_SLOTS;
    if (typeof m.equipmentSlots === 'number') {
      maxEquipmentSlots += m.equipmentSlots;
    }

    let handSize = GAMEPLAY.ROLL_SIZE;
    if (typeof m.handSize === 'number') {
      handSize += m.handSize;
    }

    let maxConsumableSlots = GAMEPLAY.MAX_CONSUMABLE_SLOTS;
    if (typeof m.supplySlots === 'number') {
      maxConsumableSlots += m.supplySlots;
    }

    runStore.setState({
      professionId: prof.id,
      dice,
      nextDieId,
      balance,
      maxEquipmentSlots,
      handSize,
      maxConsumableSlots,
      purchasedPermits: [...new Set(startingPermits)],
    });

    if (Array.isArray(m.startingSupplyCards)) {
      for (const entry of m.startingSupplyCards as (string | { id: string; aura?: string })[]) {
        const cardId = typeof entry === 'string' ? entry : entry.id;
        const auraId = typeof entry === 'string' ? undefined : entry.aura;
        const aura = auraId ? getItemAuraById(auraId) : null;
        const def = getSupplyDefById(cardId, aura);
        if (def) consumableActions.addConsumable(def);
      }
    }
  },

  finalizeRunSetup(): void {
    runStore.setState({ startingDiceCount: getRunState().dice.length });
  },

  /** Grant profession-specific starting equipment after run RNG is seeded (e.g. Witch familiar). */
  grantProfessionStartingEquipment(): void {
    const run = getRunState();
    const prof = run.professionId ? getProfessionById(run.professionId) : undefined;
    const familiarIds = prof?.modifiers.startingFamiliarIds;
    if (!Array.isArray(familiarIds) || familiarIds.length === 0) return;

    const chosenId = rngPick('equipment', familiarIds);
    const def = getEquipmentDefById(chosenId);
    if (!def) return;

    const instance = acquireEquipmentInstance(def, run.purchasedPermits, ['cursed']);
    replaceEquipmentList([...resolveEquipmentList(), instance]);
  },
};
