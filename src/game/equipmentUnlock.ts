// ─── Equipment unlock conditions (No Phaser imports) ───
// Gates shop and random equipment pools until prerequisites are met.
// Keep this module free of ItemsSystem/PlayerState imports to avoid circular init.

import type { ItemDisplayContext, RoundHintContext } from './displayContextTypes';
import type { DiceEnhancement } from './types';
import { runStore } from './store/runStore';

export type EquipmentUnlockCondition = (round: RoundHintContext | null, player: ItemDisplayContext) => boolean;

export function playerHasDiceEnhancement(
  player: ItemDisplayContext,
  enhancement: NonNullable<DiceEnhancement>,
): boolean {
  return player.dice.some((d) => d.enhancement === enhancement);
}

export function playerHasAnyEnhancedDice(player: ItemDisplayContext): boolean {
  return player.dice.some((d) => d.enhancement !== null);
}

export function playerHasDistinctEnhancedTypes(player: ItemDisplayContext, min: number): boolean {
  const types = new Set(player.dice.filter((d) => d.enhancement !== null).map((d) => d.enhancement));
  return types.size >= min;
}

export function unlockByEnhancement(enhancement: NonNullable<DiceEnhancement>): EquipmentUnlockCondition {
  return (_round, player) => playerHasDiceEnhancement(player, enhancement);
}

export function unlockByAnyEnhancement(
  ...enhancements: NonNullable<DiceEnhancement>[]
): EquipmentUnlockCondition {
  return (_round, player) => enhancements.some((enhancement) => playerHasDiceEnhancement(player, enhancement));
}

export const unlockAnyEnhanced: EquipmentUnlockCondition = (_round, player) => playerHasAnyEnhancedDice(player);

export const unlockTwoEnhancedTypes: EquipmentUnlockCondition = (_round, player) =>
  playerHasDistinctEnhancedTypes(player, 2);

export const unlockDynamite: EquipmentUnlockCondition = () => !runStore.getState().dynamiteSelfDestructed;

export const unlockNitro: EquipmentUnlockCondition = () => runStore.getState().dynamiteSelfDestructed;
