import type { Scene } from 'phaser';
import type { Sidebar } from '../ui/Sidebar';
import type { UseConsumableResult } from '../../game/facade/consumable';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';

type FailurePopupConfig = {
  x: number;
  y: number;
  sound?: () => void;
};

export function handleStandardConsumableResult(
  scene: Scene,
  sidebar: Sidebar,
  result: UseConsumableResult,
  returnScene: string,
  failurePopup?: FailurePopupConfig,
): void {
  if (!result.success && result.failReason && failurePopup) {
    showConsumableFailure(scene, result.failReason, failurePopup);
  }

  if (result.diceSelection) {
    scene.scene.start('DiceSelection', {
      config: result.diceSelection,
      returnScene,
      returnSceneData: {},
    });
  }

  const upgrades = result.handUpgrades ?? (result.handUpgrade ? [result.handUpgrade] : []);
  if (upgrades.length > 0) {
    playHandUpgradeAnimation({
      scene,
      sidebar,
      upgrades,
      onComplete: () => {},
    });
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
