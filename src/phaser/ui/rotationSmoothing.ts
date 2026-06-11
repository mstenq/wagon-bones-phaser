// ─── Rotation smoothing helpers ───
// Disable roundPixels on rotating subtrees; bake + linear filter for vector chrome.

import * as Phaser from 'phaser';
import type { GameObjects, Scene } from 'phaser';

export type RoundPixelsTarget = { roundPixels?: boolean };

export function disableRoundPixels(target: GameObjects.GameObject | null | undefined): void {
  if (!target) return;
  const node = target as RoundPixelsTarget;
  if (typeof node.roundPixels === 'boolean') {
    node.roundPixels = false;
  }
}

export function disableRoundPixelsTree(root: GameObjects.GameObject): void {
  disableRoundPixels(root);
  const container = root as GameObjects.Container;
  if (!container.each) return;
  container.each((child: GameObjects.GameObject) => {
    disableRoundPixels(child);
    if (child instanceof Phaser.GameObjects.Container) {
      disableRoundPixelsTree(child);
    }
  });
}

export function removeTextureIfExists(scene: Scene, textureKey: string): void {
  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey);
  }
}

export function bakeGraphicsToLinearTexture(
  scene: Scene,
  gfx: GameObjects.Graphics,
  textureKey: string,
  bakeWidth: number,
  bakeHeight: number,
): void {
  removeTextureIfExists(scene, textureKey);
  gfx.generateTexture(textureKey, bakeWidth, bakeHeight);
  scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
}
