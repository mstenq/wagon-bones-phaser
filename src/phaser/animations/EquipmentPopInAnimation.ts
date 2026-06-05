// ─── Equipment pop-in animation ───
// Scale + card SFX when new equipment appears on the bar (Junk Dealer, Ingenuity, Skin Walker copy, etc.).

import type { Scene } from 'phaser';
import type { EquipmentBar } from '../ui/EquipmentBar';

/** Pop in the last `count` equipment cards on the bar (Back.easeOut + sfx_card1). */
export function animateEquipmentPopIn(scene: Scene, equipBar: EquipmentBar, count: number): Promise<void> {
  return new Promise((resolve) => {
    if (count <= 0) {
      resolve();
      return;
    }

    const cards = equipBar.getCards();
    const newCards = cards.slice(Math.max(0, cards.length - count));
    if (newCards.length === 0) {
      resolve();
      return;
    }

    let completed = 0;
    const finishOne = () => {
      completed++;
      if (completed >= newCards.length) resolve();
    };

    for (let i = 0; i < newCards.length; i++) {
      const card = newCards[i];
      card.setScale(0);
      card.setAlpha(0);

      scene.time.delayedCall(i * 150, () => {
        scene.sound.play('sfx_card1', { volume: 0.5 });
        scene.tweens.add({
          targets: card,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: finishOne,
        });
      });
    }
  });
}
