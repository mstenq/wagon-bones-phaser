// ─── Visible dice row orchestration (No Phaser imports) ───
// Store reads/writes for pack lineup and round ROLL/SELECT rows after dice effects.

import {
  buildCopyLineupSync,
  drawDiceForSelection,
  syncLineupAfterDiceEffect,
  type DiceLineupSyncOptions,
  type DiceSelectionResult,
} from './DiceSelectionSystem';
import type { Die } from './types';
import { getRunState } from './store/runStore';
import { getSceneState, sceneActions } from './store/sceneStore';
import { selectHandDice, selectRoundPhase, selectRolledDice } from './store/selectors/roundSelectors';
import { setHandDice, syncRolledDiceFromFaces } from './store/roundWrites';

/** Resolve booster-pack lineup die IDs to live run dice (drops destroyed). */
export function selectPackLineupDice(): Die[] {
  const pack = getSceneState().boosterPack;
  const lineupDieIds = pack?.lineupDieIds ?? [];
  if (lineupDieIds.length === 0) return [];

  const runDiceById = new Map(getRunState().dice.map((d) => [d.id, d]));
  return lineupDieIds.flatMap((id) => {
    const die = runDiceById.get(id);
    return die ? [{ ...die }] : [];
  });
}

export function initPackLineup(): Die[] {
  const dice = drawDiceForSelection(0);
  commitPackLineup(dice);
  return dice;
}

export function reorderPackLineup(fromIndex: number, toIndex: number): void {
  const pack = getSceneState().boosterPack;
  const lineupDieIds = pack?.lineupDieIds ?? [];
  if (lineupDieIds.length === 0) return;

  const ids = [...lineupDieIds];
  const [moved] = ids.splice(fromIndex, 1);
  if (!moved) return;
  ids.splice(toIndex, 0, moved);
  sceneActions.patchBoosterPack({ lineupDieIds: ids });
}

export function commitPackLineup(dice: Die[]): void {
  sceneActions.patchBoosterPack({ lineupDieIds: dice.map((d) => d.id) });
}

export function syncPackLineupAfterSelection(result: DiceSelectionResult, selectedDice: Die[]): Die[] {
  const current = selectPackLineupDice();
  if (current.length === 0) return current;

  const copySync = buildCopyLineupSync(result, selectedDice[0]?.id);
  const next = syncLineupAfterDiceEffect(current, getRunState().dice, copySync);
  commitPackLineup(next);
  return next;
}

export function applyCopyAfterSelection(result: DiceSelectionResult, sourceDie: Die | undefined): Die[] {
  const copySync = buildCopyLineupSync(result, sourceDie?.id);
  if (!copySync) return [];
  return applyCopyToRoundRow(copySync);
}

export function applyCopyToRoundRow(copySync: DiceLineupSyncOptions): Die[] {
  const phase = selectRoundPhase();
  const current = phase === 'SELECT' ? selectHandDice() : selectRolledDice();
  if (current.length === 0) return current;

  const next = syncLineupAfterDiceEffect(current, getRunState().dice, copySync);
  if (phase === 'SELECT') {
    setHandDice(next);
  } else {
    syncRolledDiceFromFaces(next);
  }
  return next;
}
