// ─── PreferencesSettingsModal ───
// Gameplay toggles; persisted via GameplayPreferences.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import {
  getGameplayPreferences,
  setGameplayPreferences,
  type GameplayPreferences,
} from '../../game/GameplayPreferences';
import { markAllTutorialsSeen, resetAllTutorials } from '../../game/TutorialPreferences';
import { Button } from './Button';
import { DiceSprite } from './DiceSprite';
import { TOGGLE_CHECKBOX_HIT, ToggleCheckbox } from './ToggleCheckbox';
import { bringModalInteractivesToTop, createModalBackButton, createModalShell, finalizeModal } from './modalShell';

export interface PreferencesSettingsModalOptions {
  onBack: () => void;
}

export class PreferencesSettingsModal extends GameObjects.Container {
  constructor(
    scene: Scene,
    contentX: number,
    width: number,
    height: number,
    options: PreferencesSettingsModalOptions,
    contentY = 0,
  ) {
    super(scene, 0, 0);

    const { layout, dim, panel, title } = createModalShell(scene, 'Preferences', {
      contentX,
      width,
      height,
      contentY,
      panelHeight: 500,
    });
    const { labelX, controlRight } = layout;

    this.add([dim, panel, title]);

    const prefs = getGameplayPreferences();
    const rowY = layout.panelY + 88;

    const autoRollLabel = scene.add.text(labelX, rowY, 'Auto Roll First Hand', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '16px',
      color: TEXT_COLORS.PRIMARY,
    });
    autoRollLabel.setOrigin(0, 0.5);
    this.add(autoRollLabel);

    const autoRollHint = scene.add.text(labelX, rowY + 22, 'Roll automatically at round start and each new day', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '13px',
      color: TEXT_COLORS.MUTED,
      wordWrap: { width: layout.panelW - 100 },
    });
    autoRollHint.setOrigin(0, 0);
    this.add(autoRollHint);

    const autoRollCheckbox = new ToggleCheckbox(scene, controlRight - TOGGLE_CHECKBOX_HIT / 2, rowY).setChecked(
      prefs.autoRollFirstHand,
    );
    autoRollCheckbox.onChange((checked) => this.updatePref({ autoRollFirstHand: checked }));
    this.add(autoRollCheckbox);

    const stickerRowY = rowY + 72;
    const stickerLabel = scene.add.text(labelX, stickerRowY, 'Stationary Dice Stickers', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '16px',
      color: TEXT_COLORS.PRIMARY,
    });
    stickerLabel.setOrigin(0, 0.5);
    this.add(stickerLabel);

    const stickerHint = scene.add.text(
      labelX,
      stickerRowY + 22,
      'Keep sticker icons fixed on the die instead of orbiting',
      {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: TEXT_COLORS.MUTED,
        wordWrap: { width: layout.panelW - 100 },
      },
    );
    stickerHint.setOrigin(0, 0);
    this.add(stickerHint);

    const stickerCheckbox = new ToggleCheckbox(scene, controlRight - TOGGLE_CHECKBOX_HIT / 2, stickerRowY).setChecked(
      prefs.stationaryStickers,
    );
    stickerCheckbox.onChange((checked) => this.updatePref({ stationaryStickers: checked }));
    this.add(stickerCheckbox);

    const tutorialRowY = stickerRowY + 88;
    const disableTutorialBtn = new Button(scene, layout.panelX + layout.panelW / 2, tutorialRowY, 'Disable Tutorial', {
      variant: 'secondary',
      width: layout.panelW - 64,
      height: 36,
    });
    disableTutorialBtn.onClick(() => markAllTutorialsSeen());
    this.add(disableTutorialBtn);

    const disableHint = scene.add.text(labelX, tutorialRowY + 28, 'Hide all tutorial messages', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '13px',
      color: TEXT_COLORS.MUTED,
    });
    disableHint.setOrigin(0, 0);
    this.add(disableHint);

    const resetRowY = tutorialRowY + 64;
    const resetTutorialBtn = new Button(scene, layout.panelX + layout.panelW / 2, resetRowY, 'Reset Tutorial', {
      variant: 'secondary',
      width: layout.panelW - 64,
      height: 36,
    });
    resetTutorialBtn.onClick(() => resetAllTutorials());
    this.add(resetTutorialBtn);

    const resetHint = scene.add.text(labelX, resetRowY + 28, 'Show tutorial messages again on your next run', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '13px',
      color: TEXT_COLORS.MUTED,
      wordWrap: { width: layout.panelW - 64 },
    });
    resetHint.setOrigin(0, 0);
    this.add(resetHint);

    const backBtn = createModalBackButton(scene, layout, () => {
      this.destroy();
      options.onBack();
    });
    this.add(backBtn);

    bringModalInteractivesToTop(this, ToggleCheckbox, Button);
    finalizeModal(this, scene);
  }

  private updatePref(change: Partial<GameplayPreferences>): void {
    const next: GameplayPreferences = { ...getGameplayPreferences(), ...change };
    setGameplayPreferences(next);
    if (change.stationaryStickers !== undefined) {
      DiceSprite.applyStickerPreferenceToAll();
    }
  }
}
