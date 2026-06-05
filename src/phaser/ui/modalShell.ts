// ─── modalShell ───
// Shared dim background, panel, title, and layout helpers for centered modals.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { Button } from './Button';

export interface ModalPanelLayout {
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  labelX: number;
  controlRight: number;
}

export interface ModalShellOptions {
  contentX: number;
  width: number;
  height: number;
  panelHeight: number;
  panelMaxWidth?: number;
  panelWidthInset?: number;
}

export interface ModalShellChrome {
  layout: ModalPanelLayout;
  dim: GameObjects.Graphics;
  panel: GameObjects.Graphics;
  title: GameObjects.Text;
}

export function computeModalPanelLayout(options: ModalShellOptions): ModalPanelLayout {
  const { contentX, width, height, panelHeight, panelMaxWidth = 420, panelWidthInset = 40 } = options;
  const panelW = Math.min(width - panelWidthInset, panelMaxWidth);
  const panelH = panelHeight;
  const panelX = contentX + (width - panelW) / 2;
  const panelY = (height - panelH) / 2;
  const labelX = panelX + 32;
  const controlRight = panelX + panelW - 32;
  return { panelX, panelY, panelW, panelH, labelX, controlRight };
}

export function createModalDim(scene: Scene, height: number, width?: number): GameObjects.Graphics {
  const dimWidth = width ?? scene.scale.width;
  const dim = scene.add.graphics();
  dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
  dim.fillRect(0, 0, dimWidth, height);
  dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, dimWidth, height), Phaser.Geom.Rectangle.Contains);
  return dim;
}

export function createModalPanel(
  scene: Scene,
  layout: Pick<ModalPanelLayout, 'panelX' | 'panelY' | 'panelW' | 'panelH'>,
): GameObjects.Graphics {
  const { panelX, panelY, panelW, panelH } = layout;
  const panel = scene.add.graphics();
  panel.fillStyle(UI.MODAL_BG, 1);
  panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
  strokeModalPanelBorder(panel, layout);
  return panel;
}

/** Stroke-only panel border for redraw above scroll covers. */
export function strokeModalPanelBorder(
  graphics: GameObjects.Graphics,
  layout: Pick<ModalPanelLayout, 'panelX' | 'panelY' | 'panelW' | 'panelH'>,
): void {
  const { panelX, panelY, panelW, panelH } = layout;
  graphics.lineStyle(2, UI.MODAL_BORDER, 1);
  graphics.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
}

export function createModalPanelStroke(
  scene: Scene,
  layout: Pick<ModalPanelLayout, 'panelX' | 'panelY' | 'panelW' | 'panelH'>,
): GameObjects.Graphics {
  const panel = scene.add.graphics();
  strokeModalPanelBorder(panel, layout);
  return panel;
}

export interface ModalTitleOptions {
  fontSize?: string;
  titleY?: number;
}

export function createModalTitle(
  scene: Scene,
  layout: Pick<ModalPanelLayout, 'panelX' | 'panelY' | 'panelW'>,
  titleText: string,
  options?: ModalTitleOptions,
): GameObjects.Text {
  const { panelX, panelY, panelW } = layout;
  const fontSize = options?.fontSize ?? '24px';
  const titleY = options?.titleY ?? 28;
  return scene.add
    .text(panelX + panelW / 2, panelY + titleY, titleText, {
      fontFamily: FONTS.HEADING,
      fontSize,
      color: TEXT_COLORS.GOLD,
    })
    .setOrigin(0.5);
}

export function createModalShell(scene: Scene, titleText: string, options: ModalShellOptions): ModalShellChrome {
  const layout = computeModalPanelLayout(options);
  return {
    layout,
    dim: createModalDim(scene, options.height),
    panel: createModalPanel(scene, layout),
    title: createModalTitle(scene, layout, titleText),
  };
}

export interface ModalActionButtonOptions {
  label?: string;
  bottomOffset?: number;
  buttonWidth?: number;
  buttonHeight?: number;
}

export function createModalActionButton(
  scene: Scene,
  layout: Pick<ModalPanelLayout, 'panelX' | 'panelY' | 'panelW' | 'panelH'>,
  onClick: () => void,
  options?: ModalActionButtonOptions,
): Button {
  const label = options?.label ?? 'Back';
  const bottomOffset = options?.bottomOffset ?? 36;
  const buttonWidth = options?.buttonWidth ?? 120;
  const buttonHeight = options?.buttonHeight ?? 34;
  const btn = new Button(
    scene,
    layout.panelX + layout.panelW / 2,
    layout.panelY + layout.panelH - bottomOffset,
    label,
    buttonWidth,
    buttonHeight,
  );
  btn.onClick(onClick);
  return btn;
}

export function createModalBackButton(
  scene: Scene,
  layout: ModalPanelLayout,
  onBack: () => void,
  bottomOffset = 36,
): Button {
  return createModalActionButton(scene, layout, onBack, { label: 'Back', bottomOffset });
}

export function finalizeModal(container: GameObjects.Container, scene: Scene, depth = 500): void {
  container.setDepth(depth);
  scene.add.existing(container);
}

/** Bump interactive controls above labels drawn earlier in the same container. */
export function bringModalInteractivesToTop(
  container: GameObjects.Container,
  ...types: Array<new (...args: never[]) => GameObjects.GameObject>
): void {
  for (const child of container.list) {
    if (types.some((type) => child instanceof type)) {
      container.bringToTop(child);
    }
  }
}
