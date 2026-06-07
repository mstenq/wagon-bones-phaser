// ─── Sidebar ───
// Balatro-style left panel showing game state info.
// Used in both ShopScene and GameScene for consistency.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI, GAMEPLAY, TEXTURES } from '../../game/Constants';
import { formatScore, formatScoreComponent, formatMult } from '../../game/formatScore';
import { milesFromSave } from '../../game/scoreMath';
import type { DecimalSource } from '../../game/decimal';
import type { ProfessionDef } from '../../data/professions';
import type { BossDef } from '../../game/types';
import { runStore } from '../../game/store/runStore';
import { roundStore } from '../../game/store/roundStore';
import { getRunProfession } from '../../game/store/runReads';
import { selectRunSidebarModel, selectSidebarOverlayRevision } from '../../game/store/selectors/uiSelectors';
import { selectRoundTotalMiles } from '../../game/store/selectors/roundSelectors';
import { Button } from './Button';
import { addDifficultyImage, getDifficultyDef } from './DifficultyAssets';
import { DifficultyTooltip } from './DifficultyTooltip';
import { bindGameObject } from '../store/subscribe';
import type { RunStatusTrait } from '../../game/runStatusTraits';
import type { LayoutMode } from '../../game/Constants';

export interface SidebarData {
  /** Title shown at top: "SHOP", "The Inspector", etc. */
  title: string;
  /** Current round/leg score */
  roundScore: DecimalSource;
  /** Miles base value */
  milesBase: DecimalSource | number;
  /** Multiplier value */
  mult: DecimalSource;
  /** Travel days remaining */
  daysRemaining: number;
  /** Rerolls remaining */
  rerolls: number;
  /** Current leg number */
  leg: number;
  /** Total legs */
  totalLegs: number;
  /** Current round within leg */
  round?: number;
  /** Total rounds per leg */
  totalRounds?: number;
  /** Target miles for this leg */
  targetMiles: DecimalSource;
  /** Hand name to display (e.g. "Full House") */
  handName?: string;
  /** Hand level */
  handLevel?: number;
  /** Active boss (boss round) — shows portrait + effect description */
  boss?: BossDef | null;
  /** Consumable / run buffs and debuffs (sidebar status panels) */
  statusTraits?: RunStatusTrait[];
}

