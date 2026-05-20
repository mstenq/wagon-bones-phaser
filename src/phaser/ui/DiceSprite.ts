// ─── DiceSprite ───
// Phaser Container that renders a d12 die with a number on the front face.
// Reads from a Die data object — no game logic here.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { Die } from '../../game/types';
import { DICE, COLORS } from '../../game/Constants';
import { applyAuraGlow, createAuraParticles, getAuraPrimary } from './AuraFX';
import diceEnhancementsData from '../../data/dice_enhancements.json';
import diceAurasData from '../../data/dice_auras.json';
import stickerData from '../../data/pip_enhancements.json';

// Lookup maps for descriptions
const ENHANCEMENT_INFO = new Map(diceEnhancementsData.map((e) => [e.id, e]));
const AURA_INFO = new Map(diceAurasData.map((a) => [a.id, a]));
const STICKER_INFO = new Map(stickerData.map((s) => [s.id, s]));

const DICE_SIZE = DICE.SIZE;
const BG_COLOR = DICE.BG_COLOR;
const PIP_COLOR = DICE.PIP_COLOR;
const SELECTED_STROKE = DICE.SELECTED_STROKE;
const FORCED_STROKE = DICE.FORCED_STROKE;
const DEFAULT_STROKE = DICE.DEFAULT_STROKE;
const GRIMY_COLOR = DICE.GRIMY_COLOR;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG_COLOR = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER_COLOR = COLORS.TOOLTIP_BORDER;

// Dodecahedron geometry constants
const D12_INNER_RADIUS = 19; // Front face pentagon circumradius
const D12_SHOULDER_RADIUS = 26; // Shoulder points (same angles as inner verts)
const D12_TIP_RADIUS = 30; // Tip points (between inner verts)
const D12_ROTATION = -90; // Starting angle so vertex points up

/** Compute vertices of a regular pentagon */
function pentagonVerts(cx: number, cy: number, radius: number, startAngleDeg: number): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const angle = ((startAngleDeg + i * 72) * Math.PI) / 180;
    verts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return verts;
}

/** Get the 10-point outer boundary (decagon) alternating tip and shoulder points */
function dodecahedronOuterVerts(
  cx: number,
  cy: number,
  rShoulder: number,
  rTip: number,
  startAngleDeg: number,
): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    // Shoulder point (same angle as inner vertex)
    const sAngle = ((startAngleDeg + i * 72) * Math.PI) / 180;
    verts.push([cx + rShoulder * Math.cos(sAngle), cy + rShoulder * Math.sin(sAngle)]);
    // Tip point (midpoint angle between inner vertices)
    const tAngle = ((startAngleDeg + 36 + i * 72) * Math.PI) / 180;
    verts.push([cx + rTip * Math.cos(tAngle), cy + rTip * Math.sin(tAngle)]);
  }
  return verts;
}

export class DiceSprite extends GameObjects.Container {
  static suppressTooltips = false;
  private bg: GameObjects.Graphics;
  private valueText: GameObjects.Text;
  private stickerImage: GameObjects.Image | null = null;
  private auraGfx: GameObjects.Graphics;
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

