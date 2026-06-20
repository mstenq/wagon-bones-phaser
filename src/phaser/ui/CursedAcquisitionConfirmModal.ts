// ─── CursedAcquisitionConfirmModal ───
// Blocking confirmation before acquiring cursed equipment in shop or booster packs.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import type { EquipmentInstance } from '../../game/ItemsSystem';
import { isEquipmentCursed } from '../../game/ItemsSystem';
import { Button } from './Button';
import { addModifierBadgeImage } from './ModifierAssets';
import { computeLayoutMetricsFromScene } from './SceneLayout';
import {
  bringModalInteractivesToTop,
  createModalPanelBlocker,
  createModalShell,
  finalizeModal,
  openRunModalSingleton,
} from './modalShell';

const MODAL_KEY = 'cursed-acquisition-confirm';
const MODAL_DEPTH = 2000;
const PANEL_MAX_WIDTH = 440;
const PANEL_HEIGHT = 280;
const BODY_TOP = 100;
const BODY_SIDE_INSET = 64;
const BUTTON_H = 34;
const BUTTON_W = 130;
const BUTTON_GAP = 16;
const BUTTON_BOTTOM_OFFSET = 32;

const BODY_TEXT =
  'This item is Cursed. Once acquired, it cannot be sold, removed, or destroyed — by shop, trail events, consumables, or equipment effects — for the rest of this run.';

export function needsCursedAcquisitionConfirm(instance: EquipmentInstance | undefined): boolean {
  return !!instance && isEquipmentCursed(instance);
}

export interface CursedAcquisitionConfirmOptions {
  confirmLabel?: string;
}

/** Show a blocking cursed-equipment confirmation; resolves true if the player confirms. */
export function showCursedAcquisitionConfirmModal(
  scene: Scene,
  options: CursedAcquisitionConfirmOptions = {},
): Promise<boolean> {
  const confirmLabel = options.confirmLabel ?? 'Buy Anyway';

  return new Promise((resolve) => {
    const modal = openRunModalSingleton(scene, MODAL_KEY, () => {
      const { modalRegion } = computeLayoutMetricsFromScene(scene);
      const container = new GameObjects.Container(scene, 0, 0);

      const { layout, dim, panel, title } = createModalShell(scene, 'Cursed Equipment', {
        contentX: modalRegion.x,
        width: modalRegion.w,
        height: modalRegion.h,
        contentY: modalRegion.y,
        panelHeight: PANEL_HEIGHT,
        panelMaxWidth: PANEL_MAX_WIDTH,
      });
      title.setColor(TEXT_COLORS.ERROR_RED);

      const panelBlocker = createModalPanelBlocker(scene, layout);
      container.add([dim, panelBlocker, panel, title]);

      const badgeSize = UI.MODIFIER_BADGE_SIZE * 1.4;
      const badgeContainer = scene.add.container(layout.panelX + layout.panelW / 2, layout.panelY + 70);
      addModifierBadgeImage(scene, badgeContainer, 'cursed', badgeSize);
      container.add(badgeContainer);

      const body = scene.add.text(layout.labelX, layout.panelY + BODY_TOP, BODY_TEXT, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
        wordWrap: { width: layout.panelW - BODY_SIDE_INSET },
        lineSpacing: 4,
      });
      body.setOrigin(0, 0);
      container.add(body);

      const buttonRowY = layout.panelY + PANEL_HEIGHT - BUTTON_BOTTOM_OFFSET - BUTTON_H / 2;
      const close = (confirmed: boolean) => {
        container.destroy();
        resolve(confirmed);
      };

      const cancelBtn = new Button(
        scene,
        layout.panelX + layout.panelW / 2 - BUTTON_W / 2 - BUTTON_GAP / 2,
        buttonRowY,
        'Cancel',
        { variant: 'secondary', width: BUTTON_W, height: BUTTON_H },
      );
      cancelBtn.onClick(() => close(false));
      container.add(cancelBtn);

      const confirmBtn = new Button(
        scene,
        layout.panelX + layout.panelW / 2 + BUTTON_W / 2 + BUTTON_GAP / 2,
        buttonRowY,
        confirmLabel,
        { variant: 'danger', width: BUTTON_W, height: BUTTON_H },
      );
      confirmBtn.onClick(() => close(true));
      container.add(confirmBtn);

      dim.on('pointerdown', () => close(false));

      bringModalInteractivesToTop(container, Button);
      finalizeModal(container, scene, MODAL_DEPTH);
      return container;
    });

    if (!modal) {
      resolve(false);
    }
  });
}
