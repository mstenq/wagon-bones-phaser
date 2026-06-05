// ─── ToggleCheckbox ───
// Checkbox control with pointer hit zone and onChange callback.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../game/Constants';

export const TOGGLE_CHECKBOX_HIT = 32;
export const TOGGLE_CHECKBOX_DRAW = 22;

export class ToggleCheckbox extends GameObjects.Container {
  private box: GameObjects.Graphics;
  private check: GameObjects.Graphics;
  private hitZone: Phaser.GameObjects.Zone;
  private _checked = false;
  private onChangeCallback: ((checked: boolean) => void) | null = null;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y);

    this.box = scene.add.graphics();
    this.check = scene.add.graphics();
    this.hitZone = scene.add.zone(0, 0, TOGGLE_CHECKBOX_HIT, TOGGLE_CHECKBOX_HIT);

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
    const half = TOGGLE_CHECKBOX_DRAW / 2;
    this.box.clear();
    this.box.fillStyle(this._checked ? COLORS.SCORE_GREEN : COLORS.BTN_DEFAULT, 1);
    this.box.fillRoundedRect(-half, -half, TOGGLE_CHECKBOX_DRAW, TOGGLE_CHECKBOX_DRAW, 4);
    this.box.lineStyle(1, UI.MODAL_BORDER, 1);
    this.box.strokeRoundedRect(-half, -half, TOGGLE_CHECKBOX_DRAW, TOGGLE_CHECKBOX_DRAW, 4);

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
