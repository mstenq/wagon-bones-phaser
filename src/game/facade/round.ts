// ─── Round session + FSM facade (No Phaser imports) ───

import type { Die, GameConfig, ScoreResult } from '../types';
import { detectBestHand } from '../DiceSystem';
import { addScore, D, milesToSave } from '../scoreMath';
import { consumeNextRoundTags } from '../TagSystem';
import { hasActiveTrailRoundEffects, trailRoundEffectsFromModifiers } from '../TrailEventsSystem';
import { previewBossScoreSelection } from '../BossEffectsSystem';
import { roundActions } from '../store/actions/roundActions';
import { resolveDiceByIds } from '../store/roundResolve';
import { getRunHandStats } from '../store/runReads';
import {
  removeDestroyedDiceFromRound,
  setHandDice,
  setSelectedForScoreDice,
  syncRolledDiceFromFaces,
} from '../store/roundWrites';
import type { RoundSidebarOverlay } from '../store/types';
import { getRoundState } from '../store/roundStore';
import { getRunState, runActions } from '../store/runStore';
import { getSceneState } from '../store/sceneStore';
import { selectTargetMiles } from '../store/selectors/runSelectors';
import type { BeginRoundSessionOptions, EndDayOptions, EndDayResult } from './types';

export function initRoundSession(config: Partial<GameConfig> = {}): void {
  if (!getRoundState()) {
    roundActions.seedConstructorRound(config);
  }
}

export function startRoundSession(config: Partial<GameConfig> = {}): void {
  roundActions.startRound(config);
}

function syncTrailRoundEffectsOnRestore(): void {
  const run = getRunState();
  if (
    !hasActiveTrailRoundEffects(run.trailRoundEffects) &&
    hasActiveTrailRoundEffects(trailRoundEffectsFromModifiers(run.trailEventModifiers))
  ) {
    runActions.patch({
      trailRoundEffects: trailRoundEffectsFromModifiers(run.trailEventModifiers),
    });
  }
}

export const gameRound = {
  /**
   * GameScene.create round bootstrap: restored autosave vs fresh leg round.
   * Tag consumption and target miles match production GameScene.
   */
  beginRoundSession(options: BeginRoundSessionOptions = {}): void {
    const run = getRunState();
    const restoredRound = getRoundState();
    const isRestored = options.restored === true || (restoredRound !== null && getSceneState().activeScene === 'Game');

    if (isRestored) {
      initRoundSession();
      syncTrailRoundEffectsOnRestore();
      return;
    }

    consumeNextRoundTags();
    const targetMiles = selectTargetMiles(run);
    initRoundSession({ targetMiles });
    startRoundSession({ targetMiles });
  },

  selectDiceForRoll(ids: string[]): boolean {
    return roundActions.selectForRoll(ids);
  },

  /** Roll hand dice locked for this roll (alias of selectForRoll). */
  rollLockedDice(lockedIds: string[]): boolean {
    return roundActions.selectForRoll(lockedIds);
  },

  rerollUnlockedDice(unlockedIds: string[]): boolean {
    return roundActions.reroll(unlockedIds);
  },

  canUseReroll(): boolean {
    return roundActions.canUseReroll();
  },

  submitScore(selectedIds: string[]): ScoreResult | null {
    const validation = roundActions.validateScoreSelection(selectedIds);
    if (!validation.allowed) return null;

    if (!roundActions.selectForScore(selectedIds)) return null;

    return roundActions.calculateScore();
  },

  getBossScoreWarning(selectedIds: string[]): string | null {
    const round = getRoundState();
    if (!round || selectedIds.length === 0) return null;
    const selected = resolveDiceByIds(
      selectedIds.filter((id) => round.rolledDice.some((r) => r.id === id)),
      round,
    );
    if (selected.length === 0) return null;
    return previewBossScoreSelection(selected).warning;
  },

  cancelScore(): void {
    roundActions.cancelScore();
  },

  endDay(options?: EndDayOptions): EndDayResult {
    return roundActions.endDay(options);
  },

  /** Developer profession: instantly win the round (GameScene dev win button). */
  forceWinRound(): void {
    roundActions.patch({ totalMiles: D(1_000_000), phase: 'DAY_END' });
  },

  validateScoreSelection(ids: string[]): { allowed: boolean; reason?: string; warning?: string } {
    return roundActions.validateScoreSelection(ids);
  },

  selectForScore(ids: string[]): boolean {
    return roundActions.selectForScore(ids);
  },

  calculateScore(options?: { deferConsumableGrants?: boolean }): ScoreResult | null {
    return roundActions.calculateScore(options);
  },

  setSidebarOverlay(overlay: Partial<RoundSidebarOverlay> | null): void {
    roundActions.setSidebarOverlay(overlay);
  },

  clearHandPreviewOverlay(): void {
    roundActions.setSidebarOverlay({
      handName: '',
      handLevel: 0,
      milesBaseSave: milesToSave(0),
      multSave: milesToSave(0),
    });
  },

  /** Lock-preview overlay while player selects dice in ROLL phase. */
  updateHandPreviewOverlay(lockedDice: Die[]): void {
    if (lockedDice.length === 0) {
      gameRound.clearHandPreviewOverlay();
      return;
    }
    const handResult = detectBestHand(lockedDice);
    const stats = getRunHandStats(handResult.type);
    const levelBonus = stats.level - 1;
    const baseMiles = addScore(handResult.baseMiles, stats.milesPerLevel * levelBonus);
    const baseMult = addScore(handResult.baseMult, stats.multPerLevel * levelBonus);
    roundActions.setSidebarOverlay({
      handName: handResult.name,
      handLevel: stats.level,
      milesBaseSave: milesToSave(baseMiles),
      multSave: milesToSave(baseMult),
    });
  },

  syncRolledDiceFromFaces(dice: Die[]): void {
    syncRolledDiceFromFaces(dice);
  },

  setHandDice(dice: Die[]): void {
    setHandDice(dice);
  },

  setSelectedForScoreDice(dice: Die[]): void {
    setSelectedForScoreDice(dice);
  },

  removeDestroyedDiceFromRound(destroyedIds: Set<string>): void {
    removeDestroyedDiceFromRound(destroyedIds);
  },
};
