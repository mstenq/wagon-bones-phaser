// ─── TrailTagBadge ───
// Shared dual-tone trail tag badge background + atlas icon helpers.

import type { Scene } from 'phaser';
import type { TagCategory } from '../../game/types';

export const TRAIL_TAGS_ATLAS_KEY = 'trail_tags';

export const TRAIL_TAG_CATEGORY_COLORS: Record<TagCategory, number> = {
  shop: 0x4488ff,
  shop_aura: 0xaa44ff,
  boss: 0xff4444,
  immediate_pack: 0x44aa44,
  immediate_money: 0xffd700,
  immediate_equipment: 0x8b7355,
  immediate_upgrade: 0xff8800,
  next_round: 0x44cccc,
  meta: 0xff66cc,
};

const ICON_SCALE = 0.78;

export function trailTagAtlasFrame(tagId: string): string {
  return `${tagId}.png`;
}

export function trailTagBadgeRadius(size: number): number {
  return Math.max(4, Math.round((size * 4) / 36));
}

export function drawTrailTagBadgeBackground(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  category: TagCategory,
  opts?: { hover?: boolean },
): void {
  const color = TRAIL_TAG_CATEGORY_COLORS[category] ?? 0x888888;
  const radius = trailTagBadgeRadius(size);
  const hover = opts?.hover ?? false;

  g.clear();
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, size, size, radius);
  g.lineStyle(hover ? 2 : 2, 0xffffff, hover ? 0.7 : 0.5);
  g.strokeRoundedRect(x, y, size, size, radius);
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(x, y, size / 2, size);
}

export function addTrailTagBadgeIcon(
  scene: Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  size: number,
  tagId: string,
): Phaser.GameObjects.Image | null {
  const frame = trailTagAtlasFrame(tagId);
  const texture = scene.textures.get(TRAIL_TAGS_ATLAS_KEY);
  if (!scene.textures.exists(TRAIL_TAGS_ATLAS_KEY) || !texture.has(frame)) {
    return null;
  }

  const cx = x + size / 2;
  const cy = y + size / 2;
  const img = scene.add.image(cx, cy, TRAIL_TAGS_ATLAS_KEY, frame);
  const displaySize = size * ICON_SCALE;
  img.setDisplaySize(displaySize, displaySize);
  parent.add(img);
  return img;
}

/** Build a badge container with dual-tone background and atlas icon (center-anchored at cx, cy). */
export function createTrailTagBadgeContainer(
  scene: Scene,
  cx: number,
  cy: number,
  size: number,
  tagId: string,
  category: TagCategory,
): Phaser.GameObjects.Container {
  const container = scene.add.container(cx, cy);
  const half = size / 2;

  const bg = scene.add.graphics();
  drawTrailTagBadgeBackground(bg, -half, -half, size, category);
  container.add(bg);

  addTrailTagBadgeIcon(scene, container, -half, -half, size, tagId);
  return container;
}
