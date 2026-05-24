// ─── GameState class (test-only round API) ───
// Prefer roundActions + readRoundState() in new production code.

import type { Die, GameConfig, HandResult, HandType, RoundState, ScoreResult } from '../types';
import { roundActions } from '../store/actions/roundActions';
import {
  getActiveRoundConfig,
  initRoundSession,
  patchLegacyRoundState,
  readRoundState,
  startRoundSession,
} from '../store/roundView';

/** Test helper wrapping roundActions with legacy RoundState die-object view. */
export class GameState {
  private pendingConfig: Partial<GameConfig> = {};

  constructor(config: Partial<GameConfig> = {}) {
    this.pendingConfig = config;
    initRoundSession(config);
  }

  get config(): GameConfig {
    return getActiveRoundConfig(this.pendingConfig);
  }

  set config(value: GameConfig) {
    patchLegacyRoundState({}, value);
  }

  get state(): RoundState {
    const snapshot = readRoundState();
    return new Proxy(snapshot, {
      set(_target, prop, value) {
        if (typeof prop !== 'string') return false;
        patchLegacyRoundState({ [prop]: value } as Partial<RoundState>);
        return true;
      },
    });
  }

  restoreRound(config: GameConfig, state: RoundState): void {
    roundActions.restoreRound(config, state);
  }

  startRound(config?: Partial<GameConfig>): void {
    startRoundSession({ ...this.pendingConfig, ...config });
  }

  selectForRoll(diceIds: string[]): boolean {
    return roundActions.selectForRoll(diceIds);
  }

  canUseReroll(): boolean {
    return roundActions.canUseReroll();
  }

  reroll(diceIds: string[]): boolean {
    return roundActions.reroll(diceIds);
  }

  selectForScore(diceIds: string[]): boolean {
    return roundActions.selectForScore(diceIds);
  }

  validateScoreSelection(diceIds: string[]): { allowed: boolean; reason?: string } {
    return roundActions.validateScoreSelection(diceIds);
  }

  cancelScore(): void {
    roundActions.cancelScore();
  }

  calculateScore(): ScoreResult | null {
    return roundActions.calculateScore();
  }

  applyEndOfRoundDestructions(indices: number[]): void {
    roundActions.applyEndOfRoundDestructions(indices);
  }

  endDay(options?: { deferEquipmentDestructionAnimation?: boolean }): {
    outcome: 'next-day' | 'won' | 'lost';
    destroyedEquipment: string[];
    deferredDestroyIndices: number[];
  } {
    return roundActions.endDay(options);
  }
}

export type { HandResult, ScoreResult, HandType, Die };
