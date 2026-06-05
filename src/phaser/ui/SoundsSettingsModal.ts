// ─── SoundsSettingsModal ───
// Music and SFX enable toggles with volume sliders; persisted via AudioPreferences.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { getAudioPreferences, setAudioPreferences, type AudioPreferences } from '../../game/AudioPreferences';
import { applyBackgroundMusicPreferences } from '../BackgroundMusic';
import { Button } from './Button';
import { SliderControl } from './SliderControl';
import { TOGGLE_CHECKBOX_HIT, ToggleCheckbox } from './ToggleCheckbox';
import { bringModalInteractivesToTop, createModalBackButton, createModalShell, finalizeModal } from './modalShell';

export interface SoundsSettingsModalOptions {
  onBack: () => void;
}

export class SoundsSettingsModal extends GameObjects.Container {
  private musicSlider!: SliderControl;
  private sfxSlider!: SliderControl;

  constructor(
    scene: Scene,
    contentX: number,
    width: number,
    height: number,
    options: SoundsSettingsModalOptions,
    contentY = 0,
  ) {
    super(scene, 0, 0);

    const { layout, dim, panel, title } = createModalShell(scene, 'Sound Settings', {
      contentX,
      width,
      height,
      contentY,
      panelHeight: 430,
    });
    const { labelX, controlRight } = layout;
    const sliderWidth = layout.panelW - 120;
    const sliderLeft = labelX + 8;

    this.add([dim, panel, title]);

    const prefs = getAudioPreferences();

    this.buildSection(scene, {
      title: 'Background Music',
      sectionY: layout.panelY + 64,
      labelX,
      controlRight,
      sliderLeft,
      sliderWidth,
      prefs,
      kind: 'music',
    });

    this.buildSection(scene, {
      title: 'Sound Effects',
      sectionY: layout.panelY + 224,
      labelX,
      controlRight,
      sliderLeft,
      sliderWidth,
      prefs,
      kind: 'sfx',
    });

    const backBtn = createModalBackButton(scene, layout, () => {
      this.destroy();
      options.onBack();
    });
    this.add(backBtn);

    bringModalInteractivesToTop(this, ToggleCheckbox, SliderControl, Button);
    finalizeModal(this, scene);
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

    const checkbox = new ToggleCheckbox(scene, controlRight - TOGGLE_CHECKBOX_HIT / 2, enabledRowY).setChecked(enabled);
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
    const slider = new SliderControl(scene, sliderLeft, sliderY, sliderWidth).setValue(volume).setEnabled(enabled);
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
