// ─── DifficultySelectScene ───
// Oregon Trail stakes selection after profession, before round select.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import { getRunState } from '../../game/store';
import { COLORS, TEXT_COLORS, FONTS, DIFFICULTIES } from '../../game/Constants';
import { DifficultyLevel } from '../../game/types';
import { Button } from '../ui/Button';
import { addDifficultyImage } from '../ui/DifficultyAssets';
import { startAutoSaveLoop } from '../AutoSaveManager';
import { getHighestUnlockedDifficulty, isDifficultyUnlocked } from '../../game/UserStats';
import { isPortraitLayout } from '../ui/SceneLayout';
import { SeededRunModal } from '../ui/SeededRunModal';
import { wireTapOnlySession } from '../ui/pointerDragSession';
import { createScrollableViewport, type ScrollableViewportHandle } from '../ui/ScrollableViewport';

const BASE_CARD_W = 230;
const BASE_CARD_H = 250;
const BASE_ICON_SIZE = 72;
const ICON_TOP_PAD = 14;
const EFFECTS_PAD = 26;
const FOOTER_RESERVE = 80;
const ONE_COL_MAX_WIDTH = 500;

type HeaderLayout = {
  titleY: number;
  subtitleY: number;
  gridTop: number;
  titleSize: string;
  subtitleSize: string;
  subtitleWrapW: number;
};

type GridLayoutMetrics = {
  panelPad: number;
  cols: number;
  cardW: number;
  cardGap: number;
  iconSize: number;
  titleFontSize: string;
  descFontSize: string;
  effectsFontSize: string;
  effectsPad: number;
};

export class DifficultySelectScene extends Scene {
  private selectedLevel: DifficultyLevel = 1;
  private maxUnlocked: DifficultyLevel = 1;
  private professionId: string | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private gridLayout: GridLayoutMetrics;
  private gridViewport: ScrollableViewportHandle | null = null;
  private contentHeight = 0;
  private seededRunModal: SeededRunModal | null = null;

  constructor() {
    super('DifficultySelect');
  }

