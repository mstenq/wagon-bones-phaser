// ─── ProfessionSelectScene ───
// Allows the player to choose a profession before starting the journey.
// Shows all professions in a scrollable grid with images, names, and descriptions.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';
import { Button } from '../ui/Button';
import professionsData, { type ProfessionDef } from '../../data/professions';
import { ProfessionStartingDiceTooltip } from '../ui/ProfessionStartingDiceTooltip';
import { performLoadGame } from '../SaveLoadIO';

const CARD_W = 190;
const CARD_H = 310;
const CARD_GAP = 16;
const COLS = 5;
const IMAGE_SIZE = 120;

export class ProfessionSelectScene extends Scene {
  private selectedId: string | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmBtn: Button;
  private scrollContainer: Phaser.GameObjects.Container;
  private contentHeight: number = 0;
  private gridOffsetY: number = 0;
  private isDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;
  private startingDiceTooltip = new ProfessionStartingDiceTooltip();

  constructor() {
    super('ProfessionSelect');
  }

  create() {
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.startingDiceTooltip.hide();
    });

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add
      .text(width / 2, 36, 'Choose Your Profession', {
        fontFamily: FONTS.HEADING,
        fontSize: '36px',
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);

    // Subtitle
    this.add
      .text(width / 2, 70, 'Each profession grants unique bonuses for the journey ahead', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '15px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);

    // Load game (bottom-left, before a run starts)
    const loadBtn = new Button(this, 120, height - 40, 'Load Game', 160, 48);
    loadBtn.setDepth(100);
    loadBtn.onClick(() => {
      void performLoadGame(this, { confirmOverwrite: false });
    });

    // Confirm button (bottom)
    this.confirmBtn = new Button(this, width / 2, height - 40, 'Select Difficulty', 220, 48);
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.setDepth(100);
    this.confirmBtn.onClick(() => {
      if (!this.selectedId) return;
      const player = getPlayerState();
      player.applyProfession(this.selectedId);
      player.finalizeRunSetup();
      this.scene.start('DifficultySelect');
    });

    // Build scrollable grid
    this.buildGrid(width, height);

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildGrid(width: number, height: number): void {
    const profs = professionsData;
    const rows = Math.ceil(profs.length / COLS);

    // Center the grid
    const totalGridW = COLS * CARD_W + (COLS - 1) * CARD_GAP;
    const startX = (width - totalGridW) / 2 + CARD_W / 2;
    const topMargin = 100;
    this.contentHeight = rows * CARD_H + (rows - 1) * CARD_GAP;

    // Available scroll area
    const scrollAreaTop = topMargin;
    const scrollAreaBottom = height - 80;
    const scrollAreaH = scrollAreaBottom - scrollAreaTop;

    // Scroll container
    this.scrollContainer = this.add.container(0, scrollAreaTop);

    // Center vertically if content fits
    if (this.contentHeight <= scrollAreaH) {
      this.gridOffsetY = (scrollAreaH - this.contentHeight) / 2;
      this.scrollContainer.y = scrollAreaTop + this.gridOffsetY;
    }

    // Build cards
    this.cards = [];
    profs.forEach((prof, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = startX + col * (CARD_W + CARD_GAP);
      const cy = CARD_H / 2 + row * (CARD_H + CARD_GAP);

      const card = this.createProfessionCard(prof, cx, cy, row);
      this.scrollContainer.add(card);
      this.cards.push(card);
    });

    // Clip overflow: draw solid panels over the top and bottom to hide scrolled content
    const clipTop = this.add.graphics();
    clipTop.fillStyle(COLORS.BG_PRIMARY, 1);
    clipTop.fillRect(0, 0, width, scrollAreaTop);
    clipTop.setDepth(50);

    const clipBottom = this.add.graphics();
    clipBottom.fillStyle(COLORS.BG_PRIMARY, 1);
    clipBottom.fillRect(0, scrollAreaBottom, width, height - scrollAreaBottom);
    clipBottom.setDepth(50);

    // Scroll input
    if (this.contentHeight > scrollAreaH) {
      this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
        this.doScroll(dy, scrollAreaTop, scrollAreaH);
      });

      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.isDragging = true;
        this.dragStartY = pointer.y;
        this.scrollStartY = this.scrollContainer.y;
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!this.isDragging) return;
        const dy = pointer.y - this.dragStartY;
        const newY = this.scrollStartY + dy;
        this.scrollContainer.y = Phaser.Math.Clamp(
          newY,
          scrollAreaTop + scrollAreaH - this.contentHeight,
          scrollAreaTop,
        );
      });
      this.input.on('pointerup', () => {
        this.isDragging = false;
      });
    }
  }

  private doScroll(dy: number, scrollAreaTop: number, scrollAreaH: number): void {
    const newY = this.scrollContainer.y - dy * 0.5;
    this.scrollContainer.y = Phaser.Math.Clamp(newY, scrollAreaTop + scrollAreaH - this.contentHeight, scrollAreaTop);
  }

  private createProfessionCard(
    prof: ProfessionDef,
    cx: number,
    cy: number,
    row: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);

    // Card background
    const cardBg = this.add.graphics();
    cardBg.fillStyle(COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    container.add(cardBg);

    // Profession image (square, intricate border already in asset)
    const imgKey = `prof_${prof.id}`;
    if (this.textures.exists(imgKey)) {
      const img = this.add.image(0, -CARD_H / 2 + 16 + IMAGE_SIZE / 2, imgKey);
      const tex = img.texture.getSourceImage();
      const scale = IMAGE_SIZE / Math.max(tex.width, tex.height);
      img.setScale(scale);
      container.add(img);
    }

    // Title (e.g. "Demon Hunter", "Con Artist")
    const titleText = this.add
      .text(0, -CARD_H / 2 + IMAGE_SIZE + 26, prof.title, {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      })
      .setOrigin(0.5);
    container.add(titleText);

    // Character name
    const nameText = this.add
      .text(0, titleText.y + titleText.height + 4, prof.name, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      })
      .setOrigin(0.5, 0);
    container.add(nameText);

    let descY = nameText.y + nameText.height + 6;

    if (prof.specialEquipment) {
      const equipName = this.add
        .text(0, descY, prof.specialEquipment.name, {
          fontFamily: FONTS.HEADING,
          fontSize: '11px',
          color: TEXT_COLORS.GOLD,
          align: 'center',
          wordWrap: { width: CARD_W - 20 },
        })
        .setOrigin(0.5, 0);
      container.add(equipName);

      const equipEffect = this.add
        .text(0, equipName.y + equipName.height + 2, prof.specialEquipment.effect, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '10px',
          color: TEXT_COLORS.PRIMARY,
          align: 'center',
          wordWrap: { width: CARD_W - 20 },
          lineSpacing: 1,
        })
        .setOrigin(0.5, 0);
      container.add(equipEffect);

      descY = equipEffect.y + equipEffect.height + 6;
    }

    // Description
    const desc = this.add
      .text(0, descY, prof.description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: CARD_W - 20 },
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);
    container.add(desc);

    // Invisible hit area sprite for precise interaction
    const hitZone = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x000000, 0);
    container.add(hitZone);
    hitZone.setInteractive({ useHandCursor: true });

    const showStartingDiceTooltip = () => {
      const matrix = container.getWorldTransformMatrix();
      const placeBelow = row === 0;
      this.startingDiceTooltip.show(
        this,
        prof,
        {
          x: matrix.tx,
          y: placeBelow ? matrix.ty + CARD_H / 2 + 4 : matrix.ty - CARD_H / 2 - 4,
          placement: placeBelow ? 'below' : 'above',
        },
        {
          minX: 12,
          maxX: this.scale.width - 12,
          minY: 88,
          maxY: this.scale.height - 96,
        },
      );
    };

    hitZone.on('pointerover', () => {
      if (this.selectedId !== prof.id) {
        cardBg.clear();
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        cardBg.lineStyle(2, COLORS.BTN_HOVER, 1);
        cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      }
      showStartingDiceTooltip();
    });

    hitZone.on('pointerout', () => {
      if (this.selectedId !== prof.id) {
        cardBg.clear();
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
        cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      }
      this.startingDiceTooltip.scheduleHide(this);
    });

    hitZone.on('pointerdown', () => {
      this.startingDiceTooltip.hide();
      this.selectProfession(prof.id);
    });

    // Store data for later reference
    container.setData('profId', prof.id);
    container.setData('cardBg', cardBg);

    return container;
  }

  private selectProfession(id: string): void {
    this.selectedId = id;

    // Play button sound
    if (this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    // Update all card visuals
    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const profId = card.getData('profId') as string;

      cardBg.clear();
      if (profId === id) {
        // Selected state
        cardBg.fillStyle(0x2a3a2a, 1);
        cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        cardBg.lineStyle(3, COLORS.GOLD, 1);
        cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      } else {
        // Unselected
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
        cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      }
    }

    this.confirmBtn.setEnabled(true);
  }

  private onResize(): void {
    this.startingDiceTooltip.hide();
    this.scene.restart();
  }
}
