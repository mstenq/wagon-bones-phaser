// ─── Scoring Mutations Application ───

import { getPlayerState } from '../PlayerState';
import { getConsumableDefById } from '../ConsumablesSystem';
import { ScoringMutations } from './types';

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
}
