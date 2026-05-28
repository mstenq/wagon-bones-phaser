// ─── Tag earned fly-in (Round Select) ───

import type { Scene } from 'phaser';
import { TAG_STACK } from '../../game/Constants';

const TAG_FLY_COLORS: Record<string, number> = {
  shop: 0x44aa44,
  shop_aura: 0x9966cc,
  boss: 0xcc4444,
  next_round: 0xcc8844,
  meta: 0xcccccc,
};

const TOOLTIP_DEPTH = 200;

export function playTagEarnedFlyIn(
  scene: Scene,
  category: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  onComplete: () => void,
): void {
  const color = TAG_FLY_COLORS[category] ?? 0x888888;
  const half = TAG_STACK.BADGE_SIZE / 2;

  const tempBadge = scene.add.graphics();
  tempBadge.fillStyle(color, 1);
  tempBadge.fillRoundedRect(-half, -half, TAG_STACK.BADGE_SIZE, TAG_STACK.BADGE_SIZE, TAG_STACK.BADGE_RADIUS);
  tempBadge.setPosition(fromX, fromY);
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
