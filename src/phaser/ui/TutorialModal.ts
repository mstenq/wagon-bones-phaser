// ─── Tutorial popup modal ───

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { computeLayoutMetricsFromScene } from './SceneLayout';
import { Button } from './Button';
import {
  bringModalInteractivesToTop,
  createModalActionButton,
  createModalPanelBlocker,
  createModalShell,
  finalizeModal,
} from './modalShell';

const TUTORIAL_DEPTH = 2000;
const PANEL_MAX_WIDTH = 460;
const BODY_TOP = 72;
const BODY_SIDE_INSET = 64;
const BUTTON_BOTTOM_OFFSET = 28;
const BUTTON_HEIGHT = 38;
const BODY_BUTTON_GAP = 20;
const MIN_PANEL_HEIGHT = 280;
const PANEL_VERTICAL_MARGIN = 32;

function measureTutorialBodyHeight(scene: Scene, message: string, wordWrapWidth: number): number {
  const probe = scene.add.text(0, 0, message, {
    fontFamily: FONTS.PRIMARY,
    fontSize: '16px',
    wordWrap: { width: wordWrapWidth },
    lineSpacing: 4,
  });
  const textH = probe.height;
  probe.destroy();
  return textH;
}

function computeTutorialPanelHeight(
  scene: Scene,
  message: string,
  modalHeight: number,
  panelWidth: number,
): number {
  const wordWrapWidth = panelWidth - BODY_SIDE_INSET;
  const textH = measureTutorialBodyHeight(scene, message, wordWrapWidth);
  const contentH = BODY_TOP + textH + BODY_BUTTON_GAP + BUTTON_HEIGHT + BUTTON_BOTTOM_OFFSET;
  const maxH = modalHeight - PANEL_VERTICAL_MARGIN;
  return Math.min(maxH, Math.max(MIN_PANEL_HEIGHT, contentH));
}

/** Show a blocking tutorial modal; resolves when the player dismisses it. */
export function showTutorialModal(scene: Scene, message: string): Promise<void> {
  return new Promise((resolve) => {
    const metrics = computeLayoutMetricsFromScene(scene);
    const { modalRegion } = metrics;

    const panelWidth = Math.min(modalRegion.w - 40, PANEL_MAX_WIDTH);
    const panelHeight = computeTutorialPanelHeight(scene, message, modalRegion.h, panelWidth);

    const container = new GameObjects.Container(scene, 0, 0);
    const { layout, dim, panel, title } = createModalShell(scene, 'Trail Guide', {
      contentX: modalRegion.x,
      width: modalRegion.w,
      height: modalRegion.h,
      contentY: modalRegion.y,
      panelHeight,
      panelMaxWidth: PANEL_MAX_WIDTH,
    });

    const panelBlocker = createModalPanelBlocker(scene, layout);
    container.add([dim, panelBlocker, panel, title]);

    const body = scene.add.text(layout.labelX, layout.panelY + BODY_TOP, message, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '16px',
      color: TEXT_COLORS.PRIMARY,
      wordWrap: { width: layout.panelW - BODY_SIDE_INSET },
      lineSpacing: 4,
    });
    body.setOrigin(0, 0);
    container.add(body);

    const gotItBtn = createModalActionButton(
      scene,
      layout,
      () => {
        container.destroy();
        resolve();
      },
      { label: 'Got it', bottomOffset: BUTTON_BOTTOM_OFFSET, buttonWidth: 140, buttonHeight: BUTTON_HEIGHT },
    );
    container.add(gotItBtn);

    bringModalInteractivesToTop(container, Button);
    finalizeModal(container, scene, TUTORIAL_DEPTH);
  });
}
