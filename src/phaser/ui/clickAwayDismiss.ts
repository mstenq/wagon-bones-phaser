// ─── Click-away dismiss ───
// Delayed scene-level pointerdown handler that dismisses UI when clicking outside.

import type Phaser from 'phaser';

export interface ClickAwayDismissOptions {
  delayMs?: number;
  isInside: (hitObjects: Phaser.GameObjects.GameObject[], pointer: Phaser.Input.Pointer) => boolean;
  onDismiss: () => void;
}

export function hitIncludesObjectOrChild(
  hitObjects: Phaser.GameObjects.GameObject[],
  target: Phaser.GameObjects.GameObject | null,
): boolean {
  if (!target) return false;
  if (hitObjects.includes(target)) return true;
  for (const go of hitObjects) {
    if (go.parentContainer === target) return true;
  }
  return false;
}

export function installClickAwayDismiss(scene: Phaser.Scene, options: ClickAwayDismissOptions): () => void {
  const delayMs = options.delayMs ?? 50;
  let handler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  let delayEvent: Phaser.Time.TimerEvent | null = null;

  const cleanup = () => {
    if (delayEvent) {
      delayEvent.remove();
      delayEvent = null;
    }
    if (handler) {
      scene.input.off('pointerdown', handler);
      handler = null;
    }
  };

  delayEvent = scene.time.delayedCall(delayMs, () => {
    delayEvent = null;
    handler = (pointer: Phaser.Input.Pointer) => {
      const hitObjects = scene.input.hitTestPointer(pointer);
      if (options.isInside(hitObjects, pointer)) return;
      options.onDismiss();
    };
    scene.input.on('pointerdown', handler);
  });

  return cleanup;
}
