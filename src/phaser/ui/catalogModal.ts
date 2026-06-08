// ─── catalogModal ───
// Shared scroll list container, masking, and scroll input for catalog-style
// modals (Equipment catalog, Boss test picker, …). Shell chrome comes from modalShell.ts.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import {
  createModalActionButton,
  createModalDim,
  createModalPanel,
  createModalPanelStroke,
  createModalTitle,
} from './modalShell';
import { createScrollableViewport, type ScrollableViewportHandle } from './ScrollableViewport';

export const CATALOG_MODAL_DEPTH = 500;
export const CATALOG_SCROLL_DEPTH = 501;
export const CATALOG_CHROME_DEPTH = 503;
export const CATALOG_CLOSE_DEPTH = 504;

const LIST_FRAME_INSET = 12;

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
  /** Top of modal region (portrait top bar offset). Default 0. */
  contentY?: number;
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
    contentY = 0,
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

  const dim = createModalDim(scene, screenH, screenW, contentY);
  dim.setDepth(CATALOG_MODAL_DEPTH);
  parent.add(dim);

  const panelGfx = createModalPanel(scene, panel);
  panelGfx.setDepth(CATALOG_MODAL_DEPTH);
  track(panelGfx);

  const titleText = createModalTitle(scene, panel, title, { fontSize: titleFontSize, titleY });
  titleText.setDepth(CATALOG_CHROME_DEPTH);
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
  const viewportX = panelX + LIST_FRAME_INSET;
  const viewportW = panelW - LIST_FRAME_INSET * 2;

  let viewport: ScrollableViewportHandle | undefined;

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

  viewport = createScrollableViewport({
    scene,
    x: viewportX,
    y: listTop,
    width: viewportW,
    height: scrollAreaH,
    contentCenterX: panelX + panelW / 2,
    depth: CATALOG_SCROLL_DEPTH,
  });
  parent.add(viewport.root);

  const panelFrame = createModalPanelStroke(scene, panel);
  panelFrame.setDepth(CATALOG_CHROME_DEPTH);
  track(panelFrame);

  const listFrame = scene.add.graphics();
  listFrame.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
  listFrame.strokeRect(viewportX, listTop, viewportW, scrollAreaH);
  listFrame.setDepth(CATALOG_CHROME_DEPTH);
  track(listFrame);

  const closeBtn = createModalActionButton(scene, panel, onClose, {
    label: closeLabel,
    bottomOffset: closeBottomOffset,
    buttonHeight: 32,
  });
  closeBtn.setDepth(CATALOG_CLOSE_DEPTH);
  track(closeBtn);

  const setContentHeight = (contentHeight: number): void => {
    viewport?.setContentHeight(contentHeight);
  };

  const destroyManagedObjects = (): void => {
    viewport?.destroy();
    viewport = undefined;
    for (const obj of sceneObjects) {
      obj.destroy();
    }
    sceneObjects.length = 0;
  };

  return {
    scrollContainer: viewport.content,
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

export function finalizeCatalogModal(container: GameObjects.Container, scene: Scene): void {
  container.setDepth(CATALOG_MODAL_DEPTH);
  scene.add.existing(container);
}
