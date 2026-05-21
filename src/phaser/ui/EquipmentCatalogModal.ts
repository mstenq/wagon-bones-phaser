// ─── EquipmentCatalogModal ───
// Scrollable grid of all equipment definitions, sorted by rarity.
// Available from Options — reference catalog for every player.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getAllEquipment, type EquipmentDef } from '../../game/ItemsSystem';
import { Button } from './Button';
import { ItemCard } from './ItemCard';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'] as const;

const RARITY_SECTION_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

const RARITY_SECTION_COLORS: Record<string, string> = {
  common: '#88aa88',
  uncommon: '#8888cc',
  rare: '#ccaa44',
  legendary: '#cc66aa',
};

/** Match ShopScene equipment card spacing (center-to-center). */
const SHOP_CARD_SPACING = 185;
const CARD_ROW_SPACING = 220;
const SECTION_GAP = 16;
const SECTION_HEADER_H = 28;
const SCREEN_MARGIN = 12;

const MODAL_DEPTH = 500;
const SCROLL_DEPTH = 501;
const CLIP_DEPTH = 502;
const CHROME_DEPTH = 503;
const CLOSE_DEPTH = 504;

export class EquipmentCatalogModal extends GameObjects.Container {
  private scrollContainer!: Phaser.GameObjects.Container;
  private readonly sceneObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly itemCards: ItemCard[] = [];
  private contentHeight = 0;
  private scrollAreaTop = 0;
  private scrollAreaH = 0;
  private isDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ) => void;
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerUpHandler?: () => void;

  constructor(scene: Scene) {
    super(scene, 0, 0);

    const screenW = scene.scale.width;
    const screenH = scene.scale.height;
    const cardH = UI.CARD_H;

    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, screenW, screenH);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, screenW, screenH), Phaser.Geom.Rectangle.Contains);
    dim.setDepth(MODAL_DEPTH);
    this.add(dim);

    const panelX = SCREEN_MARGIN;
    const panelY = SCREEN_MARGIN;
    const panelW = screenW - SCREEN_MARGIN * 2;
    const panelH = screenH - SCREEN_MARGIN * 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.setDepth(MODAL_DEPTH);
    this.track(panel);

    const title = scene.add
      .text(panelX + panelW / 2, panelY + 24, 'Equipment', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5)
      .setDepth(CHROME_DEPTH);
    this.track(title);

    const hint = scene.add
      .text(panelX + panelW / 2, panelY + 50, `${getAllEquipment().length} items · hover for details`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5)
      .setDepth(CHROME_DEPTH);
    this.track(hint);

    const listTop = panelY + 64;
    const listBottom = panelY + panelH - 48;
    this.scrollAreaTop = listTop;
    this.scrollAreaH = listBottom - listTop;

    const innerPad = 24;
    const gridW = panelW - innerPad * 2;
    const cols = Math.max(1, Math.floor((gridW + SHOP_CARD_SPACING) / SHOP_CARD_SPACING)) - 1;
    const gridStartX = -((cols - 1) * SHOP_CARD_SPACING) / 2;

    this.scrollContainer = scene.add.container(panelX + panelW / 2, listTop);
    this.scrollContainer.setDepth(SCROLL_DEPTH);
    this.track(this.scrollContainer);

    let layoutY = 0;

    for (const rarity of RARITY_ORDER) {
      const group = getAllEquipment()
        .filter((item) => item.rarity === rarity)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (group.length === 0) continue;

      layoutY += SECTION_HEADER_H / 2;
      const sectionLabel = scene.add
        .text(0, layoutY, RARITY_SECTION_LABELS[rarity] ?? rarity, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: RARITY_SECTION_COLORS[rarity] ?? TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      this.scrollContainer.add(sectionLabel);
      layoutY += SECTION_HEADER_H / 2 + SECTION_GAP;

      const rows = Math.ceil(group.length / cols);
      const gridTop = layoutY;

      for (let i = 0; i < group.length; i++) {
        const def = group[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = gridStartX + col * SHOP_CARD_SPACING;
        const cy = gridTop + cardH / 2 + row * CARD_ROW_SPACING;

        const card = this.createCatalogCard(scene, cx, cy, def);
        this.scrollContainer.add(card);
        this.itemCards.push(card);
      }

      layoutY += rows * CARD_ROW_SPACING + SECTION_GAP;
    }

    this.contentHeight = layoutY;

    if (this.contentHeight <= this.scrollAreaH) {
      const offset = (this.scrollAreaH - this.contentHeight) / 2;
      this.scrollContainer.y = listTop + offset;
    }

    const clipTop = scene.add.graphics();
    clipTop.fillStyle(UI.MODAL_BG, 1);
    clipTop.fillRect(0, 0, screenW, listTop);
    clipTop.setDepth(CLIP_DEPTH);
    this.track(clipTop);

    const clipBottom = scene.add.graphics();
    clipBottom.fillStyle(UI.MODAL_BG, 1);
    clipBottom.fillRect(0, listBottom, screenW, screenH - listBottom);
    clipBottom.setDepth(CLIP_DEPTH);
    this.track(clipBottom);

    const headerCover = scene.add.graphics();
    headerCover.fillStyle(UI.MODAL_BG, 1);
    headerCover.fillRect(panelX, panelY, panelW, listTop - panelY);
    headerCover.setDepth(CHROME_DEPTH);
    this.track(headerCover);

    const footerCover = scene.add.graphics();
    footerCover.fillStyle(UI.MODAL_BG, 1);
    footerCover.fillRect(panelX, listBottom, panelW, panelY + panelH - listBottom);
    footerCover.setDepth(CHROME_DEPTH);
    this.track(footerCover);

    const panelFrame = scene.add.graphics();
    panelFrame.lineStyle(2, UI.MODAL_BORDER, 1);
    panelFrame.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panelFrame.setDepth(CHROME_DEPTH);
    this.track(panelFrame);

    const listFrame = scene.add.graphics();
    listFrame.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
    listFrame.strokeRect(panelX + 12, listTop, panelW - 24, this.scrollAreaH);
    listFrame.setDepth(CHROME_DEPTH);
    this.track(listFrame);

    if (this.contentHeight > this.scrollAreaH) {
      this.wheelHandler = (_pointer, _gos, _dx, dy) => {
        this.doScroll(dy);
      };
      this.pointerDownHandler = (pointer) => {
        if (pointer.x < panelX || pointer.x > panelX + panelW) return;
        if (pointer.y < listTop || pointer.y > listBottom) return;
        this.isDragging = true;
        this.dragStartY = pointer.y;
        this.scrollStartY = this.scrollContainer.y;
      };
      this.pointerMoveHandler = (pointer) => {
        if (!this.isDragging) return;
        const dy = pointer.y - this.dragStartY;
        this.scrollContainer.y = Phaser.Math.Clamp(
          this.scrollStartY + dy,
          this.scrollAreaTop + this.scrollAreaH - this.contentHeight,
          this.scrollAreaTop,
        );
      };
      this.pointerUpHandler = () => {
        this.isDragging = false;
      };

      scene.input.on('wheel', this.wheelHandler);
      scene.input.on('pointerdown', this.pointerDownHandler);
      scene.input.on('pointermove', this.pointerMoveHandler);
      scene.input.on('pointerup', this.pointerUpHandler);
    }

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 28, 'Close', 120, 32);
    closeBtn.setDepth(CLOSE_DEPTH);
    closeBtn.onClick(() => this.destroy());
    this.track(closeBtn);

    this.setDepth(MODAL_DEPTH);
    scene.add.existing(this);
  }

  private createCatalogCard(scene: Scene, x: number, y: number, def: EquipmentDef): ItemCard {
    const cardData = {
      id: def.id,
      name: def.name,
      description: def.description,
      cost: def.cost,
      rarity: def.rarity,
      aura: def.aura,
      cardTemplate: (def as { cardTemplate?: import('../../data/items').CardTemplate }).cardTemplate,
      hintDisplay: def.hintDisplay,
    };
    const card = new ItemCard(scene, x, y, cardData, {
      mode: 'shop',
      showCost: false,
    });
    card.setSuppressHints(true);
    return card;
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.sceneObjects.push(obj);
  }

  private doScroll(dy: number): void {
    const newY = this.scrollContainer.y - dy * 0.5;
    this.scrollContainer.y = Phaser.Math.Clamp(
      newY,
      this.scrollAreaTop + this.scrollAreaH - this.contentHeight,
      this.scrollAreaTop,
    );
  }

  private removeScrollInput(): void {
    if (!this.wheelHandler) return;
    this.scene.input.off('wheel', this.wheelHandler);
    this.scene.input.off('pointerdown', this.pointerDownHandler!);
    this.scene.input.off('pointermove', this.pointerMoveHandler!);
    this.scene.input.off('pointerup', this.pointerUpHandler!);
    this.wheelHandler = undefined;
    this.pointerDownHandler = undefined;
    this.pointerMoveHandler = undefined;
    this.pointerUpHandler = undefined;
  }

  destroy(fromScene?: boolean): void {
    this.removeScrollInput();
    for (const card of this.itemCards) {
      card.destroy();
    }
    this.itemCards.length = 0;
    for (const obj of this.sceneObjects) {
      obj.destroy();
    }
    this.sceneObjects.length = 0;
    super.destroy(fromScene);
  }
}
