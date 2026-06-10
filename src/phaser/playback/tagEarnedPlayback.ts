// ─── Tag earned fly-in (Round Select) ───

import type { Scene } from 'phaser';
import type { TagCategory } from '../../game/types';
import { TAG_STACK } from '../../game/Constants';
import { createTrailTagBadgeContainer } from '../ui/TrailTagBadge';

const TOOLTIP_DEPTH = 200;

export function playTagEarnedFlyIn(
  scene: Scene,
  tagId: string,
  category: TagCategory,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  onComplete: () => void,
): void {
  const tempBadge = createTrailTagBadgeContainer(scene, fromX, fromY, TAG_STACK.BADGE_SIZE, tagId, category);
  tempBadge.setDepth(TOOLTIP_DEPTH);

  scene.tweens.add({
    targets: tempBadge,
    x: toX,
    y: toY,
    scaleX: { from: 1.5, to: 1 },
    scaleY: { from: 1.5, to: 1 },
    duration: 600,
    ease: 'Back.easeIn',
    onComplete: () => {
      tempBadge.destroy();
      onComplete();
    },
  });
}
