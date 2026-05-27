// ─── GameState class (test-only round API) ───
// Prefer roundActions + selectors in new production code.

import type { Die, GameConfig, HandResult, HandType, RoundState, ScoreResult } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { roundActions } from '../store/actions/roundActions';
import { initRoundSession, startRoundSession } from '../facade';
import { runtimeToLegacyRoundState } from '../store/roundResolve';
import { setHandDice, setSelectedForScoreDice, syncRolledDiceFromFaces } from '../store/roundWrites';
import { getRoundState } from '../store/roundStore';
import { getRunState, runActions } from '../store/runStore';
function applyTestRoundStatePatch(prop: string, value: unknown): void {
  const round = getRoundState();
  if (!round) throw new Error('No active round — call initRoundSession() first');

  switch (prop) {
    case 'phase':
    case 'day':
    case 'rerollsRemaining':
    case 'totalMiles':
    case 'currentHandType':
      roundActions.patch({ [prop]: value } as Partial<typeof round>);
      return;
    case 'handHistory':
      roundActions.patch({ handHistory: value as RoundState['handHistory'] });
      return;
    case 'hand':
      setHandDice(value as Die[]);
      return;
    case 'selectedForRoll':
      roundActions.patch({
        selectedForRollIds: (value as Die[]).map((d) => d.id),
        dieValuesByDieId: {
          ...round.dieValuesByDieId,
          ...Object.fromEntries((value as Die[]).map((d) => [d.id, d.value])),
        },
      });
      return;
    case 'rolledDice':
      syncRolledDiceFromFaces(value as Die[]);
      return;
    case 'selectedForScore':
      setSelectedForScoreDice(value as Die[]);
      return;
    case 'spent':
      runActions.patch({ spentDiceIds: (value as Die[]).map((d) => d.id) });
      return;
    default:
      throw new Error(`Unsupported test round state property: ${prop}`);
  }
}

/** Test helper wrapping roundActions with legacy RoundState die-object view. */
export class GameState {
  private pendingConfig: Partial<GameConfig> = {};

  constructor(config: Partial<GameConfig> = {}) {
    this.pendingConfig = config;
    initRoundSession(config);
  }

  get config(): GameConfig {
    const round = getRoundState();
    if (round) return round.config;
    return { ...DEFAULT_CONFIG, ...this.pendingConfig };
  }

  set config(value: GameConfig) {
    roundActions.patch({ config: value });
  }

  get state(): RoundState {
    const round = getRoundState();
    if (!round) {
      throw new Error('No active round — call initRoundSession() or restoreRound() first');
    }
    const snapshot = runtimeToLegacyRoundState(round, getRunState());
    return new Proxy(snapshot, {
      set(_target, prop, value) {
        if (typeof prop !== 'string') return false;
        applyTestRoundStatePatch(prop, value);
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

  validateScoreSelection(diceIds: string[]): { allowed: boolean; reason?: string; warning?: string } {
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
