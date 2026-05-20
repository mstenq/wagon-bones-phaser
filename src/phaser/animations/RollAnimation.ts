// ─── RollAnimation ───
// Animates dice "tumbling" by rapidly changing values before landing on final value.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Die } from '../../game/types';
import { ANIM } from '../../game/Constants';

export function playRollAnimation(
  scene: Scene,
  diceSprites: DiceSprite[],
  finalDice: Die[],
  onComplete: () => void,
): void {
  const duration = ANIM.ROLL_DURATION;
  const interval = ANIM.ROLL_INTERVAL;
  let elapsed = 0;

  // Play dice rattle sound at start
  scene.sound.play('sfx_dice_roll', { volume: 0.6 });

  const timer = scene.time.addEvent({
    delay: interval,
    repeat: Math.floor(duration / interval) - 1,
    callback: () => {
      elapsed += interval;
      for (const sprite of diceSprites) {
        const tempValue = sprite.dieData.enhancement === 'stone' ? 0 : Math.ceil(Math.random() * 12);
        const tempData = { ...sprite.dieData, value: tempValue };
        sprite.setDieData(tempData);
      }
    },
  });

  // After animation, set final values
  scene.time.delayedCall(duration, () => {
    timer.destroy();
    for (let i = 0; i < diceSprites.length; i++) {
      if (finalDice[i]) {
        diceSprites[i].setDieData(finalDice[i]);
      }
    }

    // Play dice land sound
    scene.sound.play('sfx_dice_land', { volume: 0.5 });

    // Bounce tween on each die
    for (const sprite of diceSprites) {
      scene.tweens.add({
        targets: sprite,
        scaleX: 1.15,
        scaleY: 0.9,
        duration: ANIM.ROLL_BOUNCE_DURATION,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    scene.time.delayedCall(200, onComplete);
  });
}
