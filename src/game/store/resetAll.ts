// ─── Full store reset (No Phaser imports) ───

import { resetRunRng } from '../RunRng';
import { runActions } from './runStore';
import { roundActions } from './actions/roundActions';

/** Clear run + round stores for a new game (menus, game over). */
export function resetAllGameStores(): void {
  resetRunRng();
  runActions.reset();
  roundActions.reset();
}
