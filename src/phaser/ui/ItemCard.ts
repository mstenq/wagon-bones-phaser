// ─── ItemCard ───
// Reusable Phaser Container that displays any game card (equipment, trail guide,
// supply card, frontier encounter, etc.) as a worn card with rounded corners,
// drop shadow, item image, and hover tooltip.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../game/Constants';
import type { ItemAura } from '../../game/ItemsSystem';
import type { HintSegment } from '../../game/ItemsSystem';
import type { CardTemplate } from '../../data/items';
import type { GameState } from '../../game/GameState';
import type { PlayerState } from '../../game/PlayerState';
import { applyAuraGlow, createAuraParticles } from './AuraFX';

/** Generic data shape for any card type */
export interface CardData {
  id: string;
  name: string;
  description: string;
  cost?: number;
  rarity?: string;
  aura?: ItemAura | null;
  cardTemplate?: CardTemplate;
  hintDisplay?: (game: GameState | null, player: PlayerState) => HintSegment[][];
}

export interface ItemCardOptions {
  /** Display mode affects layout and what info is shown */
  mode?: 'shop' | 'inventory' | 'compact';
  /** Show cost badge (shop mode default) */
  showCost?: boolean;
  /** Show sell value instead of cost */
  sellValue?: number;
  /** Scale multiplier (default 1) */
  cardScale?: number;
  /** Texture key prefix (default 'item_'). The texture key is `${prefix}${id}` */
  texturePrefix?: string;
  /** If true, no card background is drawn and image is displayed as-is (contain-fit) */
  transparentBg?: boolean;
  /** Override x-anchor for action tabs (default: card half-width). Useful for narrow images. */
  tabAnchorX?: number;
}

const CARD_W = UI.CARD_W;
const CARD_H = UI.CARD_H;
const CARD_RADIUS = UI.CARD_RADIUS;
const SHADOW_OFFSET = UI.CARD_SHADOW_OFFSET;
const SHADOW_ALPHA = UI.CARD_SHADOW_ALPHA;
const PRICE_TAG_H = UI.CARD_PRICE_TAG_H;
const PRICE_TAG_GAP = UI.CARD_PRICE_TAG_GAP;
const TOOLTIP_PAD = UI.CARD_TOOLTIP_PAD;
const TOOLTIP_BG = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER = COLORS.TOOLTIP_BORDER;

export interface CardActionTabConfig {
  label: string;
  color: number;
  textColor?: string;
  callback: () => void;
  /** Tab position: 'right' slides out from right side, 'bottom' appears below card */
  position?: 'right' | 'bottom';
}

interface ActionTabInstance {
  container: GameObjects.Container;
  config: CardActionTabConfig;
}

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

const RARITY_LABEL_COLORS: Record<string, string> = {
  common: '#88aa88',
  uncommon: '#8888cc',
  rare: '#ccaa44',
  legendary: '#cc66aa',
};

export class ItemCard extends GameObjects.Container {
  private cardBg: GameObjects.Graphics;
  private _def: CardData;
  private _options: ItemCardOptions;
  private _sold: boolean = false;
  private _bossDisabled: boolean = false;
  private _faceDown: boolean = false;
  private _suppressTooltip: boolean = false;
  private _suppressHints: boolean = false;
  private disabledOverlay: GameObjects.Graphics;
  private faceDownCover: GameObjects.Graphics | null = null;
  private costText: GameObjects.Text | null = null;
  private soldOverlay: GameObjects.Graphics;
  private tooltip: GameObjects.Container | null = null;
  private _cardW: number;
  private _cardH: number;
  private cardImage: GameObjects.Image | null = null;
  private auraEmitters: GameObjects.Particles.ParticleEmitter[] = [];
  private auraTweens: Phaser.Tweens.Tween[] = [];
  private auraGlowCleanup: (() => void) | null = null;
  private hintObjects: GameObjects.GameObject[] = [];
  private actionTabs: ActionTabInstance[] = [];
  private _tabsVisible: boolean = false;
  private _tabLiftAmount: number = 0;