export class Sidebar extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private sidebarWidth: number;
  private barHeight: number;
  private layoutMode: LayoutMode;

  // Text elements for updating
  private titleText: GameObjects.Text;
  private roundScoreText: GameObjects.Text;
  private handNameText: GameObjects.Text;
  private milesBaseText: GameObjects.Text;
  private multText: GameObjects.Text;
  private daysText: GameObjects.Text;
  private rerollsText: GameObjects.Text;
  private moneyText: GameObjects.Text;
  private legText: GameObjects.Text;
  private targetText: GameObjects.Text;

  private journeyInfoBtn: Button;
  private optionsBtn: Button;

  private mainContentContainer: GameObjects.Container;
  private professionContainer: GameObjects.Container;
  private bossPanelHeight: number = 0;
  private bossContainer: GameObjects.Container;
  private contentStartY: number = 0;
  private bossDescText: GameObjects.Text | null = null;
  private statusPanelsContainer: GameObjects.Container;
  private statusPanelsTotalHeight = 0;
  private modifiersIndicator: GameObjects.Container | null = null;
  private topBarBoss: BossDef | null = null;
  private topBarTraits: RunStatusTrait[] = [];
  private profTooltip: GameObjects.Container | null = null;
  private difficultyTooltip = new DifficultyTooltip();
  private difficultyIcon: GameObjects.Image | null = null;
  private titleIconHit: GameObjects.Zone | null = null;
  private titleSectionY = 0;
  private titleSectionH = 44;

  private onJourneyInfo: (() => void) | null = null;
  private onOptions: (() => void) | null = null;
  private onModifiersModal: (() => void) | null = null;
  private subscribedDifficulty = 1;

  /** Y coordinate of the hand display area in sidebar space (for upgrade animation positioning) */
  private handDisplayY: number = 0;
  private handDisplayLocalY: number = 0;

  constructor(scene: Scene, width: number, height: number, layoutMode: LayoutMode = 'sidebar') {
    super(scene, 0, 0);
    this.sidebarWidth = width;
    this.barHeight = height;
    this.layoutMode = layoutMode;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.drawBackground(width, height);
    if (layoutMode === 'topbar') {
      this.buildTopBarContent(scene, width, height);
    } else {
      this.buildSidebarContent(scene, width, height);
    }

    this.setDepth(200);
    this.setScrollFactor(0);
    scene.add.existing(this);
  }

  getLayoutMode(): LayoutMode {
    return this.layoutMode;
  }

  getTopBarHeight(): number {
    return this.layoutMode === 'topbar' ? this.barHeight : 0;
  }

  /**
   * Adds a tileable textured panel plus an optional rounded border to `parent`.
   * Phaser 4 geometry masks are Canvas-only, so the tile keeps square corners;
   * the rounded border stroke (drawn in the panel's own color family) hides the
   * tiny corner overshoot.
   */
  private texturePanel(
    parent: GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    textureKey: string,
    opts: { radius?: number; border?: number; borderAlpha?: number; alpha?: number } = {},
  ): GameObjects.TileSprite {
    const radius = opts.radius ?? UI.SIDEBAR_PANEL_RADIUS;
    const tile = this.scene.add.tileSprite(x, y, w, h, textureKey).setOrigin(0, 0);
    tile.setAlpha(opts.alpha ?? 1);
    parent.add(tile);

    if (opts.border !== undefined) {
      const border = this.scene.add.graphics();
      border.lineStyle(1, opts.border, opts.borderAlpha ?? 0.8);
      border.strokeRoundedRect(x, y, w, h, radius);
      parent.add(border);
    }

    return tile;
  }

  /** Pins difficulty icon left; centers title text in the sidebar title panel. */
  private layoutSidebarTitleHeader(): void {
    if (this.layoutMode === 'topbar') return;

    const pad = UI.SIDEBAR_PADDING;
    const innerW = this.sidebarWidth - pad * 2;
    const titleIconY = this.titleSectionY + this.titleSectionH / 2;
    const titleIconX = pad + 18;

    if (this.difficultyIcon) {
      this.difficultyIcon.setPosition(titleIconX, titleIconY);
      this.titleIconHit?.setPosition(titleIconX, titleIconY);
    }

    this.titleText.setOrigin(0.5, 0.5).setPosition(pad + innerW / 2, titleIconY);
  }

  private drawBackground(w: number, h: number): void {
    this.bg.clear();
    if (this.scene.textures.exists(TEXTURES.PANEL_DARK)) {
      const tile = this.scene.add.tileSprite(0, 0, w, h, TEXTURES.PANEL_DARK).setOrigin(0, 0);
      this.add(tile);
    } else {
      this.bg.fillStyle(UI.SIDEBAR_BG, 0.95);
      this.bg.fillRect(0, 0, w, h);
    }
    this.bg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, COLORS.SIDEBAR_SECTION_BORDER_ALPHA);
    if (this.layoutMode === 'topbar') {
      this.bg.lineBetween(0, h, w, h);
    } else {
      this.bg.lineBetween(w, 0, w, h);
    }
    this.add(this.bg);
  }

  private buildSidebarContent(scene: Scene, w: number, _h: number): void {
    const pad = UI.SIDEBAR_PADDING;
    const cx = w / 2;
    const innerW = w - pad * 2;
    let y: number = pad;

    // ─── Title / header (scene name + difficulty stake) ───
    const titleH = this.titleSectionH;
    this.titleSectionY = y;
    const titleBarBottom = y + titleH;

    this.texturePanel(this, pad, y, innerW, titleH, TEXTURES.PANEL_DARK, {
      border: COLORS.SIDEBAR_SECTION_BORDER,
      borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
      radius: 0,
    });

    this.difficultyIcon = addDifficultyImage(scene, this, selectRunSidebarModel().difficulty, 0, y + titleH / 2, 32);

    this.titleText = scene.add.text(0, y + titleH / 2, 'SHOP', {
      fontFamily: FONTS.TITLE,
      fontSize: '24px',
      color: TEXT_COLORS.PRIMARY,
    });
    this.add(this.titleText);
    this.layoutSidebarTitleHeader();

    if (this.difficultyIcon) {
      const titleIconSize = 32;
      this.titleIconHit = scene.add
        .zone(0, y + titleH / 2, titleIconSize + 8, titleIconSize + 8)
        .setInteractive({ useHandCursor: true });
      this.add(this.titleIconHit);
      this.titleIconHit.on('pointerover', () => {
        const def = getDifficultyDef(selectRunSidebarModel().difficulty);
        const iconX = this.difficultyIcon?.x ?? pad;
        const iconY = this.difficultyIcon?.y ?? y + titleH / 2;
        this.difficultyTooltip.show(
          this.scene,
          def,
          iconX,
          iconY + titleIconSize / 2 + 4,
          {
            minX: pad,
            maxX: w - pad,
            minY: titleBarBottom + UI.SIDEBAR_SECTION_GAP,
          },
          400,
          this,
        );
      });
      this.titleIconHit.on('pointerout', () => this.difficultyTooltip.hide());
    }

    y += titleH;

    this.contentStartY = y;

    // ─── Status panels: run traits + trail debuffs (pinned below title) ───
    this.statusPanelsContainer = scene.add.container(0, y);
    this.add(this.statusPanelsContainer);
    this.statusPanelsContainer.setDepth(5);

    // ─── Boss Display (hidden until boss round; sits above shifting content) ───
    const bossImgSize = 72;
    const bossH = 100;
    this.bossPanelHeight = bossH + UI.SIDEBAR_SECTION_GAP;

    this.bossContainer = scene.add.container(0, this.contentStartY);
    this.bossContainer.setVisible(false);
    this.add(this.bossContainer);

    this.texturePanel(this.bossContainer, pad, 0, innerW, bossH, TEXTURES.PANEL_RED, {
      border: 0x8a3333,
      borderAlpha: 0.9,
    });

    const bossImgPlaceholder = scene.add.rectangle(
      pad + 8 + bossImgSize / 2,
      bossH / 2,
      bossImgSize,
      bossImgSize,
      0x2a1515,
    );
    this.bossContainer.add(bossImgPlaceholder);
    this.bossContainer.setData('bossImgPlaceholder', bossImgPlaceholder);

    this.bossDescText = scene.add.text(pad + 16 + bossImgSize, 10, '', {
      fontFamily: FONTS.TITLE,
      fontSize: '14px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: w - pad * 2 - bossImgSize - 24 },
      lineSpacing: 2,
    });
    this.bossContainer.add(this.bossDescText);

    // Everything below boss panel shifts down when boss is visible
    this.mainContentContainer = scene.add.container(0, this.contentStartY);
    this.add(this.mainContentContainer);

    y = 0;

    // ─── Profession Display ───
    const prof = getRunProfession();
    const profImgSize = 120;
    const profH = 130;
    this.professionContainer = scene.add.container(0, 0);
    this.mainContentContainer.add(this.professionContainer);

    if (prof) {
      // this.texturePanel(this.professionContainer, pad, y, innerW, profH, TEXTURES.PANEL_DARK, {
      //   border: COLORS.SIDEBAR_SECTION_BORDER,
      //   borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
      //   radius: 0,
      // });

      const atlasFrame = `${prof.id}.png`;
      const profTexture = scene.textures.get('professions');
      const canUseAtlas = scene.textures.exists('professions') && profTexture.has(atlasFrame);
      if (canUseAtlas) {
        const profImg = scene.add.image(profImgSize / 2, y + profH / 2, 'professions', atlasFrame);
        const imgScale = profImgSize / Math.max(profImg.width, profImg.height);
        profImg.setScale(imgScale);
        this.professionContainer.add(profImg);
      }

      // Right side content area
      const rightX = profImgSize;
      const rightW = w - rightX;
      const rightEdge = rightX + rightW - pad;

      // Title
      const profNameText = scene.add.text(rightX, y + 8, prof.title, {
        fontFamily: FONTS.TITLE,
        fontSize: '17px',
        color: TEXT_COLORS.PRIMARY,
      });
      this.professionContainer.add(profNameText);

      // Full name
      const profCharName = scene.add.text(rightX, y + 30, prof.name, {
        fontFamily: FONTS.TITLE,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
        wordWrap: { width: rightW },
      });
      this.professionContainer.add(profCharName);

      // Money (green textured box, left-aligned)
      const moneyBoxH = 30;
      const moneyBoxY = y + 52;
      this.texturePanel(this.professionContainer, rightX, moneyBoxY, rightW - pad, moneyBoxH, TEXTURES.PANEL_GREEN, {});

      this.moneyText = scene.add
        .text(rightX + 8, moneyBoxY + moneyBoxH / 2, '$10', {
          fontFamily: FONTS.HEADING,
          fontSize: '17px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0, 0.5);
      this.professionContainer.add(this.moneyText);

      // Leg info (hugging bottom with inner padding)
      const bottomLabelY = y + profH - 42;
      const bottomValueY = y + profH - 26;

      const legLabel = scene.add.text(rightX, bottomLabelY, 'LEG / ROUND', {
        fontFamily: FONTS.TITLE,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
      });
      this.professionContainer.add(legLabel);

      this.legText = scene.add.text(rightX, bottomValueY, '1 / 8', {
        fontFamily: FONTS.TITLE,
        fontSize: '14px',
        color: TEXT_COLORS.PRIMARY,
      });
      this.professionContainer.add(this.legText);

      // Target info (hugging bottom-right)
      const targetLabel = scene.add
        .text(rightEdge, bottomLabelY, 'TARGET', {
          fontFamily: FONTS.TITLE,
          fontSize: '10px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(1, 0);
      this.professionContainer.add(targetLabel);

      this.targetText = scene.add
        .text(rightEdge, bottomValueY, '300 mi', {
          fontFamily: FONTS.TITLE,
          fontSize: '14px',
          color: TEXT_COLORS.SCORE_GREEN,
        })
        .setOrigin(1, 0);
      this.professionContainer.add(this.targetText);

      // Hover hitzone for tooltip
      const hitZone = scene.add.graphics();
      hitZone.fillStyle(0x000000, 0);
      hitZone.fillRect(pad, y, w - pad * 2, profH);
      this.professionContainer.add(hitZone);
      hitZone.setInteractive(new Phaser.Geom.Rectangle(pad, y, w - pad * 2, profH), Phaser.Geom.Rectangle.Contains);

      hitZone.on('pointerover', () => {
        this.showProfTooltip(scene, w, this.getMainContentBaseY() + profH + 4, prof);
      });
      hitZone.on('pointerout', () => {
        this.hideProfTooltip();
      });

      y += profH;
    } else {
      // No profession — show money and leg as standalone sections (fallback)
      const moneyH = 40;
      this.texturePanel(this.mainContentContainer, pad, y, innerW, moneyH, TEXTURES.PANEL_GREEN, {
        border: 0x4a8a4a,
        borderAlpha: 0.8,
      });

      this.moneyText = scene.add
        .text(cx, y + moneyH / 2, '$10', {
          fontFamily: FONTS.NUMBER,
          fontSize: '24px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0.5);
      this.mainContentContainer.add(this.moneyText);
      y += moneyH + UI.SIDEBAR_SECTION_GAP;

      const legH = 52;
      this.texturePanel(this.mainContentContainer, pad, y, innerW, legH, TEXTURES.PANEL_GRAY, {
        border: COLORS.SIDEBAR_SECTION_BORDER,
        borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
      });

      this.legText = scene.add.text(pad + 8, y + 26, '1 / 8', {
        fontFamily: FONTS.TITLE,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
      });
      this.mainContentContainer.add(this.legText);

      this.targetText = scene.add
        .text(w - pad - 8, y + 26, '300 mi', {
          fontFamily: FONTS.TITLE,
          fontSize: '16px',
          color: TEXT_COLORS.SCORE_GREEN,
        })
        .setOrigin(1, 0);
      this.mainContentContainer.add(this.targetText);
      y += legH + UI.SIDEBAR_SECTION_GAP;
    }

    // ─── Round Score Section ───
    const scoreSectionH = 38;
    this.texturePanel(this.mainContentContainer, pad, y, innerW, scoreSectionH, TEXTURES.PANEL_GRAY, {
      border: COLORS.SIDEBAR_SECTION_BORDER,
      borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
      alpha: 0.25,
      radius: 0,
    });

    const scoreLabel = scene.add
      .text(pad + 10, y + scoreSectionH / 2, 'ROUND SCORE', {
        fontFamily: FONTS.TITLE,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0, 0.5);
    this.mainContentContainer.add(scoreLabel);

    this.roundScoreText = scene.add
      .text(w - pad - 10, y + scoreSectionH / 2, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '22px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(1, 0.5);
    this.mainContentContainer.add(this.roundScoreText);
    y += scoreSectionH + UI.SIDEBAR_SECTION_GAP;

    // ─── Hand Name / Level Display (above miles/mult) ───
    const handDisplayH = 30;
    this.handDisplayLocalY = y;
    this.handNameText = scene.add
      .text(cx, y + handDisplayH / 2, '', {
        fontFamily: FONTS.TITLE,
        fontSize: '16px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.mainContentContainer.add(this.handNameText);

    y += handDisplayH;

    // ─── Miles × Mult Display (Balatro chips×mult style — floating boxes) ───
    const boxH = 52;
    const boxW = (innerW - 30) / 2;
    const milesX = pad;
    const multX = w - pad - boxW;

    this.texturePanel(this.mainContentContainer, milesX, y, boxW, boxH, TEXTURES.PANEL_BLUE, {});
    this.milesBaseText = scene.add
      .text(milesX + boxW / 2, y + boxH / 2, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '26px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.milesBaseText);

    const xText = scene.add
      .text(cx, y + boxH / 2, '×', {
        fontFamily: FONTS.TITLE,
        fontSize: '18px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(xText);

    this.texturePanel(this.mainContentContainer, multX, y, boxW, boxH, TEXTURES.PANEL_RED, {});
    this.multText = scene.add
      .text(multX + boxW / 2, y + boxH / 2, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '26px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.multText);
    y += boxH + UI.SIDEBAR_SECTION_GAP;

    // ─── Days / Rerolls Row ───
    const rowH = 72;
    const halfW = (innerW - UI.SIDEBAR_SECTION_GAP) / 2;

    // Travel Days
    this.texturePanel(this.mainContentContainer, pad, y, halfW, rowH, TEXTURES.PANEL_GRAY, {
      border: COLORS.SIDEBAR_SECTION_BORDER,
      borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
      alpha: 0.25,
      radius: 0,
    });

    const daysLabel = scene.add
      .text(pad + halfW / 2, y + 14, 'TRAVEL DAYS', {
        fontFamily: FONTS.TITLE,
        fontSize: '12px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(daysLabel);

    this.daysText = scene.add
      .text(pad + halfW / 2, y + 42, '?', {
        fontFamily: FONTS.NUMBER,
        fontSize: '28px',
        color: '#2c5a89',
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.daysText);

    // Rerolls
    const rerollX = pad + halfW + UI.SIDEBAR_SECTION_GAP;
    this.texturePanel(this.mainContentContainer, rerollX, y, halfW, rowH, TEXTURES.PANEL_GRAY, {
      border: COLORS.SIDEBAR_SECTION_BORDER,
      radius: 0,
      alpha: 0.25,
      borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
    });

    const rerollLabel = scene.add
      .text(rerollX + halfW / 2, y + 14, 'REROLLS', {
        fontFamily: FONTS.TITLE,
        fontSize: '12px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(rerollLabel);

    this.rerollsText = scene.add
      .text(rerollX + halfW / 2, y + 42, '?', {
        fontFamily: FONTS.NUMBER,
        fontSize: '28px',
        color: '#b02f27',
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.rerollsText);
    y += rowH + UI.SIDEBAR_SECTION_GAP;

    // ─── Journey Info Button ───
    this.journeyInfoBtn = new Button(scene, cx, y + 22, 'JOURNEY INFO', innerW - 8, 38);
    this.journeyInfoBtn.setTextureBackground(TEXTURES.PANEL_GRAY);
    this.journeyInfoBtn.onClick(() => {
      if (this.onJourneyInfo) this.onJourneyInfo();
    });
    this.mainContentContainer.add(this.journeyInfoBtn);
    y += 50;

    // ─── Options Button ───
    this.optionsBtn = new Button(scene, cx, y + 22, 'OPTIONS', innerW - 8, 38);
    this.optionsBtn.setTextureBackground(TEXTURES.PANEL_GRAY);
    this.optionsBtn.onClick(() => {
      if (this.onOptions) this.onOptions();
    });
    this.mainContentContainer.add(this.optionsBtn);
    y += 50;

    this.syncMainContentOffset(false);

    bindGameObject(this, runStore, selectRunSidebarModel, (model) => this.applyRunModel(model));
    bindGameObject(
      this,
      roundStore,
      (round) =>
        round ? `${round.day}:${round.rerollsRemaining}:${round.config.maxDays}:${round.config.targetMiles}` : '',
      () => this.applyRunModel(selectRunSidebarModel()),
    );
    bindGameObject(this, roundStore, selectSidebarOverlayRevision, () => this.applySidebarOverlay());
    this.syncRoundScoreFromStore();
  }

  private buildTopBarContent(scene: Scene, w: number, _h: number): void {
    const pad = 10;
    const applyIcon = (btn: Button, key: string, size = 22): void => {
      if (scene.textures.exists(key)) btn.setIcon(key, size);
    };

    // ─── Header band: difficulty + title + profession | round score ───
    const headerY = 10;
    const headerH = 40;
    this.titleSectionY = headerY;
    this.titleSectionH = headerH;
    const headerCY = headerY + headerH / 2;

    const titleIconSize = 32;
    const titleIconX = pad + 18;
    this.difficultyIcon = addDifficultyImage(
      scene,
      this,
      selectRunSidebarModel().difficulty,
      titleIconX,
      headerCY,
      titleIconSize,
    );

    const titleX = pad + 40;
    this.titleText = scene.add
      .text(titleX, headerCY, 'SHOP', {
        fontFamily: FONTS.HEADING,
        fontSize: '20px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0, 0.5);
    this.add(this.titleText);

    this.professionContainer = scene.add.container(0, 0);
    this.add(this.professionContainer);
    const prof = getRunProfession();
    if (prof) {
      const miniSize = 28;
      const miniX = titleX + 132;
      const atlasFrame = `${prof.id}.png`;
      const profTexture = scene.textures.get('professions');
      const canUseAtlas = scene.textures.exists('professions') && profTexture.has(atlasFrame);
      if (canUseAtlas) {
        const profImg = scene.add.image(miniX, headerCY, 'professions', atlasFrame);
        const imgScale = miniSize / Math.max(profImg.width, profImg.height);
        profImg.setScale(imgScale);
        this.professionContainer.add(profImg);
      }
      const profLabel = scene.add.text(miniX + miniSize + 6, headerCY, prof.title, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: TEXT_COLORS.SECONDARY,
      });
      profLabel.setOrigin(0, 0.5);
      this.professionContainer.add(profLabel);

      const hitZone = scene.add
        .zone(miniX - 6, headerCY, miniSize + profLabel.width + 16, headerH)
        .setInteractive({ useHandCursor: true });
      this.professionContainer.add(hitZone);
      hitZone.on('pointerover', () => {
        this.showProfTooltip(scene, w, headerY + headerH + 4, prof);
      });
      hitZone.on('pointerout', () => this.hideProfTooltip());
    }

    if (this.difficultyIcon) {
      const iconHit = scene.add
        .zone(titleIconX, headerCY, titleIconSize + 8, titleIconSize + 8)
        .setInteractive({ useHandCursor: true });
      this.add(iconHit);
      iconHit.on('pointerover', () => {
        const def = getDifficultyDef(selectRunSidebarModel().difficulty);
        this.difficultyTooltip.show(
          this.scene,
          def,
          titleIconX,
          headerCY + titleIconSize / 2 + 4,
          { minX: pad, maxX: w - pad, minY: headerY + headerH + 4 },
          400,
          this,
        );
      });
      iconHit.on('pointerout', () => this.difficultyTooltip.hide());
    }

    const scoreBlockRight = w - pad;
    const roundScoreReserve = 108;
    const metaRight = scoreBlockRight - roundScoreReserve;

    this.moneyText = scene.add
      .text(metaRight, headerCY - 8, '$10', {
        fontFamily: FONTS.NUMBER,
        fontSize: '15px',
        color: TEXT_COLORS.MONEY,
        align: 'right',
      })
      .setOrigin(1, 0.5);
    this.add(this.moneyText);

    this.legText = scene.add
      .text(metaRight, headerCY + 10, '1·1/3', {
        fontFamily: FONTS.TITLE,
        fontSize: '12px',
        color: TEXT_COLORS.PRIMARY,
        align: 'right',
      })
      .setOrigin(1, 0.5);
    this.add(this.legText);

    this.daysText = scene.add.text(0, 0, '').setVisible(false);
    this.add(this.daysText);
    this.rerollsText = scene.add.text(0, 0, '').setVisible(false);
    this.add(this.rerollsText);

    const scoreLabel = scene.add
      .text(scoreBlockRight, headerCY - 11, 'ROUND SCORE', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
        align: 'right',
      })
      .setOrigin(1, 0.5);
    this.add(scoreLabel);

    this.roundScoreText = scene.add
      .text(scoreBlockRight, headerCY + 9, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '20px',
        color: TEXT_COLORS.PRIMARY,
        align: 'right',
      })
      .setOrigin(1, 0.5);
    this.add(this.roundScoreText);

    this.modifiersIndicator = scene.add.container(metaRight - 28, headerCY);
    this.modifiersIndicator.setVisible(false);
    this.add(this.modifiersIndicator);

    this.contentStartY = headerY + headerH + 8;

    // Top bar: boss/traits shown via dot indicator + modal (not inline panels).
    this.statusPanelsContainer = scene.add.container(0, 0);
    this.statusPanelsContainer.setVisible(false);
    this.add(this.statusPanelsContainer);

    this.bossContainer = scene.add.container(0, 0);
    this.bossContainer.setVisible(false);
    this.add(this.bossContainer);
    this.bossDescText = null;

    this.mainContentContainer = scene.add.container(0, this.contentStartY);
    this.add(this.mainContentContainer);

    const innerW = w - pad * 2;
    let localY = 0;

    // ─── Score band: target | hand | miles × mult ───
    const scoreRowH = 56;
    this.texturePanel(this.mainContentContainer, pad, localY, innerW, scoreRowH, TEXTURES.PANEL_DARK, {
      border: COLORS.SIDEBAR_SECTION_BORDER,
      borderAlpha: COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
    });

    const targetLabel = scene.add.text(pad + 12, localY + 11, 'TARGET', {
      fontFamily: FONTS.TITLE,
      fontSize: '10px',
      color: TEXT_COLORS.MUTED,
    });
    this.mainContentContainer.add(targetLabel);

    this.targetText = scene.add.text(pad + 12, localY + 26, '300 mi', {
      fontFamily: FONTS.TITLE,
      fontSize: '18px',
      color: TEXT_COLORS.SCORE_GREEN,
    });
    this.mainContentContainer.add(this.targetText);

    const ctrlBtnW = 44;
    const ctrlBtnH = 38;
    const ctrlGap = 6;
    const ctrlBlockW = ctrlBtnW * 2 + ctrlGap;
    const scoreRowCY = localY + scoreRowH / 2;

    const pillW = 58;
    const pillH = 24;
    const multX = w - pad - 12 - ctrlBlockW - 8 - pillW;
    const milesX = multX - pillW - 20;
    const scoreClusterCX = (milesX + multX + pillW) / 2;
    const pillY = localY + scoreRowH - pillH - 8;
    const handY = pillY - 4;

    this.handDisplayLocalY = handY;
    this.handNameText = scene.add
      .text(scoreClusterCX, handY, '', {
        fontFamily: FONTS.TITLE,
        fontSize: '12px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.mainContentContainer.add(this.handNameText);

    this.texturePanel(this.mainContentContainer, milesX, pillY, pillW, pillH, TEXTURES.PANEL_BLUE, {
      radius: 0,
    });

    this.milesBaseText = scene.add
      .text(milesX + pillW / 2, pillY + pillH / 2, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '15px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.milesBaseText);

    const xText = scene.add
      .text(multX - 10, pillY + pillH / 2, '×', {
        fontFamily: FONTS.TITLE,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(xText);

    this.texturePanel(this.mainContentContainer, multX, pillY, pillW, pillH, TEXTURES.PANEL_RED, {
      radius: 0,
    });

    this.multText = scene.add
      .text(multX + pillW / 2, pillY + pillH / 2, '0', {
        fontFamily: FONTS.NUMBER,
        fontSize: '15px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.multText);

    const optsCX = w - pad - 6 - ctrlBtnW / 2;
    const infoCX = optsCX - ctrlBtnW - ctrlGap;

    this.journeyInfoBtn = new Button(scene, infoCX, scoreRowCY, 'Info', ctrlBtnW, ctrlBtnH);
    this.journeyInfoBtn.setTextureBackground(
      TEXTURES.PANEL_GRAY,
      COLORS.SIDEBAR_SECTION_BORDER,
      COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
    );
    applyIcon(this.journeyInfoBtn, 'icon_book');
    this.journeyInfoBtn.onClick(() => {
      if (this.onJourneyInfo) this.onJourneyInfo();
    });
    this.mainContentContainer.add(this.journeyInfoBtn);

    this.optionsBtn = new Button(scene, optsCX, scoreRowCY, 'Opts', ctrlBtnW, ctrlBtnH);
    this.optionsBtn.setTextureBackground(
      TEXTURES.PANEL_GRAY,
      COLORS.SIDEBAR_SECTION_BORDER,
      COLORS.SIDEBAR_SECTION_BORDER_ALPHA,
    );
    applyIcon(this.optionsBtn, 'icon_menu');
    this.optionsBtn.onClick(() => {
      if (this.onOptions) this.onOptions();
    });
    this.mainContentContainer.add(this.optionsBtn);

    this.syncMainContentOffset(false);

    bindGameObject(this, runStore, selectRunSidebarModel, (model) => this.applyRunModel(model));
    bindGameObject(
      this,
      roundStore,
      (round) =>
        round ? `${round.day}:${round.rerollsRemaining}:${round.config.maxDays}:${round.config.targetMiles}` : '',
      () => this.applyRunModel(selectRunSidebarModel()),
    );
    bindGameObject(this, roundStore, selectSidebarOverlayRevision, () => this.applySidebarOverlay());
    this.syncRoundScoreFromStore();
  }

  /** Sync round score label from store (not live during score animation — use setRoundScoreAnimated). */
  syncRoundScoreFromStore(): void {
    const miles = selectRoundTotalMiles();
    if (miles !== null) {
      this.roundScoreText.setText(formatScore(miles));
      this.fitTopBarRoundScore();
    }
  }

  private applySidebarOverlay(): void {
    const round = roundStore.getState();
    const overlay = round?.sidebarOverlay;
    if (!overlay) return;
    if (overlay.title !== undefined) {
      this.titleText.setText(overlay.title);
      this.layoutSidebarTitleHeader();
    }
    if (overlay.handName !== undefined) {
      if (overlay.handName) {
        this.handNameText.setText(`${overlay.handName}  lvl.${overlay.handLevel}`);
        this.handNameText.setVisible(true);
      } else {
        this.handNameText.setVisible(false);
      }
    }
    if (overlay.milesBaseSave !== undefined) {
      this.milesBaseText.setText(formatScoreComponent(milesFromSave(overlay.milesBaseSave)));
    }
    if (overlay.multSave !== undefined) {
      this.multText.setText(formatMult(milesFromSave(overlay.multSave)));
    }
  }

  private applyRunModel(model: ReturnType<typeof selectRunSidebarModel>): void {
    this.moneyText.setText(`$${model.balance}`);
    if (this.layoutMode !== 'topbar') {
      this.daysText.setText(`${model.daysRemaining}`);
      this.rerollsText.setText(`${model.rerolls}`);
    }
    if (this.layoutMode === 'topbar') {
      this.legText.setText(`${model.leg}·${model.round}/${GAMEPLAY.ROUNDS_PER_LEG}`);
    } else {
      this.legText.setText(`Leg ${model.leg} - ${model.round}/${GAMEPLAY.ROUNDS_PER_LEG}`);
    }
    this.targetText.setText(`${formatScore(model.targetMiles)} mi`);
    this.updateBossPanel(model.boss);
    this.updateStatusPanels(model.statusTraits ?? []);

    if (this.subscribedDifficulty !== model.difficulty && this.difficultyIcon) {
      this.subscribedDifficulty = model.difficulty;
      const titleIconY = this.titleSectionY + this.titleSectionH / 2;
      this.difficultyIcon.destroy();
      const titleIconX = UI.SIDEBAR_PADDING + 18;
      this.difficultyIcon = addDifficultyImage(this.scene, this, model.difficulty, titleIconX, titleIconY, 32);
      this.layoutSidebarTitleHeader();
    }
  }

  /** Sidebar-space Y where main content block starts (includes boss offset). */
  private getMainContentBaseY(): number {
    return this.mainContentContainer.y;
  }

  private syncMainContentOffset(bossVisible: boolean): void {
    if (this.layoutMode === 'topbar') {
      this.mainContentContainer.setY(this.contentStartY);
      this.handDisplayY = this.getMainContentBaseY() + this.handDisplayLocalY;
      return;
    }
    const statusOffset = this.statusPanelsTotalHeight;
    const bossOffset = bossVisible ? this.bossPanelHeight : 0;
    const baseY = this.contentStartY + statusOffset;
    this.statusPanelsContainer.setY(this.contentStartY);
    this.bossContainer.setY(baseY);
    this.mainContentContainer.setY(baseY + bossOffset);
    this.handDisplayY = this.getMainContentBaseY() + this.handDisplayLocalY;
  }

  // ─── Public API ───

  updateData(data: Partial<SidebarData>): void {
    if (data.title !== undefined) {
      this.titleText.setText(data.title);
      this.layoutSidebarTitleHeader();
    }
    if (data.roundScore !== undefined) {
      this.roundScoreText.setText(formatScore(data.roundScore));
      this.fitTopBarRoundScore();
    }
    if (data.milesBase !== undefined) this.milesBaseText.setText(formatScoreComponent(data.milesBase));
    if (data.mult !== undefined) this.multText.setText(formatMult(data.mult));
    if (data.handName !== undefined) {
      if (data.handName) {
        this.handNameText.setText(data.handName);
        this.handNameText.setVisible(true);
      } else {
        this.handNameText.setVisible(false);
      }
    }
    if (this.layoutMode !== 'topbar') {
      if (data.daysRemaining !== undefined) {
        this.daysText.setText(`${data.daysRemaining}`);
      }
      if (data.rerolls !== undefined) {
        this.rerollsText.setText(`${data.rerolls}`);
      }
    }
    if (data.leg !== undefined) {
      let roundLabel: string;
      if (data.round !== undefined && data.totalRounds !== undefined) {
        if (this.layoutMode === 'topbar') {
          roundLabel = `${data.leg}·${data.round}/${data.totalRounds}`;
        } else {
          roundLabel = `Leg ${data.leg} - ${data.round}/${data.totalRounds}`;
        }
      } else if (data.totalLegs !== undefined) {
        roundLabel = `${data.leg} / ${data.totalLegs}`;
      } else {
        roundLabel = this.layoutMode === 'topbar' ? `${data.leg}` : `Leg ${data.leg}`;
      }
      this.legText.setText(roundLabel);
    }
    if (data.targetMiles !== undefined) {
      this.targetText.setText(`${formatScore(data.targetMiles)} mi`);
    }

    if (data.boss !== undefined) {
      this.updateBossPanel(data.boss);
    }

    // statusTraits, boss, money, leg, days, rerolls, targetMiles: driven by store subscriptions
  }

  private updateStatusPanels(traits: RunStatusTrait[]): void {
    if (this.layoutMode === 'topbar') {
      this.topBarTraits = traits;
      this.refreshTopBarModifiersIndicator();
      return;
    }
    this.statusPanelsContainer.removeAll(true);

    const pad = UI.SIDEBAR_PADDING;
    const w = this.sidebarWidth;
    const gap = 4;
    let y = 0;

    const positiveTraits = traits.filter((t) => t.polarity === 'positive');
    const negativeTraits = traits.filter((t) => t.polarity === 'negative');

    for (const trait of positiveTraits) {
      y += this.addStatusPanel(trait.label, trait.lines, 'positive', pad, w, y) + gap;
    }

    for (const trait of negativeTraits) {
      y += this.addStatusPanel(trait.label, trait.lines, 'negative', pad, w, y) + gap;
    }

    if (y > 0) {
      y -= gap;
    }

    this.statusPanelsTotalHeight = y;
    this.statusPanelsContainer.setVisible(y > 0);
    if (y > 0) {
      this.bringToTop(this.statusPanelsContainer);
    }
    this.syncMainContentOffset(this.bossContainer.visible);
  }

  private addStatusPanel(
    label: string,
    lines: string[],
    style: 'positive' | 'negative',
    pad: number,
    w: number,
    y: number,
  ): number {
    const body = lines.join('\n');
    const bodyText = this.scene.add.text(pad + 8, 20, body, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: style === 'positive' ? TEXT_COLORS.SCORE_GREEN : '#e8a070',
      lineSpacing: 2,
      wordWrap: { width: w - pad * 2 - 16 },
    });
    const panelH = Math.max(56, 20 + bodyText.height + 12);

    const panel = this.scene.add.container(0, y);
    const bg = this.scene.add.graphics();
    if (style === 'positive') {
      bg.fillStyle(0x1a3020, 0.95);
      bg.fillRoundedRect(pad, 0, w - pad * 2, panelH, 6);
      bg.lineStyle(1, 0x4a8a55, 0.85);
      bg.strokeRoundedRect(pad, 0, w - pad * 2, panelH, 6);
    } else {
      bg.fillStyle(0x3a2018, 0.95);
      bg.fillRoundedRect(pad, 0, w - pad * 2, panelH, 6);
      bg.lineStyle(1, 0x8a4433, 0.85);
      bg.strokeRoundedRect(pad, 0, w - pad * 2, panelH, 6);
    }
    panel.add(bg);

    const labelColor = style === 'positive' ? TEXT_COLORS.SCORE_GREEN : TEXT_COLORS.MUTED;
    const labelText = this.scene.add.text(pad + 8, 6, label, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '10px',
      color: labelColor,
    });
    panel.add(labelText);
    panel.add(bodyText);

    this.statusPanelsContainer.add(panel);
    return panelH;
  }

  private updateBossPanel(boss: BossDef | null | undefined): void {
    if (this.layoutMode === 'topbar') {
      this.topBarBoss = boss ?? null;
      this.refreshTopBarModifiersIndicator();
      return;
    }
    if (!boss) {
      this.bossContainer.setVisible(false);
      this.syncMainContentOffset(false);
      return;
    }
    this.bossContainer.setVisible(true);
    this.syncMainContentOffset(true);
    if (this.bossDescText) {
      this.bossDescText.setText(boss.description);
    }

    const pad = UI.SIDEBAR_PADDING;
    const bossImgSize = 72;
    const bossH = 100;
    const atlasFrame = `${boss.id}.png`;
    const bossTexture = this.scene.textures.get('bosses');
    const canUseAtlas = this.scene.textures.exists('bosses') && bossTexture.has(atlasFrame);

    // Remove previous boss image if any
    const prevImg = this.bossContainer.getData('bossImg') as GameObjects.Image | undefined;
    if (prevImg) prevImg.destroy();

    if (canUseAtlas) {
      const profImg = this.scene.add.image(pad + 8 + bossImgSize / 2, bossH / 2, 'bosses', atlasFrame);
      const imgScale = bossImgSize / Math.max(profImg.width, profImg.height);
      profImg.setScale(imgScale);
      this.bossContainer.add(profImg);
      this.bossContainer.setData('bossImg', profImg);
      const placeholder = this.bossContainer.getData('bossImgPlaceholder') as GameObjects.Rectangle;
      placeholder?.setVisible(false);
    }
  }

  setJourneyInfoCallback(cb: () => void): void {
    this.onJourneyInfo = cb;
  }

  setOptionsCallback(cb: () => void): void {
    this.onOptions = cb;
  }

  setModifiersCallback(cb: () => void): void {
    this.onModifiersModal = cb;
  }

  private refreshTopBarModifiersIndicator(): void {
    if (!this.modifiersIndicator) return;

    this.modifiersIndicator.removeAll(true);

    const dotColors: number[] = [];
    if (this.topBarBoss) {
      dotColors.push(0xcc4444);
    }
    for (const trait of this.topBarTraits) {
      dotColors.push(trait.polarity === 'positive' ? 0x44aa55 : 0xcc8844);
    }

    if (dotColors.length === 0) {
      this.modifiersIndicator.setVisible(false);
      return;
    }

    this.modifiersIndicator.setVisible(true);

    const visibleDots = dotColors.slice(0, 4);
    const dotR = 4;
    const stackGap = 5;
    const startY = -((visibleDots.length - 1) * stackGap) / 2;

    for (let i = 0; i < visibleDots.length; i++) {
      const dot = this.scene.add.graphics();
      dot.fillStyle(visibleDots[i], 1);
      dot.fillCircle(0, startY + i * stackGap, dotR);
      this.modifiersIndicator.add(dot);
    }

    if (dotColors.length > 4) {
      const overflow = this.scene.add.text(7, startY + 3 * stackGap, `+${dotColors.length - 4}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '8px',
        color: TEXT_COLORS.MUTED,
      });
      overflow.setOrigin(0, 0.5);
      this.modifiersIndicator.add(overflow);
    }

    const hit = this.scene.add.zone(0, 0, 24, 28).setInteractive({ useHandCursor: true });
    this.modifiersIndicator.add(hit);
    hit.on('pointerdown', () => {
      if (this.onModifiersModal) this.onModifiersModal();
    });
  }

  private fitTopBarRoundScore(): void {
    if (this.layoutMode !== 'topbar') return;
    const maxW = 150;
    let size = 20;
    this.roundScoreText.setFontSize(`${size}px`);
    while (this.roundScoreText.width > maxW && size > 11) {
      size -= 1;
      this.roundScoreText.setFontSize(`${size}px`);
    }
  }

  getContentX(): number {
    return this.sidebarWidth;
  }

  getSidebarWidth(): number {
    return this.sidebarWidth;
  }

  // ─── Scoring Animation Helpers ───

  /** Set miles value with a pop animation on the blue pill */
  setMilesAnimated(value: DecimalSource): void {
    this.milesBaseText.setText(formatScoreComponent(value));
    this.scene.tweens.add({
      targets: this.milesBaseText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  /** Set mult value with a pop animation on the red pill */
  setMultAnimated(value: DecimalSource): void {
    this.multText.setText(formatMult(value));
    this.scene.tweens.add({
      targets: this.multText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  /** Set round score with a pop animation */
  setRoundScoreAnimated(value: DecimalSource): void {
    this.roundScoreText.setText(formatScoreComponent(value));
    this.fitTopBarRoundScore();
    this.scene.tweens.add({
      targets: this.roundScoreText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  /** Clear hand display */
  clearHandDisplay(): void {
    this.handNameText.setVisible(false);
  }

  /** Get world position of the miles (blue) pill center */
  getMilesPillWorldPos(): { x: number; y: number } {
    return { x: this.x + this.milesBaseText.x, y: this.y + this.milesBaseText.y };
  }

  /** Get world position of the mult (red) pill center */
  getMultPillWorldPos(): { x: number; y: number } {
    return { x: this.x + this.multText.x, y: this.y + this.multText.y };
  }

  /** Pop the miles pill bigger briefly */
  shakeMilesPill(): void {
    this.scene.tweens.add({
      targets: this.milesBaseText,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  /** Pop the mult pill bigger briefly. Intense mode for xmult. */
  shakeMultPill(intense = false): void {
    this.scene.tweens.add({
      targets: this.multText,
      scaleX: intense ? 1.4 : 1.25,
      scaleY: intense ? 1.4 : 1.25,
      duration: intense ? 150 : 120,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  /** Get the Y coordinate of the hand display area (for upgrade animation positioning) */
  getHandUpgradeY(): number {
    return this.handDisplayY;
  }

  // ─── Profession Tooltip ───

  private showProfTooltip(scene: Scene, sidebarW: number, tooltipY: number, prof: ProfessionDef): void {
    this.hideProfTooltip();
    const pad = 10;
    const tooltipW = sidebarW - UI.SIDEBAR_PADDING * 2;

    // Title + name + description
    const titleText = scene.add.text(pad + 4, pad, `${prof.title} ${prof.name}`, {
      fontFamily: FONTS.HEADING,
      fontSize: '13px',
      color: TEXT_COLORS.GOLD,
      wordWrap: { width: tooltipW - pad * 2 - 8 },
    });

    const descText = scene.add.text(pad + 4, pad + titleText.height + 6, prof.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: tooltipW - pad * 2 - 8 },
      lineSpacing: 2,
    });

    const tooltipH = pad + titleText.height + 6 + descText.height + pad;

    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.TOOLTIP_BG, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 6);
    bg.lineStyle(1, COLORS.TOOLTIP_BORDER, 1);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 6);

    this.profTooltip = scene.add.container(UI.SIDEBAR_PADDING, tooltipY);
    this.profTooltip.add([bg, titleText, descText]);
    this.profTooltip.setDepth(300);
    this.add(this.profTooltip);
  }

  private hideProfTooltip(): void {
    if (this.profTooltip) {
      this.profTooltip.destroy();
      this.profTooltip = null;
    }
  }
}
