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

/** Show a blocking tutorial modal; resolves when the player dismisses it. */
export function showTutorialModal(scene: Scene, message: string): Promise<void> {
  return new Promise((resolve) => {
    const metrics = computeLayoutMetricsFromScene(scene);
    const { modalRegion } = metrics;

    const container = new GameObjects.Container(scene, 0, 0);
    const { layout, dim, panel, title } = createModalShell(scene, 'Trail Guide', {
      contentX: modalRegion.x,
      width: modalRegion.w,
      height: modalRegion.h,
      contentY: modalRegion.y,
      panelHeight: 220,
      panelMaxWidth: 460,
    });

    const panelBlocker = createModalPanelBlocker(scene, layout);
    container.add([dim, panelBlocker, panel, title]);

    const body = scene.add.text(layout.labelX, layout.panelY + 72, message, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '16px',
      color: TEXT_COLORS.PRIMARY,
      wordWrap: { width: layout.panelW - 64 },
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
      { label: 'Got it', bottomOffset: 28, buttonWidth: 140, buttonHeight: 38 },
    );
    container.add(gotItBtn);

    bringModalInteractivesToTop(container, Button);
    finalizeModal(container, scene, TUTORIAL_DEPTH);
  });
}