    this.auraGfx = scene.add.graphics();
    this.bg = scene.add.graphics();
    this.valueText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#222222',
        stroke: '#00000033',
        strokeThickness: 1,
      })
      .setOrigin(0.5, 0.5);
    this.disabledOverlay = scene.add.graphics();
    this.add([this.auraGfx, this.bg, this.valueText, this.disabledOverlay]);

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
    const r = D12_INNER_RADIUS * 0.85;
    this.disabledOverlay.lineStyle(4, 0xcc2222, 1);
    this.disabledOverlay.lineBetween(-r, -r, r, r);
    this.disabledOverlay.lineBetween(r, -r, -r, r);
    this.disabledOverlay.setDepth(10);
  }

  toggleSelected(): void {
    this.setSelected(!this._selected);
  }

  private redraw(): void {
    this.bg.clear();

    const isGrimy = this._dieData.isGrimy;
    const hasEnhancement = !!this._dieData.enhancement;
    const bgColor = isGrimy
      ? GRIMY_COLOR
      : hasEnhancement
        ? getEnhancementBgColor(this._dieData.enhancement!)
        : BG_COLOR;
    const strokeColor = this._forced ? FORCED_STROKE : this._selected ? SELECTED_STROKE : DEFAULT_STROKE;
    const strokeWidth = this._selected || this._forced ? 3 : 1;

    // Darker shade for side faces (angling away from viewer)
    const sideColor = isGrimy
      ? darkenColor(GRIMY_COLOR, 0.75)
      : hasEnhancement
        ? darkenColor(getEnhancementBgColor(this._dieData.enhancement!), 0.8)
        : darkenColor(BG_COLOR, 0.82);
    const edgeColor = isGrimy ? darkenColor(GRIMY_COLOR, 0.5) : darkenColor(bgColor, 0.6);

    // Compute geometry
    const inner = pentagonVerts(0, 0, D12_INNER_RADIUS, D12_ROTATION);
    const shoulders = pentagonVerts(0, 0, D12_SHOULDER_RADIUS, D12_ROTATION);
    const tips = pentagonVerts(0, 0, D12_TIP_RADIUS, D12_ROTATION + 36);
    const outerDecagon = dodecahedronOuterVerts(0, 0, D12_SHOULDER_RADIUS, D12_TIP_RADIUS, D12_ROTATION);

    // 1. Fill outer decagonal silhouette (die body)
    this.bg.fillStyle(sideColor, 1);
    this.bg.beginPath();
    this.bg.moveTo(outerDecagon[0][0], outerDecagon[0][1]);
    for (let i = 1; i < 10; i++) {
      this.bg.lineTo(outerDecagon[i][0], outerDecagon[i][1]);
    }
    this.bg.closePath();
    this.bg.fillPath();

    // 2. Draw 5 side face pentagons with subtle shading variation
    for (let k = 0; k < 5; k++) {
      const next = (k + 1) % 5;
      // Side face k: inner[k], shoulders[k], tips[k], shoulders[next], inner[next]
      this.bg.fillStyle(sideColor, 1);
      this.bg.beginPath();
      this.bg.moveTo(inner[k][0], inner[k][1]);
      this.bg.lineTo(shoulders[k][0], shoulders[k][1]);
      this.bg.lineTo(tips[k][0], tips[k][1]);
      this.bg.lineTo(shoulders[next][0], shoulders[next][1]);
      this.bg.lineTo(inner[next][0], inner[next][1]);
      this.bg.closePath();
      this.bg.fillPath();

      // Edge lines for side faces
      this.bg.lineStyle(1, edgeColor, 0.6);
      this.bg.beginPath();
      this.bg.moveTo(inner[k][0], inner[k][1]);
      this.bg.lineTo(shoulders[k][0], shoulders[k][1]);
      this.bg.lineTo(tips[k][0], tips[k][1]);
      this.bg.lineTo(shoulders[next][0], shoulders[next][1]);
      this.bg.lineTo(inner[next][0], inner[next][1]);
      this.bg.closePath();
      this.bg.strokePath();
    }

    // 3. Fill center pentagon (front face)
    this.bg.fillStyle(bgColor, 1);
    this.bg.beginPath();
    this.bg.moveTo(inner[0][0], inner[0][1]);
    for (let i = 1; i < 5; i++) {
      this.bg.lineTo(inner[i][0], inner[i][1]);
    }
    this.bg.closePath();
    this.bg.fillPath();

    // Inner pentagon edge
    this.bg.lineStyle(1, edgeColor, 0.8);
    this.bg.beginPath();
    this.bg.moveTo(inner[0][0], inner[0][1]);
    for (let i = 1; i < 5; i++) {
      this.bg.lineTo(inner[i][0], inner[i][1]);
    }
    this.bg.closePath();
    this.bg.strokePath();

    // 4. Outer stroke (selection indicator)
    this.bg.lineStyle(strokeWidth, strokeColor, 1);
    this.bg.beginPath();
    this.bg.moveTo(outerDecagon[0][0], outerDecagon[0][1]);
    for (let i = 1; i < 10; i++) {
      this.bg.lineTo(outerDecagon[i][0], outerDecagon[i][1]);
    }
    this.bg.closePath();
    this.bg.strokePath();


    // Number text on front face (only if not grimy)
    if (!isGrimy && this._dieData.value > 0) {
      const textColor = hasEnhancement ? getEnhancementPipColor(this._dieData.enhancement!) : PIP_COLOR;
      const enhInfo = hasEnhancement ? ENHANCEMENT_INFO.get(this._dieData.enhancement!) : null;
      const fontFamily = enhInfo?.fontFamily ?? 'Arial Black';
      this.valueText.setStyle({
        fontFamily,
        fontSize: this._dieData.value >= 10 ? '21px' : '24px',
        color: '#' + textColor.toString(16).padStart(6, '0'),
        stroke: '#00000033',
        strokeThickness: 1,
      });
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
    if (!isGrimy && this._dieData.sticker) {
      const textureKey = `sticker_${this._dieData.sticker}`;
      if (this.scene.textures.exists(textureKey)) {
        this.stickerImage = this.scene.add.image(10, 10, textureKey).setOrigin(0.5, 0.5);
        // Scale down to fit on the die face (~18px target)
        const maxDim = Math.max(this.stickerImage.width, this.stickerImage.height);
        const targetSize = 18;
        this.stickerImage.setScale(targetSize / maxDim);
        this.add(this.stickerImage);
      }
    }
  }

  private drawAuraFX(): void {
    // Clean up previous
    this.auraGfx.clear();
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

    // Phaser 4 glow filter on the die background
    const glowResult = applyAuraGlow(this.scene, this.bg as any, aura, {
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

    if (this._dieData.isGrimy) {
      lines.push('Grimy (face hidden)');
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

function getEnhancementColor(e: string): number {
  const colors: Record<string, number> = {
    bone: 0x8e8467,
    lucky: 0x0e7512,
    wooden: 0x6e5107,
    steel: 0x575757,
    gold: 0x897403,
    loaded: 0x950a0a,
    diamond: 0x00bcd4,
    stone: 0x027685,
  };
  return colors[e] ?? 0xffffff;
}

/** Full background color for enhanced dice — tinted but visible */
function getEnhancementBgColor(e: string): number {
  const colors: Record<string, number> = {
    bone: 0xd4c8b0, // warm cream/bone
    lucky: 0xc8f0c8, // light green
    wooden: 0xc4a055, // wood brown
    steel: 0xa8a8b0, // steel grey
    gold: 0xffe870, // bright gold
    loaded: 0xf0a0a0, // soft red
    diamond: 0xa0e8f0, // light cyan
    stone: 0x888888, // dark grey
  };
  return colors[e] ?? BG_COLOR;
}

/** Pip color that contrasts with the enhancement background */
function getEnhancementPipColor(e: string): number {
  const colors: Record<string, number> = {
    bone: 0x5a4a2a, // dark brown
    lucky: 0x1a5a1a, // dark green
    wooden: 0x3a2a00, // dark brown
    steel: 0x2a2a3a, // dark blue-grey
    gold: 0x8a6a00, // dark gold
    loaded: 0x6a0000, // dark red
    diamond: 0x004a5a, // dark teal
    stone: 0x333333, // very dark grey
  };
  return colors[e] ?? PIP_COLOR;
}

/** Accent bar color (slightly darker than bg) */
function getEnhancementLabelColor(e: string): number {
  return getEnhancementColor(e);
}

/** Darken a hex color by a factor (0=black, 1=unchanged) */
function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
