import type { Scene } from 'phaser';
import { ensureAuraTextures } from '../ui/AuraFX';
import type { DiceSprite } from '../ui/DiceSprite';

const FIRE_BUILDUP_MS = 260;
const FIRE_SHRINK_MS = 280;
const SPARK_CLEANUP_MS = 500;
const FIRE_EMITTER_CLEANUP_MS = 400;

/** Fire + spark destroy visual for a single die sprite (caller destroys the sprite). */
export function playDiceFireDestroyVisual(scene: Scene, sprite: DiceSprite): Promise<void> {
  ensureAuraTextures(scene);

  return new Promise((resolve) => {
    const fireEmitter = scene.add.particles(sprite.x, sprite.y, 'aura_soft', {
      speed: { min: 20, max: 60 },
      angle: { min: -110, max: -70 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 350, max: 700 },
      frequency: 24,
      quantity: 2,
      tint: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
      blendMode: 'ADD',
      maxAliveParticles: 20,
    });
    fireEmitter.setDepth(500);

    scene.time.delayedCall(FIRE_BUILDUP_MS, () => {
      const sparkEmitter = scene.add.particles(sprite.x, sprite.y, 'aura_soft', {
        speed: { min: 70, max: 150 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 220, max: 500 },
        frequency: -1,
        quantity: 10,
        tint: [0xff4400, 0xffaa00, 0xffdd00],
        blendMode: 'ADD',
      });
      sparkEmitter.setDepth(500);
      sparkEmitter.explode(10);
      scene.time.delayedCall(SPARK_CLEANUP_MS, () => sparkEmitter.destroy());
    });

    scene.tweens.add({
      targets: sprite,
      delay: FIRE_BUILDUP_MS,
      y: sprite.y - 45,
      angle: sprite.angle + 16,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: FIRE_SHRINK_MS,
      ease: 'Back.easeIn',
      onComplete: () => {
        fireEmitter.stop();
        scene.time.delayedCall(FIRE_EMITTER_CLEANUP_MS, () => fireEmitter.destroy());
        resolve();
      },
    });
  });
}

/** Play fire destroy on multiple sprites; shares one ambient fire sound. */
export function playDiceFireDestroyVisualBatch(scene: Scene, sprites: DiceSprite[]): Promise<void> {
  if (sprites.length === 0) {
    return Promise.resolve();
  }

  ensureAuraTextures(scene);
  const fireSound = scene.sound.add('sfx_ambient_fire', { volume: 1.2 });
  fireSound.play();

  return Promise.all(sprites.map((sprite) => playDiceFireDestroyVisual(scene, sprite))).then(() => {
    scene.tweens.add({
      targets: fireSound,
      volume: 0,
      duration: 250,
      onComplete: () => fireSound.destroy(),
    });
    scene.sound.play('sfx_slice1', { volume: 0.65 });
  });
}
