// ─── Round read/write helpers (No Phaser imports) ───
// Die-object round snapshot for GameScene; writes go through roundStore patches.

import { type Die, type RoundState, type GameConfig, DEFAULT_CONFIG } from '../types';
import { getRoundState, patchRoundStore } from './roundStore';
import { roundActions } from './actions/roundActions';
import { runtimeToLegacyRoundState, syncDieValuesFromDice } from './roundResolve';
import type { RoundRuntimeState } from './types';
import { getRunState, runActions, runStore } from './runStore';

function ensureDiceInRun(dice: Die[]): void {
  if (dice.length === 0) return;
  const run = getRunState();
  const existing = new Set(run.dice.map((d) => d.id));
  const missing = dice.filter((d) => !existing.has(d.id));
  if (missing.length === 0) return;
  runStore.setState({ dice: [...run.dice, ...missing] });
}

function collectDiceFromPartial(partial: Partial<RoundState>): Die[] {
  const out: Die[] = [];
  const add = (list?: Die[]) => {
    if (list) out.push(...list);
  };
  add(partial.hand);
  add(partial.selectedForRoll);
  add(partial.rolledDice);
  add(partial.selectedForScore);
  add(partial.spent);
  return out;
}

/** Apply a legacy RoundState-shaped patch to roundStore. */
export function patchLegacyRoundState(partial: Partial<RoundState>, config?: Partial<GameConfig>): void {
  ensureDiceInRun(collectDiceFromPartial(partial));
  const round = getRoundState();
  if (!round) throw new Error('No active round in roundStore');

  const patch: Partial<RoundRuntimeState> = {};
  let dieValuesByDieId = round.dieValuesByDieId;

  if (partial.phase !== undefined) patch.phase = partial.phase;
  if (partial.day !== undefined) patch.day = partial.day;
  if (partial.rerollsRemaining !== undefined) patch.rerollsRemaining = partial.rerollsRemaining;
  if (partial.totalMiles !== undefined) patch.totalMiles = partial.totalMiles;
  if (partial.currentHandType !== undefined) patch.currentHandType = partial.currentHandType;
  if (partial.handHistory !== undefined) patch.handHistory = [...partial.handHistory];

  if (partial.hand !== undefined) {
    patch.handDiceIds = partial.hand.map((d) => d.id);
    dieValuesByDieId = syncDieValuesFromDice(dieValuesByDieId, partial.hand);
  }
  if (partial.selectedForRoll !== undefined) {
    patch.selectedForRollIds = partial.selectedForRoll.map((d) => d.id);
    dieValuesByDieId = syncDieValuesFromDice(dieValuesByDieId, partial.selectedForRoll);
  }
  if (partial.rolledDice !== undefined) {
    patch.rolledDice = partial.rolledDice.map((d) => ({ id: d.id, value: d.value }));
    dieValuesByDieId = syncDieValuesFromDice(dieValuesByDieId, partial.rolledDice);
  }
  if (partial.selectedForScore !== undefined) {
    patch.selectedForScoreIds = partial.selectedForScore.map((d) => d.id);
    dieValuesByDieId = syncDieValuesFromDice(dieValuesByDieId, partial.selectedForScore);
  }
  if (partial.spent !== undefined) {
    patch.spentDiceIds = partial.spent.map((d) => d.id);
    runActions.patch({ spentDiceIds: partial.spent.map((d) => d.id) });
  }

  patch.dieValuesByDieId = dieValuesByDieId;
  if (config) {
    const r = getRoundState();
    if (r) patch.config = { ...r.config, ...config };
  }
  patchRoundStore(patch);
}

/** Read-only legacy die-object round snapshot (mutate via patchLegacyRoundState). */
export function readRoundState(): RoundState {
  const round = getRoundState();
  if (!round) {
    throw new Error('No active round — call initRoundSession() or restoreRound() first');
  }
  return runtimeToLegacyRoundState(round);
}

export function getActiveRoundConfig(pending: Partial<GameConfig> = {}): GameConfig {
  return getRoundState()?.config ?? { ...DEFAULT_CONFIG, ...pending };
}

export function initRoundSession(config: Partial<GameConfig> = {}): void {
  if (!getRoundState()) {
    roundActions.seedConstructorRound(config);
  }
}

export function startRoundSession(config: Partial<GameConfig> = {}): void {
  roundActions.startRound(config);
}
