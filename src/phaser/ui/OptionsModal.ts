// ─── OptionsModal ───
// Simple options modal with restart and return to menu.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { resetPlayerState } from '../../game/PlayerState';
import { Button } from './Button';
import { EquipmentCatalogModal } from './EquipmentCatalogModal';

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
    const panelH = 310;
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
    const equipmentBtn = new Button(scene, panelX + panelW / 2, panelY + 88, 'Equipment', panelW - 60, 40);
    equipmentBtn.onClick(() => {
      this.destroy();
      new EquipmentCatalogModal(scene);
    });
    this.add(equipmentBtn);

    // New Run button
    const newRunBtn = new Button(scene, panelX + panelW / 2, panelY + 138, 'New Run', panelW - 60, 40);
    newRunBtn.onClick(() => {
      this.destroy();
      resetPlayerState();
      scene.scene.start('MainMenu');
    });
    this.add(newRunBtn);

    // Return to Main Menu button
    const menuBtn = new Button(scene, panelX + panelW / 2, panelY + 188, 'Main Menu', panelW - 60, 40);
    menuBtn.onClick(() => {
      this.destroy();
      scene.scene.start('MainMenu');
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
