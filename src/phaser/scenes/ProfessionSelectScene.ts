// ─── ProfessionSelectScene ───
// Landscape: split view — profession grid (left) + detail panel (right).
// Portrait: full-width grid; tap opens detail overlay with bottom action bar.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY, DIFFICULTIES } from '../../game/Constants';
import { Button } from '../ui/Button';
import professionsData, { type ProfessionDef, getProfessionById } from '../../data/professions';
import { performLoadGame } from '../SaveLoadIO';
import { getDifficultyBeatColor, getDifficultyBeatStrokeColor } from '../../game/DifficultyDisplay';
import { getHighestDifficultyBeaten } from '../../game/UserStats';
import { DiceSprite } from '../ui/DiceSprite';
import { getDiceGroupDisplayLabel, groupDiceByVisualIdentity } from '../ui/diceGrouping';
import { isPortraitLayout, computePortraitSelectActionBar } from '../ui/SceneLayout';
import { wireTapOnlySession } from '../ui/pointerDragSession';
import { createScrollableViewport, type ScrollableViewportHandle } from '../ui/ScrollableViewport';

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
const GRID_TOP_MARGIN_PORTRAIT = 92;
const DETAIL_TOP_PAD = 12;
const PORTRAIT_GRID_PAD = 12;
const PORTRAIT_GRID_GAP = 10;
const PORTRAIT_DETAIL_IMAGE_SIZE = 140;
const PORTRAIT_DETAIL_TOP_Y = 24;
const PROF_NAV_BTN_SIZE = 44;
const PROF_NAV_GAP = 10;

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

export class ProfessionSelectScene extends Scene {
  private selectedId: string | null = null;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmBtn: Button;
  private backBtn: Button | null = null;
  private prevProfBtn: Button | null = null;
  private nextProfBtn: Button | null = null;
  private gridViewport!: ScrollableViewportHandle;
  private detailContainer: Phaser.GameObjects.Container;
  private contentHeight = 0;
  private dragStartY = 0;
  private scrollStartY = 0;
  private leftPanelW = 0;
  private rightPanelX = 0;
  private rightPanelW = 0;
  private diceSprites: DiceSprite[] = [];
  private isPortrait = false;
  private portraitViewMode: PortraitViewMode = 'grid';
  private gridChrome: Array<{ setVisible(visible: boolean): unknown }> = [];
  private divider: Phaser.GameObjects.Graphics | null = null;
  private loadBtn: Button | null = null;
  private sceneHeight = 0;
  private portraitBottomBarH = 0;
  private detailScrollMinY = DETAIL_TOP_PAD;
  private isDetailDragging = false;
  private gridLayout: GridLayoutMetrics;

  constructor() {
    super('ProfessionSelect');
  }

