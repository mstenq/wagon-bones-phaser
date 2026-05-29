// ─── Scoring mutation application (No Phaser imports) ───
// Applies effect mutations through run store actions instead of PlayerState.

import { getConsumableDefById } from '../ConsumablesSystem';
import { setDieEnhancement } from '../DiceSystem';
import type { Die } from '../types';
import type { ScoringMutations } from './types';
import { processEquipmentOnDiceDestroyed } from './lifecycle/onDiceDestroyed';
import { ZERO, addScore } from '../scoreMath';
import { getRunState, runStore } from '../store/runStore';
import { replaceEquipmentList, resolveEquipmentList } from '../store/resolve';
import { storedFromEquipmentInstances } from '../store/resolve';
import { economyActions } from '../store/actions/economyActions';
import { consumableActions } from '../store/actions/consumableActions';

export function createEmptyScoringMutations(): ScoringMutations {
  return {
    moneyEarned: 0,
    earnedMoney: 0,
    lostMoney: 0,
    earnedMiles: ZERO,
    lostMiles: ZERO,
    gainedDice: 0,
    lostDice: 0,
    gainedSupplyCards: 0,
    gainedEquipment: 0,
    lostEquipment: 0,
    daysBonus: 0,
    loseAllRerolls: false,
    burnBarrelMoney: 0,
    burnBarrelTriggered: false,
    supplyCardsToAdd: 0,
    diceDestroyed: [],
    diceEnhanced: [],
    consumablesGranted: [],
    diceCopied: [],
    dieBonusMilesAdded: [],
  };
}

export function mergeMutations(target: ScoringMutations, source: ScoringMutations): void {
  target.moneyEarned += source.moneyEarned;
  target.earnedMoney += source.earnedMoney;
  target.lostMoney += source.lostMoney;
  target.earnedMiles = addScore(target.earnedMiles, source.earnedMiles);
  target.lostMiles = addScore(target.lostMiles, source.lostMiles);
  target.gainedDice += source.gainedDice;
  target.lostDice += source.lostDice;
  target.gainedSupplyCards += source.gainedSupplyCards;
  target.gainedEquipment += source.gainedEquipment;
  target.lostEquipment += source.lostEquipment;
  target.daysBonus += source.daysBonus;
  target.burnBarrelMoney += source.burnBarrelMoney;
  target.supplyCardsToAdd += source.supplyCardsToAdd;
  target.diceDestroyed.push(...source.diceDestroyed);
  target.diceEnhanced.push(...source.diceEnhanced);
  target.consumablesGranted.push(...source.consumablesGranted);
  target.diceCopied.push(...source.diceCopied);
  target.dieBonusMilesAdded.push(...source.dieBonusMilesAdded);
  if (source.loseAllRerolls) target.loseAllRerolls = true;
  if (source.burnBarrelTriggered) target.burnBarrelTriggered = true;
}

/** Apply dice enhancement mutations immediately (used during pre-scoring). */
export function applyDiceEnhancementMutations(mutations: ScoringMutations, scoringDice: Die[]): void {
  const run = getRunState();
  const dice = [...run.dice];
  let changed = false;

  for (const patch of mutations.diceEnhanced) {
    const scored = scoringDice.find((d) => d.id === patch.id);
    if (scored) {
      if (patch.enhancement !== undefined) setDieEnhancement(scored, patch.enhancement);
      if (patch.aura !== undefined) scored.aura = patch.aura;
      if (patch.sticker !== undefined) scored.sticker = patch.sticker;
    }
    const idx = dice.findIndex((d) => d.id === patch.id);
    if (idx >= 0) {
      const next = { ...dice[idx] };
      if (patch.enhancement !== undefined) setDieEnhancement(next, patch.enhancement);
      if (patch.aura !== undefined) next.aura = patch.aura;
      if (patch.sticker !== undefined) next.sticker = patch.sticker;
      dice[idx] = next;
      changed = true;
    }
  }

  if (changed) runStore.setState({ dice });
}

/**
 * Apply the accumulated mutations from scoring to run store state.
 * Called after scoring completes.
 */
export function applyScoringMutations(
  mutations: ScoringMutations,
  options?: {
    deferConsumableGrants?: boolean;
  },
): void {
  if (mutations.moneyEarned > 0) {
    economyActions.earn(mutations.moneyEarned);
  }

  if (mutations.diceDestroyed.length > 0) {
    const run = getRunState();
    let enhancedCount = 0;
    const destroyedSet = new Set(mutations.diceDestroyed);
    const dice = run.dice.filter((d) => {
      if (!destroyedSet.has(d.id)) return true;
      if (d.enhancement !== null) enhancedCount++;
      return false;
    });

    const equipment = resolveEquipmentList();
    processEquipmentOnDiceDestroyed(equipment, mutations.diceDestroyed.length, enhancedCount);
    replaceEquipmentList(equipment);
    runStore.setState({
      dice,
      equipment: storedFromEquipmentInstances(equipment),
    });
  }

  if (mutations.diceEnhanced.length > 0) {
    const run = getRunState();
    const dice = run.dice.map((d) => {
      const patch = mutations.diceEnhanced.find((e) => e.id === d.id);
      if (!patch) return d;
      const next = { ...d };
      if (patch.enhancement !== undefined) setDieEnhancement(next, patch.enhancement);
      if (patch.aura !== undefined) next.aura = patch.aura;
      if (patch.sticker !== undefined) next.sticker = patch.sticker;
      return next;
    });
    runStore.setState({ dice });
  }

  if (!options?.deferConsumableGrants) {
    for (const consumableId of mutations.consumablesGranted) {
      const consumableDef = getConsumableDefById(consumableId);
      if (consumableDef) consumableActions.addConsumable(consumableDef);
    }
  }

  if (mutations.diceCopied.length > 0) {
    const run = getRunState();
    const copied: Die[] = [];
    for (const diePartial of mutations.diceCopied) {
      if (diePartial.id && diePartial.value !== undefined) {
        copied.push({
          id: diePartial.id,
          value: diePartial.value,
          enhancement: diePartial.enhancement ?? null,
          sticker: diePartial.sticker ?? null,
          aura: diePartial.aura ?? null,
          bonusMiles: diePartial.bonusMiles ?? 0,
        });
      }
    }
    if (copied.length > 0) {
      runStore.setState({ dice: [...run.dice, ...copied] });
    }
  }

  if (mutations.dieBonusMilesAdded.length > 0) {
    const run = getRunState();
    const bonusById = new Map(mutations.dieBonusMilesAdded.map((b) => [b.id, b.amount]));
    runStore.setState({
      dice: run.dice.map((d) => {
        const amount = bonusById.get(d.id);
        return amount !== undefined ? { ...d, bonusMiles: d.bonusMiles + amount } : d;
      }),
    });
  }
}
