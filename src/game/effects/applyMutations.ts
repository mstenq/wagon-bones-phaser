// ─── Scoring Mutations Application ───

import { getPlayerState } from '../PlayerState';
import { getConsumableDefById } from '../ConsumablesSystem';
import { ScoringMutations } from './types';

export function createEmptyScoringMutations(): ScoringMutations {
  return {
    moneyEarned: 0,
    earnedMoney: 0,
    lostMoney: 0,
    earnedMiles: 0,
    lostMiles: 0,
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
  target.earnedMiles += source.earnedMiles;
  target.lostMiles += source.lostMiles;
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

/**
 * Apply the accumulated mutations from scoring to the player state.
 * Called after scoring completes.
 */
export function applyScoringMutations(mutations: ScoringMutations): void {
  const player = getPlayerState();

  // Money earned during scoring
  if (mutations.moneyEarned > 0) {
    player.economy.earn(mutations.moneyEarned);
  }

  // Dice destroyed during scoring
  for (const dieId of mutations.diceDestroyed) {
    const idx = player.dice.findIndex((d) => d.id === dieId);
    if (idx >= 0) {
      player.dice.splice(idx, 1);
    }
  }

  // Dice enhanced during scoring
  for (const { id, enhancement } of mutations.diceEnhanced) {
    const die = player.dice.find((d) => d.id === id);
    if (die) {
      die.enhancement = enhancement;
    }
  }

  // Consumables granted during scoring
  for (const consumableId of mutations.consumablesGranted) {
    const consumableDef = getConsumableDefById(consumableId);
    if (consumableDef) {
      player.addConsumable(consumableDef);
    }
  }

  // Dice copied during scoring
  for (const diePartial of mutations.diceCopied) {
    if (diePartial.id && diePartial.value !== undefined) {
      player.dice.push({
        id: diePartial.id,
        value: diePartial.value,
        enhancement: diePartial.enhancement ?? null,
        sticker: diePartial.sticker ?? null,
        aura: diePartial.aura ?? null,
        isGrimy: diePartial.isGrimy ?? false,
        bonusMiles: diePartial.bonusMiles ?? 0,
      });
    }
  }

  // Permanent bonus miles granted during scoring
  for (const { id, amount } of mutations.dieBonusMilesAdded) {
    const die = player.dice.find((d) => d.id === id);
    if (die) {
      die.bonusMiles += amount;
    }
  }
}