  create() {
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
      this.destroyDiceSprites();
    });

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    const leftCenterX = this.leftPanelW / 2;
    const headerTitleSize = this.isPortrait ? '28px' : '36px';
    const headerSubSize = this.isPortrait ? '13px' : '15px';

    const headerTitle = this.add
      .text(leftCenterX, LEFT_HEADER_TOP, 'Choose Your Profession', {
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
      .text(leftCenterX, LEFT_HEADER_SUB, 'Each profession grants unique bonuses for the journey ahead', {
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

    this.loadBtn = new Button(this, 120, height - 40, 'Load Game', { variant: 'secondary', size: 'lg', width: 160 });
    this.loadBtn.setDepth(100);
    this.loadBtn.onClick(() => {
      void performLoadGame(this, { confirmOverwrite: false });
    });
    this.gridChrome.push(this.loadBtn);

    const portraitActionBar = computePortraitSelectActionBar(height);
    this.portraitBottomBarH = portraitActionBar.bottomBarH;
    const btnY = portraitActionBar.btnY;
    const backW = 120;
    const confirmW = 200;
    const btnGap = 12;
    const actionBarW = backW + btnGap + confirmW;
    const actionBarStartX = (width - actionBarW) / 2;

    const confirmX = this.isPortrait
      ? actionBarStartX + backW + btnGap + confirmW / 2
      : this.rightPanelX + this.rightPanelW / 2;
    const confirmY = this.isPortrait ? btnY : height - 40;
    this.confirmBtn = new Button(this, confirmX, confirmY, 'Select Difficulty', {
      variant: 'primary',
      size: 'lg',
      width: confirmW,
    });
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.setVisible(false);
    this.confirmBtn.setDepth(100);
    this.confirmBtn.onClick(() => {
      if (!this.selectedId) return;
      gameFacade.meta.applyProfession(this.selectedId);
      gameFacade.meta.finalizeRunSetup();
      this.scene.start('DifficultySelect', {});
    });

    if (this.isPortrait) {
      const backX = actionBarStartX + backW / 2;
      this.backBtn = new Button(this, backX, btnY, 'Back', { variant: 'secondary', size: 'lg', width: backW });
      this.backBtn.setDepth(100);
      this.backBtn.setVisible(false);
      this.backBtn.onClick(() => this.showPortraitGrid());

      const navY = DETAIL_TOP_PAD + PORTRAIT_DETAIL_TOP_Y + PORTRAIT_DETAIL_IMAGE_SIZE / 2;
      const navOffsetX = PORTRAIT_DETAIL_IMAGE_SIZE / 2 + PROF_NAV_GAP + PROF_NAV_BTN_SIZE / 2;
      this.prevProfBtn = new Button(this, width / 2 - navOffsetX, navY, '', {
        variant: 'secondary',
        width: PROF_NAV_BTN_SIZE,
        height: PROF_NAV_BTN_SIZE,
      }).setIcon('icon_chevron_left', 22);
      this.nextProfBtn = new Button(this, width / 2 + navOffsetX, navY, '', {
        variant: 'secondary',
        width: PROF_NAV_BTN_SIZE,
        height: PROF_NAV_BTN_SIZE,
      }).setIcon('icon_chevron_right', 22);
      for (const navBtn of [this.prevProfBtn, this.nextProfBtn]) {
        navBtn.setDepth(101);
        navBtn.setVisible(false);
      }
      this.prevProfBtn.onClick(() => this.navigateProfession(-1));
      this.nextProfBtn.onClick(() => this.navigateProfession(1));
    }

    this.detailContainer = this.add.container(this.rightPanelX, DETAIL_TOP_PAD);
    this.detailContainer.setDepth(70);
    if (this.isPortrait) {
      this.detailContainer.setVisible(false);
    }

    this.buildGrid(height);
    if (!this.isPortrait) {
      this.refreshDetailPanel();
    }

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildGrid(height: number): void {
    const profs = professionsData;
    this.gridLayout = this.computeGridLayout();
    const { panelPad, cols, cardW, cardH, cardGap, topMargin } = this.gridLayout;
    const usableW = this.leftPanelW - panelPad * 2;
    const rows = Math.ceil(profs.length / cols);

    const totalGridW = cols * cardW + (cols - 1) * cardGap;
    const startX = panelPad + cardW / 2 + (usableW - totalGridW) / 2;
    this.contentHeight = rows * cardH + (rows - 1) * cardGap;

    const scrollAreaTop = topMargin;
    const scrollAreaBottom = height - 80;
    const scrollAreaH = scrollAreaBottom - scrollAreaTop;

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

    this.cards = [];
    profs.forEach((prof, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + cardGap);
      const cy = cardH / 2 + row * (cardH + cardGap);
      const card = this.createProfessionCard(prof, cx, cy);
      this.gridViewport.content.add(card);
      this.cards.push(card);
    });

    this.gridViewport.setContentHeight(this.contentHeight);
    this.gridChrome.push(this.gridViewport.root);

    if (this.isPortrait) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.portraitViewMode !== 'detail') return;
        if (pointer.y >= this.sceneHeight - this.portraitBottomBarH) return;
        this.isDetailDragging = true;
        this.dragStartY = pointer.y;
        this.scrollStartY = this.detailContainer.y;
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!this.isDetailDragging) return;
        const dy = pointer.y - this.dragStartY;
        this.detailContainer.y = Phaser.Math.Clamp(this.scrollStartY + dy, this.detailScrollMinY, DETAIL_TOP_PAD);
        this.repositionDiceSprites();
      });
      const onPointerEnd = () => {
        this.isDetailDragging = false;
      };
      this.input.on('pointerup', onPointerEnd);
      this.input.on('pointerupoutside', onPointerEnd);
    }
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

  private drawProfessionCardBg(cardBg: Phaser.GameObjects.Graphics, style: 'default' | 'hover' | 'selected'): void {
    const { cardW, cardH } = this.gridLayout;
    const halfW = cardW / 2;
    const halfH = cardH / 2;

    cardBg.clear();
    if (style === 'selected') {
      cardBg.fillStyle(0x2a3a2a, 1);
      cardBg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 10);
      cardBg.lineStyle(3, COLORS.GOLD, 1);
      cardBg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 10);
      return;
    }

    cardBg.fillStyle(COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-halfW, -halfH, cardW, cardH, 10);
    const borderColor = style === 'hover' ? COLORS.BTN_HOVER : COLORS.SIDEBAR_SECTION_BORDER;
    const borderWidth = style === 'hover' ? 2 : 2;
    cardBg.lineStyle(borderWidth, borderColor, 1);
    cardBg.strokeRoundedRect(-halfW, -halfH, cardW, cardH, 10);
  }

  private createProfessionCard(prof: ProfessionDef, cx: number, cy: number): Phaser.GameObjects.Container {
    const { cardW, cardH, imageSize, titleFontSize } = this.gridLayout;
    const container = this.add.container(cx, cy);
    const beatDotX = cardW / 2 - 10;
    const beatDotY = -cardH / 2 + 10;
    const imageTopPad = 8;

    const cardBg = this.add.graphics();
    this.drawProfessionCardBg(cardBg, 'default');
    container.add(cardBg);

    this.addBeatIndicatorDot(container, prof.id, beatDotX, beatDotY);

    const atlasFrame = `${prof.id}.png`;
    const professionTexture = this.textures.get('professions');
    const canUseAtlas = this.textures.exists('professions') && professionTexture.has(atlasFrame);
    if (canUseAtlas) {
      const img = this.add.image(0, -cardH / 2 + imageTopPad + imageSize / 2, 'professions', atlasFrame);
      const scale = imageSize / Math.max(img.width, img.height);
      img.setScale(scale);
      container.add(img);
    }

    const titleText = this.add
      .text(0, -cardH / 2 + imageTopPad + imageSize + 16, prof.title, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: cardW - 10 },
      })
      .setOrigin(0.5);
    container.add(titleText);

    const hitZone = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0);
    container.add(hitZone);
    hitZone.setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      if (this.selectedId !== prof.id) {
        this.drawProfessionCardBg(cardBg, 'hover');
      }
    });

    hitZone.on('pointerout', () => {
      if (this.selectedId !== prof.id) {
        this.drawProfessionCardBg(cardBg, 'default');
      }
    });

    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      wireTapOnlySession(this, prof.id, pointer, hitZone, {
        canTap: () => this.isGridScrollActive(),
        onTap: () => this.selectProfession(prof.id),
      });
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

  private selectProfession(id: string, playSfx = true): void {
    this.selectedId = id;

    if (playSfx && this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const profId = card.getData('profId') as string;
      this.drawProfessionCardBg(cardBg, profId === id ? 'selected' : 'default');
    }

    this.confirmBtn.setEnabled(true);
    if (this.isPortrait) {
      this.showPortraitDetail();
      return;
    }

    this.confirmBtn.setVisible(true);
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
    this.destroyDiceSprites();
    this.backBtn?.setVisible(false);
    this.prevProfBtn?.setVisible(false);
    this.nextProfBtn?.setVisible(false);
    this.confirmBtn.setVisible(false);
  }

  private showPortraitDetail(): void {
    this.portraitViewMode = 'detail';
    this.gridViewport.setInputEnabled(false);
    this.setGridChromeVisible(false);
    this.detailContainer.setVisible(true);
    this.detailContainer.y = DETAIL_TOP_PAD;
    this.refreshDetailPanel();
    this.backBtn?.setVisible(true);
    this.prevProfBtn?.setVisible(true);
    this.nextProfBtn?.setVisible(true);
    this.confirmBtn.setEnabled(true);
    this.confirmBtn.setVisible(true);
  }

  private navigateProfession(delta: number): void {
    if (!this.selectedId) return;
    const ids = professionsData.map((p) => p.id);
    const idx = ids.indexOf(this.selectedId);
    if (idx < 0) return;
    const nextIdx = (idx + delta + ids.length) % ids.length;
    this.selectProfession(ids[nextIdx], false);
  }

  private setGridChromeVisible(visible: boolean): void {
    for (const obj of this.gridChrome) {
      obj.setVisible(visible);
    }
  }

  private refreshDetailPanel(): void {
    this.detailContainer.removeAll(true);
    this.destroyDiceSprites();

    const panelPad = 16;
    const contentW = this.rightPanelW - panelPad * 2;
    const centerX = this.rightPanelW / 2;
    const detailImageSize = this.isPortrait ? PORTRAIT_DETAIL_IMAGE_SIZE : DETAIL_IMAGE_SIZE;
    const titleFontSize = this.isPortrait ? '24px' : '28px';
    const detailTopY = this.isPortrait ? PORTRAIT_DETAIL_TOP_Y : 100;

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

    let y = detailTopY;

    const atlasFrame = `${prof.id}.png`;
    const professionTexture = this.textures.get('professions');
    const canUseAtlas = this.textures.exists('professions') && professionTexture.has(atlasFrame);
    if (canUseAtlas) {
      const img = this.add.image(centerX, y + detailImageSize / 2, 'professions', atlasFrame);
      const scale = detailImageSize / Math.max(img.width, img.height);
      img.setScale(scale);
      this.detailContainer.add(img);
      y += detailImageSize + 12;
    }

    const title = this.add
      .text(centerX, y, prof.title, {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
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

    if (this.isPortrait) {
      const bottomPad = this.portraitBottomBarH + 12;
      const availableH = this.sceneHeight - DETAIL_TOP_PAD - bottomPad;
      const contentH = y + beatValue.height;
      const overflow = contentH - availableH;
      this.detailScrollMinY = overflow > 0 ? DETAIL_TOP_PAD - overflow : DETAIL_TOP_PAD;
      this.detailContainer.y = DETAIL_TOP_PAD;
    }
  }

  private addStartingDiceSection(prof: ProfessionDef, centerX: number, startY: number, contentW: number): number {
    const specialtyCount = prof.startingDice.length;
    const standardCount = Math.max(0, GAMEPLAY.STARTING_DICE - specialtyCount);

    const previewDice = prof.startingDice.map((enhancement, i) =>
      gameFacade.meta.createPreviewDie({
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
        representative: gameFacade.meta.createPreviewDie({
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
    const diceGroupSpacing = this.isPortrait ? 68 : DICE_GROUP_SPACING;
    const dicePreviewScale = this.isPortrait ? 0.58 : DICE_PREVIEW_SCALE;
    const maxCols = this.isPortrait ? 3 : 4;
    const cols = Math.min(displayGroups.length, maxCols);
    const gridStartX = centerX - ((cols - 1) * diceGroupSpacing) / 2;

    DiceSprite.suppressTooltips = true;

    for (let i = 0; i < displayGroups.length; i++) {
      const group = displayGroups[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * diceGroupSpacing;
      const dieY = y + row * DICE_ROW_HEIGHT + 22;

      const sprite = new DiceSprite(this, this.rightPanelX + x, this.detailContainer.y + dieY, group.representative);
      sprite.setData('detailLocalY', dieY);
      sprite.setScale(dicePreviewScale);
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

  private repositionDiceSprites(): void {
    for (const sprite of this.diceSprites) {
      const localY = sprite.getData('detailLocalY') as number;
      sprite.y = this.detailContainer.y + localY;
    }
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
