// ─── DifficultyAssets ───
// Texture keys and image helpers for Oregon Trail stake icons.

import type { Scene } from 'phaser';
import { DIFFICULTIES } from '../../game/Constants';
import type { DifficultyDef, DifficultyLevel } from '../../game/types';

export function difficultyTextureKey(level: DifficultyLevel): string {
  return `difficulty_${level}`;
}

export function getDifficultyDef(level: DifficultyLevel): DifficultyDef {
  const def = DIFFICULTIES.find((d) => d.level === level);
  if (!def) throw new Error(`Unknown difficulty level: ${level}`);
  return def;
}

/** Add a scaled difficulty badge image to a container; returns null if texture missing. */
export function addDifficultyImage(
  scene: Scene,
  container: Phaser.GameObjects.Container,
  level: DifficultyLevel,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Image | null {
  const key = difficultyTextureKey(level);
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const tex = img.texture.getSourceImage();
  const scale = size / Math.max(tex.width, tex.height);
  img.setScale(scale);
  container.add(img);
  return img;
}
