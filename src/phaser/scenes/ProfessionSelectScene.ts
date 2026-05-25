// ─── ProfessionSelectScene ───
// Split view: compact profession grid (left) + detail panel (right).

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { setupActions } from '../../game/store';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY, DIFFICULTIES } from '../../game/Constants';
import { Button } from '../ui/Button';
import professionsData, { type ProfessionDef, getProfessionById } from '../../data/professions';
import { performLoadGame } from '../SaveLoadIO';
import { getDifficultyBeatColor, getDifficultyBeatStrokeColor, getHighestDifficultyBeaten } from '../../game/UserStats';
import { createDie } from '../../game/DiceSystem';
import { DiceSprite } from '../ui/DiceSprite';
import { getDiceGroupDisplayLabel, groupDiceByVisualIdentity } from '../ui/diceGrouping';

const GRID_CARD_W = 148;
const GRID_CARD_H = 148;
const GRID_CARD_GAP = 12;
const GRID_IMAGE_SIZE = 100;
const BEAT_DOT_RADIUS = 7;
const DETAIL_IMAGE_SIZE = 200;
const DICE_PREVIEW_SCALE = 0.68;
const DICE_GROUP_SPACING = 88;
const DICE_ROW_HEIGHT = 82;
const LEFT_HEADER_TOP = 36;
const LEFT_HEADER_SUB = 70;
const GRID_TOP_MARGIN = 100;
const DETAIL_TOP_PAD = 12;

export class ProfessionSelectScene extends Scene {
  private selectedId: string | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmBtn: Button;
  private scrollContainer: Phaser.GameObjects.Container;
  private detailContainer: Phaser.GameObjects.Container;
  private contentHeight = 0;
  private gridOffsetY = 0;
  private isDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;
  private leftPanelW = 0;
  private rightPanelX = 0;
  private rightPanelW = 0;
  private diceSprites: DiceSprite[] = [];

  constructor() {
    super('ProfessionSelect');
  }

