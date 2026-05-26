// ─── UI-initiated round store writes (No Phaser imports) ───
// Blessed round mutations from Phaser scenes — ID-based RoundRuntimeState fields.

import type { Die } from '../types';
import { roundActions } from './actions/roundActions';
import { syncDieValuesFromDice, syncDieValuesFromRefs } from './roundResolve';
import { selectHandDice, selectRolledDice, selectSelectedForScore } from './selectors/roundSelectors';
import { getRunState, runStore } from './runStore';
import { getRoundState } from './roundStore';
import type { RolledDieRef } from './types';

function ensureDiceInRun(dice: Die[]): void {
  if (dice.length === 0) return;
  const run = getRunState();
  const existing = new Set(run.dice.map((d) => d.id));
  const missing = dice.filter((d) => !existing.has(d.id));
  if (missing.length === 0) return;
  runStore.setState({ dice: [...run.dice, ...missing] });
}

/** Sync rolled faces from UI dice sprites into round store (order + values). */
export function syncRolledDiceFromFaces(dice: Die[]): void {
  const round = getRoundState();
  if (!round) return;
  ensureDiceInRun(dice);
  const rolledDice: RolledDieRef[] = dice.map((d) => ({ id: d.id, value: d.value }));
  roundActions.patch({
    rolledDice,
    dieValuesByDieId: syncDieValuesFromRefs(round.dieValuesByDieId, rolledDice),
  });
}

/** Update SELECT-phase hand dice (IDs + value overlays). */
export function setHandDice(dice: Die[]): void {
  const round = getRoundState();
  if (!round) return;
  ensureDiceInRun(dice);
  roundActions.patch({
    handDiceIds: dice.map((d) => d.id),
    dieValuesByDieId: syncDieValuesFromDice(round.dieValuesByDieId, dice),
  });
}

/** Lock selection for score preview during ROLL (does not enter SCORE phase). */
export function setSelectedForScoreDice(dice: Die[]): void {
  const round = getRoundState();
  if (!round) return;
  ensureDiceInRun(dice);
  roundActions.patch({
    selectedForScoreIds: dice.map((d) => d.id),
    dieValuesByDieId: syncDieValuesFromDice(round.dieValuesByDieId, dice),
  });
}

/** Remove destroyed dice from hand or rolled/locked selection for the active phase. */
export function removeDestroyedDiceFromRound(destroyedIds: Set<string>): void {
  const round = getRoundState();
  if (!round) return;
  if (round.phase === 'SELECT') {
    setHandDice(selectHandDice().filter((d) => !destroyedIds.has(d.id)));
    return;
  }
  if (round.phase === 'ROLL') {
    syncRolledDiceFromFaces(selectRolledDice().filter((d) => !destroyedIds.has(d.id)));
    setSelectedForScoreDice(selectSelectedForScore().filter((d) => !destroyedIds.has(d.id)));
  }
}
