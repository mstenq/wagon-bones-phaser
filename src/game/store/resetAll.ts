// ─── Full store reset (No Phaser imports) ───

import { resetRunRng } from '../RunRng';
import { runActions } from './runStore';
import { roundActions } from './actions/roundActions';
import { sceneActions } from './sceneStore';

/** Clear run + round + scene stores for a new game (menus, game over). */
export function resetAllGameStores(): void {
  resetRunRng();
  runActions.reset();
  roundActions.reset();
  sceneActions.reset();
}
