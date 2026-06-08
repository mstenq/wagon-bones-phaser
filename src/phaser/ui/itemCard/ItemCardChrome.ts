// ─── ItemCard chrome, content, and overlays ───

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../../game/Constants';
import type { CardData, CardTextureSource, ItemCardLayout, ItemCardOptions } from './itemCardTypes';
import { computePriceTagMetrics } from './priceTagLayout';

const CARD_RADIUS = UI.CARD_RADIUS;
const SHADOW_OFFSET = UI.CARD_SHADOW_OFFSET;
const SHADOW_ALPHA = UI.CARD_SHADOW_ALPHA;

export interface ItemCardContentResult {
  cardImage: GameObjects.Image | null;
  costText: GameObjects.Text | null;
}

export class ItemCardChrome {
  readonly cardBg: GameObjects.Graphics;
  readonly soldOverlay: GameObjects.Graphics;
  readonly disabledOverlay: GameObjects.Graphics;
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private readonly options: ItemCardOptions;
  private readonly def: CardData;
  private faceDownCover: GameObjects.Graphics | null = null;
  cardImage: GameObjects.Image | null = null;
  costText: GameObjects.Text | null = null;

  constructor(
    scene: Scene,
    card: GameObjects.Container,
    layout: ItemCardLayout,
    def: CardData,
    options: ItemCardOptions,
  ) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
    this.def = def;
    this.options = options;

    this.cardBg = scene.add.graphics();
    this.card.add(this.cardBg);

    this.drawCardBackground();

    const content = this.addContent();
    this.cardImage = content.cardImage;
    this.costText = content.costText;

    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.card.add(this.soldOverlay);

