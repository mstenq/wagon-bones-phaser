// ─── RoundScoreProgress ───
// Round score / target progress bar with in-bar label.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, FONTS, UI } from '../../game/Constants';
import type { LayoutMode } from '../../game/Constants';
import { D, type DecimalSource } from '../../game/decimal';
import { formatScore, formatScoreComponent } from '../../game/formatScore';
import {
  barLabelTextColor,
  contrastingTextColor,
  getStackedProgressLayers,
  type ScoreProgressLayer,
} from './roundScoreProgressMath';

export type RoundScoreProgressVariant = LayoutMode;

export interface RoundScoreProgressOptions {
  /** Max width for in-bar text shrink (topbar). */
  labelMaxWidth?: number;
}

export class RoundScoreProgress extends GameObjects.Container {
  private variant: RoundScoreProgressVariant;
  private sectionW: number;
  private sectionH: number;
  private labelMaxWidth: number | null;

  private barOverlayText: GameObjects.Text;
  private multiplierText: GameObjects.Text;
  private trackGfx: GameObjects.Graphics;
  private fillGfx: GameObjects.Graphics;

  private displayedScore: DecimalSource = 0;
  private targetMiles: DecimalSource = 0;
  private animateTween: Phaser.Tweens.Tween | null = null;
  private levelUpPlaying = false;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    variant: RoundScoreProgressVariant,
    opts: RoundScoreProgressOptions = {},
  ) {
    super(scene, x, y);
    this.variant = variant;
    this.sectionW = width;
    this.labelMaxWidth = opts.labelMaxWidth ?? null;
    this.sectionH = UI.SCORE_PROGRESS_SECTION_H;

    this.trackGfx = scene.add.graphics();
    this.fillGfx = scene.add.graphics();

    const barCY = this.sectionH / 2;
    const labelSize = variant === 'topbar' ? '12px' : '14px';

    this.multiplierText = scene.add
      .text(UI.SCORE_PROGRESS_MULTIPLIER_PAD, barCY, '', {
        fontFamily: FONTS.NUMBER,
        fontSize: variant === 'topbar' ? '11px' : '12px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.barOverlayText = scene.add
      .text(this.sectionW / 2, barCY, '0 / 0 mi', {
        fontFamily: FONTS.NUMBER,
        fontSize: labelSize,
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add([this.trackGfx, this.fillGfx, this.multiplierText, this.barOverlayText]);
    scene.add.existing(this);
  }

  getSectionHeight(): number {
    return this.sectionH;
  }

  setInstant(roundScore: DecimalSource, targetMiles: DecimalSource): void {
    this.killAnimation();
    this.displayedScore = D(roundScore);
    this.targetMiles = D(targetMiles);
    this.redraw(false);
  }

  setTarget(targetMiles: DecimalSource): void {
    this.targetMiles = D(targetMiles);
    this.redraw(false);
  }

  animateTo(toScore: DecimalSource, targetMiles?: DecimalSource, opts?: { durationMs?: number }): void {
    this.killAnimation();
    if (targetMiles !== undefined) {
      this.targetMiles = D(targetMiles);
    }

    const target = this.targetMiles;
    const fromNum = D(this.displayedScore).toNumber();
    const toNum = D(toScore).toNumber();
    const duration = opts?.durationMs ?? UI.SCORE_PROGRESS_ANIM_MS;
    const proxy = { t: 0 };

    const rate = UI.SCORE_PROGRESS_LEVELUP_SEC / (duration / 1000);
    this.scene.sound.play('sfx_level_up', { volume: 0.45, rate });
    this.levelUpPlaying = true;

    this.animateTween = this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const current = fromNum + (toNum - fromNum) * proxy.t;
        this.renderAtScore(current, target, true);
      },
      onComplete: () => {
        this.displayedScore = D(toScore);
        this.animateTween = null;
        this.levelUpPlaying = false;
        this.redraw(false);
        this.popBarText();
      },
    });
  }

  destroy(fromScene?: boolean): void {
    this.killAnimation();
    super.destroy(fromScene);
  }

  private killAnimation(): void {
    if (this.animateTween) {
      this.animateTween.stop();
      this.animateTween = null;
    }
    if (this.levelUpPlaying) {
      this.scene.sound.stopByKey('sfx_level_up');
      this.levelUpPlaying = false;
    }
  }

  private renderAtScore(scoreNum: number, target: DecimalSource, animating: boolean): void {
    const score = D(scoreNum);
    this.updateLabel(score, target, animating);
    this.drawBar(score, target);
  }

  private redraw(animating: boolean): void {
    this.updateLabel(this.displayedScore, this.targetMiles, animating);
    this.drawBar(this.displayedScore, this.targetMiles);
  }

  private updateLabel(roundScore: DecimalSource, targetMiles: DecimalSource, animating: boolean): void {
    const format = animating ? formatScoreComponent : formatScore;
    const scoreStr = format(roundScore);
    const targetStr = format(targetMiles);
    this.barOverlayText.setText(`${scoreStr} / ${targetStr} mi`);
    this.fitBarLabel();
  }

  private fitBarLabel(): void {
    if (this.labelMaxWidth === null) return;
    const baseSize = this.variant === 'topbar' ? 12 : 14;
    let size = baseSize;
    this.barOverlayText.setFontSize(`${size}px`);
    while (this.barOverlayText.width > this.labelMaxWidth && size > 9) {
      size -= 1;
      this.barOverlayText.setFontSize(`${size}px`);
    }
  }

  private popBarText(): void {
    this.scene.tweens.add({
      targets: this.barOverlayText,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private drawBar(roundScore: DecimalSource, targetMiles: DecimalSource): void {
    const radius = UI.SCORE_PROGRESS_BAR_RADIUS;
    const stacked = getStackedProgressLayers(roundScore, targetMiles, UI.SCORE_PROGRESS_MAX_TIER);
    const barW = this.sectionW;
    const barH = this.sectionH;

    this.trackGfx.clear();
    this.trackGfx.fillStyle(UI.SCORE_PROGRESS_TRACK, 0.9);
    this.trackGfx.fillRoundedRect(0, 0, barW, barH, radius);

    this.fillGfx.clear();
    this.drawOverlayLayers(stacked.layers, barW, barH, radius);

    const barCY = barH / 2;
    this.barOverlayText.setPosition(barW / 2, barCY);

    if (stacked.multiplierLabel !== null) {
      this.multiplierText.setText(`x${stacked.multiplierLabel}`);
      this.multiplierText.setVisible(true);
      this.multiplierText.setPosition(UI.SCORE_PROGRESS_MULTIPLIER_PAD, barCY);
      const multColor = fillColorAtX(stacked.layers, barW, UI.SCORE_PROGRESS_MULTIPLIER_PAD + 4);
      this.multiplierText.setColor(contrastingTextColor(multColor));
      this.multiplierText.setStroke('#000000', 3);
    } else {
      this.multiplierText.setVisible(false);
    }

    const labelColor = stackedLabelTextColor(stacked.layers, barW);
    this.barOverlayText.setColor(labelColor);
    this.barOverlayText.setStroke(labelColor === '#ffffff' ? '#000000' : '#ffffff', 2);

    this.bringToTop(this.multiplierText);
    this.bringToTop(this.barOverlayText);
  }

  /** Same x/y/height for every tier — later layers paint over earlier ones. */
  private drawOverlayLayers(layers: ScoreProgressLayer[], barW: number, barH: number, radius: number): void {
    for (const layer of layers) {
      const fillColor = UI.SCORE_PROGRESS_TIER_COLORS[layer.tierIndex] ?? COLORS.SCORE_GREEN;
      const fillW = Math.max(0, Math.min(1, layer.fill)) * barW;
      if (fillW <= 0) continue;

      this.fillGfx.fillStyle(fillColor, 1);
      this.fillGfx.fillRoundedRect(0, 0, fillW, barH, radius);
    }
  }
}

function fillColorAtX(layers: ScoreProgressLayer[], barW: number, x: number): number {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer.fill * barW >= x) {
      return UI.SCORE_PROGRESS_TIER_COLORS[layer.tierIndex] ?? COLORS.SCORE_GREEN;
    }
  }
  return UI.SCORE_PROGRESS_TRACK;
}

function stackedLabelTextColor(layers: ScoreProgressLayer[], barW: number): string {
  const textCenterX = barW / 2;

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const fillW = layer.fill * barW;
    if (fillW >= textCenterX) {
      const fillColor = UI.SCORE_PROGRESS_TIER_COLORS[layer.tierIndex] ?? COLORS.SCORE_GREEN;
      return contrastingTextColor(fillColor);
    }
  }

  return barLabelTextColor(UI.SCORE_PROGRESS_TRACK, 0, barW);
}
