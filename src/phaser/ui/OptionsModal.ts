// ─── OptionsModal ───
// Simple options modal with settings and return to menu.

import { GameObjects, Scene } from 'phaser';
import { isDevMode } from '../../game/DevMode';
import { ScoreAnimTimingsModal } from '../scenes/dev/ScoreAnimTimingsModal';
import { Button } from './Button';
import { BossTestModal } from './BossTestModal';
import { EquipmentCatalogModal } from './EquipmentCatalogModal';
import { SoundsSettingsModal } from './SoundsSettingsModal';
import { PreferencesSettingsModal } from './PreferencesSettingsModal';
import { exportGameFromScene, exportPreviousAutoSaveFromStorage, performLoadGame } from '../SaveLoadIO';
import { createModalShell, finalizeModal, wireModalBackdropDismiss } from './modalShell';
import { createScrollableViewport, type ScrollableViewportHandle } from './ScrollableViewport';

const PANEL_H = 480;
const LIST_TOP_OFFSET = 56;
const LIST_BOTTOM_OFFSET = 48;
const LIST_INSET = 12;
const BTN_H = 40;
const BTN_GAP = 10;
const CONTENT_PAD_TOP = 4;

type MenuEntry = { label: string; onClick: () => void };

export class OptionsModal extends GameObjects.Container {
  private scrollViewport: ScrollableViewportHandle | null = null;

  constructor(scene: Scene, contentX: number, width: number, height: number, contentY = 0) {
    super(scene, 0, 0);

    const { layout, dim, panel, title } = createModalShell(scene, 'Options', {
      contentX,
      width,
      height,
      contentY,
      panelHeight: PANEL_H,
      panelMaxWidth: 380,
    });
    const { panelX, panelY, panelW, panelH } = layout;

    const close = () => this.destroy();
    const panelBlocker = wireModalBackdropDismiss(dim, close, layout, scene);
    this.add([dim, panelBlocker, panel, title]);

    const openOptions = () => new OptionsModal(scene, contentX, width, height, contentY);
    const btnW = panelW - 60;

    const menuEntries: MenuEntry[] = [
      {
        label: 'Equipment',
        onClick: () => {
          this.destroy();
          new EquipmentCatalogModal(scene);
        },
      },
      {
        label: 'Sound Settings',
        onClick: () => {
          this.destroy();
          new SoundsSettingsModal(scene, contentX, width, height, { onBack: openOptions }, contentY);
        },
      },
      {
        label: 'Preferences',
        onClick: () => {
          this.destroy();
          new PreferencesSettingsModal(scene, contentX, width, height, { onBack: openOptions }, contentY);
        },
      },
      {
        label: 'Score Animation',
        onClick: () => {
          this.destroy();
          new ScoreAnimTimingsModal(scene, contentX, width, height, { onBack: openOptions }, contentY);
        },
      },
      {
        label: 'Export Game State',
        onClick: () => exportGameFromScene(scene),
      },
      {
        label: 'Load Game',
        onClick: () => {
          this.destroy();
          void performLoadGame(scene, { confirmOverwrite: true });
        },
      },
      {
        label: 'Main Menu',
        onClick: () => {
          this.destroy();
          scene.scene.start('MainMenu', {});
        },
      },
    ];

    if (isDevMode()) {
      menuEntries.push({
        label: 'Export Previous Game State (Debug)',
        onClick: () => exportPreviousAutoSaveFromStorage(),
      });
      menuEntries.push({
        label: 'Test Boss',
        onClick: () => {
          this.destroy();
          new BossTestModal(scene, contentX, width, height, contentY);
        },
      });
    }

    const listTop = panelY + LIST_TOP_OFFSET;
    const listBottom = panelY + panelH - LIST_BOTTOM_OFFSET;
    const scrollAreaH = listBottom - listTop;
    const viewportX = panelX + LIST_INSET;
    const viewportW = panelW - LIST_INSET * 2;

    this.scrollViewport = createScrollableViewport({
      scene,
      x: viewportX,
      y: listTop,
      width: viewportW,
      height: scrollAreaH,
      contentCenterX: panelX + panelW / 2,
    });
    this.add(this.scrollViewport.root);

    let layoutY = CONTENT_PAD_TOP + BTN_H / 2;
    for (const entry of menuEntries) {
      const btn = new Button(scene, 0, layoutY, entry.label, { variant: 'secondary', width: btnW, height: BTN_H });
      btn.onClick(entry.onClick);
      this.scrollViewport.content.add(btn);
      layoutY += BTN_H + BTN_GAP;
    }
    this.scrollViewport.setContentHeight(layoutY + CONTENT_PAD_TOP);

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', {
      variant: 'secondary',
      size: 'sm',
      width: 120,
    });
    closeBtn.onClick(close);
    this.add(closeBtn);

    this.once('destroy', () => {
      this.scrollViewport?.destroy();
      this.scrollViewport = null;
    });

    finalizeModal(this, scene);
  }
}
