// ─── Touch-safe pointer drag session ───
// Candidate → threshold → drag lifecycle with touch tap fallback on pointer up.

import type Phaser from 'phaser';
import { attachPointerDragTrack, getPointerDragDistance } from './pointerDragTrack';

export type PointerDragSessionHandlers<T> = {
  canStart?: (target: T, pointer: Phaser.Input.Pointer) => boolean;
  /** Called immediately on pointer down, before tracking begins. */
  onPress?: (target: T, pointer: Phaser.Input.Pointer) => void;
  onBeginDrag: (target: T, pointer: Phaser.Input.Pointer) => void;
  onDragMove: (target: T, pointer: Phaser.Input.Pointer) => void;
  onDragEnd: (target: T, pointer: Phaser.Input.Pointer) => void;
  /** Touch-only tap when pointer up without crossing drag threshold. */
  onTap?: (target: T, pointer: Phaser.Input.Pointer) => void;
};

export type PointerDragSession<T> = {
  start: (target: T, pointer: Phaser.Input.Pointer, trackTarget?: Phaser.GameObjects.GameObject | null) => void;
  stop: () => void;
  isDragging: () => boolean;
  isActive: () => boolean;
};

export function createPointerDragSession<T>(
  scene: Phaser.Scene,
  handlers: PointerDragSessionHandlers<T>,
): PointerDragSession<T> {
  let candidate: T | null = null;
  let dragging: T | null = null;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let detach: (() => void) | null = null;

  const stopTracking = () => {
    if (detach) {
      detach();
      detach = null;
    }
  };

  const onMove = (pointer: Phaser.Input.Pointer) => {
    if (pointerId !== null && pointer.id !== pointerId) return;

    if (!dragging && candidate) {
      const dx = pointer.worldX - startX;
      const dy = pointer.worldY - startY;
      if (Math.hypot(dx, dy) < getPointerDragDistance(pointer)) return;
      dragging = candidate;
      candidate = null;
      handlers.onBeginDrag(dragging, pointer);
    }

    if (dragging) {
      handlers.onDragMove(dragging, pointer);
    }
  };

  const onEnd = (pointer: Phaser.Input.Pointer) => {
    if (pointerId !== null && pointer.id !== pointerId) return;

    const tapTarget = candidate;

    if (dragging) {
      const dragTarget = dragging;
      dragging = null;
      handlers.onDragEnd(dragTarget, pointer);
    } else if (tapTarget && pointer.wasTouch && handlers.onTap) {
      handlers.onTap(tapTarget, pointer);
    }

    candidate = null;
    pointerId = null;
    stopTracking();
  };

  const session: PointerDragSession<T> = {
    start(target, pointer, trackTarget = null) {
      session.stop();
      if (handlers.canStart && !handlers.canStart(target, pointer)) return;

      candidate = target;
      pointerId = pointer.id;
      startX = pointer.worldX;
      startY = pointer.worldY;

      handlers.onPress?.(target, pointer);

      detach = attachPointerDragTrack(scene, trackTarget, { onMove, onEnd });
    },
    stop() {
      candidate = null;
      dragging = null;
      pointerId = null;
      stopTracking();
    },
    isDragging: () => dragging !== null,
    isActive: () => candidate !== null || dragging !== null,
  };

  return session;
}
