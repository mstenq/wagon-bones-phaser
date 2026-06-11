// ─── DifficultySelectScene ───
// Landscape: split view — difficulty grid (left) + detail panel (right).
// Portrait: full-width grid; tap opens detail overlay. Top-left Back returns to grid, then profession.

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

const GRID_CARD_W = 148;
const GRID_CARD_H = 148;
const GRID_CARD_GAP = 12;
const GRID_IMAGE_SIZE = 100;
const DETAIL_IMAGE_SIZE = 200;
const LEFT_HEADER_TOP = 36;
const LEFT_HEADER_SUB = 70;
const GRID_TOP_MARGIN = 100;
const GRID_TOP_MARGIN_PORTRAIT = 92;
const DETAIL_TOP_PAD = 12;
const PORTRAIT_BOTTOM_BAR_H = 72;
const PORTRAIT_GRID_PAD = 12;
const PORTRAIT_GRID_GAP = 10;
const PORTRAIT_DETAIL_IMAGE_SIZE = 140;
const PORTRAIT_DETAIL_TOP_Y = 24;
const DIFF_NAV_BTN_SIZE = 44;
const DIFF_NAV_GAP = 10;

type PortraitViewMode = 'grid' | 'detail';

type GridLayoutMetrics = {
  panelPad: number;
  cols: number;
  cardW: number;
  cardH: number;
  cardGap: number;
  imageSize: number;
  titleFontSize: string;
  topMargin: number;
};

export class DifficultySelectScene extends Scene {
  private selectedLevel: DifficultyLevel = 1;
  private maxUnlocked: DifficultyLevel = 1;
  private professionId: string | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private gridLayout!: GridLayoutMetrics;
  private gridViewport!: ScrollableViewportHandle;
  private detailContainer!: Phaser.GameObjects.Container;
  private contentHeight = 0;
  private seededRunModal: SeededRunModal | null = null;
  private embarkBtn!: Button;
  private seedBtn!: Button;
  private backBtn!: Button;
  private prevDiffBtn: Button | null = null;
  private nextDiffBtn: Button | null = null;
  private leftPanelW = 0;
  private rightPanelX = 0;
  private rightPanelW = 0;
  private isPortrait = false;
  private portraitViewMode: PortraitViewMode = 'grid';
  private gridChrome: Array<{ setVisible(visible: boolean): unknown }> = [];
  private divider: Phaser.GameObjects.Graphics | null = null;
  private sceneHeight = 0;
  private detailScrollMinY = DETAIL_TOP_PAD;
  private isDetailDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  constructor() {
    super('DifficultySelect');
  }

  create(): void {
    const { width, height } = this.scale;
    this.sceneHeight = height;
    this.isPortrait = isPortraitLayout(width, height);
    this.portraitViewMode = 'grid';

    if (this.isPortrait) {
      this.leftPanelW = width;
      this.rightPanelX = 0;
      this.rightPanelW = width;
    } else {
      this.leftPanelW = Math.floor(width * (2 / 3));
      this.rightPanelX = this.leftPanelW;
      this.rightPanelW = width - this.leftPanelW;
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.gridViewport?.destroy();
      this.seededRunModal?.destroy();
      this.seededRunModal = null;
    });

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    const leftCenterX = this.leftPanelW / 2;
    const headerTitleSize = this.isPortrait ? '28px' : '36px';
    const headerSubSize = this.isPortrait ? '13px' : '15px';

