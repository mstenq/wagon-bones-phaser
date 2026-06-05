// ─── Button ───
// Reusable Phaser text button with background rect, hover/click states.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS } from '../../game/Constants';

const DEFAULT_BG = COLORS.BTN_DEFAULT;
const HOVER_BG = COLORS.BTN_HOVER;
const DISABLED_BG = COLORS.BTN_DISABLED;
const TEXT_COLOR = TEXT_COLORS.PRIMARY;
const DISABLED_TEXT = TEXT_COLORS.DISABLED;

export class Button extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private label: GameObjects.Text;
  private _enabled: boolean = true;
  private _width: number;
  private _height: number;
  private onClickCallback: (() => void) | null = null;
  private _bgColor: number = DEFAULT_BG;
  private _hoverColor: number = HOVER_BG;

  constructor(scene: Scene, x: number, y: number, text: string, width = 160, height = 44) {
    super(scene, x, y);
    this._width = width;
    this._height = height;

    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: TEXT_COLOR,
        align: 'center',
      })
      .setOrigin(0.5);

    this.add([this.bg, this.label]);
    this.setSize(width, height);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);

    this.on('pointerover', () => {
      if (this._enabled) this.drawBg(this._hoverColor);
    });
    this.on('pointerout', () => {
      if (this._enabled) this.drawBg(this._bgColor);
    });
    this.on('pointerdown', () => {
      if (this._enabled && this.onClickCallback) {
        if (this.scene.sound?.get('sfx_button') || this.scene.cache?.audio?.exists('sfx_button')) {
          this.scene.sound.play('sfx_button', { volume: 0.4 });
        }
        this.onClickCallback();
      }
    });

    this.drawBg(DEFAULT_BG);
    scene.add.existing(this);
  }

  onClick(cb: () => void): this {
    this.onClickCallback = cb;
    return this;
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.drawBg(enabled ? this._bgColor : DISABLED_BG);
    this.label.setColor(enabled ? TEXT_COLOR : DISABLED_TEXT);
    return this;
  }

  setColor(bg: number, hover: number): this {
    this._bgColor = bg;
    this._hoverColor = hover;
    if (this._enabled) this.drawBg(bg);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setLabelFontSize(size: number | string): this {
    this.label.setFontSize(size);
    return this;
  }

  private drawBg(color: number): void {
    this.bg.clear();
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-this._width / 2, -this._height / 2, this._width, this._height, 8);
    this.bg.lineStyle(1, 0x888888, 0.5);
    this.bg.strokeRoundedRect(-this._width / 2, -this._height / 2, this._width, this._height, 8);
  }
}