    this.disabledOverlay = scene.add.graphics();
    this.card.add(this.disabledOverlay);
  }

  drawBossDisabledOverlay(bossDisabled: boolean): void {
    this.disabledOverlay.clear();
    if (!bossDisabled) return;
    const hw = this.layout.cardW / 2;
    const hh = this.layout.cardH / 2;
    this.disabledOverlay.lineStyle(5, 0xcc2222, 1);
    this.disabledOverlay.lineBetween(-hw * 0.7, -hh * 0.7, hw * 0.7, hh * 0.7);
    this.disabledOverlay.lineBetween(hw * 0.7, -hh * 0.7, -hw * 0.7, hh * 0.7);
    this.disabledOverlay.setDepth(20);
  }

  refreshFaceDown(faceDown: boolean): void {
    if (this.faceDownCover) {
      this.faceDownCover.destroy();
      this.faceDownCover = null;
    }
    if (this.cardImage) this.cardImage.setVisible(!faceDown);
    if (!faceDown) return;

    const hw = this.layout.cardW / 2;
    const hh = this.layout.cardH / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0x2a1f3d, 1);
    g.fillRoundedRect(-hw, -hh, this.layout.cardW, this.layout.cardH, CARD_RADIUS);
    g.lineStyle(2, 0x6a4a8a, 0.9);
    g.strokeRoundedRect(-hw, -hh, this.layout.cardW, this.layout.cardH, CARD_RADIUS);
    g.fillStyle(0x4a3560, 0.6);
    g.fillTriangle(0, -hh + 12, -14, 0, 14, 0);
    g.fillTriangle(0, hh - 12, -14, 0, 14, 0);
    this.faceDownCover = g;
    this.card.add(g);
    this.card.bringToTop(g);
  }

  markSold(): void {
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(
      -this.layout.cardW / 2,
      -this.layout.cardH / 2,
      this.layout.cardW,
      this.layout.cardH,
      CARD_RADIUS,
    );
    this.soldOverlay.setVisible(true);
    if (this.costText) {
      this.costText.setText('SOLD');
      this.costText.setColor('#888888');
    }
  }

  setAffordable(canAfford: boolean, sold: boolean): void {
    if (sold) return;
    if (this.costText) {
      this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
    }
  }

  private drawCardBackground(): void {
    if (this.options.transparentBg) return;

    const g = this.cardBg;
    g.clear();

    const w = this.layout.cardW;
    const h = this.layout.cardH;
    const hw = w / 2;
    const hh = h / 2;

    g.fillStyle(0x000000, SHADOW_ALPHA);
    g.fillRoundedRect(-hw + SHADOW_OFFSET, -hh + SHADOW_OFFSET, w, h, CARD_RADIUS);

    g.fillStyle(COLORS.BG_CARD, 1);
    g.fillRoundedRect(-hw, -hh, w, h, CARD_RADIUS);
  }

  private resolveCardTextureSource(): CardTextureSource {
    if (this.options.texturePrefix) {
      return { key: `${this.options.texturePrefix}${this.def.id}` };
    }
    const textureKey = this.options.textureKey ?? 'items';
    const frameSuffix = this.options.textureFrameSuffix ?? '.png';
    return { key: textureKey, frame: `${this.def.id}${frameSuffix}` };
  }

  private getCardTextureFrame(source: CardTextureSource): Phaser.Textures.Frame | null {
    return this.scene.textures.getFrame(source.key, source.frame);
  }

  private addContent(): ItemCardContentResult {
    const w = this.layout.cardW;
    const h = this.layout.cardH;
    const hh = h / 2;
    const scale = this.layout.cardScale;
    const mode = this.options.mode ?? 'shop';
    const radius = CARD_RADIUS * scale;
    let cardImage: GameObjects.Image | null = null;
    let costText: GameObjects.Text | null = null;

    const source = this.resolveCardTextureSource();
    const sourceFrame = this.getCardTextureFrame(source);
    if (sourceFrame) {
      if (this.options.transparentBg) {
        const img = this.scene.add.image(0, 0, source.key, source.frame);
        const containScale = Math.min(w / sourceFrame.cutWidth, h / sourceFrame.cutHeight) * 0.85;
        img.setScale(containScale);
        cardImage = img;
        this.card.add(img);
      } else {
        const imageFit = this.options.imageFit ?? 'cover';
        if (imageFit === 'contain') {
          const img = this.scene.add.image(0, 0, source.key, source.frame);
          const containScale = Math.min((w * 0.82) / sourceFrame.cutWidth, (h * 0.82) / sourceFrame.cutHeight);
          img.setScale(containScale);
          cardImage = img;
          this.card.add(img);
        } else {
          const roundedKey = `${source.key}_${source.frame ?? '__BASE'}_rounded_${Math.round(w)}x${Math.round(h)}`;

          if (!this.scene.textures.exists(roundedKey)) {
            const sourceImage = sourceFrame.source.image as CanvasImageSource;
            const srcW = sourceFrame.cutWidth;
            const srcH = sourceFrame.cutHeight;

            const canvasTex = this.scene.textures.createCanvas(roundedKey, w, h)!;
            const ctx = canvasTex.getContext();

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

            const imgScale = Math.max(w / srcW, h / srcH);
            const drawW = srcW * imgScale;
            const drawH = srcH * imgScale;
            const dx = (w - drawW) / 2;
            const dy = (h - drawH) / 2;
            ctx.drawImage(sourceImage, sourceFrame.cutX, sourceFrame.cutY, srcW, srcH, dx, dy, drawW, drawH);

            canvasTex.refresh();
          }

          const img = this.scene.add.image(0, 0, roundedKey);
          cardImage = img;
          this.card.add(img);

          if (this.def.cardTemplate) {
            const overlayKey = `card_template_${this.def.cardTemplate}`;
            if (this.scene.textures.exists(overlayKey)) {
              const roundedOverlayKey = `${overlayKey}_rounded_${Math.round(w)}x${Math.round(h)}`;
              if (!this.scene.textures.exists(roundedOverlayKey)) {
                const overlaySrc = this.scene.textures.get(overlayKey).getSourceImage() as HTMLImageElement;
                const overlayCanvas = this.scene.textures.createCanvas(roundedOverlayKey, w, h)!;
                const oCtx = overlayCanvas.getContext();

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

                const oScale = Math.max(w / overlaySrc.width, h / overlaySrc.height);
                const oDrawW = overlaySrc.width * oScale;
                const oDrawH = overlaySrc.height * oScale;
                const oDx = (w - oDrawW) / 2;
                const oDy = (h - oDrawH) / 2;
                oCtx.drawImage(overlaySrc, oDx, oDy, oDrawW, oDrawH);

                overlayCanvas.refresh();
              }
              const overlay = this.scene.add.image(0, 0, roundedOverlayKey);
              this.card.add(overlay);
            }
          }
        }
      }
    }

    const showCost = this.options.showCost ?? mode === 'shop';
    if ((showCost && this.def.cost !== undefined) || this.options.sellValue !== undefined) {
      const value = this.options.sellValue !== undefined ? this.options.sellValue : this.def.cost!;
      const prefix = this.options.sellValue !== undefined ? 'Sell $' : '$';
      const priceTag = computePriceTagMetrics(scale);
      const tagY = -hh - priceTag.gap - priceTag.tagH / 2;

      const tagBg = this.scene.add.graphics();
      tagBg.fillStyle(0x222233, 0.95);
      tagBg.fillRoundedRect(
        -priceTag.tagW / 2,
        tagY - priceTag.tagH / 2,
        priceTag.tagW,
        priceTag.tagH,
        6 * priceTag.tagScale,
      );
      tagBg.lineStyle(1.5 * priceTag.tagScale, 0x555577, 0.8);
      tagBg.strokeRoundedRect(
        -priceTag.tagW / 2,
        tagY - priceTag.tagH / 2,
        priceTag.tagW,
        priceTag.tagH,
        6 * priceTag.tagScale,
      );
      this.card.add(tagBg);

      costText = this.scene.add
        .text(0, tagY, `${prefix}${value}`, {
          fontFamily: 'Arial Black',
          fontSize: `${priceTag.fontSize}px`,
          color: '#ffd700',
          align: 'center',
        })
        .setOrigin(0.5);
      this.card.add(costText);
    }

    return { cardImage, costText };
  }
}
