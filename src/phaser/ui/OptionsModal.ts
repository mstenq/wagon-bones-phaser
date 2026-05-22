// ─── OptionsModal ───
// Simple options modal with restart and return to menu.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { resetPlayerState } from '../../game/PlayerState';
import { Button } from './Button';
import { EquipmentCatalogModal } from './EquipmentCatalogModal';
import { SoundsSettingsModal } from './SoundsSettingsModal';
import { clearAutoSave } from '../AutoSaveManager';
import { exportGameFromScene, performLoadGame } from '../SaveLoadIO';

export class OptionsModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    // Dim background
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal panel
    const panelW = Math.min(width - 40, 380);
    const panelH = 460;
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add
      .text(panelX + panelW / 2, panelY + 28, 'Options', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    // Equipment catalog
    const equipmentBtn = new Button(scene, panelX + panelW / 2, panelY + 78, 'Equipment', panelW - 60, 40);
    equipmentBtn.onClick(() => {
      this.destroy();
      new EquipmentCatalogModal(scene);
    });
    this.add(equipmentBtn);

    // Sound settings
    const soundBtn = new Button(scene, panelX + panelW / 2, panelY + 128, 'Sound Settings', panelW - 60, 40);
    soundBtn.onClick(() => {
      this.destroy();
      new SoundsSettingsModal(scene, contentX, width, height);
    });
    this.add(soundBtn);

    // Export game state
    const exportBtn = new Button(scene, panelX + panelW / 2, panelY + 178, 'Export Game State', panelW - 60, 40);
    exportBtn.onClick(() => {
      exportGameFromScene(scene);
    });
    this.add(exportBtn);

    // Load game
    const loadBtn = new Button(scene, panelX + panelW / 2, panelY + 228, 'Load Game', panelW - 60, 40);
    loadBtn.onClick(() => {
      this.destroy();
      void performLoadGame(scene, { confirmOverwrite: true });
    });
    this.add(loadBtn);

    // New Run button
    const newRunBtn = new Button(scene, panelX + panelW / 2, panelY + 278, 'New Run', panelW - 60, 40);
    newRunBtn.onClick(() => {
      this.destroy();
      clearAutoSave();
      resetPlayerState();
      scene.scene.start('MainMenu', {});
    });
    this.add(newRunBtn);

    // Return to Main Menu button
    const menuBtn = new Button(scene, panelX + panelW / 2, panelY + 328, 'Main Menu', panelW - 60, 40);
    menuBtn.onClick(() => {
      this.destroy();
      scene.scene.start('MainMenu', {});
    });
    this.add(menuBtn);

    // Close button
    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    this.setDepth(500);
    scene.add.existing(this);
  }
}
