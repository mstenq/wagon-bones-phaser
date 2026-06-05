// ─── catalogModal ───
// Shared dim/panel chrome, scroll list container, clipping bands, and scroll input
// for catalog-style modals (Equipment catalog, Boss test picker, …).

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { Button } from './Button';

export const CATALOG_MODAL_DEPTH = 500;
export const CATALOG_SCROLL_DEPTH = 501;
export const CATALOG_CLIP_DEPTH = 502;
export const CATALOG_CHROME_DEPTH = 503;
export const CATALOG_CLOSE_DEPTH = 504;

export interface CatalogPanelBounds {
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
}

export interface CatalogModalShellOptions {
  scene: Scene;
  parent: GameObjects.Container;
  screenW: number;
  screenH: number;
  /** Horizontal bounds for outer clip bands (defaults to full screen width). */
  clipX?: number;
  clipW?: number;
  panel: CatalogPanelBounds;
  title: string;
  subtitle?: string;
  titleFontSize?: string;
  titleY?: number;
  subtitleY?: number;
  /** Distance from panel top to list viewport top (default 64). */
  listTopOffset?: number;
  /** Distance from panel bottom to list viewport bottom (default 52). */
  listBottomOffset?: number;
  closeLabel?: string;
  closeBottomOffset?: number;
  onClose: () => void;
}

export interface CatalogModalShell {
  scrollContainer: GameObjects.Container;
  scrollAreaTop: number;
  scrollAreaH: number;
  listTop: number;
  listBottom: number;
  panel: CatalogPanelBounds;
  track: (obj: Phaser.GameObjects.GameObject) => void;
  setContentHeight: (contentHeight: number) => void;
  destroyManagedObjects: () => void;
}

export function createCatalogModalShell(options: CatalogModalShellOptions): CatalogModalShell {
  const {
    scene,
    parent,
    screenW,
    screenH,
    clipX = 0,
    clipW = screenW,
    panel,
    title,
    subtitle,
    titleFontSize = '22px',
    titleY = 24,
    subtitleY = 48,
    listTopOffset = 64,
    listBottomOffset = 52,
    closeLabel = 'Close',
    closeBottomOffset = 28,
    onClose,
  } = options;

  const { panelX, panelY, panelW, panelH } = panel;
  const sceneObjects: Phaser.GameObjects.GameObject[] = [];

  const track = (obj: Phaser.GameObjects.GameObject): void => {
    sceneObjects.push(obj);
  };

  const dim = scene.add.graphics();
  dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
  dim.fillRect(0, 0, screenW, screenH);
  dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, screenW, screenH), Phaser.Geom.Rectangle.Contains);
  dim.setDepth(CATALOG_MODAL_DEPTH);
  parent.add(dim);

  const panelGfx = scene.add.graphics();
  panelGfx.fillStyle(UI.MODAL_BG, 1);
  panelGfx.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
  panelGfx.lineStyle(2, UI.MODAL_BORDER, 1);
  panelGfx.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
  panelGfx.setDepth(CATALOG_MODAL_DEPTH);
  track(panelGfx);

  const titleText = scene.add
    .text(panelX + panelW / 2, panelY + titleY, title, {
      fontFamily: FONTS.HEADING,
      fontSize: titleFontSize,
      color: TEXT_COLORS.GOLD,
    })
    .setOrigin(0.5)
    .setDepth(CATALOG_CHROME_DEPTH);
  track(titleText);

  if (subtitle) {
    const subtitleText = scene.add
      .text(panelX + panelW / 2, panelY + subtitleY, subtitle, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5)
      .setDepth(CATALOG_CHROME_DEPTH);
    track(subtitleText);
  }

  const listTop = panelY + listTopOffset;
  const listBottom = panelY + panelH - listBottomOffset;
  const scrollAreaTop = listTop;
  const scrollAreaH = listBottom - listTop;

  const scrollContainer = scene.add.container(panelX + panelW / 2, listTop);
  scrollContainer.setDepth(CATALOG_SCROLL_DEPTH);
  track(scrollContainer);

  const clipTop = scene.add.graphics();
  clipTop.fillStyle(UI.MODAL_BG, 1);
  clipTop.fillRect(clipX, 0, clipW, listTop);
  clipTop.setDepth(CATALOG_CLIP_DEPTH);
  track(clipTop);

  const clipBottom = scene.add.graphics();
  clipBottom.fillStyle(UI.MODAL_BG, 1);
  clipBottom.fillRect(clipX, listBottom, clipW, screenH - listBottom);
  clipBottom.setDepth(CATALOG_CLIP_DEPTH);
  track(clipBottom);

  const headerCover = scene.add.graphics();
  headerCover.fillStyle(UI.MODAL_BG, 1);
  headerCover.fillRect(panelX, panelY, panelW, listTop - panelY);
  headerCover.setDepth(CATALOG_CHROME_DEPTH);
  track(headerCover);

  const footerCover = scene.add.graphics();
  footerCover.fillStyle(UI.MODAL_BG, 1);
  footerCover.fillRect(panelX, listBottom, panelW, panelY + panelH - listBottom);
  footerCover.setDepth(CATALOG_CHROME_DEPTH);
  track(footerCover);

  const panelFrame = scene.add.graphics();
  panelFrame.lineStyle(2, UI.MODAL_BORDER, 1);
  panelFrame.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
  panelFrame.setDepth(CATALOG_CHROME_DEPTH);
  track(panelFrame);

  const listFrame = scene.add.graphics();
  listFrame.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
  listFrame.strokeRect(panelX + 12, listTop, panelW - 24, scrollAreaH);
  listFrame.setDepth(CATALOG_CHROME_DEPTH);
  track(listFrame);

  const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - closeBottomOffset, closeLabel, 120, 32);
  closeBtn.setDepth(CATALOG_CLOSE_DEPTH);
  closeBtn.onClick(onClose);
  track(closeBtn);

  let scrollHandlers: CatalogScrollHandlers | undefined;

  const setContentHeight = (contentHeight: number): void => {
    if (contentHeight <= scrollAreaH) {
      const offset = (scrollAreaH - contentHeight) / 2;
      scrollContainer.y = listTop + offset;
    }

    if (contentHeight > scrollAreaH) {
      scrollHandlers = bindCatalogScrollInput(scene, {
        panelX,
        panelW,
        listTop,
        listBottom,
        scrollAreaTop,
        scrollAreaH,
        contentHeight,
        scrollContainer,
        getIsDragging: () => scrollState.isDragging,
        setIsDragging: (value) => {
          scrollState.isDragging = value;
        },
        getDragStartY: () => scrollState.dragStartY,
        setDragStartY: (value) => {
          scrollState.dragStartY = value;
        },
        getScrollStartY: () => scrollState.scrollStartY,
        setScrollStartY: (value) => {
          scrollState.scrollStartY = value;
        },
      });
    }
  };

  const scrollState = {
    isDragging: false,
    dragStartY: 0,
    scrollStartY: 0,
  };

  const destroyManagedObjects = (): void => {
    if (scrollHandlers) {
      removeCatalogScrollInput(scene, scrollHandlers);
      scrollHandlers = undefined;
    }
    for (const obj of sceneObjects) {
      obj.destroy();
    }
    sceneObjects.length = 0;
  };

  return {
    scrollContainer,
    scrollAreaTop,
    scrollAreaH,
    listTop,
    listBottom,
    panel,
    track,
    setContentHeight,
    destroyManagedObjects,
  };
}

