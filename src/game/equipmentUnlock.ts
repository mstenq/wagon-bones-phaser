// ─── Equipment unlock conditions (No Phaser imports) ───
// Gates shop and random equipment pools until prerequisites are met.

import type { GameState } from './GameState';
import type { PlayerState } from './PlayerState';
import type { DiceEnhancement } from './types';
import type { EquipmentDef } from './ItemsSystem';
import { getPlayerState } from './PlayerState';

export type EquipmentUnlockCondition = (
  game: GameState | null,
  player: PlayerState,
) => boolean;

export function playerHasDiceEnhancement(
  player: PlayerState,
  enhancement: NonNullable<DiceEnhancement>,
): boolean {
  return player.dice.some((d) => d.enhancement === enhancement);
}

export function playerHasAnyEnhancedDice(player: PlayerState): boolean {
  return player.dice.some((d) => d.enhancement !== null);
}

export function playerHasDistinctEnhancedTypes(player: PlayerState, min: number): boolean {
  const types = new Set(
    player.dice.filter((d) => d.enhancement !== null).map((d) => d.enhancement),
  );
  return types.size >= min;
}

export function unlockByEnhancement(
  enhancement: NonNullable<DiceEnhancement>,
): EquipmentUnlockCondition {
  return (_game, player) => playerHasDiceEnhancement(player, enhancement);
}

export const unlockAnyEnhanced: EquipmentUnlockCondition = (_game, player) =>
  playerHasAnyEnhancedDice(player);

export const unlockTwoEnhancedTypes: EquipmentUnlockCondition = (_game, player) =>
  playerHasDistinctEnhancedTypes(player, 2);

export const unlockNitro: EquipmentUnlockCondition = (_game, player) =>
  player.dynamiteSelfDestructed;

export function isEquipmentUnlocked(
  def: EquipmentDef,
  game: GameState | null = null,
  player?: PlayerState,
): boolean {
  if (!def.unlockCondition) return true;
  return def.unlockCondition(game, player ?? getPlayerState());
}
