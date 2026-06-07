// ─── DiceSprite ───
// Phaser Container that renders a d12 die from per-face atlas frames.
// Reads from a Die data object — no game logic here.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { Die } from '../../game/types';
import { DICE, COLORS, UI } from '../../game/Constants';
import { getGameplayPreferences } from '../../game/GameplayPreferences';
import { AuraEffectHost } from '../effects/AuraEffectHost';
import { effectPhaseFromSeed } from '../effects/context';
import { isRegistryAura } from '../effects/registry';
import { getAuraPrimary, setupLegacyDieAura, type LegacyAuraHandle } from './AuraFX';
import { DICE_ATLAS_KEY, resolveDiceAtlasFrame } from './diceAssets';
import diceEnhancements from '../../data/dice_enhancements';
import diceAuras from '../../data/dice_auras';
import pipEnhancements from '../../data/pip_enhancements';

// Lookup maps for descriptions
const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const AURA_INFO = new Map(diceAuras.map((a) => [a.id, a]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

const DICE_SIZE = DICE.SIZE;
const SELECTED_STROKE = DICE.SELECTED_STROKE;
const FORCED_STROKE = DICE.FORCED_STROKE;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG_COLOR = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER_COLOR = COLORS.TOOLTIP_BORDER;

function setStickerOrbitPosition(image: GameObjects.Image, angleRad: number): void {
  const r = DICE.STICKER_ORBIT_RADIUS;
  image.setPosition(Math.cos(angleRad) * r, Math.sin(angleRad) * r);
}

function setStickerOrbitOrientation(image: GameObjects.Image, stickerId: Die['sticker'], angleRad: number): void {
  if (stickerId === 'red_bullet') {
    // Keep the bullet tangent to the orbit path so it appears to "fly" around the die.
    image.setRotation(angleRad + Math.PI / 2 + Phaser.Math.DegToRad(45));
    return;
  }
  image.setRotation(0);
}

export type DiceScorePresentation = 'none' | 'filler';

export class DiceSprite extends GameObjects.Container {
  static suppressTooltips = false;
  private static readonly instances = new Set<DiceSprite>();

  /** Re-apply sticker layout after the stationary/orbit preference changes */
  static applyStickerPreferenceToAll(): void {
    for (const sprite of DiceSprite.instances) {
      if (sprite.active && sprite.scene) sprite.redraw();
    }
  }
  private dieImage: GameObjects.Image;
  private selectionGfx: GameObjects.Graphics;
  private stickerImage: GameObjects.Image | null = null;
  private stickerOrbitAngle = { rad: 0 };
  private stickerOrbitTween: Phaser.Tweens.Tween | null = null;
  /** Per-sprite orbit params so redraw does not re-sync every die */
  private stickerOrbitPhaseRad: number | null = null;
  private stickerOrbitDurationMs: number | null = null;
  private auraLabel: GameObjects.Text | null = null;
  private tooltip: GameObjects.Container | null = null;
  private effectHost: AuraEffectHost | null = null;
  private legacyAura: LegacyAuraHandle | null = null;
  private _dieData: Die;
  private _selected: boolean = false;
  private _rerollLocked: boolean = false;
  private _showSelectedStroke: boolean = false;
  private rerollLockLabel: GameObjects.Text | null = null;
  private _forced: boolean = false;
  _disabled: boolean = false;
  private disabledOverlay: GameObjects.Graphics;
  private _showAuraLabel: boolean = false;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    dieData: Die,
    options?: { showAuraLabel?: boolean; showSelectedStroke?: boolean },
  ) {
    super(scene, x, y);
    this._dieData = dieData;
    this._showAuraLabel = options?.showAuraLabel ?? false;
    this._showSelectedStroke = options?.showSelectedStroke ?? false;

    this.dieImage = scene.add.image(0, 0, DICE_ATLAS_KEY, 'standard-01.png').setOrigin(0.5, 0.5);
    this.selectionGfx = scene.add.graphics();
    this.disabledOverlay = scene.add.graphics();
    this.add([this.dieImage, this.selectionGfx, this.disabledOverlay]);

    this.setSize(DICE_SIZE, DICE_SIZE);
    // Container origin is 0.5 — InputManager adds displayOriginX/Y before hit tests,
    // so (0,0,w,h) aligns with the visually centered die, not (-half,-half,w,h).
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, DICE_SIZE, DICE_SIZE), Phaser.Geom.Rectangle.Contains);

    this.redraw();
    this.drawAuraFX();

    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
    DiceSprite.instances.add(this);
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

  setShowSelectedStroke(show: boolean): void {
    this._showSelectedStroke = show;
    this.redraw();
  }

  setRerollLocked(locked: boolean): void {
    this._rerollLocked = locked;
    this.drawRerollLockLabel();
  }

  get rerollLocked(): boolean {
    return this._rerollLocked;
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
    const frame = resolveDiceAtlasFrame(this.scene, this._dieData);
    this.dieImage.setTexture(DICE_ATLAS_KEY, frame);
    this.dieImage.setDisplaySize(DICE_SIZE, DICE_SIZE);
    this.dieImage.clearTint();

    this.drawSelectionStroke();
    this.drawRerollLockLabel();
    this.drawSticker();
  }

  private drawSticker(): void {
    this.clearStickerOrbit();
    if (!this._dieData.sticker) return;

    const textureKey = `sticker_${this._dieData.sticker}`;
    if (!this.scene.textures.exists(textureKey)) return;

    this.stickerImage = this.scene.add.image(0, 0, textureKey).setOrigin(0.5, 0.5);
    const maxDim = Math.max(this.stickerImage.width, this.stickerImage.height);
    this.stickerImage.setScale(DICE.STICKER_SIZE / maxDim);
    this.stickerImage.setDepth(8);
    this.add(this.stickerImage);
    this.bringToTop(this.stickerImage);

    if (getGameplayPreferences().stationaryStickers) {
      this.stickerImage.setPosition(DICE.STICKER_OFFSET, DICE.STICKER_OFFSET);
      return;
    }

    if (this.stickerOrbitPhaseRad === null) {
      this.stickerOrbitPhaseRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.stickerOrbitDurationMs = DICE.STICKER_ORBIT_DURATION_MS * Phaser.Math.FloatBetween(0.88, 1.14);
    }
    const phase = this.stickerOrbitPhaseRad;
    this.stickerOrbitAngle.rad = phase;
    setStickerOrbitPosition(this.stickerImage, phase);
    setStickerOrbitOrientation(this.stickerImage, this._dieData.sticker, phase);

    const endRad = phase + Math.PI * 2;
    this.stickerOrbitTween = this.scene.tweens.add({
      targets: this.stickerOrbitAngle,
      rad: endRad,
      duration: this.stickerOrbitDurationMs!,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        if (this.stickerImage) {
          setStickerOrbitPosition(this.stickerImage, this.stickerOrbitAngle.rad);
          setStickerOrbitOrientation(this.stickerImage, this._dieData.sticker, this.stickerOrbitAngle.rad);
        }
      },
    });
  }

  private clearStickerOrbit(): void {
    if (this.stickerOrbitTween) {
      this.stickerOrbitTween.destroy();
      this.stickerOrbitTween = null;
    }
    if (this.stickerImage) {
      this.stickerImage.destroy();
      this.stickerImage = null;
    }
    if (!this._dieData.sticker) {
      this.stickerOrbitPhaseRad = null;
      this.stickerOrbitDurationMs = null;
    }
  }

  private drawSelectionStroke(): void {
    this.selectionGfx.clear();
    if (!this._forced && !(this._selected && this._showSelectedStroke)) return;

    const strokeColor = this._forced ? FORCED_STROKE : SELECTED_STROKE;
    const strokeWidth = 3;
    const radius = DICE_SIZE / 2 - strokeWidth / 2;
    this.selectionGfx.lineStyle(strokeWidth, strokeColor, 1);
    this.selectionGfx.strokeCircle(0, 0, radius);
  }

  private drawRerollLockLabel(): void {
    if (this.rerollLockLabel) {
      this.rerollLockLabel.destroy();
      this.rerollLockLabel = null;
    }
    if (!this._rerollLocked) return;

    this.rerollLockLabel = this.scene.add
      .text(0, DICE.REROLL_LOCK_LABEL_Y, '🔒', {
        fontSize: `${DICE.REROLL_LOCK_FONT_SIZE}px`,
      })
      .setOrigin(0.5, 0);
    this.rerollLockLabel.setDepth(12);
    this.add(this.rerollLockLabel);
  }

  private clearAuraFX(): void {
    if (this.effectHost) {
      this.effectHost.destroy();
      this.effectHost = null;
    }
    if (this.legacyAura) {
      this.legacyAura.destroy();
      this.legacyAura = null;
    }
  }

  private drawAuraFX(): void {
    if (this.auraLabel) {
      this.auraLabel.destroy();
      this.auraLabel = null;
    }
    this.clearAuraFX();

    const aura = this._dieData.aura;
    if (!aura) return;

    const half = DICE_SIZE / 2;
    const color = getAuraPrimary(aura);
    const info = AURA_INFO.get(aura);

    if (isRegistryAura(aura)) {
      this.effectHost = new AuraEffectHost({
        scene: this.scene,
        parent: this,
        effectId: aura,
        hostKind: 'die',
        width: DICE_SIZE,
        height: DICE_SIZE,
        phase: effectPhaseFromSeed(this._dieData.id),
        getArtImage: () => this.dieImage,
      });
      this.effectHost.bindPointer(this);
    } else {
      this.legacyAura = setupLegacyDieAura(this.scene, this, aura, half, this.dieImage);
    }

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
    DiceSprite.instances.delete(this);
    this.hideTooltip();
    if (this.rerollLockLabel) {
      this.rerollLockLabel.destroy();
      this.rerollLockLabel = null;
    }
    this.clearStickerOrbit();
    this.clearAuraFX();
    super.destroy(fromScene);
  }
}
