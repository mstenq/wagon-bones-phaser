// ─── PreferencesSettingsModal ───
// Gameplay toggles; persisted via GameplayPreferences.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import {
  getGameplayPreferences,
  setGameplayPreferences,
  type GameplayPreferences,
} from '../../game/GameplayPreferences';
import { Button } from './Button';
import { OptionsModal } from './OptionsModal';

const CHECK_HIT = 32;
const CHECK_DRAW = 22;

class ToggleCheckbox extends GameObjects.Container {
  private box: GameObjects.Graphics;
  private check: GameObjects.Graphics;
  private hitZone: Phaser.GameObjects.Zone;
  private _checked = false;
  private onChangeCallback: ((checked: boolean) => void) | null = null;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y);

    this.box = scene.add.graphics();
    this.check = scene.add.graphics();
    this.hitZone = scene.add.zone(0, 0, CHECK_HIT, CHECK_HIT);

    this.add([this.box, this.check, this.hitZone]);

    this.box.disableInteractive();
    this.check.disableInteractive();

    this.hitZone.setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerdown', () => {
      this.setChecked(!this._checked);
      this.onChangeCallback?.(this._checked);
    });

    this.redraw();
  }

  onChange(cb: (checked: boolean) => void): this {
    this.onChangeCallback = cb;
    return this;
  }

  setChecked(checked: boolean): this {
    this._checked = checked;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const half = CHECK_DRAW / 2;
    this.box.clear();
    this.box.fillStyle(this._checked ? COLORS.SCORE_GREEN : COLORS.BTN_DEFAULT, 1);
    this.box.fillRoundedRect(-half, -half, CHECK_DRAW, CHECK_DRAW, 4);
    this.box.lineStyle(1, UI.MODAL_BORDER, 1);
    this.box.strokeRoundedRect(-half, -half, CHECK_DRAW, CHECK_DRAW, 4);

    this.check.clear();
    if (this._checked) {
      this.check.lineStyle(3, 0xffffff, 1);
      this.check.beginPath();
      this.check.moveTo(-6, 0);
      this.check.lineTo(-2, 5);
      this.check.lineTo(7, -6);
      this.check.strokePath();
    }
  }
}

export class PreferencesSettingsModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    const panelW = Math.min(width - 40, 420);
    const panelH = 280;
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;
    const labelX = panelX + 32;
    const controlRight = panelX + panelW - 32;

    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    this.add(panel);

    const title = scene.add
      .text(panelX + panelW / 2, panelY + 28, 'Preferences', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    const prefs = getGameplayPreferences();
    const rowY = panelY + 88;

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
      wordWrap: { width: panelW - 100 },
    });
    autoRollHint.setOrigin(0, 0);
    this.add(autoRollHint);

    const checkbox = new ToggleCheckbox(scene, controlRight - CHECK_HIT / 2, rowY).setChecked(prefs.autoRollFirstHand);
    checkbox.onChange((checked) => this.updatePref({ autoRollFirstHand: checked }));
    this.add(checkbox);

    const backBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 36, 'Back', 120, 34);
    backBtn.onClick(() => {
      this.destroy();
      new OptionsModal(scene, contentX, width, height);
    });
    this.add(backBtn);

    this.bringInteractiveToTop();

    this.setDepth(500);
    scene.add.existing(this);
  }

  private bringInteractiveToTop(): void {
    for (const child of this.list) {
      if (child instanceof ToggleCheckbox || child instanceof Button) {
        this.bringToTop(child);
      }
    }
  }

  private updatePref(change: Partial<GameplayPreferences>): void {
    const next: GameplayPreferences = { ...getGameplayPreferences(), ...change };
    setGameplayPreferences(next);
  }
}
