// ─── Round state resolution (No Phaser imports) ───
// Maps round-store IDs to Die objects using run-store dice metadata.

import type { Die, GameConfig, RoundState } from '../types';
import type { RolledDieRef, RoundRuntimeState } from './types';
import { getRunState } from './runStore';
import { selectSpentDice } from './selectors/runSelectors';
import type { RunState } from './types';

export function dieValueInRound(
  dieId: string,
  round: RoundRuntimeState,
  run: RunState = getRunState(),
): number | undefined {
  const rolled = round.rolledDice.find((r) => r.id === dieId);
  if (rolled) return rolled.value;
  const overlay = round.dieValuesByDieId[dieId];
  if (overlay !== undefined) return overlay;
  return run.dice.find((d) => d.id === dieId)?.value;
}

export function resolveDieById(
  dieId: string,
  round: RoundRuntimeState,
  run: RunState = getRunState(),
): Die | undefined {
  const base = run.dice.find((d) => d.id === dieId);
  if (!base) return undefined;
  const value = dieValueInRound(dieId, round, run);
  return value !== undefined ? { ...base, value } : { ...base };
}

export function resolveDiceByIds(ids: string[], round: RoundRuntimeState, run: RunState = getRunState()): Die[] {
  return ids.map((id) => resolveDieById(id, round, run)).filter((d): d is Die => d !== undefined);
}

export function rolledRefsToDice(
  rolled: RolledDieRef[],
  _round: RoundRuntimeState,
  run: RunState = getRunState(),
): Die[] {
  return rolled
    .map((ref) => {
      const base = run.dice.find((d) => d.id === ref.id);
      if (!base) return undefined;
      return { ...base, value: ref.value };
    })
    .filter((d): d is Die => d !== undefined);
}

export function legacyRoundStateToRuntime(config: GameConfig, state: RoundState): RoundRuntimeState {
  const dieValuesByDieId: Record<string, number> = {};
  const recordValues = (dice: Die[]) => {
    for (const d of dice) dieValuesByDieId[d.id] = d.value;
  };
  recordValues(state.hand);
  recordValues(state.selectedForRoll);
  recordValues(state.rolledDice);
  recordValues(state.selectedForScore);
  recordValues(state.spent);

  return {
    config: { ...config },
    phase: state.phase,
    day: state.day,
    rerollsRemaining: state.rerollsRemaining,
    totalMiles: state.totalMiles,
    spentDiceIds: state.spent.map((d) => d.id),
    handDiceIds: state.hand.map((d) => d.id),
    dieValuesByDieId,
    selectedForRollIds: state.selectedForRoll.map((d) => d.id),
    rolledDice: state.rolledDice.map((d) => ({ id: d.id, value: d.value })),
    selectedForScoreIds: state.selectedForScore.map((d) => d.id),
    rerollLockedDiceIds: [],
    currentHandType: state.currentHandType,
    handHistory: [...state.handHistory],
    lastScoreResult: null,
  };
}

export function runtimeToLegacyRoundState(round: RoundRuntimeState, run: RunState = getRunState()): RoundState {
  return {
    phase: round.phase,
    day: round.day,
    rerollsRemaining: round.rerollsRemaining,
    totalMiles: round.totalMiles,
    spent: selectSpentDice(run),
    hand: resolveDiceByIds(round.handDiceIds, round, run),
    selectedForRoll: resolveDiceByIds(round.selectedForRollIds, round, run),
    rolledDice: rolledRefsToDice(round.rolledDice, round, run),
    selectedForScore: resolveDiceByIds(round.selectedForScoreIds, round, run),
    currentHandType: round.currentHandType,
    handHistory: [...round.handHistory],
  };
}

export function syncDieValuesFromDice(dieValuesByDieId: Record<string, number>, dice: Die[]): Record<string, number> {
  const next = { ...dieValuesByDieId };
  for (const d of dice) next[d.id] = d.value;
  return next;
}

export function syncDieValuesFromRefs(
  dieValuesByDieId: Record<string, number>,
  refs: RolledDieRef[],
): Record<string, number> {
  const next = { ...dieValuesByDieId };
  for (const r of refs) next[r.id] = r.value;
  return next;
}