    const headerTitle = this.add
      .text(leftCenterX, LEFT_HEADER_TOP, 'Choose Your Trail', {
        fontFamily: FONTS.HEADING,
        fontSize: headerTitleSize,
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.gridChrome.push(headerTitle);

    const headerSub = this.add
      .text(leftCenterX, LEFT_HEADER_SUB, 'Higher stakes stack penalties — pick how harsh the frontier will be', {
        fontFamily: FONTS.PRIMARY,
        fontSize: headerSubSize,
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: this.leftPanelW - (this.isPortrait ? 24 : 32) },
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.gridChrome.push(headerSub);

    if (!this.isPortrait) {
      this.divider = this.add.graphics();
      this.divider.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
      this.divider.lineBetween(this.rightPanelX, 0, this.rightPanelX, height - 16);
      this.divider.setDepth(55);
    }

    this.backBtn = new Button(this, 72, 40, '← Back', 120, 36);
    this.backBtn.setDepth(100);
    this.backBtn.onClick(() => this.handleBack());

    this.buildActionButtons(width, height);

    this.professionId = getRunState().professionId;
    this.maxUnlocked = this.professionId ? getHighestUnlockedDifficulty(this.professionId) : 1;

    this.detailContainer = this.add.container(this.rightPanelX, DETAIL_TOP_PAD);
    this.detailContainer.setDepth(70);
    if (this.isPortrait) {
      this.detailContainer.setVisible(false);
    }

    this.buildGrid(height);

    this.selectedLevel = this.maxUnlocked;
    this.highlightSelectedCard();
    this.updateActionButtons();
    if (!this.isPortrait) {
      this.refreshDetailPanel();
    }

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildActionButtons(width: number, height: number): void {
    const btnY = height - PORTRAIT_BOTTOM_BAR_H / 2;
    const seedBtnW = width < 400 ? 110 : 130;
    const embarkW = width < 400 ? 130 : 160;
    const btnGap = 10;
    const actionBarW = seedBtnW + btnGap + embarkW;
    const actionBarStartX = (width - actionBarW) / 2;

    const landscapeBtnGap = 12;
    const landscapeSeedW = 140;
    const landscapeEmbarkW = 160;
    const landscapeTotalW = landscapeSeedW + landscapeBtnGap + landscapeEmbarkW;
    const landscapeStartX = this.rightPanelX + (this.rightPanelW - landscapeTotalW) / 2;
    const landscapeY = height - 40;

    const seedX = this.isPortrait ? actionBarStartX + seedBtnW / 2 : landscapeStartX + landscapeSeedW / 2;
    const embarkX = this.isPortrait
      ? actionBarStartX + seedBtnW + btnGap + embarkW / 2
      : landscapeStartX + landscapeSeedW + landscapeBtnGap + landscapeEmbarkW / 2;
    const actionY = this.isPortrait ? btnY : landscapeY;

    this.seedBtn = new Button(this, seedX, actionY, 'Seeded Run', this.isPortrait ? seedBtnW : landscapeSeedW, 48);
    this.seedBtn.setDepth(100);
    this.seedBtn.setVisible(!this.isPortrait);
    this.seedBtn.onClick(() => this.openSeededRunModal());

    this.embarkBtn = new Button(this, embarkX, actionY, 'Embark', this.isPortrait ? embarkW : landscapeEmbarkW, 48);
    this.embarkBtn.setDepth(100);
    this.embarkBtn.setVisible(!this.isPortrait);
    this.embarkBtn.onClick(() => this.embarkWithSeed(''));

    if (this.isPortrait) {
      const navY = DETAIL_TOP_PAD + PORTRAIT_DETAIL_TOP_Y + PORTRAIT_DETAIL_IMAGE_SIZE / 2;
      const navOffsetX = PORTRAIT_DETAIL_IMAGE_SIZE / 2 + DIFF_NAV_GAP + DIFF_NAV_BTN_SIZE / 2;
      this.prevDiffBtn = new Button(
        this,
        width / 2 - navOffsetX,
        navY,
        '',
        DIFF_NAV_BTN_SIZE,
        DIFF_NAV_BTN_SIZE,
      ).setIcon('icon_chevron_left', 22);
      this.nextDiffBtn = new Button(
        this,
        width / 2 + navOffsetX,
        navY,
        '',
        DIFF_NAV_BTN_SIZE,
        DIFF_NAV_BTN_SIZE,
      ).setIcon('icon_chevron_right', 22);
      for (const navBtn of [this.prevDiffBtn, this.nextDiffBtn]) {
        navBtn.setDepth(101);
        navBtn.setVisible(false);
      }
      this.prevDiffBtn.onClick(() => this.navigateDifficulty(-1));
      this.nextDiffBtn.onClick(() => this.navigateDifficulty(1));
    }
  }

  private handleBack(): void {
    if (this.isPortrait && this.portraitViewMode === 'detail') {
      this.showPortraitGrid();
      return;
    }
    this.scene.start('ProfessionSelect', {});
  }

  private updateActionButtons(): void {
    const unlocked = this.professionId ? isDifficultyUnlocked(this.professionId, this.selectedLevel) : true;
    this.embarkBtn.setEnabled(unlocked);
    this.seedBtn.setEnabled(unlocked);
  }

  private openSeededRunModal(): void {
    if (!this.professionId || !isDifficultyUnlocked(this.professionId, this.selectedLevel)) return;

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

  private computeGridLayout(): GridLayoutMetrics {
    if (!this.isPortrait) {
      const panelPad = 20;
      const usableW = this.leftPanelW - panelPad * 2;
      const cols = Math.max(3, Math.floor((usableW + GRID_CARD_GAP) / (GRID_CARD_W + GRID_CARD_GAP)));
      return {
        panelPad,
        cols,
        cardW: GRID_CARD_W,
        cardH: GRID_CARD_H,
        cardGap: GRID_CARD_GAP,
        imageSize: GRID_IMAGE_SIZE,
        titleFontSize: '15px',
        topMargin: GRID_TOP_MARGIN,
      };
    }

    const panelPad = PORTRAIT_GRID_PAD;
    const cardGap = PORTRAIT_GRID_GAP;
    const usableW = this.leftPanelW - panelPad * 2;
    const threeColWidth = 3 * GRID_CARD_W + 2 * cardGap;
    const cols = usableW >= threeColWidth ? 3 : 2;
    const cardW = Math.floor((usableW - (cols - 1) * cardGap) / cols);
    const cardH = cardW;
    const imageSize = Math.floor(cardW * (GRID_IMAGE_SIZE / GRID_CARD_W));
    const titleFontSize = cardW < 130 ? '13px' : '14px';

    return {
      panelPad,
      cols,
      cardW,
      cardH,
      cardGap,
      imageSize,
      titleFontSize,
      topMargin: GRID_TOP_MARGIN_PORTRAIT,
    };
  }

  private buildGrid(height: number): void {
    this.gridLayout = this.computeGridLayout();
    const { panelPad, cols, cardW, cardH, cardGap, topMargin } = this.gridLayout;
    const usableW = this.leftPanelW - panelPad * 2;
    const rows = Math.ceil(DIFFICULTIES.length / cols);

    const totalGridW = cols * cardW + (cols - 1) * cardGap;
    const startX = panelPad + cardW / 2 + (usableW - totalGridW) / 2;
    this.contentHeight = rows * cardH + (rows - 1) * cardGap;

    const scrollAreaTop = topMargin;
    const scrollAreaBottom = height - 80;
    const scrollAreaH = scrollAreaBottom - scrollAreaTop;

    this.gridViewport?.destroy();
    this.gridViewport = createScrollableViewport({
      scene: this,
      x: 0,
      y: scrollAreaTop,
      width: this.leftPanelW,
      height: scrollAreaH,
      contentCenterX: 0,
      depth: 40,
    });
    this.gridViewport.setInputEnabled(this.isGridScrollActive());
    this.gridChrome.push(this.gridViewport.root);

    this.cards = [];
    DIFFICULTIES.forEach((diff, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + cardGap);
      const cy = cardH / 2 + row * (cardH + cardGap);
      const card = this.createDifficultyCard(diff.level, diff.name, cx, cy, diff.level > this.maxUnlocked);
      this.gridViewport.content.add(card);
      this.cards.push(card);
    });

    this.gridViewport.setContentHeight(this.contentHeight);

    if (this.isPortrait) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.portraitViewMode !== 'detail') return;
        if (pointer.y >= this.sceneHeight - PORTRAIT_BOTTOM_BAR_H) return;
        this.isDetailDragging = true;
        this.dragStartY = pointer.y;
        this.scrollStartY = this.detailContainer.y;
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!this.isDetailDragging) return;
        const dy = pointer.y - this.dragStartY;
        this.detailContainer.y = Phaser.Math.Clamp(this.scrollStartY + dy, this.detailScrollMinY, DETAIL_TOP_PAD);
      });
      const onPointerEnd = () => {
        this.isDetailDragging = false;
      };
      this.input.on('pointerup', onPointerEnd);
      this.input.on('pointerupoutside', onPointerEnd);
    }
  }

  private drawDifficultyCardBg(
    cardBg: Phaser.GameObjects.Graphics,
    locked: boolean,
    style: 'default' | 'hover' | 'selected',
  ): void {
    const { cardW, cardH } = this.gridLayout;
    const halfW = cardW / 2;
    const halfH = cardH / 2;

    cardBg.clear();
    if (style === 'selected') {
      cardBg.fillStyle(0x2a3a2a, 1);
      cardBg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 10);
      cardBg.lineStyle(3, COLORS.SELECTION, 1);
      cardBg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 10);
      return;
    }

    const fillColor = locked ? 0x1a1612 : COLORS.BG_CARD;
    cardBg.fillStyle(fillColor, 1);
    cardBg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 10);
    const borderColor = style === 'hover' ? COLORS.BTN_HOVER : COLORS.SIDEBAR_SECTION_BORDER;
    cardBg.lineStyle(2, borderColor, 1);
    cardBg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 10);
  }

  private createDifficultyCard(
    level: DifficultyLevel,
    name: string,
    cx: number,
    cy: number,
    locked: boolean,
  ): Phaser.GameObjects.Container {
    const { cardW, cardH, imageSize, titleFontSize } = this.gridLayout;
    const container = this.add.container(cx, cy);
    const imageTopPad = 8;

    const cardBg = this.add.graphics();
    this.drawDifficultyCardBg(cardBg, locked, 'default');
    container.add(cardBg);

    if (locked) {
      const lockBadge = this.add
        .text(cardW / 2 - 6, -cardH / 2 + 6, 'Locked', {
          fontFamily: FONTS.HEADING,
          fontSize: '10px',
          color: TEXT_COLORS.DISABLED,
        })
        .setOrigin(1, 0);
      container.add(lockBadge);
    }

    addDifficultyImage(this, container, level, 0, -cardH / 2 + imageTopPad + imageSize / 2, imageSize);

    const titleText = this.add
      .text(0, -cardH / 2 + imageTopPad + imageSize + 14, `${level}. ${name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: locked ? TEXT_COLORS.DISABLED : TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: cardW - 10 },
      })
      .setOrigin(0.5);
    container.add(titleText);

    const hitZone = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0);
    container.add(hitZone);
    hitZone.setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      if (this.selectedLevel !== level) {
        this.drawDifficultyCardBg(cardBg, locked, 'hover');
      }
    });

    hitZone.on('pointerout', () => {
      if (this.selectedLevel !== level) {
        this.drawDifficultyCardBg(cardBg, locked, 'default');
      }
    });

    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      wireTapOnlySession(this, level, pointer, hitZone, {
        canTap: () => this.isGridScrollActive(),
        onTap: () => this.selectDifficulty(level),
      });
    });

    container.setData('level', level);
    container.setData('cardBg', cardBg);
    container.setData('locked', locked);

    return container;
  }

  private highlightSelectedCard(): void {
    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const cardLevel = card.getData('level') as DifficultyLevel;
      const locked = card.getData('locked') as boolean;
      const style = cardLevel === this.selectedLevel ? 'selected' : 'default';
      this.drawDifficultyCardBg(cardBg, locked, style);
    }
  }

  private selectDifficulty(level: DifficultyLevel, playSfx = true): void {
    this.selectedLevel = level;

    if (playSfx && this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    this.highlightSelectedCard();
    this.updateActionButtons();

    if (this.isPortrait) {
      this.showPortraitDetail();
      return;
    }

    this.refreshDetailPanel();
  }

  private isGridScrollActive(): boolean {
    if (!this.isPortrait) {
      return true;
    }
    return this.portraitViewMode === 'grid';
  }

  private showPortraitGrid(): void {
    this.portraitViewMode = 'grid';
    this.isDetailDragging = false;
    this.detailContainer.y = DETAIL_TOP_PAD;
    this.gridViewport.setInputEnabled(true);
    this.setGridChromeVisible(true);
    this.detailContainer.setVisible(false);
    this.prevDiffBtn?.setVisible(false);
    this.nextDiffBtn?.setVisible(false);
    this.embarkBtn.setVisible(false);
    this.seedBtn.setVisible(false);
  }

  private showPortraitDetail(): void {
    this.portraitViewMode = 'detail';
    this.gridViewport.setInputEnabled(false);
    this.setGridChromeVisible(false);
    this.detailContainer.setVisible(true);
    this.detailContainer.y = DETAIL_TOP_PAD;
    this.refreshDetailPanel();
    this.prevDiffBtn?.setVisible(true);
    this.nextDiffBtn?.setVisible(true);
    this.embarkBtn.setVisible(true);
    this.seedBtn.setVisible(true);
  }

  private navigateDifficulty(delta: number): void {
    const levels = DIFFICULTIES.map((d) => d.level);
    const idx = levels.indexOf(this.selectedLevel);
    if (idx < 0) return;
    const nextIdx = (idx + delta + levels.length) % levels.length;
    this.selectDifficulty(levels[nextIdx], false);
  }

  private setGridChromeVisible(visible: boolean): void {
    for (const obj of this.gridChrome) {
      obj.setVisible(visible);
    }
  }

  private refreshDetailPanel(): void {
    this.detailContainer.removeAll(true);

    const panelPad = 16;
    const contentW = this.rightPanelW - panelPad * 2;
    const centerX = this.rightPanelW / 2;
    const detailImageSize = this.isPortrait ? PORTRAIT_DETAIL_IMAGE_SIZE : DETAIL_IMAGE_SIZE;
    const titleFontSize = this.isPortrait ? '24px' : '28px';
    const detailTopY = this.isPortrait ? PORTRAIT_DETAIL_TOP_Y : 40;

    const diff = DIFFICULTIES.find((d) => d.level === this.selectedLevel);
    if (!diff) return;

    const locked = this.professionId ? !isDifficultyUnlocked(this.professionId, this.selectedLevel) : false;

    let y = detailTopY;

    addDifficultyImage(this, this.detailContainer, diff.level, centerX, y + detailImageSize / 2, detailImageSize);
    y += detailImageSize + 12;

    const title = this.add
      .text(centerX, y, `${diff.level}. ${diff.name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(title);
    y += title.height + 8;

    const desc = this.add
      .text(centerX, y, diff.description, {
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

    const penaltiesHeader = this.add
      .text(centerX, y, 'Trail penalties', {
        fontFamily: FONTS.HEADING,
        fontSize: '14px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.detailContainer.add(penaltiesHeader);
    y += penaltiesHeader.height + 8;

    y = this.addEffectsSection(diff.effects, centerX, y, contentW);

    if (locked) {
      y += 14;
      const prevDiff = DIFFICULTIES[this.maxUnlocked - 1];
      const lockMsg = this.add
        .text(centerX, y, `Beat ${prevDiff.name} (${this.maxUnlocked}) to unlock this difficulty.`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.DISABLED,
          align: 'center',
          wordWrap: { width: contentW },
          lineSpacing: 2,
        })
        .setOrigin(0.5, 0);
      this.detailContainer.add(lockMsg);
      y += lockMsg.height;
    }

    if (this.isPortrait) {
      const bottomPad = PORTRAIT_BOTTOM_BAR_H + 12;
      const availableH = this.sceneHeight - DETAIL_TOP_PAD - bottomPad;
      const contentH = y;
      const overflow = contentH - availableH;
      this.detailScrollMinY = overflow > 0 ? DETAIL_TOP_PAD - overflow : DETAIL_TOP_PAD;
      this.detailContainer.y = DETAIL_TOP_PAD;
    }
  }

  private addEffectsSection(effects: string[], centerX: number, startY: number, contentW: number): number {
    let y = startY;

    if (effects.length === 0) {
      const line = this.add
        .text(centerX, y, 'No extra penalties', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.DISABLED,
          align: 'center',
          wordWrap: { width: contentW },
        })
        .setOrigin(0.5, 0);
      this.detailContainer.add(line);
      return y + line.height;
    }

    for (const effect of effects) {
      const line = this.add
        .text(centerX, y, `• ${effect}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.PRIMARY,
          align: 'center',
          wordWrap: { width: contentW },
          lineSpacing: 2,
        })
        .setOrigin(0.5, 0);
      this.detailContainer.add(line);
      y += line.height + 4;
    }

    return y;
  }

  private onResize(): void {
    this.seededRunModal?.destroy();
    this.seededRunModal = null;
    this.scene.restart();
  }
}
