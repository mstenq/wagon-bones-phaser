// ─── Shared horizontal drag-to-reorder ───
// Pointer session, velocity swing, nearest-slot reorder, sibling tweens, settle chain.

import * as Phaser from 'phaser';
import { ANIM } from '../../game/Constants';
import { createPointerDragSession, type PointerDragSession } from './pointerDragSession';

export type DragSlot = { x: number; y: number; rotation?: number };

type DraggableGameObject = Phaser.GameObjects.GameObject & { x: number };

export type HorizontalDragReorderConfig<T extends DraggableGameObject> = {
  scene: Phaser.Scene;
  getItems: () => T[];
  getSlotPositions: (count: number) => DragSlot[];
  canStart: (item: T, pointer: Phaser.Input.Pointer) => boolean;
  getPointerOffset: (item: T, pointer: Phaser.Input.Pointer) => { x: number; y: number };
  onBegin?: (item: T, startIndex: number) => void;
  onMoveItem: (
    item: T,
    pointer: Phaser.Input.Pointer,
    ctx: { offsetX: number; offsetY: number; swing: number },
  ) => void;
  onSiblingMove?: (item: T, index: number, slot: DragSlot) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onSettleStart?: (item: T, fromIndex: number, toIndex: number) => void;
  onSettleComplete?: (item: T, fromIndex: number, toIndex: number) => void;
  /** Called immediately when drag ends, before settle tween starts. */
  onDragEnd?: (item: T, fromIndex: number, toIndex: number) => void;
  getSettleSlot?: (item: T, index: number, count: number) => DragSlot;
  getSettleScale?: (item: T) => { scaleX: number; scaleY: number };
  /** Touch-only tap when pointer up without crossing drag threshold. */
  onTap?: (item: T, pointer: Phaser.Input.Pointer) => void;
  canTap?: () => boolean;
  /** Pointer up without drag (all pointer types). Takes precedence over onTap when set. */
  onReleaseWithoutDrag?: (item: T, pointer: Phaser.Input.Pointer) => void;
  siblingTweenDuration?: number;
  playSettleSound?: boolean | ((item: T) => void);
};

export type HorizontalDragReorder<T extends DraggableGameObject> = {
  wirePointerDown: (item: T, pointer: Phaser.Input.Pointer, trackTarget?: Phaser.GameObjects.GameObject | null) => void;
  stop: () => void;
  isDragging: () => boolean;
  wasDragging: () => boolean;
};

type SettleTweenStep = {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: string;
  onComplete?: Phaser.Types.Tweens.TweenBuilderConfig['onComplete'];
};

export function buildDragSettleTweens(
  slot: DragSlot,
  overshoot: number,
  scale: { scaleX: number; scaleY: number },
): SettleTweenStep[] {
  const baseRotation = slot.rotation ?? 0;
  const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

  return [
    {
      x: slot.x,
      y: slot.y,
      rotation: overshoot + baseRotation,
      scaleX: scale.scaleX,
      scaleY: scale.scaleY,
      duration: dur * 0.3,
      ease: 'Sine.easeOut',
    },
    {
      rotation: -overshoot * 0.4 + baseRotation,
      duration: dur * 0.25,
      ease: 'Sine.easeInOut',
    },
    {
      rotation: overshoot * 0.1 + baseRotation,
      duration: dur * 0.2,
      ease: 'Sine.easeInOut',
    },
    {
      rotation: baseRotation,
      duration: dur * 0.25,
      ease: 'Sine.easeIn',
    },
  ];
}

function findNearestSlotIndex(dragX: number, slots: DragSlot[]): number {
  let newIndex = 0;
  let minDist = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const dist = Math.abs(dragX - slots[i].x);
    if (dist < minDist) {
      minDist = dist;
      newIndex = i;
    }
  }
  return newIndex;
}

function defaultSiblingTween(
  scene: Phaser.Scene,
  item: Phaser.GameObjects.GameObject,
  slot: DragSlot,
  duration: number,
): void {
  scene.tweens.add({
    targets: item,
    x: slot.x,
    y: slot.y,
    rotation: slot.rotation ?? 0,
    duration,
    ease: 'Power2',
  });
}