  create() {
    const { width, height } = this.scale;
    this.leftPanelW = Math.floor(width * (2 / 3));
    this.rightPanelX = this.leftPanelW;
    this.rightPanelW = width - this.leftPanelW;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.destroyDiceSprites();
    });

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    const leftCenterX = this.leftPanelW / 2;

    this.add
      .text(leftCenterX, LEFT_HEADER_TOP, 'Choose Your Profession', {
        fontFamily: FONTS.HEADING,
        fontSize: '36px',
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.add
      .text(leftCenterX, LEFT_HEADER_SUB, 'Each profession grants unique bonuses for the journey ahead', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '15px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: this.leftPanelW - 32 },
      })
      .setOrigin(0.5)
      .setDepth(60);

    const divider = this.add.graphics();
    divider.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
    divider.lineBetween(this.rightPanelX, 0, this.rightPanelX, height - 16);
    divider.setDepth(55);

    const loadBtn = new Button(this, 120, height - 40, 'Load Game', 160, 48);
    loadBtn.setDepth(100);
    loadBtn.onClick(() => {
      void performLoadGame(this, { confirmOverwrite: false });
    });

    const confirmX = this.rightPanelX + this.rightPanelW / 2;
    this.confirmBtn = new Button(this, confirmX, height - 40, 'Select Difficulty', 220, 48);
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.setVisible(false);
    this.confirmBtn.setDepth(100);
    this.confirmBtn.onClick(() => {
      if (!this.selectedId) return;
      setupActions.applyProfession(this.selectedId);
      setupActions.finalizeRunSetup();
      this.scene.start('DifficultySelect', {});
    });

    this.detailContainer = this.add.container(this.rightPanelX, DETAIL_TOP_PAD);
    this.detailContainer.setDepth(70);

    this.buildGrid(height);
    this.refreshDetailPanel();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildGrid(height: number): void {
    const profs = professionsData;
    const panelPad = 20;
    const usableW = this.leftPanelW - panelPad * 2;
    const cols = Math.max(3, Math.floor((usableW + GRID_CARD_GAP) / (GRID_CARD_W + GRID_CARD_GAP)));
    const rows = Math.ceil(profs.length / cols);

    const totalGridW = cols * GRID_CARD_W + (cols - 1) * GRID_CARD_GAP;
    const startX = panelPad + GRID_CARD_W / 2 + (usableW - totalGridW) / 2;
    const topMargin = GRID_TOP_MARGIN;
    this.contentHeight = rows * GRID_CARD_H + (rows - 1) * GRID_CARD_GAP;

    const scrollAreaTop = topMargin;
    const scrollAreaBottom = height - 80;
    const scrollAreaH = scrollAreaBottom - scrollAreaTop;

    this.scrollContainer = this.add.container(0, scrollAreaTop);

    if (this.contentHeight <= scrollAreaH) {
      this.gridOffsetY = (scrollAreaH - this.contentHeight) / 2;
      this.scrollContainer.y = scrollAreaTop + this.gridOffsetY;
    }

    this.cards = [];
    profs.forEach((prof, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (GRID_CARD_W + GRID_CARD_GAP);
      const cy = GRID_CARD_H / 2 + row * (GRID_CARD_H + GRID_CARD_GAP);
      const card = this.createProfessionCard(prof, cx, cy);
      this.scrollContainer.add(card);
      this.cards.push(card);
    });

    const clipTop = this.add.graphics();
    clipTop.fillStyle(COLORS.BG_PRIMARY, 1);
    clipTop.fillRect(0, 0, this.leftPanelW, scrollAreaTop);
    clipTop.setDepth(50);

    const clipBottom = this.add.graphics();
    clipBottom.fillStyle(COLORS.BG_PRIMARY, 1);
    clipBottom.fillRect(0, scrollAreaBottom, this.leftPanelW, height - scrollAreaBottom);
    clipBottom.setDepth(50);

    if (this.contentHeight > scrollAreaH) {
      this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
        if (_pointer.x > this.leftPanelW) return;
        this.doScroll(dy, scrollAreaTop, scrollAreaH);
      });

      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.x > this.leftPanelW) return;
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

  private createProfessionCard(prof: ProfessionDef, cx: number, cy: number): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);
    const beatDotX = GRID_CARD_W / 2 - 12;
    const beatDotY = -GRID_CARD_H / 2 + 12;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
    cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
    cardBg.strokeRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
    container.add(cardBg);

    this.addBeatIndicatorDot(container, prof.id, beatDotX, beatDotY);

    const imgKey = `prof_${prof.id}`;
    if (this.textures.exists(imgKey)) {
      const img = this.add.image(0, -GRID_CARD_H / 2 + 10 + GRID_IMAGE_SIZE / 2, imgKey);
      const tex = img.texture.getSourceImage();
      const scale = GRID_IMAGE_SIZE / Math.max(tex.width, tex.height);
      img.setScale(scale);
      container.add(img);
    }

    const titleText = this.add
      .text(0, -GRID_CARD_H / 2 + GRID_IMAGE_SIZE + 22, prof.title, {
        fontFamily: FONTS.HEADING,
        fontSize: '15px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: GRID_CARD_W - 12 },
      })
      .setOrigin(0.5);
    container.add(titleText);

    const hitZone = this.add.rectangle(0, 0, GRID_CARD_W, GRID_CARD_H, 0x000000, 0);
    container.add(hitZone);
    hitZone.setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      if (this.selectedId !== prof.id) {
        cardBg.clear();
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
        cardBg.lineStyle(2, COLORS.BTN_HOVER, 1);
        cardBg.strokeRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
      }
    });

    hitZone.on('pointerout', () => {
      if (this.selectedId !== prof.id) {
        cardBg.clear();
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
        cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
        cardBg.strokeRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
      }
    });

    hitZone.on('pointerdown', () => {
      this.selectProfession(prof.id);
    });

    container.setData('profId', prof.id);
    container.setData('cardBg', cardBg);

    return container;
  }

  private addBeatIndicatorDot(
    container: Phaser.GameObjects.Container,
    professionId: string,
    x: number,
    y: number,
  ): void {
    const beaten = getHighestDifficultyBeaten(professionId);
    const dot = this.add.graphics();
    const fillColor = getDifficultyBeatColor(beaten);
    const strokeColor = beaten > 0 ? getDifficultyBeatStrokeColor(beaten) : COLORS.SIDEBAR_SECTION_BORDER;

    if (fillColor !== null) {
      dot.fillStyle(fillColor, 1);
      dot.fillCircle(x, y, BEAT_DOT_RADIUS);
    }
    dot.lineStyle(2, strokeColor, 1);
    dot.strokeCircle(x, y, BEAT_DOT_RADIUS);
    container.add(dot);
  }

  private selectProfession(id: string): void {
    this.selectedId = id;

    if (this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const profId = card.getData('profId') as string;

      cardBg.clear();
      if (profId === id) {
        cardBg.fillStyle(0x2a3a2a, 1);
        cardBg.fillRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
        cardBg.lineStyle(3, COLORS.GOLD, 1);
        cardBg.strokeRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
      } else {
        cardBg.fillStyle(COLORS.BG_CARD, 1);
        cardBg.fillRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
        cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
        cardBg.strokeRoundedRect(-GRID_CARD_W / 2, -GRID_CARD_H / 2, GRID_CARD_W, GRID_CARD_H, 10);
      }
    }

    this.confirmBtn.setEnabled(true);
    this.confirmBtn.setVisible(true);
    this.refreshDetailPanel();
  }

  private refreshDetailPanel(): void {
    this.detailContainer.removeAll(true);
    this.destroyDiceSprites();

    const panelPad = 16;
    const contentW = this.rightPanelW - panelPad * 2;
    const centerX = this.rightPanelW / 2;

    if (!this.selectedId) {
      const placeholder = this.add
        .text(centerX, 80, 'Select a profession', {
          fontFamily: FONTS.HEADING,
          fontSize: '20px',
          color: TEXT_COLORS.MUTED,
          align: 'center',
        })
        .setOrigin(0.5);
      this.detailContainer.add(placeholder);
      return;
    }

    const prof = getProfessionById(this.selectedId);
    if (!prof) return;

    let y = 100;

    const imgKey = `prof_${prof.id}`;
    if (this.textures.exists(imgKey)) {
      const img = this.add.image(centerX, y + DETAIL_IMAGE_SIZE / 2, imgKey);
      const tex = img.texture.getSourceImage();
      const scale = DETAIL_IMAGE_SIZE / Math.max(tex.width, tex.height);
      img.setScale(scale);
      this.detailContainer.add(img);
      y += DETAIL_IMAGE_SIZE + 12;
    }

    const title = this.add
      .text(centerX, y, prof.title, {
        fontFamily: FONTS.HEADING,
        fontSize: '28px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(title);
    y += title.height + 4;

    const charName = this.add
      .text(centerX, y, prof.name, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(charName);
    y += charName.height + 14;

    const desc = this.add
      .text(centerX, y, prof.description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: contentW },
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(desc);
    y += desc.height + 16;

    if (prof.specialEquipment) {
      const equipName = this.add
        .text(centerX, y, `Equipment Synergy: ${prof.specialEquipment.name}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: TEXT_COLORS.GOLD,
          align: 'center',
          wordWrap: { width: contentW },
        })
        .setOrigin(0.5, 0);
      this.detailContainer.add(equipName);
      y += equipName.height + 4;

      const equipEffect = this.add
        .text(centerX, y, prof.specialEquipment.effect, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
          wordWrap: { width: contentW },
          lineSpacing: 2,
        })
        .setOrigin(0.5, 0);
      this.detailContainer.add(equipEffect);
      y += equipEffect.height + 12;
    }

    y = this.addStartingDiceSection(prof, centerX, y, contentW);
    y += 14;

    const beaten = getHighestDifficultyBeaten(prof.id);
    const beatenLabel = beaten > 0 ? `${DIFFICULTIES[beaten - 1].name} (${beaten})` : 'None';

    const beatHeader = this.add
      .text(centerX, y, 'Highest difficulty completed', {
        fontFamily: FONTS.HEADING,
        fontSize: '13px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(beatHeader);
    y += beatHeader.height + 4;

    const beatValue = this.add
      .text(centerX, y, beatenLabel, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: beaten > 0 ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(beatValue);
  }

  private addStartingDiceSection(prof: ProfessionDef, centerX: number, startY: number, contentW: number): number {
    const specialtyCount = prof.startingDice.length;
    const standardCount = Math.max(0, GAMEPLAY.STARTING_DICE - specialtyCount);

    const previewDice = prof.startingDice.map((enhancement, i) =>
      createDie({
        id: `prof_detail_${prof.id}_${i}`,
        enhancement,
        value: enhancement === 'stone' ? 0 : 6,
      }),
    );

    const specialtyGroups = groupDiceByVisualIdentity(previewDice);
    const displayGroups: { representative: (typeof previewDice)[0]; count: number; isStandard: boolean }[] =
      specialtyGroups.map((g) => ({
        representative: g.representative,
        count: g.dice.length,
        isStandard: false,
      }));

    if (standardCount > 0) {
      displayGroups.push({
        representative: createDie({
          id: `prof_detail_${prof.id}_standard`,
          enhancement: null,
          value: 6,
        }),
        count: standardCount,
        isStandard: true,
      });
    }

    const header = this.add
      .text(centerX, startY, 'Starting Dice', {
        fontFamily: FONTS.HEADING,
        fontSize: '14px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(header);

    const summary =
      standardCount > 0
        ? `${specialtyCount} specialty · ${standardCount} standard (${GAMEPLAY.STARTING_DICE} total)`
        : `${specialtyCount} dice (${GAMEPLAY.STARTING_DICE} total)`;

    const subtitle = this.add
      .text(centerX, startY + header.height + 4, summary, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: contentW },
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(subtitle);

    let y = startY + header.height + subtitle.height + 14;
    const cols = Math.min(displayGroups.length, 4);
    const gridStartX = centerX - ((cols - 1) * DICE_GROUP_SPACING) / 2;

    DiceSprite.suppressTooltips = true;

    for (let i = 0; i < displayGroups.length; i++) {
      const group = displayGroups[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * DICE_GROUP_SPACING;
      const dieY = y + row * DICE_ROW_HEIGHT + 22;

      const sprite = new DiceSprite(this, this.rightPanelX + x, this.detailContainer.y + dieY, group.representative);
      sprite.setScale(DICE_PREVIEW_SCALE);
      sprite.setDepth(71);
      this.diceSprites.push(sprite);

      const label = this.add
        .text(x, dieY + 32, getDiceGroupDisplayLabel(group.representative, group.count), {
          fontFamily: FONTS.PRIMARY,
          fontSize: '10px',
          color: group.isStandard ? TEXT_COLORS.MUTED : TEXT_COLORS.SECONDARY,
          align: 'center',
        })
        .setOrigin(0.5);
      this.detailContainer.add(label);
    }

    const rows = Math.ceil(displayGroups.length / cols);
    return y + rows * DICE_ROW_HEIGHT;
  }

  private destroyDiceSprites(): void {
    for (const s of this.diceSprites) s.destroy();
    this.diceSprites = [];
    DiceSprite.suppressTooltips = false;
  }

  private onResize(): void {
    this.scene.restart();
  }
}
