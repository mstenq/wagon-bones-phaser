// ─── DifficultySelectScene ───
// Oregon Trail stakes selection after profession, before round select.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, DIFFICULTIES } from '../../game/Constants';
import { DifficultyLevel } from '../../game/types';
import { Button } from '../ui/Button';

const CARD_W = 230;
const CARD_H = 248;
const CARD_GAP = 14;
const COLS = 4;
const BADGE_R = 8;

export class DifficultySelectScene extends Scene {
  private selectedLevel: DifficultyLevel = 1;
  private cards: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('DifficultySelect');
  }

  create(): void {
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, 36, 'Choose Your Trail', {
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
      .text(width / 2, 70, 'Higher stakes stack penalties — pick how harsh the frontier will be', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '15px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(60);

    const backBtn = new Button(this, 72, 40, '← Back', 120, 36);
    backBtn.setDepth(100);
    backBtn.onClick(() => this.scene.start('ProfessionSelect'));

    const confirmBtn = new Button(this, width / 2, height - 40, 'Embark', 220, 48);
    confirmBtn.setDepth(100);
    confirmBtn.onClick(() => {
      getPlayerState().setDifficulty(this.selectedLevel);
      this.scene.start('RoundSelect');
    });

    this.buildGrid(width);
    this.selectDifficulty(1);

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildGrid(width: number): void {
    const totalGridW = COLS * CARD_W + (COLS - 1) * CARD_GAP;
    const startX = (width - totalGridW) / 2 + CARD_W / 2;
    const startY = 118 + CARD_H / 2;

    this.cards = [];
    DIFFICULTIES.forEach((diff, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = startX + col * (CARD_W + CARD_GAP);
      const cy = startY + row * (CARD_H + CARD_GAP);
      const card = this.createDifficultyCard(diff.level, diff.name, diff.description, diff.color, diff.effects, cx, cy);
      this.cards.push(card);
    });
  }

  private createDifficultyCard(
    level: DifficultyLevel,
    name: string,
    description: string,
    badgeColor: number,
    effects: string[],
    cx: number,
    cy: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);

    const cardBg = this.add.graphics();
    cardBg.fillStyle(COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    cardBg.lineStyle(2, COLORS.SIDEBAR_SECTION_BORDER, 1);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    container.add(cardBg);

    const headerY = -CARD_H / 2 + 22;
    const badgeGfx = this.add.graphics();
    badgeGfx.fillStyle(badgeColor, 1);
    badgeGfx.fillCircle(-CARD_W / 2 + 24, headerY, BADGE_R);
    if (badgeColor <= 0x444444) {
      badgeGfx.lineStyle(2, 0xaaaaaa, 1);
      badgeGfx.strokeCircle(-CARD_W / 2 + 24, headerY, BADGE_R);
    }
    container.add(badgeGfx);

    const levelLabel = this.add
      .text(-CARD_W / 2 + 42, headerY, `${level}. ${name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '15px',
        color: TEXT_COLORS.GOLD,
        align: 'left',
      })
      .setOrigin(0, 0.5);
    container.add(levelLabel);

    const desc = this.add
      .text(0, headerY + 28, description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        wordWrap: { width: CARD_W - 24 },
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);
    container.add(desc);

    const effectsY = desc.y + desc.height + 10;
    const effectsBlock = this.buildEffectsText(effects);
    effectsBlock.setPosition(0, effectsY);
    container.add(effectsBlock);

    const hitZone = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x000000, 0);
    container.add(hitZone);
    hitZone.setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      if (this.selectedLevel !== level) {
        this.drawCardBorder(cardBg, COLORS.BTN_HOVER, 2);
      }
    });

    hitZone.on('pointerout', () => {
      if (this.selectedLevel !== level) {
        this.drawCardBorder(cardBg, COLORS.SIDEBAR_SECTION_BORDER, 2);
      }
    });

    hitZone.on('pointerdown', () => this.selectDifficulty(level));

    container.setData('level', level);
    container.setData('cardBg', cardBg);

    return container;
  }

  private buildEffectsText(effects: string[]): Phaser.GameObjects.Container {
    const block = this.add.container(0, 0);
    if (effects.length === 0) {
      const line = this.add.text(0, 0, 'No extra penalties', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.DISABLED,
        align: 'center',
        wordWrap: { width: CARD_W - 28 },
      });
      line.setOrigin(0.5, 0);
      block.add(line);
      return block;
    }

    let y = 0;
    effects.forEach((effect, i) => {
      const isNew = i === effects.length - 1;
      const line = this.add.text(0, y, `• ${effect}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: isNew ? TEXT_COLORS.PRIMARY : TEXT_COLORS.DISABLED,
        align: 'center',
        wordWrap: { width: CARD_W - 28 },
        lineSpacing: 1,
      });
      line.setOrigin(0.5, 0);
      block.add(line);
      y += line.height + 3;
    });
    return block;
  }

  private drawCardBorder(cardBg: Phaser.GameObjects.Graphics, borderColor: number, width: number): void {
    cardBg.clear();
    cardBg.fillStyle(COLORS.BG_CARD, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
    cardBg.lineStyle(width, borderColor, 1);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
  }

  private selectDifficulty(level: DifficultyLevel): void {
    this.selectedLevel = level;

    if (this.cache?.audio?.exists('sfx_button')) {
      this.sound.play('sfx_button', { volume: 0.4 });
    }

    for (const card of this.cards) {
      const cardBg = card.getData('cardBg') as Phaser.GameObjects.Graphics;
      const cardLevel = card.getData('level') as DifficultyLevel;

      cardBg.clear();
      if (cardLevel === level) {
        cardBg.fillStyle(0x2a3a2a, 1);
        cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        cardBg.lineStyle(3, COLORS.SELECTION, 1);
        cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      } else {
        this.drawCardBorder(cardBg, COLORS.SIDEBAR_SECTION_BORDER, 2);
      }
    }
  }

  private onResize(): void {
    this.scene.restart();
  }
}