interface CatalogScrollBindings {
  panelX: number;
  panelW: number;
  listTop: number;
  listBottom: number;
  scrollAreaTop: number;
  scrollAreaH: number;
  contentHeight: number;
  scrollContainer: Phaser.GameObjects.Container;
  getIsDragging: () => boolean;
  setIsDragging: (value: boolean) => void;
  getDragStartY: () => number;
  setDragStartY: (value: number) => void;
  getScrollStartY: () => number;
  setScrollStartY: (value: number) => void;
}

interface CatalogScrollHandlers {
  wheel: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ) => void;
  pointerDown: (pointer: Phaser.Input.Pointer) => void;
  pointerMove: (pointer: Phaser.Input.Pointer) => void;
  pointerUp: () => void;
}

function bindCatalogScrollInput(scene: Scene, bindings: CatalogScrollBindings): CatalogScrollHandlers {
  const doScroll = (dy: number): void => {
    const newY = bindings.scrollContainer.y - dy * 0.5;
    bindings.scrollContainer.y = Phaser.Math.Clamp(
      newY,
      bindings.scrollAreaTop + bindings.scrollAreaH - bindings.contentHeight,
      bindings.scrollAreaTop,
    );
  };

  const handlers: CatalogScrollHandlers = {
    wheel: (_pointer, _gos, _dx, dy) => {
      doScroll(dy);
    },
    pointerDown: (pointer) => {
      if (pointer.x < bindings.panelX || pointer.x > bindings.panelX + bindings.panelW) return;
      if (pointer.y < bindings.listTop || pointer.y > bindings.listBottom) return;
      bindings.setIsDragging(true);
      bindings.setDragStartY(pointer.y);
      bindings.setScrollStartY(bindings.scrollContainer.y);
    },
    pointerMove: (pointer) => {
      if (!bindings.getIsDragging()) return;
      const dy = pointer.y - bindings.getDragStartY();
      bindings.scrollContainer.y = Phaser.Math.Clamp(
        bindings.getScrollStartY() + dy,
        bindings.scrollAreaTop + bindings.scrollAreaH - bindings.contentHeight,
        bindings.scrollAreaTop,
      );
    },
    pointerUp: () => {
      bindings.setIsDragging(false);
    },
  };

  scene.input.on('wheel', handlers.wheel);
  scene.input.on('pointerdown', handlers.pointerDown);
  scene.input.on('pointermove', handlers.pointerMove);
  scene.input.on('pointerup', handlers.pointerUp);

  return handlers;
}

function removeCatalogScrollInput(scene: Scene, handlers: CatalogScrollHandlers): void {
  scene.input.off('wheel', handlers.wheel);
  scene.input.off('pointerdown', handlers.pointerDown);
  scene.input.off('pointermove', handlers.pointerMove);
  scene.input.off('pointerup', handlers.pointerUp);
}

export function finalizeCatalogModal(container: GameObjects.Container, scene: Scene): void {
  container.setDepth(CATALOG_MODAL_DEPTH);
  scene.add.existing(container);
}
