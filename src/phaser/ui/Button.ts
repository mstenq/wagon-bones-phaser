// ─── Button ───
// Reusable Phaser text button with background rect, hover/click states.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';

const DEFAULT_BG = COLORS.BTN_DEFAULT;
const HOVER_BG = COLORS.BTN_HOVER;
const DISABLED_BG = COLORS.BTN_DISABLED;
const TEXT_COLOR = TEXT_COLORS.PRIMARY;
const DISABLED_TEXT = TEXT_COLORS.DISABLED;

const CORNER_BADGE_FONT_SIZE = 11;
const CORNER_BADGE_PAD_X = 4;
const CORNER_BADGE_PAD_Y = 2;
const CORNER_BADGE_MIN = 16;

export class Button extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private bgTile: GameObjects.TileSprite | null = null;
  private textured = false;
  private _borderColor = 0x000000;
  private _borderAlpha = 0.5;
  private label: GameObjects.Text;
  private icon: GameObjects.Image | null = null;
  private cornerBadge: GameObjects.Container | null = null;
  private cornerBadgeBg: GameObjects.Graphics | null = null;
  private cornerBadgeLabel: GameObjects.Text | null = null;
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
        fontFamily: FONTS.TITLE,
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
    this.icon?.setAlpha(enabled ? 1 : 0.45);
    return this;
  }

  setColor(bg: number, hover: number): this {
    this._bgColor = bg;
    this._hoverColor = hover;
    if (this._enabled) this.drawBg(bg);
    return this;
  }

  /**
   * Render a tileable texture as the button background (e.g. TEXTURES.PANEL_GRAY).
   * The texture sits below a thin border; hover/disabled states overlay a tint.
   */
  setTextureBackground(textureKey: string, borderColor = 0x000000, borderAlpha = 0.5): this {
    if (!this.scene.textures.exists(textureKey)) return this;
    this.textured = true;
    this._borderColor = borderColor;
    this._borderAlpha = borderAlpha;

    if (this.bgTile) this.bgTile.destroy();
    this.bgTile = this.scene.add.tileSprite(0, 0, this._width, this._height, textureKey).setOrigin(0.5);

    // Texture below the border/overlay graphics so the border renders on top.
    // (Phaser 4 geometry masks are Canvas-only; the rounded border hides corners.)
    this.addAt(this.bgTile, 0);
    this.drawBg(this._enabled ? this._bgColor : DISABLED_BG);
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

  setIcon(textureKey: string, size = 20): this {
    this.label.setVisible(false);
    if (this.icon) {
      this.icon.destroy();
    }
    this.icon = this.scene.add.image(0, 0, textureKey).setOrigin(0.5);
    this.icon.setDisplaySize(size, size);
    this.add(this.icon);
    return this;
  }

  /** Small count pill on the top-right; pass null to hide. */
  setCornerBadge(value: number | null, bgColor: number = COLORS.ERROR_RED): this {
    if (value === null) {
      this.cornerBadge?.setVisible(false);
      return this;
    }

    if (!this.cornerBadge) {
      this.cornerBadgeBg = this.scene.add.graphics();
      this.cornerBadgeLabel = this.scene.add
        .text(0, 0, '', {
          fontFamily: FONTS.TITLE,
          fontSize: `${CORNER_BADGE_FONT_SIZE}px`,
          color: TEXT_COLORS.PRIMARY,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.cornerBadge = this.scene.add.container(0, 0, [this.cornerBadgeBg, this.cornerBadgeLabel]);
      this.add(this.cornerBadge);
    }

    this.cornerBadgeLabel!.setText(String(value));
    const badgeW = Math.max(CORNER_BADGE_MIN, this.cornerBadgeLabel!.width + CORNER_BADGE_PAD_X * 2);
    const badgeH = Math.max(CORNER_BADGE_MIN, this.cornerBadgeLabel!.height + CORNER_BADGE_PAD_Y * 2);
    const inset = 2;
    this.cornerBadge!.setPosition(this._width / 2 - badgeW / 2 + inset, -this._height / 2 + badgeH / 2 - inset);

    this.cornerBadgeBg!.clear();
    this.cornerBadgeBg!.fillStyle(bgColor, 1);
    this.cornerBadgeBg!.fillRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);

    this.cornerBadge!.setVisible(true);
    this.cornerBadge!.setAlpha(1);
    return this;
  }

  private drawBg(color: number): void {
    this.bg.clear();
    const x = -this._width / 2;
    const y = -this._height / 2;

    if (this.textured) {
      // Texture supplies the fill; overlay a tint for hover (lighten) / disabled (darken).
      if (color === this._hoverColor) {
        this.bg.fillStyle(0xffffff, 0.12);
        this.bg.fillRoundedRect(x, y, this._width, this._height, UI.BTN_RADIUS);
      } else if (color === DISABLED_BG) {
        this.bg.fillStyle(0x000000, 0.45);
        this.bg.fillRoundedRect(x, y, this._width, this._height, UI.BTN_RADIUS);
      }
      this.bg.lineStyle(1, this._borderColor, this._borderAlpha);
      this.bg.strokeRoundedRect(x, y, this._width, this._height, UI.BTN_RADIUS);
      return;
    }

    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(x, y, this._width, this._height, 8);
    this.bg.lineStyle(1, 0x888888, 0.5);
    this.bg.strokeRoundedRect(x, y, this._width, this._height, 8);
  }
}
