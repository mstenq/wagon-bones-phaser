// ─── Score animation timings modal ───

import { GameObjects, Scene } from 'phaser';
import {
  applyScoreAnimSpeedPreset,
  SCORE_ANIM_SPEED_PRESETS,
  SCORE_ANIM_SPEED_PRESET_LABELS,
  type ScoreAnimSpeedPreset,
} from '../../../game/ScoreAnimTimings';
import { Button } from '../../ui/Button';
import { createModalBackButton, createModalShell, finalizeModal } from '../../ui/modalShell';
import { ScoreAnimTimingsPanel } from './scoreAnimTimingsPanel';

export interface ScoreAnimTimingsModalOptions {
  onBack: () => void;
}

const PRESET_BTN_H = 34;
const PRESET_ROW_GAP = 8;
/** Space reserved below the timings panel for gap + Back button. */
const FOOTER_H = 68;
const TITLE_Y = 28;
const TITLE_FONT_HALF = 12;
const TITLE_BOTTOM_GAP = 16;

export class ScoreAnimTimingsModal extends GameObjects.Container {
  private timingsPanel: ScoreAnimTimingsPanel | null = null;
  private presetButtons: Button[] = [];

  constructor(
    scene: Scene,
    contentX: number,
    width: number,
    height: number,
    options: ScoreAnimTimingsModalOptions,
    contentY = 0,
  ) {
    super(scene, 0, 0);

    const panelWidthRatio = 0.58;
    const pad = 12;
    const { layout, dim, panel, title } = createModalShell(scene, 'Score Animation', {
      contentX,
      width,
      height,
      contentY,
      panelHeight: Math.min(height - 24, 720),
      panelMaxWidth: Math.min(560, Math.floor(width * panelWidthRatio)),
    });
    const { panelX, panelY, panelW, panelH } = layout;

    this.add([dim, panel, title]);

    const presetY = panelY + TITLE_Y + TITLE_FONT_HALF + TITLE_BOTTOM_GAP + PRESET_BTN_H / 2;
    const presetGap = 6;
    const presetW =
      (panelW - pad * 2 - presetGap * (SCORE_ANIM_SPEED_PRESETS.length - 1)) / SCORE_ANIM_SPEED_PRESETS.length;

    SCORE_ANIM_SPEED_PRESETS.forEach((preset, index) => {
      const cx = panelX + pad + presetW / 2 + index * (presetW + presetGap);
      const btn = new Button(scene, cx, presetY, SCORE_ANIM_SPEED_PRESET_LABELS[preset], {
        variant: 'secondary',
        width: presetW,
        height: PRESET_BTN_H,
      });
      btn.onClick(() => this.applyPreset(preset));
      this.presetButtons.push(btn);
      this.add(btn);
    });

    const panelTop = presetY + PRESET_BTN_H / 2 + PRESET_ROW_GAP;
    const panelBounds = {
      x: panelX + pad,
      y: panelTop,
      width: panelW - pad * 2,
      height: panelY + panelH - FOOTER_H - panelTop,
    };
    this.timingsPanel = new ScoreAnimTimingsPanel(scene, panelBounds);

    const backBtn = createModalBackButton(scene, layout, () => {
      this.destroy();
      options.onBack();
    });
    this.add(backBtn);

    finalizeModal(this, scene);
  }

  private applyPreset(preset: ScoreAnimSpeedPreset): void {
    applyScoreAnimSpeedPreset(preset);
    this.timingsPanel?.refreshInputs();
  }

  destroy(fromScene?: boolean): void {
    for (const btn of this.presetButtons) btn.destroy();
    this.presetButtons = [];
    this.timingsPanel?.destroy();
    this.timingsPanel = null;
    super.destroy(fromScene);
  }
}
