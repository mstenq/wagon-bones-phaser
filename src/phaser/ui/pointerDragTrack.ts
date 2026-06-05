// ─── Touch-safe manual pointer drag tracking ───
// Phaser setDraggable is unreliable on touch. Scene-level move/up handlers plus
// a target game-object move listener and pointerupoutside cover mobile reliably.

import type Phaser from 'phaser';

export const POINTER_DRAG_DISTANCE = 8;
export const POINTER_DRAG_DISTANCE_TOUCH = 4;

export function getPointerDragDistance(pointer: Phaser.Input.Pointer): number {
  return pointer.wasTouch ? POINTER_DRAG_DISTANCE_TOUCH : POINTER_DRAG_DISTANCE;
}

export type PointerDragTrackHandlers = {
  onMove: (pointer: Phaser.Input.Pointer) => void;
  onEnd: (pointer: Phaser.Input.Pointer) => void;
};

/** Attach move/end listeners on scene input and optionally on the pressed target (for touch). */
export function attachPointerDragTrack(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject | null,
  handlers: PointerDragTrackHandlers,
): () => void {
  const { onMove, onEnd } = handlers;

  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onEnd);
  scene.input.on('pointerupoutside', onEnd);
  if (target) {
    target.on('pointermove', onMove);
  }

  return () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onEnd);
    scene.input.off('pointerupoutside', onEnd);
    if (target) {
      target.off('pointermove', onMove);
    }
  };
}
