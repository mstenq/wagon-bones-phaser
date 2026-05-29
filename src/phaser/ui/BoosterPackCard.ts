// ─── BoosterPackCard ───
// Displays a booster pack in the shop. Shows the pack image as-is with a price tag above.
// Tooltip on hover shows pack details.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { PackInstance } from '../../game/BoosterPackSystem';
import { COLORS } from '../../game/Constants';

const PRICE_TAG_H = 26;
const PRICE_TAG_GAP = 6;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER = COLORS.TOOLTIP_BORDER;

const PACK_DISPLAY_H = 235;

const TIER_LABELS: Record<string, string> = {
  normal: 'Standard',
  jumbo: 'Jumbo',
  mega: 'Mega',
};

const CATEGORY_LABELS: Record<string, string> = {
  dice: 'Dice',
  supply: 'Supply',
  trail_guide: 'Trail Guide',
  frontier: 'Frontier',
  equipment: 'Equipment',
};

export class BoosterPackCard extends GameObjects.Container {
  private _pack: PackInstance;
  private _sold: boolean = false;
  private costText: GameObjects.Text;
  private soldOverlay: GameObjects.Graphics;
  private tooltip: GameObjects.Container | null = null;
  private packImage: GameObjects.Image | null = null;
  private _displayW: number = 120;
  private _displayH: number = PACK_DISPLAY_H;

  constructor(scene: Scene, x: number, y: number, pack: PackInstance) {
    super(scene, x, y);
    this._pack = pack;

    // Pack image
    const atlasFrame = `${pack.def.id}.png`;
    if (scene.textures.getFrame('packs', atlasFrame)) {
      this.packImage = scene.add.image(0, 0, 'packs', atlasFrame);
      // Scale to fit within display height, maintaining aspect ratio
      const imgScale = PACK_DISPLAY_H / this.packImage.height;
      this.packImage.setScale(imgScale);
      this._displayW = this.packImage.width * imgScale;
      this._displayH = PACK_DISPLAY_H;
      this.add(this.packImage);
    }

    // Price tag above the image
    const tagY = -this._displayH / 2 - PRICE_TAG_GAP - PRICE_TAG_H / 2;
    const tagW = 50;
    const tagBg = scene.add.graphics();
    tagBg.fillStyle(0x222233, 0.95);
    tagBg.fillRoundedRect(-tagW / 2, tagY - PRICE_TAG_H / 2, tagW, PRICE_TAG_H, 6);
    tagBg.lineStyle(1.5, 0x555577, 0.8);
    tagBg.strokeRoundedRect(-tagW / 2, tagY - PRICE_TAG_H / 2, tagW, PRICE_TAG_H, 6);
    this.add(tagBg);

    this.costText = scene.add
      .text(0, tagY, `$${pack.def.cost}`, {
        fontFamily: 'Arial Black',
        fontSize: '14px',
        color: '#ffd700',
        align: 'center',
      })
      .setOrigin(0.5);
    this.add(this.costText);

    // Sold overlay (hidden initially)
    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.add(this.soldOverlay);

    // Interactive hit area
    this.setSize(this._displayW, this._displayH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this._displayW, this._displayH),
      Phaser.Geom.Rectangle.Contains,
    );

    // Tooltip on hover
    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
  }

  get pack(): PackInstance {
    return this._pack;
  }
  get sold(): boolean {
    return this._sold;
  }

  markSold(): void {
    this._sold = true;
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(-this._displayW / 2, -this._displayH / 2, this._displayW, this._displayH, 10);
    this.soldOverlay.setVisible(true);
    this.costText.setText('OPENED');
    this.costText.setColor('#888888');
  }

  setAffordable(canAfford: boolean): void {
    if (this._sold) return;
    this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
  }

  setCostDisplay(cost: number): void {
    if (!this._sold) this.costText.setText(`$${cost}`);
  }

  // ─── Tooltip ───

  private showTooltip(): void {
    if (this.tooltip) return;

    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;
    const hh = this._displayH / 2;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    const def = this._pack.def;
    const tierLabel = TIER_LABELS[def.tier] ?? def.tier;
    const catLabel = CATEGORY_LABELS[def.category] ?? def.category;

    // Title
    const nameText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD, def.name, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    // Category & tier
    const subtitleText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD + nameText.height + 4, `${tierLabel} ${catLabel} Pack`, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: '#aaaacc',
      })
      .setOrigin(0, 0);

    // Pick info
    const pickText = this.scene.add
      .text(
        TOOLTIP_PAD,
        TOOLTIP_PAD + nameText.height + 4 + subtitleText.height + 8,
        `Pick ${def.pickCount} of ${def.totalCards}`,
        {
          fontFamily: 'Arial',
          fontSize: '12px',
          color: '#cccccc',
        },
      )
      .setOrigin(0, 0);

    const tooltipChildren: GameObjects.GameObject[] = [nameText, subtitleText, pickText];
    const bottomY = TOOLTIP_PAD + nameText.height + 4 + subtitleText.height + 8 + pickText.height;

    // Compute size
    const contentWidth = tooltipChildren.reduce(
      (max, child) => Math.max(max, (child as GameObjects.Text).width ?? 0),
      0,
    );
    const tooltipW = contentWidth + TOOLTIP_PAD * 2;
    const tooltipH = bottomY + TOOLTIP_PAD;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add([bg, ...tooltipChildren]);

    // Position above the card (account for price tag)
    const tagOffset = PRICE_TAG_H + PRICE_TAG_GAP;
    let tx = worldX - tooltipW / 2;
    let ty = worldY - hh - tagOffset - tooltipH - 10;

    // Clamp to screen bounds
    const { width: sw } = this.scene.scale;
    if (tx < 8) tx = 8;
    if (tx + tooltipW > sw - 8) tx = sw - 8 - tooltipW;
    if (ty < 8) {
      ty = worldY + hh + 12;
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
    super.destroy(fromScene);
  }
}
