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
import { getAuraPrimary } from './AuraFX';
import { DICE_ATLAS_KEY, resolveDiceAtlasFrame } from './diceAssets';
import { HINT_COLORS } from './itemCard/itemCardHintStyles';
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

function setOrbitPosition(obj: GameObjects.Components.Transform, angleRad: number): void {
  const r = DICE.STICKER_ORBIT_RADIUS;
  obj.setPosition(Math.cos(angleRad) * r, Math.sin(angleRad) * r);
}

function setStickerOrbitOrientation(image: GameObjects.Image, stickerId: Die['sticker'], angleRad: number): void {
  if (stickerId === 'red_bullet') {
    // Keep the bullet tangent to the orbit path so it appears to "fly" around the die.
    image.setRotation(angleRad + Math.PI / 2 + Phaser.Math.DegToRad(45));
    return;
  }
  image.setRotation(0);
}

const BONUS_MILES_BADGE_FILL = 0x55aaff;

function createBonusMilesBadge(scene: Scene, amount: number): GameObjects.Container {
  const badge = scene.add.container(0, 0);
  const radius = DICE.BONUS_MILES_BADGE_SIZE / 2;
  const circle = scene.add.graphics();
  circle.fillStyle(BONUS_MILES_BADGE_FILL, 1);
  circle.lineStyle(1, 0x000000, 0.55);
  circle.fillCircle(0, 0, radius);
  circle.strokeCircle(0, 0, radius);

  const digits = `${amount}`;
  const fontSize =
    digits.length >= 3 ? DICE.BONUS_MILES_BADGE_FONT_SIZE - 3 : DICE.BONUS_MILES_BADGE_FONT_SIZE;
  const label = scene.add
    .text(0, 0, digits, {
      fontFamily: 'Arial',
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 0.5);

  badge.add([circle, label]);
  badge.setDepth(9);
  return badge;
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
  private bonusMilesBadge: GameObjects.Container | null = null;
  private orbitAngle = { rad: 0 };
  private orbitTween: Phaser.Tweens.Tween | null = null;
  /** Per-sprite orbit params so redraw does not re-sync every die */
  private orbitPhaseRad: number | null = null;
  private orbitDurationMs: number | null = null;
  private auraLabel: GameObjects.Text | null = null;
  private tooltip: GameObjects.Container | null = null;
  private tooltipLayout: { width: number; height: number } | null = null;
  private effectHost: AuraEffectHost | null = null;
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
    this.drawOrbitDecorations();
  }

  private hasOrbitSticker(): boolean {
    if (!this._dieData.sticker) return false;
    return this.scene.textures.exists(`sticker_${this._dieData.sticker}`);
  }

  private bonusMilesAmount(): number {
    return this._dieData.bonusMiles ?? 0;
  }

  private hasOrbitDecorations(): boolean {
    return this.hasOrbitSticker() || this.bonusMilesAmount() > 0;
  }

  private drawOrbitDecorations(): void {
    this.clearOrbitDecorations();
    if (!this.hasOrbitDecorations()) return;

    const hasSticker = this.hasOrbitSticker();
    const bonusMiles = this.bonusMilesAmount();
    const hasBonus = bonusMiles > 0;

    if (hasSticker) {
      const textureKey = `sticker_${this._dieData.sticker}`;
      this.stickerImage = this.scene.add.image(0, 0, textureKey).setOrigin(0.5, 0.5);
      const maxDim = Math.max(this.stickerImage.width, this.stickerImage.height);
      this.stickerImage.setScale(DICE.STICKER_SIZE / maxDim);
      this.stickerImage.setDepth(8);
      this.add(this.stickerImage);
    }

    if (hasBonus) {
      this.bonusMilesBadge = createBonusMilesBadge(this.scene, bonusMiles);
      this.add(this.bonusMilesBadge);
    }

    if (this.stickerImage) this.bringToTop(this.stickerImage);
    if (this.bonusMilesBadge) this.bringToTop(this.bonusMilesBadge);

    if (getGameplayPreferences().stationaryStickers) {
      this.applyStationaryOrbitDecorations(hasSticker, hasBonus);
      return;
    }

    if (this.orbitPhaseRad === null) {
      this.orbitPhaseRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.orbitDurationMs = DICE.STICKER_ORBIT_DURATION_MS * Phaser.Math.FloatBetween(0.88, 1.14);
    }
    const phase = this.orbitPhaseRad;
    this.orbitAngle.rad = phase;
    this.applyOrbitingDecorations(phase, hasSticker, hasBonus);

    const endRad = phase + Math.PI * 2;
    this.orbitTween = this.scene.tweens.add({
      targets: this.orbitAngle,
      rad: endRad,
      duration: this.orbitDurationMs!,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        this.applyOrbitingDecorations(this.orbitAngle.rad, hasSticker, hasBonus);
      },
    });
  }

  private applyStationaryOrbitDecorations(hasSticker: boolean, hasBonus: boolean): void {
    if (hasSticker && this.stickerImage) {
      this.stickerImage.setPosition(DICE.STICKER_OFFSET, DICE.STICKER_OFFSET);
    }
    if (hasBonus && this.bonusMilesBadge) {
      if (hasSticker) {
        this.bonusMilesBadge.setPosition(-DICE.STICKER_OFFSET, -DICE.STICKER_OFFSET);
      } else {
        this.bonusMilesBadge.setPosition(DICE.STICKER_OFFSET, DICE.STICKER_OFFSET);
      }
      this.bonusMilesBadge.setRotation(0);
    }
  }

  private applyOrbitingDecorations(angleRad: number, hasSticker: boolean, hasBonus: boolean): void {
    if (hasSticker && this.stickerImage) {
      setOrbitPosition(this.stickerImage, angleRad);
      setStickerOrbitOrientation(this.stickerImage, this._dieData.sticker, angleRad);
    }
    if (hasBonus && this.bonusMilesBadge) {
      const bonusAngle = angleRad + (hasSticker ? Math.PI : 0);
      setOrbitPosition(this.bonusMilesBadge, bonusAngle);
      this.bonusMilesBadge.setRotation(0);
    }
  }

  private clearOrbitDecorations(): void {
    if (this.orbitTween) {
      this.orbitTween.destroy();
      this.orbitTween = null;
    }
    if (this.stickerImage) {
      this.stickerImage.destroy();
      this.stickerImage = null;
    }
    if (this.bonusMilesBadge) {
      this.bonusMilesBadge.destroy();
      this.bonusMilesBadge = null;
    }
    if (!this.hasOrbitDecorations()) {
      this.orbitPhaseRad = null;
      this.orbitDurationMs = null;
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

  /** Keep scene-root tooltip aligned when the die moves (e.g. select lift tween). */
  syncTooltipPosition(): void {
    if (!this.tooltip) return;
    const matrix = this.getWorldTransformMatrix();
    this.positionTooltipAtWorld(matrix.tx, matrix.ty);
  }

  private showTooltip(): void {
    if (this.tooltip || DiceSprite.suppressTooltips) return;

    // Get world position (handles nested containers)
    const matrix = this.getWorldTransformMatrix();

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

    const bonusMiles = this._dieData.bonusMiles ?? 0;
    let bonusText: GameObjects.Text | null = null;
    if (bonusMiles > 0) {
      bonusText = this.scene.add
        .text(0, 0, `+${bonusMiles} bonus miles`, {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: HINT_COLORS.miles.text,
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
    }

    const contentWidth = Math.max(infoText.width, bonusText?.width ?? 0);
    infoText.setPosition(TOOLTIP_PAD, TOOLTIP_PAD);
    let contentBottom = TOOLTIP_PAD + infoText.height;
    if (bonusText) {
      bonusText.setPosition(TOOLTIP_PAD, contentBottom + 4);
      contentBottom = bonusText.y + bonusText.height;
    }

    const tooltipWidth = contentWidth + TOOLTIP_PAD * 2;
    const tooltipHeight = contentBottom + TOOLTIP_PAD;
    this.tooltipLayout = { width: tooltipWidth, height: tooltipHeight };

    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG_COLOR, 0.95);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    bg.lineStyle(1, TOOLTIP_BORDER_COLOR, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    this.tooltip.add(bg);
    this.tooltip.add(infoText);
    if (bonusText) this.tooltip.add(bonusText);

    this.positionTooltipAtWorld(matrix.tx, matrix.ty);
  }

  private positionTooltipAtWorld(worldX: number, worldY: number): void {
    if (!this.tooltip || !this.tooltipLayout) return;

    const half = DICE_SIZE / 2;
    const { width: tooltipWidth, height: tooltipHeight } = this.tooltipLayout;

    let tx = worldX - tooltipWidth / 2;
    let ty = worldY - half - tooltipHeight - 12;

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
      this.tooltipLayout = null;
    }
  }

  destroy(fromScene?: boolean): void {
    DiceSprite.instances.delete(this);
    this.hideTooltip();
    if (this.rerollLockLabel) {
      this.rerollLockLabel.destroy();
      this.rerollLockLabel = null;
    }
    this.clearOrbitDecorations();
    this.clearAuraFX();
    super.destroy(fromScene);
  }
}
