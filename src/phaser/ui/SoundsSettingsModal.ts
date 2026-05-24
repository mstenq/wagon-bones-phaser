// ─── SoundsSettingsModal ───
// Music and SFX enable toggles with volume sliders; persisted via AudioPreferences.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getAudioPreferences, setAudioPreferences, type AudioPreferences } from '../../game/AudioPreferences';
import { applyBackgroundMusicPreferences } from '../BackgroundMusic';
import { Button } from './Button';
import { OptionsModal } from './OptionsModal';

const CHECK_HIT = 32;
const CHECK_DRAW = 22;
const SLIDER_TRACK_H = 8;
const SLIDER_HANDLE_R = 10;
const SLIDER_HIT_H = 36;

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

class VolumeSlider extends GameObjects.Container {
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

export class SoundsSettingsModal extends GameObjects.Container {
  private musicSlider!: VolumeSlider;
  private sfxSlider!: VolumeSlider;

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    const panelW = Math.min(width - 40, 420);
    const panelH = 430;
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;
    const labelX = panelX + 32;
    const controlRight = panelX + panelW - 32;
    const sliderWidth = panelW - 120;
    const sliderLeft = labelX + 8;

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
      .text(panelX + panelW / 2, panelY + 28, 'Sound Settings', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    const prefs = getAudioPreferences();

    this.buildSection(scene, {
      title: 'Background Music',
      sectionY: panelY + 64,
      labelX,
      controlRight,
      sliderLeft,
      sliderWidth,
      prefs,
      kind: 'music',
    });

    this.buildSection(scene, {
      title: 'Sound Effects',
      sectionY: panelY + 224,
      labelX,
      controlRight,
      sliderLeft,
      sliderWidth,
      prefs,
      kind: 'sfx',
    });

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

  /** Interactive controls added earlier can sit under labels; bump them above text. */
  private bringInteractiveToTop(): void {
    for (const child of this.list) {
      if (child instanceof ToggleCheckbox || child instanceof VolumeSlider || child instanceof Button) {
        this.bringToTop(child);
      }
    }
  }

  private buildSection(
    scene: Scene,
    opts: {
      title: string;
      sectionY: number;
      labelX: number;
      controlRight: number;
      sliderLeft: number;
      sliderWidth: number;
      prefs: AudioPreferences;
      kind: 'music' | 'sfx';
    },
  ): void {
    const { title, sectionY, labelX, controlRight, sliderLeft, sliderWidth, prefs, kind } = opts;
    const enabled = kind === 'music' ? prefs.musicEnabled : prefs.sfxEnabled;
    const volume = kind === 'music' ? prefs.musicVolume : prefs.sfxVolume;

    const header = scene.add.text(labelX, sectionY, title, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '18px',
      color: TEXT_COLORS.PRIMARY,
    });
    header.setOrigin(0, 0);
    this.add(header);

    const enabledRowY = sectionY + 34;
    const enabledLabel = scene.add.text(labelX, enabledRowY, 'Enabled', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '15px',
      color: TEXT_COLORS.MUTED,
    });
    enabledLabel.setOrigin(0, 0.5);
    this.add(enabledLabel);

    const checkbox = new ToggleCheckbox(scene, controlRight - CHECK_HIT / 2, enabledRowY).setChecked(enabled);
    checkbox.onChange((checked) => {
      const slider = kind === 'music' ? this.musicSlider : this.sfxSlider;
      slider.setEnabled(checked);
      this.updatePref(kind, { enabled: checked });
    });
    this.add(checkbox);

    const volumeLabelY = sectionY + 72;
    const volumeLabel = scene.add.text(labelX, volumeLabelY, 'Volume', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '15px',
      color: TEXT_COLORS.MUTED,
    });
    volumeLabel.setOrigin(0, 0);
    this.add(volumeLabel);

    const sliderY = volumeLabelY + 28;
    const slider = new VolumeSlider(scene, sliderLeft, sliderY, sliderWidth).setValue(volume).setEnabled(enabled);
    slider.onChange((value) => this.updatePref(kind, { volume: value }));
    this.add(slider);
    if (kind === 'music') this.musicSlider = slider;
    else this.sfxSlider = slider;
  }

  private updatePref(kind: 'music' | 'sfx', change: { enabled?: boolean; volume?: number }): void {
    const current = getAudioPreferences();
    const next: AudioPreferences = { ...current };

    if (kind === 'music') {
      if (change.enabled !== undefined) next.musicEnabled = change.enabled;
      if (change.volume !== undefined) next.musicVolume = change.volume;
    } else {
      if (change.enabled !== undefined) next.sfxEnabled = change.enabled;
      if (change.volume !== undefined) next.sfxVolume = change.volume;
    }

    setAudioPreferences(next);
    applyBackgroundMusicPreferences(this.scene);
  }
}
