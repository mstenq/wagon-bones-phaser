// ─── Ambient dice pre-selection before arming a consumable (No Phaser imports) ───
// Pack lineup and game SELECT-phase pre-picks share one pattern: writable when no
// session is active; session seeds from ambient on arm and cancel restores ambient.

import { getSceneState, sceneActions } from '../store/sceneStore';
import { getActiveConsumableTargeting } from './consumableTargetingSession';

export type AmbientDiceSelectionScene = 'game' | 'booster_pack';

function readAmbientStoreIds(scene: AmbientDiceSelectionScene): string[] {
  const state = getSceneState();
  if (scene === 'booster_pack') {
    return [...(state.boosterPack?.lineupSelectedDieIds ?? [])];
  }
  return [...(state.consumableSeedDieIds ?? [])];
}

function writeAmbientStoreIds(scene: AmbientDiceSelectionScene, ids: string[]): void {
  if (scene === 'booster_pack') {
    sceneActions.patchPackLineupSelection(ids);
    return;
  }
  sceneActions.patchConsumableSeedSelection(ids);
}

export function getAmbientSelectedDieIds(scene: AmbientDiceSelectionScene): string[] {
  const session = getActiveConsumableTargeting();
  if (session?.useContext.scene === scene) {
    return [...session.selectedDieIds];
  }
  return readAmbientStoreIds(scene);
}

export function setAmbientSelectedDieIds(scene: AmbientDiceSelectionScene, ids: string[]): void {
  const session = getActiveConsumableTargeting();
  if (session?.useContext.scene === scene) {
    return;
  }
  writeAmbientStoreIds(scene, ids);
}

export function clearAmbientSelectedDieIds(scene: AmbientDiceSelectionScene): void {
  setAmbientSelectedDieIds(scene, []);
}

/** @deprecated Use getAmbientSelectedDieIds('booster_pack') */
export function getPackLineupSelectedDieIds(): string[] {
  return getAmbientSelectedDieIds('booster_pack');
}

/** @deprecated Use setAmbientSelectedDieIds('booster_pack', ids) */
export function setPackLineupSelectedDieIds(ids: string[]): void {
  setAmbientSelectedDieIds('booster_pack', ids);
}

export function getGameConsumableSeedDieIds(): string[] {
  return getAmbientSelectedDieIds('game');
}

export function setGameConsumableSeedDieIds(ids: string[]): void {
  setAmbientSelectedDieIds('game', ids);
}
