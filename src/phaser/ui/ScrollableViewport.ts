// ─── ScrollableViewport ───
// Masked vertical scroll region with viewport-scoped input and optional kinetic coast.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { createPointerDragSession } from './pointerDragSession';

export interface ScrollableViewportOptions {
  scene: Scene;
  /** Top-left x of the visible scroll window. */
  x: number;
  /** Top y of the visible scroll window. */
  y: number;
  width: number;
  height: number;
  /** Horizontal anchor for content children (defaults to x + width / 2). */
  contentCenterX?: number;
  kinetic?: boolean;
  wheel?: boolean;
  depth?: number;
}

export interface ScrollableViewportHandle {
  /** Fixed clip root — add to parent container or scene. */
  root: GameObjects.Container;
  /** Add scrollable children here (center-x coordinates). */
  content: GameObjects.Container;
  setContentHeight: (contentHeight: number) => void;
  setInputEnabled: (enabled: boolean) => void;
  scrollTo: (scrollOffset: number, durationMs?: number) => void;
  destroy: () => void;
}

type ScrollTweenTarget = { offset: number };
const SCROLL_DRAG_TARGET = Symbol('scrollable-viewport-drag');

function pointerInRect(pointer: Phaser.Input.Pointer, x: number, y: number, width: number, height: number): boolean {
  const px = pointer.worldX;
  const py = pointer.worldY;
  return px >= x && px <= x + width && py >= y && py <= y + height;
}

function resolvePointerTrackTarget(scene: Scene, pointer: Phaser.Input.Pointer): Phaser.GameObjects.GameObject | null {
  const hits = scene.input.hitTestPointer(pointer);
  return hits.length > 0 ? hits[0] : null;
}

