// ─── SliderControl ───
// Horizontal slider with fill track, draggable handle, and percentage label.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';

const SLIDER_TRACK_H = 8;
const SLIDER_HANDLE_R = 10;
const SLIDER_HIT_H = 36;

export class SliderControl extends GameObjects.Container {
  private track: GameObjects.Graphics;
  private fill: GameObjects.Graphics;
  private handle: GameObjects.Graphics;
  private valueLabel: GameObjects.Text;
  private hitZone: Phaser.GameObjects.Zone;
  private trackWidth: number;
  private _value = 1;
  private _enabled = true;
  private dragging = false;
  private onChangeCallback: ((value: number) => void) | null = null;
  private readonly onPointerMove: (pointer: Phaser.Input.Pointer) => void;
  private readonly onPointerUp: () => void;

  constructor(scene: Scene, x: number, y: number, trackWidth: number) {
    super(scene, x, y);
    this.trackWidth = trackWidth;

    this.track = scene.add.graphics();
    this.fill = scene.add.graphics();
    this.handle = scene.add.graphics();
    this.hitZone = scene.add.zone(trackWidth / 2, 0, trackWidth, SLIDER_HIT_H);
    this.valueLabel = scene.add.text(trackWidth + 12, 0, '100%', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '14px',
      color: TEXT_COLORS.MUTED,
    });
    this.valueLabel.setOrigin(0, 0.5);

    this.add([this.track, this.fill, this.handle, this.hitZone, this.valueLabel]);

    this.track.disableInteractive();
    this.fill.disableInteractive();
    this.handle.disableInteractive();
    this.valueLabel.disableInteractive();

    this.hitZone.setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this._enabled) return;
      this.dragging = true;
      this.setValueFromPointer(pointer);
    });

    this.onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !this._enabled) return;
      this.setValueFromPointer(pointer);
    };
    this.onPointerUp = () => {
      this.dragging = false;
    };

    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);
    this.once('destroy', () => {
      scene.input.off('pointermove', this.onPointerMove);
      scene.input.off('pointerup', this.onPointerUp);
    });

    this.redraw();
  }

  onChange(cb: (value: number) => void): this {
    this.onChangeCallback = cb;
    return this;
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    if (enabled) {
      this.hitZone.setInteractive({ useHandCursor: true });
    } else {
      this.hitZone.disableInteractive();
      this.dragging = false;
    }
    this.redraw();
    return this;
  }

  setValue(value: number): this {
    this._value = Phaser.Math.Clamp(value, 0, 1);
    this.redraw();
    return this;
  }

  private setValueFromPointer(pointer: Phaser.Input.Pointer): void {
    const bounds = this.hitZone.getBounds();
    const next = Phaser.Math.Clamp((pointer.worldX - bounds.left) / bounds.width, 0, 1);
    const changed = Math.abs(next - this._value) >= 0.001;
    this._value = next;
    this.redraw();
    if (changed) this.onChangeCallback?.(this._value);
  }

  private redraw(): void {
    const handleX = this._value * this.trackWidth;

    this.track.clear();
    this.track.fillStyle(COLORS.BTN_DISABLED, 1);
    this.track.fillRoundedRect(0, -SLIDER_TRACK_H / 2, this.trackWidth, SLIDER_TRACK_H, 4);

    this.fill.clear();
    if (this._value > 0) {
      this.fill.fillStyle(COLORS.SCORE_GREEN, 1);
      this.fill.fillRoundedRect(0, -SLIDER_TRACK_H / 2, this._value * this.trackWidth, SLIDER_TRACK_H, 4);
    }

    this.handle.clear();
    this.handle.fillStyle(this._enabled ? COLORS.BTN_HOVER : COLORS.BTN_DISABLED, 1);
    this.handle.fillCircle(handleX, 0, SLIDER_HANDLE_R);
    this.handle.lineStyle(1, 0x888888, 0.6);
    this.handle.strokeCircle(handleX, 0, SLIDER_HANDLE_R);

    this.valueLabel.setText(`${Math.round(this._value * 100)}%`);
  }
}
