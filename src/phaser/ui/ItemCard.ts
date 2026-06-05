// ─── ItemCard ───
// Reusable Phaser Container that displays any game card (equipment, trail guide,
// supply card, frontier encounter, etc.) as a worn card with rounded corners,
// drop shadow, item image, and hover tooltip.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../game/Constants';
import type { ItemAura, EquipmentInstance } from '../../game/ItemsSystem';
import type { HintSegment, HintSize, ItemDisplayResult } from '../../game/ItemsSystem';
import { isEquipmentCursed, isEquipmentLeased, isEquipmentPerishable } from '../../game/ItemsSystem';
import { getModifierTooltipLines } from '../../game/EquipmentModifierDisplay';
import { addModifierBadgeImage, addProfessionSpecialBadgeImage } from './ModifierAssets';
import { getRunState } from '../../game/store/runStore';
import { selectIsProfessionSpecialEquipment } from '../../game/store/selectors/runSelectors';
import type { EquipmentModifier } from '../../game/types';
import type { CardTemplate } from '../../data/items';
import { getItemDisplayContext, type ItemDisplayContext, type RoundHintContext } from '../../game/displayContext';
import { applyAuraGlow, createAuraParticles } from './AuraFX';

/** Generic data shape for any card type */
export interface CardData {
  id: string;
  name: string;
  cost?: number;
  rarity?: string;
  aura?: ItemAura | null;
  cardTemplate?: CardTemplate;
  display: (round: RoundHintContext | null, player: ItemDisplayContext) => ItemDisplayResult;
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
  /** Legacy texture key prefix. When provided, texture key is `${prefix}${id}` with no frame. */
  texturePrefix?: string;
  /** Texture key for atlas/non-atlas lookup (default 'items' when texturePrefix is unset). */
  textureKey?: string;
  /** Frame suffix when using atlas mode (default '.png'). */
  textureFrameSuffix?: string;
  /** Image fit mode for non-transparent cards */
  imageFit?: 'cover' | 'contain';
  /** If true, no card background is drawn and image is displayed as-is (contain-fit) */
  transparentBg?: boolean;
  /** Override x-anchor for action tabs (default: card half-width). Useful for narrow images. */
  tabAnchorX?: number;
  /** Owned equipment instance — enables modifier badges and tooltip lines */
  equipment?: EquipmentInstance;
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
  /** Grayed-out tab with no action (e.g. cursed equipment) */
  disabled?: boolean;
}

interface ActionTabInstance {
  container: GameObjects.Container;
  config: CardActionTabConfig;
}

interface SegmentRenderMetrics {
  fontSize: number;
  padX: number;
  padY: number;
}

interface CardTextureSource {
  key: string;
  frame?: string;
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
  private _interactionTooltipSuppressed: boolean = false;
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
  private ghostTintOverlay: GameObjects.Graphics | null = null;
  private auraImageFilterCleanup: (() => void) | null = null;
  private auraSuppressed: boolean = false;
  private hintObjects: GameObjects.GameObject[] = [];
  private actionTabs: ActionTabInstance[] = [];
  private _tabsVisible: boolean = false;
  private _tabLiftAmount: number = 0;
  private _equipment: EquipmentInstance | null = null;
  private modifierBadgeContainers: GameObjects.Container[] = [];
  private professionSpecialBadgeContainer: GameObjects.Container | null = null;
  private perishableBadgeContainer: GameObjects.Container | null = null;
  private leasedBadgeContainer: GameObjects.Container | null = null;
  private tooltipRound: RoundHintContext | null = null;
  private tooltipPlayer: ItemDisplayContext | null = null;