  create(): void {
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.gridViewport?.destroy();
      this.gridViewport = null;
      this.seededRunModal?.destroy();
      this.seededRunModal = null;
    });

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    const header = this.computeHeaderLayout(width, height);

    this.add
      .text(width / 2, header.titleY, 'Choose Your Trail', {
        fontFamily: FONTS.HEADING,
        fontSize: header.titleSize,
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.add
      .text(width / 2, header.subtitleY, 'Higher stakes stack penalties — pick how harsh the frontier will be', {
        fontFamily: FONTS.PRIMARY,
        fontSize: header.subtitleSize,
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: header.subtitleWrapW },
      })
      .setOrigin(0.5)
      .setDepth(60);

    const backBtn = new Button(this, 72, 40, '← Back', 120, 36);
    backBtn.setDepth(100);
    backBtn.onClick(() => {
      this.scene.start('ProfessionSelect', {});
    });

    this.buildActionButtons(width, height);

    this.professionId = getRunState().professionId;
    this.maxUnlocked = this.professionId ? getHighestUnlockedDifficulty(this.professionId) : 1;

    this.gridLayout = this.computeGridLayout(width);
    this.buildGrid(width, height, header.gridTop);
    this.selectDifficulty(this.maxUnlocked);

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildActionButtons(width: number, height: number): void {
    const btnY = height - 40;
    const btnGap = 12;
    const seedBtnW = width < 400 ? 120 : 140;
    const embarkW = width < 400 ? 160 : 200;
    const totalW = seedBtnW + btnGap + embarkW;
    const startX = (width - totalW) / 2;

    const seedBtn = new Button(this, startX + seedBtnW / 2, btnY, 'Seeded Run', seedBtnW, 48);
    seedBtn.setDepth(100);
    seedBtn.onClick(() => this.openSeededRunModal());

    const embarkBtn = new Button(this, startX + seedBtnW + btnGap + embarkW / 2, btnY, 'Embark', embarkW, 48);
    embarkBtn.setDepth(100);
    embarkBtn.onClick(() => this.embarkWithSeed(''));
  }

  private openSeededRunModal(): void {
    this.seededRunModal?.destroy();
    const { width, height } = this.scale;
    this.seededRunModal = new SeededRunModal(this, width, height, (seed) => {
      this.seededRunModal = null;
      this.embarkWithSeed(seed);
    });
  }

  private embarkWithSeed(seed: string): void {
    if (!this.professionId || !isDifficultyUnlocked(this.professionId, this.selectedLevel)) return;

    gameFacade.meta.setDifficulty(this.selectedLevel);
    const finalSeed = seed.trim() || gameFacade.meta.generateRunSeed();
    gameFacade.meta.initRunRng(finalSeed);
    gameFacade.meta.grantProfessionStartingEquipment();
    gameFacade.meta.assignBosses();
    startAutoSaveLoop();
    this.scene.start('RoundSelect', {});
  }

  private computeHeaderLayout(width: number, _height: number): HeaderLayout {
    const stacked = isPortraitLayout(width, _height) || width < 640;

    if (stacked) {
      return {
        titleY: 78,
        subtitleY: 108,
        gridTop: 132,
        titleSize: '28px',
        subtitleSize: '13px',
        subtitleWrapW: width - 24,
      };
    }

    return {
      titleY: 36,
      subtitleY: 70,
      gridTop: 118,
      titleSize: '36px',
      subtitleSize: '15px',
      subtitleWrapW: width - 48,
    };
  }

  private computeGridLayout(width: number): GridLayoutMetrics {
    const panelPad = width < 500 ? 12 : 20;
    const cardGap = width < 500 ? 10 : 14;
    const usableW = width - panelPad * 2;

    const fourColMin = 4 * BASE_CARD_W + 3 * cardGap;
    const threeColMin = 3 * BASE_CARD_W + 2 * cardGap;
    const twoColMin = 2 * 170 + cardGap;

    let cols = 1;
    if (width > ONE_COL_MAX_WIDTH) {
      if (usableW >= fourColMin) cols = 4;
      else if (usableW >= threeColMin) cols = 3;
      else if (usableW >= twoColMin) cols = 2;
    }

    const cardW = Math.floor((usableW - (cols - 1) * cardGap) / cols);
    const iconSize = Math.floor(BASE_ICON_SIZE * (cardW / BASE_CARD_W));
    const titleFontSize = cardW < 190 ? '13px' : '15px';
    const descFontSize = cardW < 190 ? '12px' : '14px';
    const effectsFontSize = cardW < 190 ? '12px' : '14px';
    const effectsPad = Math.max(16, Math.floor(EFFECTS_PAD * (cardW / BASE_CARD_W)));

    return {
      panelPad,
      cols,
      cardW,
      cardGap,
      iconSize,
      titleFontSize,
      descFontSize,
      effectsFontSize,
      effectsPad,
    };
  }

  private measureCardHeight(
    level: DifficultyLevel,
    name: string,
    description: string,
    effects: string[],
    locked: boolean,
  ): number {
    const { cardW, iconSize, titleFontSize, descFontSize, effectsFontSize, effectsPad } = this.gridLayout;
    const effectsTextW = cardW - effectsPad * 2;
    const bottomPad = locked ? 34 : 16;
    let y = ICON_TOP_PAD + iconSize + 10;

    const title = this.add
      .text(0, 0, `${level}. ${name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: cardW - 24 },
      })
      .setVisible(false);
    y += title.height + 8;
    title.destroy();

    const desc = this.add
      .text(0, 0, description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: descFontSize,
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: cardW - 24 },
        lineSpacing: 2,
      })
      .setVisible(false);
    y += desc.height + 10;
    desc.destroy();

    y += this.measureEffectsHeight(effects, effectsTextW, effectsFontSize);
    y += bottomPad;

    if (this.gridLayout.cols === 1) {
      return y;
    }

    const minH = Math.floor(cardW * (BASE_CARD_H / BASE_CARD_W));
    return Math.max(y, minH);
  }

  private measureEffectsHeight(effects: string[], effectsTextW: number, effectsFontSize: string): number {
    if (effects.length === 0) {
      const line = this.add
        .text(0, 0, 'No extra penalties', {
          fontFamily: FONTS.PRIMARY,
          fontSize: effectsFontSize,
          color: TEXT_COLORS.DISABLED,
          align: 'left',
          wordWrap: { width: effectsTextW },
        })
        .setVisible(false);
      const h = line.height;
      line.destroy();
      return h;
    }

    let y = 0;
    effects.forEach((effect) => {
      const line = this.add
        .text(0, 0, `• ${effect}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: effectsFontSize,
          color: TEXT_COLORS.PRIMARY,
          align: 'left',
          wordWrap: { width: effectsTextW },
          lineSpacing: 1,
        })
        .setVisible(false);
      y += line.height + 3;
      line.destroy();
    });
    return y;
  }

  private buildGrid(width: number, height: number, gridTop: number): void {
    const { panelPad, cols, cardW, cardGap } = this.gridLayout;
    const usableW = width - panelPad * 2;
    const rowCount = Math.ceil(DIFFICULTIES.length / cols);

    const cardHeights = DIFFICULTIES.map((diff) =>
      this.measureCardHeight(diff.level, diff.name, diff.description, diff.effects, diff.level > this.maxUnlocked),
    );

    const rowHeights: number[] = [];
    for (let row = 0; row < rowCount; row++) {
      let maxH = 0;
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index < cardHeights.length) {
          maxH = Math.max(maxH, cardHeights[index]);
        }
      }
      rowHeights.push(maxH);
    }

    const totalGridW = cols * cardW + (cols - 1) * cardGap;
    const startX = panelPad + cardW / 2 + (usableW - totalGridW) / 2;
    this.contentHeight = rowHeights.reduce((sum, h, i) => sum + h + (i < rowHeights.length - 1 ? cardGap : 0), 0);

    const scrollAreaH = height - FOOTER_RESERVE - gridTop;

    this.gridViewport?.destroy();
    const viewport = createScrollableViewport({
      scene: this,
      x: 0,
      y: gridTop,
      width,
      height: scrollAreaH,
      contentCenterX: 0,
      depth: 40,
    });
    this.gridViewport = viewport;

    this.cards = [];
    let rowY = 0;
    DIFFICULTIES.forEach((diff, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (col === 0 && row > 0) {
        rowY += rowHeights[row - 1] + cardGap;
      }

      const cx = startX + col * (cardW + cardGap);
      const cardH = cols === 1 ? cardHeights[i] : rowHeights[row];
      const cy = rowY + cardH / 2;
      const card = this.createDifficultyCard(
        diff.level,
        diff.name,
        diff.description,
        diff.effects,
        cx,
        cy,
        cardH,
        diff.level > this.maxUnlocked,
      );
      viewport.content.add(card);
      this.cards.push(card);
    });

    viewport.setContentHeight(this.contentHeight);
  }

  private createDifficultyCard(
    level: DifficultyLevel,
    name: string,
    description: string,
    effects: string[],
    cx: number,
    cy: number,
    cardH: number,
    locked: boolean,
  ): Phaser.GameObjects.Container {
    const { cardW, iconSize, titleFontSize, descFontSize, effectsFontSize, effectsPad } = this.gridLayout;
    const effectsTextW = cardW - effectsPad * 2;

    const container = this.add.container(cx, cy);

    const cardBg = this.add.graphics();
    this.drawDifficultyCardBackground(cardBg, cardW, cardH, locked);
    container.add(cardBg);

    if (locked) {
      const lockOverlay = this.add.graphics();
      lockOverlay.fillStyle(0x000000, 0.45);
      lockOverlay.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
      container.add(lockOverlay);

      const lockedLabel = this.add
        .text(0, cardH / 2 - 18, 'Locked', {
          fontFamily: FONTS.HEADING,
          fontSize: '13px',
          color: TEXT_COLORS.DISABLED,
          align: 'center',
        })
        .setOrigin(0.5);
      container.add(lockedLabel);
    }

    const cardTop = -cardH / 2;
    const iconY = cardTop + ICON_TOP_PAD + iconSize / 2;
    addDifficultyImage(this, container, level, 0, iconY, iconSize);

    const titleY = iconY + iconSize / 2 + 10;
    const levelLabel = this.add
      .text(0, titleY, `${level}. ${name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: cardW - 24 },
      })
      .setOrigin(0.5, 0);
    container.add(levelLabel);

    const desc = this.add
      .text(0, titleY + levelLabel.height + 8, description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: descFontSize,
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: cardW - 24 },
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);
    container.add(desc);

    const effectsY = desc.y + desc.height + 10;
    const effectsBlock = this.buildEffectsText(effects, effectsTextW, effectsFontSize);
    effectsBlock.setPosition(-cardW / 2 + effectsPad, effectsY);
    container.add(effectsBlock);

    const hitZone = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0);
    container.add(hitZone);

    if (!locked) {
      hitZone.setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        if (this.selectedLevel !== level) {
          this.drawCardBorder(cardBg, cardW, cardH, COLORS.BTN_HOVER, 2, false);
        }
      });

      hitZone.on('pointerout', () => {
        if (this.selectedLevel !== level) {
          this.drawCardBorder(cardBg, cardW, cardH, COLORS.SIDEBAR_SECTION_BORDER, 2, false);
        }
      });

      hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        wireTapOnlySession(this, level, pointer, hitZone, {
          onTap: () => this.selectDifficulty(level),
        });
      });
    }

    container.setData('level', level);
    container.setData('cardBg', cardBg);
    container.setData('cardW', cardW);
    container.setData('cardH', cardH);
    container.setData('locked', locked);

    return container;
  }

  private buildEffectsText(
    effects: string[],
    effectsTextW: number,
    effectsFontSize: string,
  ): Phaser.GameObjects.Container {
    const block = this.add.container(0, 0);
    if (effects.length === 0) {
      const line = this.add.text(0, 0, 'No extra penalties', {
        fontFamily: FONTS.PRIMARY,
        fontSize: effectsFontSize,
        color: TEXT_COLORS.DISABLED,
        align: 'left',
        wordWrap: { width: effectsTextW },
      });
      line.setOrigin(0, 0);
      block.add(line);
      return block;
    }

    let y = 0;
    effects.forEach((effect, i) => {
      const isNew = i === effects.length - 1;
      const line = this.add.text(0, y, `• ${effect}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: effectsFontSize,
        color: isNew ? TEXT_COLORS.PRIMARY : TEXT_COLORS.DISABLED,
        align: 'left',
        wordWrap: { width: effectsTextW },
        lineSpacing: 1,
      });
      line.setOrigin(0, 0);
      block.add(line);
      y += line.height + 3;
    });
    return block;
  }

  private drawDifficultyCardBackground(
    cardBg: Phaser.GameObjects.Graphics,
    cardW: number,
    cardH: number,
    locked: boolean,
  ): void {
    cardBg.clear();
    cardBg.fillStyle(locked ? 0x1a1612 : COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
    cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
    cardBg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
  }

  private drawCardBorder(
    cardBg: Phaser.GameObjects.Graphics,
    cardW: number,
    cardH: number,
    borderColor: number,
    width: number,
    locked: boolean,
  ): void {
    this.drawDifficultyCardBackground(cardBg, cardW, cardH, locked);
    cardBg.lineStyle(width, borderColor, 1);
    cardBg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
  }

  private selectDifficulty(level: DifficultyLevel): void {
    if (this.professionId && !isDifficultyUnlocked(this.professionId, level)) return;

    this.selectedLevel = level;

    if (this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const cardLevel = card.getData('level') as DifficultyLevel;
      const cardW = card.getData('cardW') as number;
      const cardH = card.getData('cardH') as number;
      const locked = card.getData('locked') as boolean;

      cardBg.clear();
      if (cardLevel === level) {
        cardBg.fillStyle(0x2a3a2a, 1);
        cardBg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
        cardBg.lineStyle(3, COLORS.SELECTION, 1);
        cardBg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
      } else {
        this.drawCardBorder(cardBg, cardW, cardH, COLORS.SIDEBAR_SECTION_BORDER, 2, locked);
      }
    }
  }

  private onResize(): void {
    this.seededRunModal?.destroy();
    this.seededRunModal = null;
    this.scene.restart();
  }
}
