// ─── Booster pack lineup dice pre-selection (No Phaser imports) ───

import { getSceneState, sceneActions } from '../store/sceneStore';
import { getActiveConsumableTargeting } from './consumableTargetingSession';

/** Selected lineup dice from an active pack targeting session, or ambient store selection. */
export function getPackLineupSelectedDieIds(): string[] {
  const session = getActiveConsumableTargeting();
  if (session?.useContext.scene === 'booster_pack') {
    return [...session.selectedDieIds];
  }
  return [...(getSceneState().boosterPack?.lineupSelectedDieIds ?? [])];
}

export function setPackLineupSelectedDieIds(ids: string[]): void {
  const session = getActiveConsumableTargeting();
  if (session?.useContext.scene === 'booster_pack') {
    return;
  }
  sceneActions.patchPackLineupSelection(ids);
}
