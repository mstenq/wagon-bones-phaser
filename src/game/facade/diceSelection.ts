// ─── Dice selection facade (No Phaser imports) ───

import type { Die } from '../types';
import {
  applyDiceSelectionEffect,
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
  shouldUpdateDisplayedDiceValue,
  type DiceSelectionConfig,
  type DiceSelectionResult,
} from '../DiceSelectionSystem';

export type {
  DiceLineupSyncOptions,
  DiceSelectionConfig,
  DiceSelectionEffectType,
  DiceSelectionResult,
} from '../DiceSelectionSystem';
export { getDiceSelectionMaxPicks, getDiceSelectionMinPicks, isDiceSelectionReady, shouldUpdateDisplayedDiceValue };

export const gameDiceSelection = {
  applyEffect(config: DiceSelectionConfig, selectedDice: Die[]): DiceSelectionResult {
    return applyDiceSelectionEffect(config, selectedDice);
  },
};
