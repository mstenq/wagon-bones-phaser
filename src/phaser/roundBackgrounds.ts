// ─── Round background lazy-load (Phaser) ───

import type { Scene } from 'phaser';
import { gameRoundBackgroundPath, gameRoundBackgroundTextureKey } from '../game/roundBackgrounds';

export { gameRoundBackgroundPath, gameRoundBackgroundTextureKey };

/**
 * Loads a single round background if needed, then invokes onReady with the texture key.
 * On load failure, onReady still runs; callers should verify `scene.textures.exists(key)`.
 */
export function ensureGameRoundBackgroundLoaded(
  scene: Scene,
  index: number,
  onReady: (textureKey: string) => void,
): void {
  const key = gameRoundBackgroundTextureKey(index);
  if (scene.textures.exists(key)) {
    onReady(key);
    return;
  }
  scene.load.image(key, gameRoundBackgroundPath(index));
  scene.load.once('complete', () => onReady(key));
  scene.load.once('loaderror', () => onReady(key));
  scene.load.start();
}
