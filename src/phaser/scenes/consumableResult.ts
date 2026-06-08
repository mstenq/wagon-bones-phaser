import type { Scene } from 'phaser';
import type { Sidebar } from '../ui/Sidebar';
import type { UseConsumableResult } from '../../game/facade/consumable';

type FailurePopupConfig = {
  x: number;
  y: number;
  sound?: () => void;
};

/** Route consumable use results (animations via playback queue; dice targeting is inline per scene). */
export function handleStandardConsumableResult(
  scene: Scene,
  _sidebar: Sidebar,
  result: UseConsumableResult,
  _returnScene: string,
  failurePopup?: FailurePopupConfig,
): void {
  if (!result.success && result.failReason && failurePopup) {
    showConsumableFailure(scene, result.failReason, failurePopup);
  }
}

function showConsumableFailure(scene: Scene, message: string, popup: FailurePopupConfig): void {
  const text = scene.add
    .text(popup.x, popup.y, message, {
      fontFamily: 'sans-serif',
      fontSize: '24px',
      color: '#fff',
      stroke: '#000000',
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setDepth(1000);
  popup.sound?.();
  scene.tweens.add({
    targets: text,
    y: text.y - 15,
    alpha: 0,
    duration: 2000,
    ease: 'Power2',
    onComplete: () => text.destroy(),
  });
}