export function createScrollableViewport(options: ScrollableViewportOptions): ScrollableViewportHandle {
  const {
    scene,
    x: viewportX,
    y: viewportY,
    width: viewportW,
    height: viewportH,
    contentCenterX = viewportX + viewportW / 2,
    kinetic = true,
    wheel = true,
    depth,
  } = options;

  const viewportCenterX = viewportX + viewportW / 2;
  const viewportCenterY = viewportY + viewportH / 2;

  const clipRoot = scene.add.container(contentCenterX, viewportY);
  if (depth !== undefined) {
    clipRoot.setDepth(depth);
  }

  const content = scene.add.container(0, 0);
  const touchPad = scene.add.rectangle(0, viewportH / 2, viewportW, viewportH, 0x000000, 0);
  touchPad.setInteractive({ useHandCursor: false });
  clipRoot.add(touchPad);
  clipRoot.add(content);

  const maskShape = scene.add.rectangle(viewportCenterX, viewportCenterY, viewportW, viewportH, 0xffffff);
  maskShape.setVisible(false);
  if (depth !== undefined) {
    maskShape.setDepth(depth);
  }

  clipRoot.enableFilters();
  clipRoot.filters!.internal.addMask(maskShape);

  let contentHeight = 0;
  let scrollOffset = 0;
  let maxScroll = 0;
  let scrollable = false;
  let inputEnabled = true;

  let velocityY = 0;
  let amplitudeY = 0;
  let targetOffset = 0;
  let autoScroll = false;
  let kineticTimestamp = 0;
  let scrollTween: Phaser.Tweens.Tween | null = null;

  let dragPointerId: number | null = null;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let dragLastY = 0;
  let dragLastTime = 0;

  const clampOffset = (offset: number): number => Phaser.Math.Clamp(offset, 0, maxScroll);

  const applyOffset = (offset: number): void => {
    scrollOffset = clampOffset(offset);
    if (!scrollable) {
      content.y = (viewportH - contentHeight) / 2;
      return;
    }
    content.y = -scrollOffset;
  };

  const pointerInViewport = (pointer: Phaser.Input.Pointer): boolean =>
    pointerInRect(pointer, viewportX, viewportY, viewportW, viewportH);

  const stopKinetic = (): void => {
    autoScroll = false;
    amplitudeY = 0;
    velocityY = 0;
  };

  const stopScrollTween = (): void => {
    if (scrollTween) {
      scrollTween.stop();
      scrollTween = null;
    }
  };

  const beginKineticCoast = (): void => {
    if (!kinetic || !scrollable) return;
    if (Math.abs(velocityY) < UI.SCROLL_KINETIC_MIN_VELOCITY) return;

    amplitudeY = UI.SCROLL_KINETIC_AMPLITUDE_FACTOR * velocityY;
    targetOffset = clampOffset(scrollOffset - amplitudeY);
    amplitudeY = scrollOffset - targetOffset;
    autoScroll = amplitudeY !== 0;
    kineticTimestamp = Date.now();
  };

  const dragSession = createPointerDragSession<typeof SCROLL_DRAG_TARGET>(scene, {
    onBeginDrag: () => {},
    onDragMove: (_target, pointer) => {
      if (dragPointerId !== null && pointer.id !== dragPointerId) return;
      const dy = pointer.worldY - dragStartY;
      applyOffset(dragStartOffset - dy);

      const now = Date.now();
      const elapsed = now - dragLastTime;
      if (elapsed > 0) {
        const delta = pointer.worldY - dragLastY;
        velocityY = 0.8 * ((1000 * delta) / (1 + elapsed)) + 0.2 * velocityY;
      }
      dragLastY = pointer.worldY;
      dragLastTime = now;
    },
    onDragEnd: () => {
      dragPointerId = null;
      beginKineticCoast();
    },
  });

  const beginScroll = (pointer: Phaser.Input.Pointer, trackTarget: Phaser.GameObjects.GameObject | null): void => {
    if (!inputEnabled || !scrollable || !pointerInViewport(pointer)) return;
    if (dragSession.isActive()) return;

    stopScrollTween();
    stopKinetic();

    dragPointerId = pointer.id;
    dragStartY = pointer.worldY;
    dragStartOffset = scrollOffset;
    dragLastY = pointer.worldY;
    dragLastTime = Date.now();
    velocityY = 0;

    dragSession.start(SCROLL_DRAG_TARGET, pointer, trackTarget);
  };

  const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    beginScroll(pointer, resolvePointerTrackTarget(scene, pointer));
  };

  const onTouchPadDown = (pointer: Phaser.Input.Pointer): void => {
    beginScroll(pointer, touchPad);
  };

  const onWheel = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (!inputEnabled || !wheel || !scrollable) return;
    if (!pointerInViewport(pointer)) return;

    stopScrollTween();
    stopKinetic();
    applyOffset(scrollOffset + deltaY * UI.SCROLL_WHEEL_SCALE);
  };

  const onUpdate = (): void => {
    if (!autoScroll || !scrollable) return;

    const elapsed = Date.now() - kineticTimestamp;
    const delta = amplitudeY * Math.exp(-elapsed / UI.SCROLL_KINETIC_TIME_MS);

    if (Math.abs(delta) > 0.5) {
      applyOffset(targetOffset + delta);
      return;
    }

    applyOffset(targetOffset);
    stopKinetic();
  };

  scene.input.on('wheel', onWheel);
  scene.input.on('pointerdown', onPointerDown);
  touchPad.on('pointerdown', onTouchPadDown);
  scene.events.on('update', onUpdate);

  const setContentHeight = (height: number): void => {
    contentHeight = height;
    maxScroll = Math.max(0, contentHeight - viewportH);
    scrollable = contentHeight > viewportH;

    stopScrollTween();
    stopKinetic();
    dragSession.stop();
    dragPointerId = null;

    if (!scrollable) {
      applyOffset(0);
    } else {
      applyOffset(Math.min(scrollOffset, maxScroll));
    }
  };

  const scrollTo = (offset: number, durationMs = 1000): void => {
    if (!scrollable) return;

    stopKinetic();
    stopScrollTween();

    const target = clampOffset(offset);
    if (durationMs <= 0) {
      applyOffset(target);
      return;
    }

    const tweenTarget: ScrollTweenTarget = { offset: scrollOffset };
    scrollTween = scene.tweens.add({
      targets: tweenTarget,
      offset: target,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        applyOffset(tweenTarget.offset);
      },
      onComplete: () => {
        scrollTween = null;
      },
    });
  };

  const setInputEnabled = (enabled: boolean): void => {
    inputEnabled = enabled;
    if (!enabled) {
      dragSession.stop();
      dragPointerId = null;
      stopKinetic();
    }
  };

  const destroy = (): void => {
    stopScrollTween();
    stopKinetic();
    dragSession.stop();
    dragPointerId = null;

    scene.input.off('wheel', onWheel);
    scene.input.off('pointerdown', onPointerDown);
    touchPad.off('pointerdown', onTouchPadDown);
    scene.events.off('update', onUpdate);

    maskShape.destroy();
    clipRoot.destroy();
  };

  return {
    root: clipRoot,
    content,
    setContentHeight,
    setInputEnabled,
    scrollTo,
    destroy,
  };
}
