// ─── DiceSprite ───
// Phaser Container that renders a d12 die with a number on the front face.
// Reads from a Die data object — no game logic here.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { Die } from '../../game/types';
import { DICE, COLORS, UI } from '../../game/Constants';
import { applyAuraGlow, createAuraParticles, getAuraPrimary } from './AuraFX';
import diceEnhancements from '../../data/dice_enhancements';
import diceAuras from '../../data/dice_auras';
import pipEnhancements from '../../data/pip_enhancements';

// Lookup maps for descriptions
const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const AURA_INFO = new Map(diceAuras.map((a) => [a.id, a]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

const DICE_SIZE = DICE.SIZE;
const PIP_COLOR = DICE.PIP_COLOR;
const SELECTED_STROKE = DICE.SELECTED_STROKE;
const FORCED_STROKE = DICE.FORCED_STROKE;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG_COLOR = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER_COLOR = COLORS.TOOLTIP_BORDER;

function getDiceTextureKey(die: Die): string {
  return die.enhancement ? `dice_${die.enhancement}` : 'dice_standard';
}

export type DiceScorePresentation = 'none' | 'filler';

export class DiceSprite extends GameObjects.Container {
  static suppressTooltips = false;
  private dieImage: GameObjects.Image;
  private selectionGfx: GameObjects.Graphics;
  private valueText: GameObjects.Text;
  private stickerImage: GameObjects.Image | null = null;
  private auraLabel: GameObjects.Text | null = null;
  private tooltip: GameObjects.Container | null = null;
  private auraTweens: Phaser.Tweens.Tween[] = [];
  private auraEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private auraGlowCleanup: (() => void) | null = null;
  private _dieData: Die;
  private _selected: boolean = false;
  private _forced: boolean = false;
  _disabled: boolean = false;
  private disabledOverlay: GameObjects.Graphics;
  private _showAuraLabel: boolean = false;

  constructor(scene: Scene, x: number, y: number, dieData: Die, options?: { showAuraLabel?: boolean }) {
    super(scene, x, y);
    this._dieData = dieData;
    this._showAuraLabel = options?.showAuraLabel ?? false;

    this.dieImage = scene.add.image(0, 0, 'dice_standard').setOrigin(0.5, 0.5);
    this.selectionGfx = scene.add.graphics();
    this.valueText = scene.add
      .text(0, DICE.VALUE_Y_OFFSET, '', {
        fontFamily: 'Arial Black',
        fontSize: `${DICE.FONT_SIZE}px`,
        color: '#222222',
        stroke: '#00000033',
        strokeThickness: 1,
      })
      .setOrigin(0.5, 0.5);
    this.disabledOverlay = scene.add.graphics();
    this.add([this.dieImage, this.valueText, this.selectionGfx, this.disabledOverlay]);

    this.setSize(DICE_SIZE, DICE_SIZE);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, DICE_SIZE, DICE_SIZE), Phaser.Geom.Rectangle.Contains);

    this.redraw();
    this.drawAuraFX();

    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
  }

  get dieData(): Die {
    return this._dieData;
  }

  get selected(): boolean {
    return this._selected;
  }

  setDieData(data: Die): void {
    this._dieData = data;
    this.redraw();
    this.drawAuraFX();
  }

  setSelected(selected: boolean): void {
    this._selected = selected;
    this.redraw();
  }

  setForced(forced: boolean): void {
    this._forced = forced;
    this._selected = forced;
    this.redraw();
  }

  /** Score line: full opacity for hand dice, dimmed for non-scoring kickers */
  setScorePresentation(presentation: DiceScorePresentation): void {
    this.setAlpha(presentation === 'filler' ? UI.DICE_SCORE_FILLER_ALPHA : 1);
  }

  get forced(): boolean {
    return this._forced;
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.setAlpha(disabled ? 0.55 : 1);
    this.drawDisabledOverlay();
  }

  private drawDisabledOverlay(): void {
    this.disabledOverlay.clear();
    if (!this._disabled) return;
    const r = DICE_SIZE / 2 - 2;
    this.disabledOverlay.lineStyle(4, 0xcc2222, 1);
    this.disabledOverlay.lineBetween(-r, -r, r, r);
    this.disabledOverlay.lineBetween(r, -r, -r, r);
    this.disabledOverlay.setDepth(10);
  }

  toggleSelected(): void {
    this.setSelected(!this._selected);
  }

  private redraw(): void {
    const hasEnhancement = !!this._dieData.enhancement;

    const key = getDiceTextureKey(this._dieData);
    const textureKey = this.scene.textures.exists(key) ? key : 'dice_standard';
    this.dieImage.setTexture(textureKey);
    this.dieImage.setDisplaySize(DICE_SIZE, DICE_SIZE);
    this.dieImage.clearTint();

    this.drawSelectionStroke();

    if (this._dieData.value > 0) {
      const enhInfo = hasEnhancement ? ENHANCEMENT_INFO.get(this._dieData.enhancement!) : null;
      const fontFamily = enhInfo?.fontFamily ?? 'Arial Black';
      const textColor = enhInfo?.color ? `#${enhInfo.color}` : `#${PIP_COLOR.toString(16).padStart(6, '0')}`;
      this.valueText.setStyle({
        fontFamily,
        fontSize: this._dieData.value >= 10 ? `${DICE.FONT_SIZE_TWO_DIGIT}px` : `${DICE.FONT_SIZE}px`,
        color: textColor,
        stroke: enhInfo?.strokeColor ? `#${enhInfo.strokeColor}` : '#00000000',
        strokeThickness: enhInfo?.strokeWidth ?? 0,
      });
      this.valueText.setPosition(0, DICE.VALUE_Y_OFFSET);
      this.valueText.setText(`${this._dieData.value}`);
      this.valueText.setVisible(true);
    } else {
      this.valueText.setVisible(false);
    }

    // Sticker icon (small colored symbol in bottom-right of front face)
    if (this.stickerImage) {
      this.stickerImage.destroy();
      this.stickerImage = null;
    }
    if (this._dieData.sticker) {
      const textureKey = `sticker_${this._dieData.sticker}`;
      if (this.scene.textures.exists(textureKey)) {
        this.stickerImage = this.scene.add
          .image(DICE.STICKER_OFFSET, DICE.STICKER_OFFSET, textureKey)
          .setOrigin(0.5, 0.5);
        // Scale down to fit on the die face
        const maxDim = Math.max(this.stickerImage.width, this.stickerImage.height);
        const targetSize = DICE.STICKER_SIZE;
        this.stickerImage.setScale(targetSize / maxDim);
        this.add(this.stickerImage);
      }
    }
  }

  private drawSelectionStroke(): void {
    this.selectionGfx.clear();
    if (!this._selected && !this._forced) return;

    const strokeColor = this._forced ? FORCED_STROKE : SELECTED_STROKE;
    const strokeWidth = 3;
    const radius = DICE_SIZE / 2 - strokeWidth / 2;
    this.selectionGfx.lineStyle(strokeWidth, strokeColor, 1);
    this.selectionGfx.strokeCircle(0, 0, radius);
  }

  private drawAuraFX(): void {
    // Clean up previous
    if (this.auraLabel) {
      this.auraLabel.destroy();
      this.auraLabel = null;
    }
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];
    if (this.auraGlowCleanup) {
      this.auraGlowCleanup();
      this.auraGlowCleanup = null;
    }

    const aura = this._dieData.aura;
    if (!aura) return;

    const half = DICE_SIZE / 2;
    const color = getAuraPrimary(aura);
    const info = AURA_INFO.get(aura);

    // Phaser 4 glow filter on the die image
    const glowResult = applyAuraGlow(this.scene, this.dieImage as any, aura, {
      strength: 6,
      pulseMin: 0.4,
      pulseMax: 1,
    });
    this.auraTweens.push(...glowResult.tweens);
    this.auraGlowCleanup = glowResult.destroy;

    // Particle effects
    const particleResult = createAuraParticles(this.scene, aura, half, half);
    for (const em of particleResult.emitters) {
      this.add(em);
    }
    this.auraEmitters.push(...particleResult.emitters);
    this.auraTweens.push(...particleResult.tweens);

    // Aura label below indicators (only in grab bag / booster pack)
    if (info && this._showAuraLabel) {
      this.auraLabel = this.scene.add
        .text(0, half + 16, info.name, {
          fontFamily: 'Arial',
          fontSize: '12px',
          color: '#' + color.toString(16).padStart(6, '0'),
          align: 'center',
        })
        .setOrigin(0.5, 0);
      this.add(this.auraLabel);
    }
  }

  private showTooltip(): void {
    if (this.tooltip || DiceSprite.suppressTooltips) return;

    // Get world position (handles nested containers)
    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;
    const half = DICE_SIZE / 2;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    // --- Info text ---
    const lines: string[] = [];

    if (this._dieData.enhancement) {
      const info = ENHANCEMENT_INFO.get(this._dieData.enhancement);
      if (info) {
        lines.push(`${info.name} Die`);
        lines.push(`  ${info.description}`);
      }
    } else {
      lines.push('Standard Die');
    }

    if (this._dieData.aura) {
      const info = AURA_INFO.get(this._dieData.aura);
      if (info) {
        lines.push(`${info.name} Aura: ${info.description}`);
      }
    }

    // Sticker info
    if (this._dieData.sticker) {
      const info = STICKER_INFO.get(this._dieData.sticker);
      const stickerName = info ? info.name : this._dieData.sticker.replace(/_/g, ' ');
      const stickerDesc = info ? ` - ${info.description}` : '';
      lines.push(`${stickerName}${stickerDesc}`);
    }

    const infoText = this.scene.add
      .text(0, 0, lines.join('\n'), {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: '#dddddd',
        lineSpacing: 4,
        wordWrap: { width: 280 },
      })
      .setOrigin(0, 0);

    const tooltipWidth = infoText.width + TOOLTIP_PAD * 2;
    const tooltipHeight = infoText.height + TOOLTIP_PAD * 2;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG_COLOR, 0.95);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    bg.lineStyle(1, TOOLTIP_BORDER_COLOR, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    this.tooltip.add(bg);

    // Position text
    infoText.setPosition(TOOLTIP_PAD, TOOLTIP_PAD);
    this.tooltip.add(infoText);

    // Position tooltip above the die
    let tx = worldX - tooltipWidth / 2;
    let ty = worldY - half - tooltipHeight - 12;

    // Clamp to screen bounds
    const { width: sw } = this.scene.scale;
    if (tx < 8) tx = 8;
    if (tx + tooltipWidth > sw - 8) tx = sw - 8 - tooltipWidth;
    if (ty < 8) {
      ty = worldY + half + 28;
    }

    this.tooltip.setPosition(tx, ty);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  destroy(fromScene?: boolean): void {
    this.hideTooltip();
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];
    if (this.auraGlowCleanup) {
      this.auraGlowCleanup();
      this.auraGlowCleanup = null;
    }
    super.destroy(fromScene);
  }
}
