// ─── Meta / progression facade (No Phaser imports) ───

import { createDie } from '../DiceSystem';
import { getPackDefById } from '../BoosterPackSystem';
import {
  ensureRoundSkipPreviewTags,
  expandImmediatePackTagsToPackDefIds,
  getPackDefIdForTag,
  grantTag,
  isImmediateTag,
  processChangeOfGuardTags,
  processImmediateTags,
  processJunkPileTag,
  type ImmediateTagResult,
} from '../TagSystem';
import type { DifficultyLevel, Die, TrailTagInstance } from '../types';
import { bossActions, economyActions, progressionActions, setupActions, tagActions } from '../store';
import { generateRunSeed, initRunRng } from '../RunRng';

export type { ImmediateTagResult, TrailTagInstance, Die, DifficultyLevel };

export const gameMeta = {
  applyProfession(professionId: string): void {
    setupActions.applyProfession(professionId);
  },

  finalizeRunSetup(): void {
    setupActions.finalizeRunSetup();
  },

  setDifficulty(level: DifficultyLevel): void {
    setupActions.setDifficulty(level);
  },

  assignBosses(): void {
    bossActions.assignBosses();
  },

  tryBossPermitReroll(): boolean {
    return bossActions.tryBossPermitReroll();
  },

  recordRoundSkipped(
    tagDef: Parameters<typeof tagActions.recordRoundSkipped>[0],
    previewMeta: Parameters<typeof tagActions.recordRoundSkipped>[1],
  ): void {
    tagActions.recordRoundSkipped(tagDef, previewMeta);
  },

  grantTag(tagDef: Parameters<typeof grantTag>[0], previewMeta?: Parameters<typeof grantTag>[1]): TrailTagInstance {
    return grantTag(tagDef, previewMeta);
  },

  advanceRound(skipped = false): boolean {
    return progressionActions.advanceRound(skipped);
  },

  /** Payout collect: earn money and advance leg/round. Returns whether the journey is complete. */
  collectPayout(total: number, investmentBonus: number): boolean {
    economyActions.earn(total + investmentBonus);
    return progressionActions.advanceRound();
  },

  ensureRoundSkipPreviewTags,
  processChangeOfGuardTags,
  processImmediateTags,
  processJunkPileTag,
  expandImmediatePackTagsToPackDefIds,
  getPackDefIdForTag,
  isImmediateTag,
  consumeTagsByCategory: tagActions.consumeTagsByCategory,

  createPreviewDie(options: Parameters<typeof createDie>[0]): Die {
    return createDie(options);
  },

  getPackDefById,
  generateRunSeed,
  initRunRng,
};