  constructor(scene: Scene, x: number, y: number, def: CardData, options?: ItemCardOptions) {
    super(scene, x, y);
    this._def = def;
    this._options = options ?? {};

    const scale = this._options.cardScale ?? 1;
    this._cardW = CARD_W * scale;
    this._cardH = CARD_H * scale;

    this.cardBg = scene.add.graphics();
    this.add(this.cardBg);

    this.drawCard();
    this.addContent(scale);
    this.setupAuraVFX();

    // Sold overlay (hidden initially)
    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.add(this.soldOverlay);

    this.disabledOverlay = scene.add.graphics();
    this.add(this.disabledOverlay);

    this.setSize(this._cardW, this._cardH);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, this._cardW, this._cardH), Phaser.Geom.Rectangle.Contains);

    // Tooltip on hover
    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
  }

  get def(): CardData {
    return this._def;
  }
  get sold(): boolean {
    return this._sold;
  }

  // ─── Public API ───

  markSold(): void {
    this._sold = true;
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(-this._cardW / 2, -this._cardH / 2, this._cardW, this._cardH, CARD_RADIUS);
    this.soldOverlay.setVisible(true);
    if (this.costText) {
      this.costText.setText('SOLD');
      this.costText.setColor('#888888');
    }
  }

  setAffordable(canAfford: boolean): void {
    if (this._sold) return;
    if (this.costText) {
      this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
    }
  }

  setBossDisabled(disabled: boolean): void {
    this._bossDisabled = disabled;
    this.drawBossDisabledOverlay();
  }

  setFaceDown(faceDown: boolean): void {
    this._faceDown = faceDown;
    this.refreshFaceDown();
  }

  setSuppressTooltip(suppress: boolean): void {
    this._suppressTooltip = suppress;
    if (suppress) this.hideTooltip();
  }

  setSuppressHints(suppress: boolean): void {
    this._suppressHints = suppress;
    if (suppress) {
      for (const obj of this.hintObjects) obj.destroy();
      this.hintObjects = [];
    }
  }

  private drawBossDisabledOverlay(): void {
    this.disabledOverlay.clear();
    if (!this._bossDisabled) return;
    const hw = this._cardW / 2;
    const hh = this._cardH / 2;
    this.disabledOverlay.lineStyle(5, 0xcc2222, 1);
    this.disabledOverlay.lineBetween(-hw * 0.7, -hh * 0.7, hw * 0.7, hh * 0.7);
    this.disabledOverlay.lineBetween(hw * 0.7, -hh * 0.7, -hw * 0.7, hh * 0.7);
    this.disabledOverlay.setDepth(20);
  }

  private refreshFaceDown(): void {
    if (this.faceDownCover) {
      this.faceDownCover.destroy();
      this.faceDownCover = null;
    }
    if (this.cardImage) this.cardImage.setVisible(!this._faceDown);
    if (!this._faceDown) return;

    const hw = this._cardW / 2;
    const hh = this._cardH / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0x2a1f3d, 1);
    g.fillRoundedRect(-hw, -hh, this._cardW, this._cardH, CARD_RADIUS);
    g.lineStyle(2, 0x6a4a8a, 0.9);
    g.strokeRoundedRect(-hw, -hh, this._cardW, this._cardH, CARD_RADIUS);
    // Decorative diamond pattern
    g.fillStyle(0x4a3560, 0.6);
    g.fillTriangle(0, -hh + 12, -14, 0, 14, 0);
    g.fillTriangle(0, hh - 12, -14, 0, 14, 0);
    this.faceDownCover = g;
    this.add(g);
    this.bringToTop(g);
  }

  // ─── Drawing ───

  private drawCard(): void {
    if (this._options.transparentBg) return;

    const g = this.cardBg;
    g.clear();

    const w = this._cardW;
    const h = this._cardH;
    const hw = w / 2;
    const hh = h / 2;

    // Drop shadow
    g.fillStyle(0x000000, SHADOW_ALPHA);
    g.fillRoundedRect(-hw + SHADOW_OFFSET, -hh + SHADOW_OFFSET, w, h, CARD_RADIUS);

    // Card body — neutral dark background
    g.fillStyle(COLORS.BG_CARD, 1);
    g.fillRoundedRect(-hw, -hh, w, h, CARD_RADIUS);
  }

  private setupAuraVFX(): void {
    const aura = this._def.aura;
    if (!aura) return;

    const hw = this._cardW / 2;
    const hh = this._cardH / 2;

    // Glow filter on the card background
    const glowResult = applyAuraGlow(this.scene, this.cardBg as any, aura.id, {
      strength: 8,
      pulseMin: 0.3,
      pulseMax: 1,
    });
    this.auraTweens.push(...glowResult.tweens);
    this.auraGlowCleanup = glowResult.destroy;

    // Ghost aura: invert + green tint, 70% transparent
    if (aura.id === 'ghost') {
      this.setAlpha(0.8);
      if (this.cardImage) {
        (this.cardImage as any).enableFilters();
        const cm = (this.cardImage as any).filters.internal.addColorMatrix();
        cm.colorMatrix.negative();
      }
      const tintOverlay = this.scene.add.graphics();
      tintOverlay.fillStyle(0x44dd88, 0.3);
      tintOverlay.fillRoundedRect(-hw, -hh, this._cardW, this._cardH, CARD_RADIUS);
      this.add(tintOverlay);
    }

    // Particles around the card
    const particleResult = createAuraParticles(this.scene, aura.id, hw, hh);
    for (const em of particleResult.emitters) {
      this.add(em);
    }
    this.auraEmitters.push(...particleResult.emitters);
    this.auraTweens.push(...particleResult.tweens);
  }

  private addContent(scale: number): void {
    const w = this._cardW;
    const h = this._cardH;
    const hh = h / 2;
    const mode = this._options.mode ?? 'shop';
    const radius = CARD_RADIUS * scale;

    // Item image — bake rounded corners into a CanvasTexture
    const prefix = this._options.texturePrefix ?? 'item_';
    const srcKey = `${prefix}${this._def.id}`;
    if (this.scene.textures.exists(srcKey)) {
      if (this._options.transparentBg) {
        // Transparent mode: display image as-is, contain-fit within card bounds
        const img = this.scene.add.image(0, 0, srcKey);
        const srcImg = this.scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
        const containScale = Math.min(w / srcImg.width, h / srcImg.height) * 0.85;
        img.setScale(containScale);
        this.cardImage = img;
        this.add(img);
      } else {
      const roundedKey = `${srcKey}_rounded_${Math.round(w)}x${Math.round(h)}`;

      if (!this.scene.textures.exists(roundedKey)) {
        // Get source image
        const srcImg = this.scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;

        // Create canvas texture at card dimensions
        const canvasTex = this.scene.textures.createCanvas(roundedKey, w, h)!;
        const ctx = canvasTex.getContext();

        // Clip to rounded rect path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(w - radius, 0);
        ctx.arcTo(w, 0, w, radius, radius);
        ctx.lineTo(w, h - radius);
        ctx.arcTo(w, h, w - radius, h, radius);
        ctx.lineTo(radius, h);
        ctx.arcTo(0, h, 0, h - radius, radius);
        ctx.lineTo(0, radius);
        ctx.arcTo(0, 0, radius, 0, radius);
        ctx.closePath();
        ctx.clip();

        // Draw source image cover-filling the card area
        const imgScale = Math.max(w / srcImg.width, h / srcImg.height);
        const drawW = srcImg.width * imgScale;
        const drawH = srcImg.height * imgScale;
        const dx = (w - drawW) / 2;
        const dy = (h - drawH) / 2;
        ctx.drawImage(srcImg, dx, dy, drawW, drawH);

        canvasTex.refresh();
      }

      const img = this.scene.add.image(0, 0, roundedKey);
      this.cardImage = img;
      this.add(img);

      // Render card template overlay on top of the image
      if (this._def.cardTemplate) {
        const overlayKey = `card_template_${this._def.cardTemplate}`;
        if (this.scene.textures.exists(overlayKey)) {
          const roundedOverlayKey = `${overlayKey}_rounded_${Math.round(w)}x${Math.round(h)}`;
          if (!this.scene.textures.exists(roundedOverlayKey)) {
            const overlaySrc = this.scene.textures.get(overlayKey).getSourceImage() as HTMLImageElement;
            const overlayCanvas = this.scene.textures.createCanvas(roundedOverlayKey, w, h)!;
            const oCtx = overlayCanvas.getContext();

            // Same rounded rect clip as the base image
            oCtx.beginPath();
            oCtx.moveTo(radius, 0);
            oCtx.lineTo(w - radius, 0);
            oCtx.arcTo(w, 0, w, radius, radius);
            oCtx.lineTo(w, h - radius);
            oCtx.arcTo(w, h, w - radius, h, radius);
            oCtx.lineTo(radius, h);
            oCtx.arcTo(0, h, 0, h - radius, radius);
            oCtx.lineTo(0, radius);
            oCtx.arcTo(0, 0, radius, 0, radius);
            oCtx.closePath();
            oCtx.clip();

            // Cover-fill the overlay
            const oScale = Math.max(w / overlaySrc.width, h / overlaySrc.height);
            const oDrawW = overlaySrc.width * oScale;
            const oDrawH = overlaySrc.height * oScale;
            const oDx = (w - oDrawW) / 2;
            const oDy = (h - oDrawH) / 2;
            oCtx.drawImage(overlaySrc, oDx, oDy, oDrawW, oDrawH);

            overlayCanvas.refresh();
          }
          const overlay = this.scene.add.image(0, 0, roundedOverlayKey);
          this.add(overlay);
        }
      }
      }
    }

    // Price tag floating above the card (shop mode)
    const showCost = this._options.showCost ?? mode === 'shop';
    if ((showCost && this._def.cost !== undefined) || this._options.sellValue !== undefined) {
      const value = this._options.sellValue !== undefined ? this._options.sellValue : this._def.cost!;
      const prefix = this._options.sellValue !== undefined ? 'Sell $' : '$';
      const tagY = -hh - PRICE_TAG_GAP * scale - (PRICE_TAG_H * scale) / 2;

      const tagBg = this.scene.add.graphics();
      const tagW = 50 * scale;
      const tagH = PRICE_TAG_H * scale;
      tagBg.fillStyle(0x222233, 0.95);
      tagBg.fillRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, 6 * scale);
      tagBg.lineStyle(1.5 * scale, 0x555577, 0.8);
      tagBg.strokeRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, 6 * scale);
      this.add(tagBg);

      this.costText = this.scene.add
        .text(0, tagY, `${prefix}${value}`, {
          fontFamily: 'Arial Black',
          fontSize: `${Math.round(14 * scale)}px`,
          color: '#ffd700',
          align: 'center',
        })
        .setOrigin(0.5);
      this.add(this.costText);
    }
  }

  // ─── Hint Display ───

  private static readonly HINT_COLORS: Record<string, { text: string; bg?: number }> = {
    miles: { text: '#55aaff' },
    mult: { text: '#ffffff', bg: 0xcc3333 },
    xmult: { text: '#ffffff', bg: 0xcc3333 },
    odds: { text: '#55cc55' },
    inactive: { text: '#777777' },
    condition: { text: '#ddaa44' },
    active: { text: '#55dd55' },
    money: { text: '#ffd700' },
    text: { text: '#7b7b7b' },
    aura_fire: { text: '#ff4500' },
    aura_icy: { text: '#00bfff' },
    aura_holy: { text: '#fffacd' },
  };

  /** Build aura bonus row if this card has a scoring aura */
  private getAuraHintRow(): HintSegment[] | null {
    const aura = this._def.aura;
    if (!aura) return null;
    switch (aura.id) {
      case 'fire':
        return [
          { text: '+10', style: 'mult' },
          { text: 'Fire', style: 'aura_fire' },
        ];
      case 'icy':
        return [
          { text: '+50', style: 'miles' },
          { text: 'Icy', style: 'aura_icy' },
        ];
      case 'holy':
        return [
          { text: 'x1.5', style: 'xmult' },
          { text: 'Holy', style: 'aura_holy' },
        ];
      default:
        return null;
    }
  }

  /** Render or update the hint rows below the card */
  updateHints(game: GameState | null, player: PlayerState): void {
    if (this._suppressHints) return;
    if (!this._def.hintDisplay && !this._def.aura) return;

    const baseRows = this._def.hintDisplay ? this._def.hintDisplay(game, player) : [];
    const auraRow = this.getAuraHintRow();
    const rows = [...(baseRows || [])];
    if (auraRow) rows.push(auraRow);
    if (rows.length === 0) return;

    // Clear previous hint objects
    for (const obj of this.hintObjects) {
      obj.destroy();
    }
    this.hintObjects = [];

    const scale = this._options.cardScale ?? 1;
    const fontSize = Math.round(18 * scale);
    const padX = 3 * scale;
    const padY = 1 * scale;
    const chipRadius = 3 * scale;
    const rowHeight = Math.round(15 * scale);
    const rowGap = Math.round(10 * scale);
    const startY = this._cardH / 2 + Math.round(12 * scale);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rowY = startY + r * (rowHeight + rowGap) + rowHeight / 2;
      const segGap = Math.round(3 * scale);

      // Measure row width
      let totalW = 0;
      const measurements: { w: number; h: number }[] = [];
      for (const seg of row) {
        const hasBg = ItemCard.HINT_COLORS[seg.style]?.bg !== undefined;
        const tmpText = this.scene.add.text(0, 0, seg.text, {
          fontFamily: 'sans-serif',
          fontSize: `${fontSize}px`,
        });
        const tw = tmpText.width;
        const th = tmpText.height;
        tmpText.destroy();
        const segW = hasBg ? tw + padX * 2 : tw;
        measurements.push({ w: segW, h: th });
        totalW += segW;
      }
      // Add gaps between segments
      totalW += segGap * (row.length - 1);

      // Render segments centered
      let curX = -totalW / 2;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = ItemCard.HINT_COLORS[seg.style] ?? ItemCard.HINT_COLORS.text;
        const { w: segW, h: segH } = measurements[i];
        const hasBg = colors.bg !== undefined;

        if (hasBg) {
          const chipG = this.scene.add.graphics();
          const chipW = segW;
          const chipH = segH + padY * 2;
          chipG.fillStyle(colors.bg!, 0.9);
          chipG.fillRoundedRect(curX, rowY - chipH / 2, chipW, chipH, chipRadius);
          this.add(chipG);
          this.hintObjects.push(chipG);
        }

        const segText = this.scene.add
          .text(curX + segW / 2, rowY, seg.text, {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            color: colors.text,
          })
          .setOrigin(0.5);
        this.add(segText);
        this.hintObjects.push(segText);

        curX += segW + segGap;
      }
    }
  }

  // ─── Action Tabs (Sell / Use) ───

  get tabsVisible(): boolean {
    return this._tabsVisible;
  }
  get cardWidth(): number {
    return this._cardW;
  }
  get cardHeight(): number {
    return this._cardH;
  }

  /** Show action tabs. Bottom tabs slide the card up; right tabs slide out from the side. */
  showActionTabs(tabs: CardActionTabConfig[]): void {
    this.hideActionTabs();
    this._tabsVisible = true;

    const scale = this._options.cardScale ?? 1;
    const tabRadius = Math.round(6 * scale);
    const fontSize = Math.round(16 * scale);
    const hw = this._options.tabAnchorX ?? this._cardW / 2;
    const hh = this._cardH / 2;

    const bottomTabs = tabs.filter((t) => t.position === 'bottom');
    const rightTabs = tabs.filter((t) => t.position !== 'bottom');

    // ─── Bottom tabs (card slides up to reveal) ───
    if (bottomTabs.length > 0) {
      const btabH = Math.round(30 * scale);
      const btabW = Math.round(this._cardW * 0.8);

      for (let i = 0; i < bottomTabs.length; i++) {
        const cfg = bottomTabs[i];
        const tabContainer = this.scene.add.container(0, 0);
        tabContainer.setDepth(-1);

        const tabY = hh + (btabH * i);

        const bg = this.scene.add.graphics();
        bg.fillStyle(cfg.color, 0.95);
        bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, {
          tl: 0,
          tr: 0,
          bl: tabRadius,
          br: tabRadius,
        });
        bg.lineStyle(1, 0xffffff, 0.2);
        bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, {
          tl: 0,
          tr: 0,
          bl: tabRadius,
          br: tabRadius,
        });
        tabContainer.add(bg);

        const label = this.scene.add
          .text(0, tabY + btabH / 2, cfg.label, {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            fontStyle: 'bold',
            color: cfg.textColor ?? '#ffffff',
            align: 'center',
          })
          .setOrigin(0.5);
        tabContainer.add(label);

        // Make tab interactive
        tabContainer.setSize(btabW, btabH);
        tabContainer.setInteractive(
          new Phaser.Geom.Rectangle(0, tabY + btabH / 2, btabW, btabH),
          Phaser.Geom.Rectangle.Contains,
        );

        tabContainer.on('pointerover', () => {
          bg.clear();
          bg.fillStyle(Phaser.Display.Color.ValueToColor(cfg.color).lighten(20).color, 0.95);
          bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
          bg.lineStyle(1, 0xffffff, 0.4);
          bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
        });

        tabContainer.on('pointerout', () => {
          bg.clear();
          bg.fillStyle(cfg.color, 0.95);
          bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
          bg.lineStyle(1, 0xffffff, 0.2);
          bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
        });

        tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event?.stopPropagation();
          cfg.callback();
        });

        this.add(tabContainer);
        this.sendToBack(tabContainer);
        this.actionTabs.push({ container: tabContainer, config: cfg });
      }

      // Slide card up to reveal bottom tabs
      const liftAmount = bottomTabs.length * Math.round(30 * scale);
      this._tabLiftAmount = liftAmount;
      this.scene.tweens.add({
        targets: this,
        y: this.y - liftAmount,
        duration: 200,
        ease: 'Back.easeOut',
      });
    }

    // ─── Right-side tabs (slide out from card edge) ───
    const tabW = Math.round(50 * scale);
    const tabH = Math.round(45 * scale);
    const tabGap = Math.round(4 * scale);

    for (let i = 0; i < rightTabs.length; i++) {
      const cfg = rightTabs[i];
      const tabContainer = this.scene.add.container(hw, 0);
      tabContainer.setDepth(-1);

      const tabY = hh - tabH - (tabH + tabGap) * i - 30;

      const bg = this.scene.add.graphics();
      bg.fillStyle(cfg.color, 0.95);
      bg.fillRoundedRect(0, tabY, tabW, tabH, {
        tl: 0,
        tr: tabRadius,
        bl: 0,
        br: tabRadius,
      });
      bg.lineStyle(1, 0xffffff, 0.2);
      bg.strokeRoundedRect(0, tabY, tabW, tabH, {
        tl: 0,
        tr: tabRadius,
        bl: 0,
        br: tabRadius,
      });
      tabContainer.add(bg);

      const label = this.scene.add
        .text(tabW / 2, tabY + tabH / 2, cfg.label, {
          fontFamily: 'sans-serif',
          fontSize: `${fontSize}px`,
          color: cfg.textColor ?? '#ffffff',
          align: 'center',
          lineSpacing: -2,
        })
        .setOrigin(0.5);
      tabContainer.add(label);

      tabContainer.setSize(tabW, tabH);
      tabContainer.setInteractive(
        new Phaser.Geom.Rectangle(tabW / 2, tabY + tabH / 2, tabW, tabH),
        Phaser.Geom.Rectangle.Contains,
      );

      tabContainer.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(Phaser.Display.Color.ValueToColor(cfg.color).lighten(20).color, 0.95);
        bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        bg.lineStyle(1, 0xffffff, 0.4);
        bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      });

      tabContainer.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(cfg.color, 0.95);
        bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        bg.lineStyle(1, 0xffffff, 0.2);
        bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      });

      tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation();
        cfg.callback();
      });

      const finalX = hw;
      tabContainer.x = hw - tabW;
      this.add(tabContainer);
      this.sendToBack(tabContainer);

      this.scene.tweens.add({
        targets: tabContainer,
        x: finalX,
        duration: 200,
        ease: 'Back.easeOut',
        delay: i * 50,
      });

      this.actionTabs.push({ container: tabContainer, config: cfg });
    }

    // Play whoosh on open
    this.scene.sound.play('sfx_whoosh', { volume: 0.3 });
  }

  /** Hide action tabs with optional slide-back animation */
  hideActionTabs(animate: boolean = false): void {
    if (!this._tabsVisible) return;
    this._tabsVisible = false;

    // Slide card back down if it was lifted for bottom tabs
    if (this._tabLiftAmount > 0 && this.scene) {
      if (animate) {
        this.scene.tweens.add({
          targets: this,
          y: this.y + this._tabLiftAmount,
          duration: 150,
          ease: 'Power2',
        });
      } else {
        this.y += this._tabLiftAmount;
      }
      this._tabLiftAmount = 0;
    }

    if (animate && this.actionTabs.length > 0 && this.scene) {
      // Play whoosh on close
      this.scene.sound.play('sfx_whoosh2', { volume: 0.3 });
      const hw = this._cardW / 2;
      const scale = this._options.cardScale ?? 1;
      const tabW = Math.round(50 * scale);
      for (const tab of this.actionTabs) {
        const container = tab.container;
        // Only animate right-side tabs (bottom tabs just get destroyed with the card drop)
        if (tab.config.position !== 'bottom') {
          this.scene.tweens.add({
            targets: container,
            x: hw - tabW,
            duration: 150,
            ease: 'Power2',
            onComplete: () => container.destroy(),
          });
        } else {
          container.destroy();
        }
      }
    } else {
      for (const tab of this.actionTabs) {
        tab.container.destroy();
      }
    }
    this.actionTabs = [];
  }

  // ─── Tooltip ───

  private showTooltip(): void {
    if (this._suppressTooltip || this._faceDown) return;
    if (this.tooltip) return;

    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    // Build tooltip text
    const lines: string[] = [];
    lines.push(this._def.name);
    lines.push('');
    lines.push(this._def.description);
    if (this._def.rarity || this._def.cost !== undefined) {
      lines.push('');
      const rarityLabel = this._def.rarity ? (RARITY_LABELS[this._def.rarity] ?? this._def.rarity) : '';
      const costLabel = this._def.cost !== undefined ? `Cost: $${this._def.cost}` : '';
      lines.push([rarityLabel, costLabel].filter(Boolean).join('  ·  '));
    }
    const rarityLabel = this._def.rarity ? (RARITY_LABELS[this._def.rarity] ?? this._def.rarity) : null;

    const infoText = this.scene.add
      .text(0, 0, lines.join('\n'), {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: '#dddddd',
        lineSpacing: 4,
        wordWrap: { width: 200 },
      })
      .setOrigin(0, 0);

    // Title styling
    const nameText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD, this._def.name, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    const descText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD + nameText.height + 6, this._def.description, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#cccccc',
        lineSpacing: 3,
        wordWrap: { width: 200 },
      })
      .setOrigin(0, 0);

    let bottomY = TOOLTIP_PAD + nameText.height + 6 + descText.height;
    const tooltipChildren: GameObjects.GameObject[] = [nameText, descText];

    if (rarityLabel) {
      const rarityText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 8, rarityLabel, {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#888888',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 8 + rarityText.height;
      tooltipChildren.push(rarityText);
    }

    // Aura info (if present on EquipmentDef)
    const aura = this._def.aura;
    if (aura) {
      const auraText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 6, `✦ ${aura.name}: ${aura.description}`, {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: '#ddaa44',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 6 + auraText.height;
      tooltipChildren.push(auraText);
    }

    // Compute size
    const contentWidth = tooltipChildren.reduce(
      (max, child) => Math.max(max, (child as GameObjects.Text).width ?? 0),
      0,
    );
    const tooltipW = contentWidth + TOOLTIP_PAD * 2;
    const tooltipH = bottomY + TOOLTIP_PAD;

    // Discard the multiline infoText — we built separate texts instead
    infoText.destroy();

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add([bg, ...tooltipChildren]);

    // Position to the left of the card
    const hw = this._cardW / 2;
    let tx = worldX - hw - tooltipW - 10;
    let ty = worldY - tooltipH / 2;

    // Clamp to screen bounds
    const { width: sw, height: sh } = this.scene.scale;
    if (tx < 8) {
      // Not enough room on left — fall back to right side
      tx = worldX + hw + 10;
    }
    if (tx + tooltipW > sw - 8) tx = sw - 8 - tooltipW;
    if (ty < 8) ty = 8;
    if (ty + tooltipH > sh - 8) ty = sh - 8 - tooltipH;

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
    this.hideActionTabs();
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
