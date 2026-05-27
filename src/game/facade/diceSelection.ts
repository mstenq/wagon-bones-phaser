// ─── Dice selection facade (No Phaser imports) ───

import type { Die } from '../types';
import {
  applyDiceSelectionEffect,
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
  shouldUpdateDisplayedDiceValue,
  type DiceSelectionConfig,
} from '../DiceSelectionSystem';

export type { DiceSelectionConfig, DiceSelectionEffectType } from '../DiceSelectionSystem';
export { getDiceSelectionMaxPicks, getDiceSelectionMinPicks, isDiceSelectionReady, shouldUpdateDisplayedDiceValue };

export const gameDiceSelection = {
  applyEffect(config: DiceSelectionConfig, selectedDice: Die[]): string {
    return applyDiceSelectionEffect(config, selectedDice);
  },
};
