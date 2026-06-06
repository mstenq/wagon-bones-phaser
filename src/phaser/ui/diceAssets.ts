// ─── Dice atlas frame helpers ───

import type { Scene } from 'phaser';
import type { Die } from '../../game/types';

export const DICE_ATLAS_KEY = 'dice';

const FALLBACK_FRAME = 'standard-01.png';

/** TexturePacker frame name for a die's current face (enhancement + value). */
export function getDiceAtlasFrame(die: Die): string {
  const material = die.enhancement ?? 'standard';
  if (material === 'stone') return 'stone.png';
  const v = die.value;
  if (v >= 1 && v <= 12) {
    return `${material}-${String(v).padStart(2, '0')}.png`;
  }
  return `${material}-01.png`;
}

/** Resolve a frame that exists on the loaded dice atlas, with standard fallback. */
export function resolveDiceAtlasFrame(scene: Scene, die: Die): string {
  const frame = getDiceAtlasFrame(die);
  if (scene.textures.exists(DICE_ATLAS_KEY) && scene.textures.get(DICE_ATLAS_KEY).has(frame)) {
    return frame;
  }
  return FALLBACK_FRAME;
}