  constructor(scene: Scene, x: number, y: number, def: CardData, options?: ItemCardOptions) {
    super(scene, x, y);
    this._def = def;
    this._options = options ?? {};
    this._equipment = this._options.equipment ?? null;

    const scale = this._options.cardScale ?? 1;
    this._cardW = CARD_W * scale;
    this._cardH = CARD_H * scale;

    this.cardBg = scene.add.graphics();
    this.add(this.cardBg);

    this.drawCard();
    this.addContent(scale);
    this.renderEquipmentBadges();
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
  get equipment(): EquipmentInstance | null {
    return this._equipment;
  }

  /** Refresh modifier and profession-special badges (e.g. after perishable countdown). */
  updateModifierBadges(equipment?: EquipmentInstance): void {
    if (equipment) this._equipment = equipment;
    this.renderEquipmentBadges();
  }

  /** Re-apply aura VFX when equipment.def is replaced in-place (Bless, Blood Moon, dev tools). */
  syncAuraFromEquipment(equipment: EquipmentInstance): void {
    this._equipment = equipment;
    const prevAuraId = this._def.aura?.id ?? '';
    this._def = equipment.def;
    const nextAuraId = this._def.aura?.id ?? '';
    // Ghost aura has no particle emitters; only compare aura id to avoid stacking filters on every hint sync.
    if (prevAuraId === nextAuraId) return;
    this.clearAuraVFX();
    if (this._def.aura) this.setupAuraVFX();
  }

  /** Pulse the perishable badge red when one round remains. */
  flashPerishableWarning(): void {
    if (!this.perishableBadgeContainer || !this.scene) return;
    this.scene.tweens.add({
      targets: this.perishableBadgeContainer,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
  }

  /** Brief flash on leased badge when upkeep is paid. */
  flashLeasedPaid(): void {
    if (!this.leasedBadgeContainer || !this.scene) return;
    this.scene.tweens.add({
      targets: this.leasedBadgeContainer,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      yoyo: true,
      repeat: 1,
      ease: 'Back.easeOut',
    });
  }

  /** Crumble/fade when destroyed by perishable expiry or lease default. */
  animateModifierDestruction(type: 'perished' | 'repossessed', onComplete: () => void): void {
    this.prepareForRemoval();

    const matrix = this.getWorldTransformMatrix();
    const wx = matrix.tx;
    const wy = matrix.ty - this._cardH / 2 - 8;
    const label = type === 'perished' ? 'Spoiled!' : 'Repossessed!';
    const color = type === 'perished' ? '#ff8800' : '#ffd700';

    const popup = this.scene.add
      .text(wx, wy, label, {
        fontFamily: 'Arial Black',
        fontSize: '15px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(500);

    this.scene.sound.play('sfx_explosion', { volume: 0.45 });

    this.scene.tweens.add({
      targets: popup,
      y: wy - 28,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 0.15,
      scaleY: 0.15,
      rotation: this.rotation + (Math.random() > 0.5 ? 0.6 : -0.6),
      duration: 380,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  /** Prevent stray hover/click behavior while this card is being removed. */
  prepareForRemoval(): void {
    if (!this.scene) return;
    this.hideTooltip();
    this.hideActionTabs(true);
    this.disableInteractive();
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

  /** Hide tooltips during drag/reorder without clearing boss or scene suppress state. */
  setInteractionTooltipSuppressed(suppressed: boolean): void {
    this._interactionTooltipSuppressed = suppressed;
    if (suppressed) this.hideTooltip();
  }

  setSuppressHints(suppress: boolean): void {
    this._suppressHints = suppress;
    if (suppress) {
      for (const obj of this.hintObjects) obj.destroy();
      this.hintObjects = [];
    }
  }

  setTooltipContext(round: RoundHintContext | null, player: ItemDisplayContext | null = null): void {
    this.tooltipRound = round;
    this.tooltipPlayer = player;
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
    this.applyFaceDownSuppression();
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

  private applyFaceDownSuppression(): void {
    if (this.cardImage) this.cardImage.setVisible(!this._faceDown);
    for (const c of this.modifierBadgeContainers) c.setVisible(!this._faceDown);
    if (this.professionSpecialBadgeContainer) this.professionSpecialBadgeContainer.setVisible(!this._faceDown);
    if (this.perishableBadgeContainer) this.perishableBadgeContainer.setVisible(!this._faceDown);
    if (this.leasedBadgeContainer) this.leasedBadgeContainer.setVisible(!this._faceDown);
    this.setAuraSuppressed(this._faceDown);
  }

  private setAuraSuppressed(suppressed: boolean): void {
    if (this.auraSuppressed === suppressed) return;
    this.auraSuppressed = suppressed;
    if (suppressed) {
      this.clearAuraVFX();
      return;
    }
    if (this._def.aura) this.setupAuraVFX();
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

  private clearAuraVFX(): void {
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];
    if (this.auraGlowCleanup) {
      this.auraGlowCleanup();
      this.auraGlowCleanup = null;
    }
    if (this.ghostTintOverlay) {
      this.ghostTintOverlay.destroy();
      this.ghostTintOverlay = null;
    }
    if (this.auraImageFilterCleanup) {
      this.auraImageFilterCleanup();
      this.auraImageFilterCleanup = null;
    }
    if (this.cardImage) {
      this.cardImage.setAlpha(1);
    }
    this.setAlpha(1);
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
        const img = this.cardImage as GameObjects.Image & { enableFilters?: () => void; filters?: any };
        if (img.enableFilters) {
          img.enableFilters();
          const cm = img.filters.internal.addColorMatrix();
          cm.colorMatrix.negative();
          this.auraImageFilterCleanup = () => {
            if (img.filters) img.filters.internal.remove(cm);
          };
        }
      }
      const tintOverlay = this.scene.add.graphics();
      tintOverlay.fillStyle(0x44dd88, 0.3);
      tintOverlay.fillRoundedRect(-hw, -hh, this._cardW, this._cardH, CARD_RADIUS);
      this.ghostTintOverlay = tintOverlay;
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

  private resolveCardTextureSource(): CardTextureSource {
    if (this._options.texturePrefix) {
      return { key: `${this._options.texturePrefix}${this._def.id}` };
    }
    const textureKey = this._options.textureKey ?? 'items';
    const frameSuffix = this._options.textureFrameSuffix ?? '.png';
    return { key: textureKey, frame: `${this._def.id}${frameSuffix}` };
  }

  private getCardTextureFrame(source: CardTextureSource): Phaser.Textures.Frame | null {
    return this.scene.textures.getFrame(source.key, source.frame);
  }

  private addContent(scale: number): void {
    const w = this._cardW;
    const h = this._cardH;
    const hh = h / 2;
    const mode = this._options.mode ?? 'shop';
    const radius = CARD_RADIUS * scale;

    // Item image — bake rounded corners into a CanvasTexture
    const source = this.resolveCardTextureSource();
    const sourceFrame = this.getCardTextureFrame(source);
    if (sourceFrame) {
      if (this._options.transparentBg) {
        // Transparent mode: display image as-is, contain-fit within card bounds
        const img = this.scene.add.image(0, 0, source.key, source.frame);
        const containScale = Math.min(w / sourceFrame.cutWidth, h / sourceFrame.cutHeight) * 0.85;
        img.setScale(containScale);
        this.cardImage = img;
        this.add(img);
      } else {
        const imageFit = this._options.imageFit ?? 'cover';
        if (imageFit === 'contain') {
          const img = this.scene.add.image(0, 0, source.key, source.frame);
          const containScale = Math.min((w * 0.82) / sourceFrame.cutWidth, (h * 0.82) / sourceFrame.cutHeight);
          img.setScale(containScale);
          this.cardImage = img;
          this.add(img);
        } else {
          const roundedKey = `${source.key}_${source.frame ?? '__BASE'}_rounded_${Math.round(w)}x${Math.round(h)}`;

          if (!this.scene.textures.exists(roundedKey)) {
            // Draw the specific frame region so atlas-backed cards render correctly.
            const sourceImage = sourceFrame.source.image as CanvasImageSource;
            const srcW = sourceFrame.cutWidth;
            const srcH = sourceFrame.cutHeight;

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
            const imgScale = Math.max(w / srcW, h / srcH);
            const drawW = srcW * imgScale;
            const drawH = srcH * imgScale;
            const dx = (w - drawW) / 2;
            const dy = (h - drawH) / 2;
            ctx.drawImage(sourceImage, sourceFrame.cutX, sourceFrame.cutY, srcW, srcH, dx, dy, drawW, drawH);

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

  // ─── Modifier Badges ───

  private clearEquipmentBadges(): void {
    for (const c of this.modifierBadgeContainers) c.destroy();
    this.modifierBadgeContainers = [];
    this.professionSpecialBadgeContainer?.destroy();
    this.professionSpecialBadgeContainer = null;
    this.perishableBadgeContainer = null;
    this.leasedBadgeContainer = null;
  }

  private renderEquipmentBadges(): void {
    this.clearEquipmentBadges();
    this.renderModifierBadges();
    this.renderProfessionSpecialBadge();
    this.applyFaceDownSuppression();
  }

  private renderModifierBadges(): void {
    if (!this._equipment || this._equipment.modifiers.length === 0) return;

    const scale = this._options.cardScale ?? 1;
    const size = UI.MODIFIER_BADGE_SIZE * scale;
    const gap = UI.MODIFIER_BADGE_GAP * scale;
    const offset = UI.MODIFIER_BADGE_OFFSET * scale;
    const hw = this._cardW / 2;
    const hh = this._cardH / 2;

    const kinds: EquipmentModifier[] = [];
    if (isEquipmentCursed(this._equipment)) kinds.push('cursed');
    if (isEquipmentPerishable(this._equipment)) kinds.push('perishable');
    if (isEquipmentLeased(this._equipment)) kinds.push('leased');

    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const x = hw - offset - size / 2;
      const y = -hh + offset + size / 2 + i * (size + gap);

      const container = this.scene.add.container(x, y);
      addModifierBadgeImage(this.scene, container, kind, size);

      container.setDepth(25);
      this.add(container);
      this.bringToTop(container);
      this.modifierBadgeContainers.push(container);

      if (kind === 'perishable') this.perishableBadgeContainer = container;
      if (kind === 'leased') this.leasedBadgeContainer = container;
    }
  }

  private renderProfessionSpecialBadge(): void {
    if (!selectIsProfessionSpecialEquipment(getRunState(), this._def.id)) return;

    const scale = this._options.cardScale ?? 1;
    const size = UI.MODIFIER_BADGE_SIZE * scale;
    const offset = UI.MODIFIER_BADGE_OFFSET * scale;
    const hw = this._cardW / 2;
    const hh = this._cardH / 2;
    const x = -hw + offset + size / 2;
    const y = hh - offset - size / 2;

    const container = this.scene.add.container(x, y);
    addProfessionSpecialBadgeImage(this.scene, container, size);
    container.setDepth(25);
    this.add(container);
    this.bringToTop(container);
    this.professionSpecialBadgeContainer = container;
  }

  // ─── Hint Display ───

  private static readonly HINT_COLORS: Record<string, { text: string; bg?: number }> = {
    miles: { text: '#55aaff' },
    mult: { text: '#ffffff', bg: 0xcc3333 },
    xmult: { text: '#ffffff', bg: 0xcc3333 },
    retrigger: { text: '#b266ff' },
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

  /** Tooltip uses larger type and brighter plain text than on-card hints */
  private static tooltipSegmentColors(style: string): { text: string; bg?: number } {
    const base = ItemCard.HINT_COLORS[style] ?? ItemCard.HINT_COLORS.text;
    if (style === 'text') return { text: COLORS.TOOLTIP_BODY_TEXT };
    return base;
  }

  private static readonly SIZE_SCALE: Record<HintSize, number> = {
    xs: 0.7,
    sm: 0.85,
    md: 1,
  };

  private static getSegmentSize(seg: HintSegment): HintSize {
    return seg.size ?? 'md';
  }

  private static getHintMetrics(seg: HintSegment, scale: number): SegmentRenderMetrics {
    const segmentScale = ItemCard.SIZE_SCALE[ItemCard.getSegmentSize(seg)];
    return {
      fontSize: Math.max(12, Math.round(24 * scale * segmentScale)),
      padX: Math.max(1, Math.round(3 * scale * segmentScale)),
      padY: Math.max(1, Math.round(scale * segmentScale)),
    };
  }

  private static getTooltipMetrics(seg: HintSegment): SegmentRenderMetrics {
    const segmentScale = ItemCard.SIZE_SCALE[ItemCard.getSegmentSize(seg)];
    return {
      fontSize: Math.max(10, Math.round(UI.CARD_TOOLTIP_FONT_SIZE * segmentScale)),
      padX: Math.max(1, Math.round(3 * segmentScale)),
      padY: Math.max(1, Math.round(segmentScale)),
    };
  }

  /** Build aura bonus row if this card has a scoring aura */
  private getAuraHintRow(): HintSegment[] | null {
    const aura = this._def.aura;
    if (!aura) return null;
    switch (aura.id) {
      case 'fire':
        return [
          { text: '+10', style: 'mult', size: 'xs' },
          { text: 'Fire', style: 'aura_fire', size: 'xs' },
        ];
      case 'icy':
        return [
          { text: '+50', style: 'miles', size: 'xs' },
          { text: 'Icy', style: 'aura_icy', size: 'xs' },
        ];
      case 'holy':
        return [
          { text: 'x1.5', style: 'xmult', size: 'xs' },
          { text: 'Holy', style: 'aura_holy', size: 'xs' },
        ];
      default:
        return null;
    }
  }

  private resolveDisplay(round: RoundHintContext | null, player: ItemDisplayContext): ItemDisplayResult {
    return this._def.display(round, player);
  }

  /** Render or update the hint rows below the card */
  updateHints(round: RoundHintContext | null, player: ItemDisplayContext): void {
    if (!this.scene) return;
    this.setTooltipContext(round, player);
    if (this._suppressHints) return;
    if (!this._def.aura && this.resolveDisplay(round, player).hint.length === 0) return;

    const baseRows = this.resolveDisplay(round, player).hint;
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
    const chipRadius = 3 * scale;
    const rowGap = Math.round(8 * scale);
    const startY = this._cardH / 2 + Math.round(12 * scale);
    const segGap = Math.round(3 * scale);
    let currentY = startY;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Measure row width
      let totalW = 0;
      let rowHeight = 0;
      const measurements: Array<SegmentRenderMetrics & { w: number; h: number }> = [];
      for (const seg of row) {
        const metrics = ItemCard.getHintMetrics(seg, scale);
        const hasBg = ItemCard.HINT_COLORS[seg.style]?.bg !== undefined;
        const tmpText = this.scene.add.text(0, 0, seg.text, {
          fontFamily: 'sans-serif',
          fontSize: `${metrics.fontSize}px`,
        });
        const tw = tmpText.width;
        const th = tmpText.height;
        tmpText.destroy();
        const segW = hasBg ? tw + metrics.padX * 2 : tw;
        const segH = hasBg ? th + metrics.padY * 2 : th;
        measurements.push({ ...metrics, w: segW, h: segH });
        totalW += segW;
        rowHeight = Math.max(rowHeight, segH);
      }
      // Add gaps between segments
      totalW += segGap * (row.length - 1);
      const rowY = currentY + rowHeight / 2;

      // Render segments centered
      let curX = -totalW / 2;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = ItemCard.HINT_COLORS[seg.style] ?? ItemCard.HINT_COLORS.text;
        const { w: segW, h: segH, fontSize, padX } = measurements[i];
        const hasBg = colors.bg !== undefined;

        if (hasBg) {
          const chipG = this.scene.add.graphics();
          chipG.fillStyle(colors.bg!, 0.9);
          chipG.fillRoundedRect(curX, rowY - segH / 2, segW, segH, chipRadius);
          this.add(chipG);
          this.hintObjects.push(chipG);
        }

        const segText = this.scene.add
          .text(curX + (hasBg ? padX : segW / 2), rowY, seg.text, {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            color: colors.text,
          })
          .setOrigin(hasBg ? 0 : 0.5, 0.5);
        this.add(segText);
        this.hintObjects.push(segText);

        curX += segW + segGap;
      }
      currentY += rowHeight + rowGap;
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

        const tabY = hh + btabH * i;

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

        if (!cfg.disabled) {
          tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event?.stopPropagation();
            cfg.callback();
          });
        } else {
          tabContainer.disableInteractive();
        }

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

      if (!cfg.disabled) {
        tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event?.stopPropagation();
          cfg.callback();
        });
      } else {
        tabContainer.disableInteractive();
      }

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
    if (this._suppressTooltip || this._interactionTooltipSuppressed || this._faceDown) return;
    if (this.tooltip) return;

    const player = this.tooltipPlayer ?? getItemDisplayContext();

    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);
    const tooltipRows = this.resolveDisplay(this.tooltipRound, player).tooltip;

    const rarityLabel = this._def.rarity ? (RARITY_LABELS[this._def.rarity] ?? this._def.rarity) : null;

    // Title styling
    const nameText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD, this._def.name, {
        fontFamily: 'Arial',
        fontSize: `${UI.CARD_TOOLTIP_TITLE_FONT_SIZE}px`,
        color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    let bottomY = TOOLTIP_PAD + nameText.height + 6;
    const tooltipChildren: GameObjects.GameObject[] = [nameText];
    let contentWidth = nameText.width;

    const segGap = 4;
    const chipRadius = 3;
    for (const row of tooltipRows) {
      if (!row || row.length === 0) {
        bottomY += 4;
        continue;
      }

      const measurements: Array<SegmentRenderMetrics & { w: number; h: number; hasBg: boolean }> = [];
      let rowWidth = 0;
      let rowHeight = 0;
      for (const seg of row) {
        const metrics = ItemCard.getTooltipMetrics(seg);
        const colors = ItemCard.tooltipSegmentColors(seg.style);
        const hasBg = colors.bg !== undefined;
        const tmpText = this.scene.add.text(0, 0, seg.text, {
          fontFamily: 'Arial',
          fontSize: `${metrics.fontSize}px`,
        });
        const tw = tmpText.width;
        const th = tmpText.height;
        tmpText.destroy();
        const w = hasBg ? tw + metrics.padX * 2 : tw;
        const h = hasBg ? th + metrics.padY * 2 : th;
        measurements.push({ ...metrics, w, h, hasBg });
        rowWidth += w;
        rowHeight = Math.max(rowHeight, h);
      }
      rowWidth += segGap * Math.max(0, row.length - 1);
      contentWidth = Math.max(contentWidth, rowWidth);

      const rowY = bottomY + rowHeight / 2;
      let curX = TOOLTIP_PAD;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = ItemCard.tooltipSegmentColors(seg.style);
        const measurement = measurements[i];
        if (measurement.hasBg) {
          const chipG = this.scene.add.graphics();
          chipG.fillStyle(colors.bg!, 0.9);
          chipG.fillRoundedRect(curX, rowY - measurement.h / 2, measurement.w, measurement.h, chipRadius);
          tooltipChildren.push(chipG);
        }

        const segText = this.scene.add
          .text(curX + (measurement.hasBg ? measurement.padX : 0), rowY, seg.text, {
            fontFamily: 'Arial',
            fontSize: `${measurement.fontSize}px`,
            color: colors.text,
          })
          .setOrigin(0, 0.5);
        tooltipChildren.push(segText);
        curX += measurement.w + segGap;
      }
      bottomY += rowHeight + 5;
    }

    if (rarityLabel) {
      const rarityText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 8, rarityLabel, {
          fontFamily: 'Arial',
          fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
          color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#888888',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 8 + rarityText.height;
      tooltipChildren.push(rarityText);
      contentWidth = Math.max(contentWidth, rarityText.width);
    }

    // Aura info (if present on EquipmentDef)
    const aura = this._def.aura;
    if (aura) {
      const auraText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 6, `✦ ${aura.name}: ${aura.description}`, {
          fontFamily: 'Arial',
          fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
          color: '#ddaa44',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 6 + auraText.height;
      tooltipChildren.push(auraText);
      contentWidth = Math.max(contentWidth, auraText.width);
    }

    if (this._equipment) {
      const modLines = getModifierTooltipLines(this._equipment);
      for (const line of modLines) {
        const modText = this.scene.add
          .text(TOOLTIP_PAD, bottomY + 6, line.text, {
            fontFamily: 'Arial',
            fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
            color: line.color,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0);
        bottomY = bottomY + 6 + modText.height;
        tooltipChildren.push(modText);
        contentWidth = Math.max(contentWidth, modText.width);
      }
    }

    const tooltipW = contentWidth + TOOLTIP_PAD * 2;
    const tooltipH = bottomY + TOOLTIP_PAD;

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
    this.clearEquipmentBadges();
    this.clearAuraVFX();
    super.destroy(fromScene);
  }
}
