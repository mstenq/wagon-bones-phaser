// ─── ModifierAssets ───
// Texture keys and image helpers for equipment modifier badges (cursed / perishable / leased).

import type { Scene } from 'phaser';
import type { EquipmentModifier } from '../../game/types';

export const PROFESSION_SPECIAL_BADGE_KEY = 'modifier_special';

export function modifierTextureKey(modifier: EquipmentModifier): string {
  return `modifier_${modifier}`;
}

/** Add a scaled modifier badge image to a container; returns null if texture missing. */
export function addModifierBadgeImage(
  scene: Scene,
  container: Phaser.GameObjects.Container,
  modifier: EquipmentModifier,
  size: number,
): Phaser.GameObjects.Image | null {
  const key = modifierTextureKey(modifier);
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(0, 0, key);
  const tex = img.texture.getSourceImage();
  const scale = size / Math.max(tex.width, tex.height);
  img.setScale(scale);
  container.add(img);
  return img;
}

/** Add the profession special-equipment star badge to a container. */
export function addProfessionSpecialBadgeImage(
  scene: Scene,
  container: Phaser.GameObjects.Container,
  size: number,
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(PROFESSION_SPECIAL_BADGE_KEY)) return null;
  const img = scene.add.image(0, 0, PROFESSION_SPECIAL_BADGE_KEY);
  const tex = img.texture.getSourceImage();
  const scale = size / Math.max(tex.width, tex.height);
  img.setScale(scale);
  container.add(img);
  return img;
}
