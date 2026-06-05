// ─── OptionsModal ───
// Simple options modal with restart and return to menu.

import { GameObjects, Scene } from 'phaser';
import { resetAllGameStores } from '../../game/store';
import { Button } from './Button';
import { EquipmentCatalogModal } from './EquipmentCatalogModal';
import { SoundsSettingsModal } from './SoundsSettingsModal';
import { PreferencesSettingsModal } from './PreferencesSettingsModal';
import { clearAutoSave } from '../AutoSaveManager';
import { exportGameFromScene, exportPreviousAutoSaveFromStorage, performLoadGame } from '../SaveLoadIO';
import { createModalShell, finalizeModal } from './modalShell';

export class OptionsModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    const { layout, dim, panel, title } = createModalShell(scene, 'Options', {
      contentX,
      width,
      height,
      panelHeight: 560,
      panelMaxWidth: 380,
    });
    const { panelX, panelY, panelW, panelH } = layout;

    this.add([dim, panel, title]);

    const equipmentBtn = new Button(scene, panelX + panelW / 2, panelY + 78, 'Equipment', panelW - 60, 40);
    equipmentBtn.onClick(() => {
      this.destroy();
      new EquipmentCatalogModal(scene);
    });
    this.add(equipmentBtn);

    const soundBtn = new Button(scene, panelX + panelW / 2, panelY + 128, 'Sound Settings', panelW - 60, 40);
    soundBtn.onClick(() => {
      this.destroy();
      new SoundsSettingsModal(scene, contentX, width, height, {
        onBack: () => new OptionsModal(scene, contentX, width, height),
      });
    });
    this.add(soundBtn);

    const prefsBtn = new Button(scene, panelX + panelW / 2, panelY + 178, 'Preferences', panelW - 60, 40);
    prefsBtn.onClick(() => {
      this.destroy();
      new PreferencesSettingsModal(scene, contentX, width, height, {
        onBack: () => new OptionsModal(scene, contentX, width, height),
      });
    });
    this.add(prefsBtn);

    const exportBtn = new Button(scene, panelX + panelW / 2, panelY + 228, 'Export Game State', panelW - 60, 40);
    exportBtn.onClick(() => {
      exportGameFromScene(scene);
    });
    this.add(exportBtn);

    const exportPrevBtn = new Button(
      scene,
      panelX + panelW / 2,
      panelY + 278,
      'Export Previous Game State (Debug)',
      panelW - 60,
      40,
    );
    exportPrevBtn.onClick(() => {
      exportPreviousAutoSaveFromStorage();
    });
    this.add(exportPrevBtn);

    const loadBtn = new Button(scene, panelX + panelW / 2, panelY + 328, 'Load Game', panelW - 60, 40);
    loadBtn.onClick(() => {
      this.destroy();
      void performLoadGame(scene, { confirmOverwrite: true });
    });
    this.add(loadBtn);

    const newRunBtn = new Button(scene, panelX + panelW / 2, panelY + 378, 'New Run', panelW - 60, 40);
    newRunBtn.onClick(() => {
      this.destroy();
      clearAutoSave();
      resetAllGameStores();
      scene.scene.start('MainMenu', {});
    });
    this.add(newRunBtn);

    const menuBtn = new Button(scene, panelX + panelW / 2, panelY + 428, 'Main Menu', panelW - 60, 40);
    menuBtn.onClick(() => {
      this.destroy();
      scene.scene.start('MainMenu', {});
    });
    this.add(menuBtn);

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    finalizeModal(this, scene);
  }
}
