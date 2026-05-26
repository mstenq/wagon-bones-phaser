// ─── Boss effect facade (No Phaser imports) ───

import type { Die } from '../types';
import { isDiceLockedByBoss, isDiceScoringDisabledByBoss, revealLandSlideHints } from '../BossEffectsSystem';

export type BossRollUiState = {
  /** Die IDs the boss forces locked for scoring (e.g. bounty). */
  lockedDieIds: string[];
};

export const gameBoss = {
  revealLandSlideHints,

  getRollUiState(dice: Die[]): BossRollUiState {
    return {
      lockedDieIds: dice.filter((d) => isDiceLockedByBoss(d.id)).map((d) => d.id),
    };
  },

  isDiceLocked(dieId: string): boolean {
    return isDiceLockedByBoss(dieId);
  },

  isDiceScoringDisabled(die: Die): boolean {
    return isDiceScoringDisabledByBoss(die);
  },
};
