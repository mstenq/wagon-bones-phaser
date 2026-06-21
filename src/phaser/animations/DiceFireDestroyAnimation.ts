import type { Scene } from 'phaser';
import { ensureAuraTextures } from '../ui/AuraFX';
import type { DiceSprite } from '../ui/DiceSprite';

const FIRE_BUILDUP_MS = 260;
const FIRE_SHRINK_MS = 280;
const SPARK_CLEANUP_MS = 500;
const FIRE_EMITTER_CLEANUP_MS = 400;
const FIRE_SOUND_FADE_MS = 250;
const FIRE_SOUND_KEY = 'sfx_ambient_fire';

const activeFireSounds = new WeakMap<Scene, Set<Phaser.Sound.BaseSound>>();
const fadingFireSounds = new WeakSet<Phaser.Sound.BaseSound>();
const sceneCleanupRegistered = new WeakSet<Scene>();

function ensureSceneFireSoundCleanup(scene: Scene): void {
  if (sceneCleanupRegistered.has(scene)) return;
  sceneCleanupRegistered.add(scene);

  const cleanup = () => {
    scene.sound.stopByKey(FIRE_SOUND_KEY);
    const sounds = activeFireSounds.get(scene);
    if (!sounds) return;
    for (const sound of sounds) {
      sound.stop();
      sound.destroy();
    }
    sounds.clear();
  };

  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
}

function trackFireSound(scene: Scene, sound: Phaser.Sound.BaseSound): void {
  ensureSceneFireSoundCleanup(scene);
  let set = activeFireSounds.get(scene);
  if (!set) {
    set = new Set();
    activeFireSounds.set(scene, set);
  }
  set.add(sound);
}

function untrackFireSound(scene: Scene, sound: Phaser.Sound.BaseSound): void {
  activeFireSounds.get(scene)?.delete(sound);
}

/** Start tracked ambient fire for dice destruction; always pair with fade or scene shutdown cleanup. */
export function startDiceFireDestroySound(scene: Scene, volume = 1.2): Phaser.Sound.BaseSound {
  const fireSound = scene.sound.add(FIRE_SOUND_KEY, { volume });
  trackFireSound(scene, fireSound);
  fireSound.play();
  return fireSound;
}

/** Fade out and destroy a dice fire sound. Safe to call multiple times or after scene exit. */
export function fadeOutDiceFireDestroySound(
  scene: Scene,
  fireSound: Phaser.Sound.BaseSound,
  onComplete?: () => void,
): void {
  if (fadingFireSounds.has(fireSound)) {
    onComplete?.();
    return;
  }
  fadingFireSounds.add(fireSound);

  scene.tweens.add({
    targets: fireSound,
    volume: 0,
    duration: FIRE_SOUND_FADE_MS,
    onComplete: () => {
      fireSound.stop();
      fireSound.destroy();
      untrackFireSound(scene, fireSound);
      onComplete?.();
    },
  });
}

/** Force fade if visuals are interrupted (early continue, scene transition, destroyed sprites). */
export function scheduleDiceFireDestroySoundSafetyFade(
  scene: Scene,
  fireSound: Phaser.Sound.BaseSound,
  maxDurationMs: number,
): void {
  scene.time.delayedCall(maxDurationMs, () => {
    fadeOutDiceFireDestroySound(scene, fireSound);
  });
}

export function diceFireDestroySoundMaxMs(
  count: number,
  options: { firstDelayMs?: number; staggerMs?: number } = {},
): number {
  if (count <= 0) return 0;
  const firstDelayMs = options.firstDelayMs ?? 0;
  const staggerMs = options.staggerMs ?? 0;
  const lastStartMs = firstDelayMs + (count - 1) * staggerMs;
  return lastStartMs + FIRE_BUILDUP_MS + FIRE_SHRINK_MS + FIRE_SOUND_FADE_MS + 200;
}

/** Fire + spark destroy visual for a single die sprite (caller destroys the sprite). */
export function playDiceFireDestroyVisual(scene: Scene, sprite: DiceSprite): Promise<void> {
  ensureAuraTextures(scene);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

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

    scene.time.delayedCall(FIRE_BUILDUP_MS + FIRE_SHRINK_MS + 50, finish);

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
        finish();
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
  const fireSound = startDiceFireDestroySound(scene, 1.2);
  scheduleDiceFireDestroySoundSafetyFade(scene, fireSound, diceFireDestroySoundMaxMs(sprites.length));

  return Promise.all(sprites.map((sprite) => playDiceFireDestroyVisual(scene, sprite))).then(() => {
    fadeOutDiceFireDestroySound(scene, fireSound, () => {
      scene.sound.play('sfx_slice1', { volume: 0.65 });
    });
  });
}
