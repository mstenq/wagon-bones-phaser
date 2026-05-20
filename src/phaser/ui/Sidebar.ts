// ─── Sidebar ───
// Balatro-style left panel showing game state info.
// Used in both ShopScene and GameScene for consistency.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';
import { getPlayerState, ProfessionDef } from '../../game/PlayerState';
import type { BossDef } from '../../game/types';
import { Button } from './Button';
import { isDevMode } from '../../game/DevMode';

export interface SidebarData {
  /** Title shown at top: "SHOP", "The Inspector", etc. */
  title: string;
  /** Current round/leg score */
  roundScore: number;
  /** Miles base value */
  milesBase: number;
  /** Multiplier value */
  mult: number;
  /** Travel days remaining */
  daysRemaining: number;
  /** Re-rolls remaining */
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
  targetMiles: number;
  /** Hand name to display (e.g. "Full House") */
  handName?: string;
  /** Hand level */
  handLevel?: number;
  /** Active boss (boss round) — shows portrait + effect description */
  boss?: BossDef | null;
}

export class Sidebar extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private sidebarWidth: number;

  // Text elements for updating
  private titleText: GameObjects.Text;
  private roundScoreText: GameObjects.Text;
  private handNameText: GameObjects.Text;
  private handLevelText: GameObjects.Text;
  private milesBaseText: GameObjects.Text;
  private multText: GameObjects.Text;
  private milesBaseBg: GameObjects.Graphics;
  private multBg: GameObjects.Graphics;
  private daysText: GameObjects.Text;
  private rerollsText: GameObjects.Text;
  private moneyText: GameObjects.Text;
  private legText: GameObjects.Text;
  private targetText: GameObjects.Text;

  private journeyInfoBtn: Button;
  private testBossBtn: Button | null = null;
  private optionsBtn: Button;

  private mainContentContainer: GameObjects.Container;
  private professionContainer: GameObjects.Container;
  private bossPanelHeight: number = 0;
  private bossContainer: GameObjects.Container;
  private contentStartY: number = 0;
  private bossDescText: GameObjects.Text | null = null;
  private profTooltip: GameObjects.Container | null = null;

  private onJourneyInfo: (() => void) | null = null;
  private onDevBossTest: (() => void) | null = null;
  private onOptions: (() => void) | null = null;

  /** Y coordinate of the hand display area in sidebar space (for upgrade animation positioning) */
  private handDisplayY: number = 0;
  private handDisplayLocalY: number = 0;

  constructor(scene: Scene, width: number, height: number) {
    super(scene, 0, 0);
    this.sidebarWidth = width;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.drawBackground(width, height);
    this.buildContent(scene, width, height);

    this.setDepth(200);
    this.setScrollFactor(0);
    scene.add.existing(this);
  }

  private drawBackground(w: number, h: number): void {
    this.bg.clear();
    // Main background
    this.bg.fillStyle(UI.SIDEBAR_BG, 0.95);
    this.bg.fillRect(0, 0, w, h);
    // Right border
    this.bg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
    this.bg.lineBetween(w, 0, w, h);
  }

  private buildContent(scene: Scene, w: number, _h: number): void {
    const pad = UI.SIDEBAR_PADDING;
    const cx = w / 2;
    let y = pad;

    // ─── Title Section (scene name) ───
    const titleBg = scene.add.graphics();
    titleBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
    titleBg.fillRoundedRect(pad, y, w - pad * 2, 44, 6);
    titleBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    titleBg.strokeRoundedRect(pad, y, w - pad * 2, 44, 6);
    this.add(titleBg);

    this.titleText = scene.add
      .text(cx, y + 22, 'SHOP', {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5);
    this.add(this.titleText);
    y += 52;

    this.contentStartY = y;

    // ─── Boss Display (hidden until boss round; sits above shifting content) ───
    const bossImgSize = 72;
    const bossH = 100;
    this.bossPanelHeight = bossH + UI.SIDEBAR_SECTION_GAP;

    this.bossContainer = scene.add.container(0, this.contentStartY);
    this.bossContainer.setVisible(false);
    this.add(this.bossContainer);

    const bossBg = scene.add.graphics();
    bossBg.fillStyle(0x3a1a1a, 1);
    bossBg.fillRoundedRect(pad, 0, w - pad * 2, bossH, 6);
    bossBg.lineStyle(1, 0x8a3333, 0.9);
    bossBg.strokeRoundedRect(pad, 0, w - pad * 2, bossH, 6);
    this.bossContainer.add(bossBg);

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
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
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
    const player = getPlayerState();
    const profImgSize = 120;
    const profH = 130;
    this.professionContainer = scene.add.container(0, 0);
    this.mainContentContainer.add(this.professionContainer);

    if (player.profession) {
      const profY = 0;

      const profBg = scene.add.graphics();
      profBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
      profBg.fillRoundedRect(pad, y, w - pad * 2, profH, 6);
      profBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
      profBg.strokeRoundedRect(pad, y, w - pad * 2, profH, 6);
      this.professionContainer.add(profBg);

      const imgKey = `prof_${player.profession.id}`;
      if (scene.textures.exists(imgKey)) {
        const profImg = scene.add.image(pad + 6 + profImgSize / 2, y + profH / 2, imgKey);
        const tex = profImg.texture.getSourceImage();
        const imgScale = profImgSize / Math.max(tex.width, tex.height);
        profImg.setScale(imgScale);
        this.professionContainer.add(profImg);
      }

      // Right side content area
      const rightX = pad + 12 + profImgSize;
      const rightW = w - pad * 2 - (rightX - pad);
      const rightEdge = rightX + rightW - pad;

      // Title
      const profNameText = scene.add.text(rightX, y + 8, player.profession.title, {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.GOLD,
      });
      this.professionContainer.add(profNameText);

      // Full name
      const profCharName = scene.add.text(rightX, y + 28, player.profession.name, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
        wordWrap: { width: rightW },
      });
      this.professionContainer.add(profCharName);

      // Money (green box, left-aligned)
      const moneyBoxH = 28;
      const moneyBoxY = y + 54;
      const moneyBoxBg = scene.add.graphics();
      moneyBoxBg.fillStyle(0x1a4a1a, 1);
      moneyBoxBg.fillRoundedRect(rightX, moneyBoxY, rightW - pad, moneyBoxH, 4);
      moneyBoxBg.lineStyle(1, 0x2a6a2a, 0.8);
      moneyBoxBg.strokeRoundedRect(rightX, moneyBoxY, rightW - pad, moneyBoxH, 4);
      this.professionContainer.add(moneyBoxBg);

      this.moneyText = scene.add
        .text(rightX + 8, moneyBoxY + moneyBoxH / 2, '$10', {
          fontFamily: FONTS.HEADING,
          fontSize: '18px',
          color: TEXT_COLORS.MONEY,
        })
        .setOrigin(0, 0.5);
      this.professionContainer.add(this.moneyText);

      // Leg info (hugging bottom with inner padding)
      const bottomLabelY = y + profH - 40;
      const bottomValueY = y + profH - 24;

      const legLabel = scene.add.text(rightX, bottomLabelY, 'Leg / Round', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
      });
      this.professionContainer.add(legLabel);

      this.legText = scene.add.text(rightX, bottomValueY, '1 / 8', {
        fontFamily: FONTS.HEADING,
        fontSize: '14px',
        color: TEXT_COLORS.PRIMARY,
      });
      this.professionContainer.add(this.legText);

      // Target info (hugging bottom-right)
      const targetLabel = scene.add
        .text(rightEdge, bottomLabelY, 'Target', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '10px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(1, 0);
      this.professionContainer.add(targetLabel);

      this.targetText = scene.add
        .text(rightEdge, bottomValueY, '300 mi', {
          fontFamily: FONTS.HEADING,
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
        this.showProfTooltip(scene, w, this.getMainContentBaseY() + profH + 4, player.profession!);
      });
      hitZone.on('pointerout', () => {
        this.hideProfTooltip();
      });

      y += profH + UI.SIDEBAR_SECTION_GAP;
    } else {
      // No profession — show money and leg as standalone sections (fallback)
      const moneyH = 40;
      const moneyBg = scene.add.graphics();
      moneyBg.fillStyle(0x1a4a1a, 1);
      moneyBg.fillRoundedRect(pad, y, w - pad * 2, moneyH, 6);
      moneyBg.lineStyle(1, 0x2a6a2a, 0.8);
      moneyBg.strokeRoundedRect(pad, y, w - pad * 2, moneyH, 6);
      this.mainContentContainer.add(moneyBg);

      this.moneyText = scene.add
        .text(cx, y + moneyH / 2, '$10', {
          fontFamily: FONTS.HEADING,
          fontSize: '24px',
          color: TEXT_COLORS.MONEY,
        })
        .setOrigin(0.5);
      this.mainContentContainer.add(this.moneyText);
      y += moneyH + UI.SIDEBAR_SECTION_GAP;

      const legH = 52;
      const legBg = scene.add.graphics();
      legBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
      legBg.fillRoundedRect(pad, y, w - pad * 2, legH, 6);
      legBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
      legBg.strokeRoundedRect(pad, y, w - pad * 2, legH, 6);
      this.mainContentContainer.add(legBg);

      this.legText = scene.add.text(pad + 8, y + 26, '1 / 8', {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
      });
      this.mainContentContainer.add(this.legText);

      this.targetText = scene.add
        .text(w - pad - 8, y + 26, '300 mi', {
          fontFamily: FONTS.HEADING,
          fontSize: '16px',
          color: TEXT_COLORS.SCORE_GREEN,
        })
        .setOrigin(1, 0);
      this.mainContentContainer.add(this.targetText);
      y += legH + UI.SIDEBAR_SECTION_GAP;
    }

    // ─── Round Score Section ───
    const scoreSectionH = 36;
    const scoreBg = scene.add.graphics();
    scoreBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
    scoreBg.fillRoundedRect(pad, y, w - pad * 2, scoreSectionH, 6);
    scoreBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    scoreBg.strokeRoundedRect(pad, y, w - pad * 2, scoreSectionH, 6);
    this.mainContentContainer.add(scoreBg);

    const scoreLabel = scene.add
      .text(pad + 8, y + scoreSectionH / 2, 'Round\nscore', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
        lineSpacing: -2,
      })
      .setOrigin(0, 0.5);
    this.mainContentContainer.add(scoreLabel);

    this.roundScoreText = scene.add
      .text(w - pad - 8, y + scoreSectionH / 2, '0', {
        fontFamily: FONTS.HEADING,
        fontSize: '20px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(1, 0.5);
    this.mainContentContainer.add(this.roundScoreText);
    y += scoreSectionH + UI.SIDEBAR_SECTION_GAP;

    // ─── Hand Name / Level Display (above miles/mult) ───
    const handDisplayH = 32;
    this.handDisplayLocalY = y;
    this.handNameText = scene.add
      .text(cx, y + handDisplayH / 2, '', {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.mainContentContainer.add(this.handNameText);

    this.handLevelText = scene.add
      .text(cx, y + handDisplayH / 2 + 1, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
      })
      .setOrigin(0.5, -0.5)
      .setVisible(false);
    this.mainContentContainer.add(this.handLevelText);
    y += handDisplayH;

    // ─── Miles/Mult Display (Balatro chips×mult style) ───
    const scoreDisplayH = 48;
    const scoreDisplayBg = scene.add.graphics();
    scoreDisplayBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
    scoreDisplayBg.fillRoundedRect(pad, y, w - pad * 2, scoreDisplayH, 6);
    scoreDisplayBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    scoreDisplayBg.strokeRoundedRect(pad, y, w - pad * 2, scoreDisplayH, 6);
    this.mainContentContainer.add(scoreDisplayBg);

    // Miles base (blue pill)
    const pillW = (w - pad * 2 - 36) / 2;
    const pillH = 30;
    const pillY = y + (scoreDisplayH - pillH) / 2;

    this.milesBaseBg = scene.add.graphics();
    this.milesBaseBg.fillStyle(COLORS.MILES_BG, 1);
    this.milesBaseBg.fillRoundedRect(pad + 6, pillY, pillW, pillH, 4);
    this.mainContentContainer.add(this.milesBaseBg);

    this.milesBaseText = scene.add
      .text(pad + 6 + pillW / 2, pillY + pillH / 2, '0', {
        fontFamily: FONTS.HEADING,
        fontSize: '18px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.milesBaseText);

    // "×" separator
    const xText = scene.add
      .text(cx, pillY + pillH / 2, '×', {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(xText);

    // Mult (red pill)
    this.multBg = scene.add.graphics();
    this.multBg.fillStyle(COLORS.MULT_BG, 1);
    this.multBg.fillRoundedRect(w - pad - 6 - pillW, pillY, pillW, pillH, 4);
    this.mainContentContainer.add(this.multBg);

    this.multText = scene.add
      .text(w - pad - 6 - pillW / 2, pillY + pillH / 2, '0', {
        fontFamily: FONTS.HEADING,
        fontSize: '18px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.multText);
    y += scoreDisplayH + UI.SIDEBAR_SECTION_GAP;

    // ─── Days / Re-rolls Row ───
    const rowH = 52;
    const halfW = (w - pad * 2 - UI.SIDEBAR_SECTION_GAP) / 2;

    // Travel Days
    const daysBg = scene.add.graphics();
    daysBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
    daysBg.fillRoundedRect(pad, y, halfW, rowH, 6);
    daysBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    daysBg.strokeRoundedRect(pad, y, halfW, rowH, 6);
    this.mainContentContainer.add(daysBg);

    const daysLabel = scene.add
      .text(pad + halfW / 2, y + 12, 'Travel Days', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(daysLabel);

    this.daysText = scene.add
      .text(pad + halfW / 2, y + 34, '4', {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: '#66aaff',
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.daysText);

    // Re-rolls
    const rerollX = pad + halfW + UI.SIDEBAR_SECTION_GAP;
    const rerollBg = scene.add.graphics();
    rerollBg.fillStyle(COLORS.SIDEBAR_SECTION, 1);
    rerollBg.fillRoundedRect(rerollX, y, halfW, rowH, 6);
    rerollBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    rerollBg.strokeRoundedRect(rerollX, y, halfW, rowH, 6);
    this.mainContentContainer.add(rerollBg);

    const rerollLabel = scene.add
      .text(rerollX + halfW / 2, y + 12, 'Re-rolls', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(rerollLabel);

    this.rerollsText = scene.add
      .text(rerollX + halfW / 2, y + 34, '3', {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: '#ff6666',
      })
      .setOrigin(0.5);
    this.mainContentContainer.add(this.rerollsText);
    y += rowH + UI.SIDEBAR_SECTION_GAP;

    // ─── Journey Info Button ───
    this.journeyInfoBtn = new Button(scene, cx, y + 20, 'Journey Info', w - pad * 2 - 8, 34);
    this.journeyInfoBtn.onClick(() => {
      if (this.onJourneyInfo) this.onJourneyInfo();
    });
    this.mainContentContainer.add(this.journeyInfoBtn);
    y += 46;

    if (isDevMode()) {
      this.testBossBtn = new Button(scene, cx, y + 20, 'Test Boss', w - pad * 2 - 8, 34);
      this.testBossBtn.onClick(() => {
        if (this.onDevBossTest) this.onDevBossTest();
      });
      this.mainContentContainer.add(this.testBossBtn);
      y += 46;
    }

    // ─── Options Button ───
    this.optionsBtn = new Button(scene, cx, y + 20, 'Options', w - pad * 2 - 8, 34);
    this.optionsBtn.onClick(() => {
      if (this.onOptions) this.onOptions();
    });
    this.mainContentContainer.add(this.optionsBtn);
    y += 46;

    this.syncMainContentOffset(false);
  }

  /** Sidebar-space Y where main content block starts (includes boss offset). */
  private getMainContentBaseY(): number {
    return this.mainContentContainer.y;
  }

  private syncMainContentOffset(bossVisible: boolean): void {
    const offset = bossVisible ? this.bossPanelHeight : 0;
    this.mainContentContainer.setY(this.contentStartY + offset);
    this.handDisplayY = this.getMainContentBaseY() + this.handDisplayLocalY;
  }

  // ─── Public API ───

  updateData(data: Partial<SidebarData>): void {
    if (data.title !== undefined) this.titleText.setText(data.title);
    if (data.roundScore !== undefined) this.roundScoreText.setText(formatScore(data.roundScore));
    if (data.milesBase !== undefined) this.milesBaseText.setText(formatScore(data.milesBase));
    if (data.mult !== undefined) this.multText.setText(`${data.mult}`);
    if (data.handName !== undefined) {
      if (data.handName) {
        this.handNameText.setText(data.handName);
        this.handNameText.setVisible(true);
      } else {
        this.handNameText.setVisible(false);
      }
    }
    if (data.handLevel !== undefined) {
      if (data.handLevel > 0) {
        this.handLevelText.setText(`lvl.${data.handLevel}`);
        this.handLevelText.setVisible(true);
      } else {
        this.handLevelText.setVisible(false);
      }
    }
    if (data.daysRemaining !== undefined) {
      this.daysText.setText(`${data.daysRemaining}`);
    }
    if (data.rerolls !== undefined) {
      this.rerollsText.setText(`${data.rerolls}`);
    }
    if (data.leg !== undefined && data.totalLegs !== undefined) {
      const roundLabel =
        data.round !== undefined && data.totalRounds !== undefined
          ? `Leg ${data.leg} - ${data.round}/${data.totalRounds}`
          : `${data.leg} / ${data.totalLegs}`;
      this.legText.setText(roundLabel);
    }
    if (data.targetMiles !== undefined) {
      this.targetText.setText(`${formatScore(data.targetMiles)} mi`);
    }

    if (data.boss !== undefined) {
      this.updateBossPanel(data.boss);
    }

    // Always refresh money from player state
    const player = getPlayerState();
    this.moneyText.setText(`$${player.economy.balance}`);
  }

  private updateBossPanel(boss: BossDef | null | undefined): void {
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
    const imgKey = `boss_${boss.id}`;

    // Remove previous boss image if any
    const prevImg = this.bossContainer.getData('bossImg') as GameObjects.Image | undefined;
    if (prevImg) prevImg.destroy();

    if (this.scene.textures.exists(imgKey)) {
      const profImg = this.scene.add.image(pad + 8 + bossImgSize / 2, bossH / 2, imgKey);
      const tex = profImg.texture.getSourceImage();
      const imgScale = bossImgSize / Math.max(tex.width, tex.height);
      profImg.setScale(imgScale);
      this.bossContainer.add(profImg);
      this.bossContainer.setData('bossImg', profImg);
      const placeholder = this.bossContainer.getData('bossImgPlaceholder') as GameObjects.Rectangle;
      placeholder?.setVisible(false);
    }
  }

  refreshMoney(): void {
    const player = getPlayerState();
    this.moneyText.setText(`$${player.economy.balance}`);
  }

  setJourneyInfoCallback(cb: () => void): void {
    this.onJourneyInfo = cb;
  }

  setDevBossTestCallback(cb: () => void): void {
    this.onDevBossTest = cb;
  }

  setOptionsCallback(cb: () => void): void {
    this.onOptions = cb;
  }

  getContentX(): number {
    return this.sidebarWidth;
  }

  getSidebarWidth(): number {
    return this.sidebarWidth;
  }

  // ─── Scoring Animation Helpers ───

  /** Set miles value with a pop animation on the blue pill */
  setMilesAnimated(value: number): void {
    this.milesBaseText.setText(formatScore(value));
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
  setMultAnimated(value: number): void {
    this.multText.setText(`${value}`);
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
  setRoundScoreAnimated(value: number): void {
    this.roundScoreText.setText(formatScore(value));
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
    this.handLevelText.setVisible(false);
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
