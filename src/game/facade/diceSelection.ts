// ─── Dice selection facade (No Phaser imports) ───

import type { Die } from '../types';
import {
  applyDiceSelectionEffect,
  shouldUpdateDisplayedDiceValue,
  type DiceSelectionConfig,
} from '../DiceSelectionSystem';

export type { DiceSelectionConfig, DiceSelectionEffectType } from '../DiceSelectionSystem';
export { shouldUpdateDisplayedDiceValue };

export const gameDiceSelection = {
  applyEffect(config: DiceSelectionConfig, selectedDice: Die[]): string {
    return applyDiceSelectionEffect(config, selectedDice);
  },
};