export function createHorizontalDragReorder<T extends DraggableGameObject>(
  config: HorizontalDragReorderConfig<T>,
): HorizontalDragReorder<T> {
  let draggingItem: T | null = null;
  let dragStartIndex = -1;
  let offsetX = 0;
  let offsetY = 0;
  let prevX = 0;
  let velocityX = 0;
  let didDrag = false;

  const siblingDuration = config.siblingTweenDuration ?? 150;

  const updateVelocity = (pointer: Phaser.Input.Pointer): number => {
    const dx = pointer.worldX - prevX;
    velocityX = velocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
    prevX = pointer.worldX;
    return Phaser.Math.Clamp(
      velocityX * ANIM.CARD_DRAG_SWING_FACTOR,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );
  };

  const updateDrag = (item: T, pointer: Phaser.Input.Pointer): void => {
    if (!draggingItem) return;
    const list = config.getItems();
    if (list.length === 0) return;

    const swing = updateVelocity(pointer);
    config.onMoveItem(item, pointer, { offsetX, offsetY, swing });

    const slots = config.getSlotPositions(list.length);
    const newIndex = findNearestSlotIndex(draggingItem.x, slots);
    const currentIndex = list.indexOf(item);

    if (newIndex !== currentIndex) {
      list.splice(currentIndex, 1);
      list.splice(newIndex, 0, item);
      config.onReorder?.(currentIndex, newIndex);

      for (let i = 0; i < list.length; i++) {
        if (list[i] === item) continue;
        const slot = slots[i];
        if (config.onSiblingMove) {
          config.onSiblingMove(list[i], i, slot);
        } else {
          defaultSiblingTween(config.scene, list[i], slot, siblingDuration);
        }
      }
    }
  };

  const finishDrag = (item: T): void => {
    if (!draggingItem) return;

    const finalVelocity = velocityX;
    const fromIndex = dragStartIndex;
    draggingItem = null;
    velocityX = 0;
    dragStartIndex = -1;

    const list = config.getItems();
    const itemScene = (item as Phaser.GameObjects.GameObject).scene;
    const toIndex = list.indexOf(item);

    if (list.length === 0 || toIndex === -1 || !itemScene) {
      config.onDragEnd?.(item, fromIndex, toIndex);
      return;
    }

    config.onDragEnd?.(item, fromIndex, toIndex);

    const slots = config.getSlotPositions(list.length);
    const settleSlot = config.getSettleSlot?.(item, toIndex, list.length) ?? slots[toIndex];
    if (!settleSlot) {
      config.onSettleStart?.(item, fromIndex, toIndex);
      config.onSettleComplete?.(item, fromIndex, toIndex);
      return;
    }

    const scale = config.getSettleScale?.(item) ?? { scaleX: 1, scaleY: 1 };

    const overshoot = Phaser.Math.Clamp(
      finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );

    if (config.playSettleSound) {
      if (typeof config.playSettleSound === 'function') {
        config.playSettleSound(item);
      } else {
        config.scene.sound.play('sfx_dice_land', { volume: 0.2 });
      }
    }

    config.onSettleStart?.(item, fromIndex, toIndex);

    const settleTweens = buildDragSettleTweens(settleSlot, overshoot, scale);
    const lastTween = settleTweens[settleTweens.length - 1]!;
    const priorOnComplete = lastTween.onComplete;
    lastTween.onComplete = (tween, targets, ...rest) => {
      priorOnComplete?.(tween, targets, ...rest);
      config.onSettleComplete?.(item, fromIndex, toIndex);
    };

    config.scene.tweens.chain({
      targets: item,
      tweens: settleTweens,
    });
  };

  const sessionHandlers: Parameters<typeof createPointerDragSession<T>>[1] = {
    canStart: (item, pointer) => config.canStart(item, pointer),
    onPress: (item, pointer) => {
      didDrag = false;
      const offset = config.getPointerOffset(item, pointer);
      offsetX = offset.x;
      offsetY = offset.y;
      prevX = pointer.worldX;
      velocityX = 0;
    },
    onBeginDrag: (item) => {
      didDrag = true;
      draggingItem = item;
      dragStartIndex = config.getItems().indexOf(item);
      config.onBegin?.(item, dragStartIndex);
    },
    onDragMove: (item, pointer) => updateDrag(item, pointer),
    onDragEnd: (item) => finishDrag(item),
    onTap: (item, pointer) => {
      if (config.canTap && !config.canTap()) return;
      config.onTap?.(item, pointer);
    },
  };

  if (config.onReleaseWithoutDrag) {
    sessionHandlers.onReleaseWithoutDrag = (item, pointer) => {
      config.onReleaseWithoutDrag!(item, pointer);
    };
  }

  const session: PointerDragSession<T> = createPointerDragSession(config.scene, sessionHandlers);

  return {
    wirePointerDown(item, pointer, trackTarget) {
      didDrag = false;
      session.start(item, pointer, trackTarget ?? item);
    },
    stop() {
      session.stop();
      draggingItem = null;
      velocityX = 0;
      dragStartIndex = -1;
      didDrag = false;
    },
    isDragging: () => draggingItem !== null,
    wasDragging: () => didDrag,
  };
}
