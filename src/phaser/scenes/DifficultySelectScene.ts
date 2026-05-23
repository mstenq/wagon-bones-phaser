// ─── DifficultySelectScene ───
// Oregon Trail stakes selection after profession, before round select.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, DIFFICULTIES } from '../../game/Constants';
import { DifficultyLevel } from '../../game/types';
import { Button } from '../ui/Button';
import { addDifficultyImage } from '../ui/DifficultyAssets';
import { startAutoSaveLoop } from '../AutoSaveManager';
import { generateRunSeed, initRunRng } from '../../game/RunRng';

const CARD_W = 230;
const CARD_H = 288;
const CARD_GAP = 14;
const COLS = 4;
const ICON_SIZE = 72;
const ICON_TOP_PAD = 14;
const EFFECTS_PAD = 26;
const EFFECTS_TEXT_W = CARD_W - EFFECTS_PAD * 2;

export class DifficultySelectScene extends Scene {
  private selectedLevel: DifficultyLevel = 1;
  private cards: Phaser.GameObjects.Container[] = [];
  private seededRunEnabled = false;
  private seedInput: HTMLInputElement | null = null;

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
    backBtn.onClick(() => {
      this.destroySeedInput();
      this.scene.start('ProfessionSelect', {});
    });

    const confirmBtn = new Button(this, width / 2, height - 40, 'Embark', 220, 48);
    confirmBtn.setDepth(100);
    confirmBtn.onClick(() => {
      const player = getPlayerState();
      player.setDifficulty(this.selectedLevel);
      const typedSeed = this.seedInput?.value.trim() ?? '';
      const seed = this.seededRunEnabled ? typedSeed || generateRunSeed() : generateRunSeed();
      initRunRng(seed);
      player.assignBosses();
      startAutoSaveLoop();
      this.destroySeedInput();
      this.scene.start('RoundSelect', {});
    });

    this.buildGrid(width);
    this.buildSeedControls(width, height);
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
      const card = this.createDifficultyCard(diff.level, diff.name, diff.description, diff.effects, cx, cy);
      this.cards.push(card);
    });
  }

  private createDifficultyCard(
    level: DifficultyLevel,
    name: string,
    description: string,
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

    const cardTop = -CARD_H / 2;
    const iconY = cardTop + ICON_TOP_PAD + ICON_SIZE / 2;
    addDifficultyImage(this, container, level, 0, iconY, ICON_SIZE);

    const titleY = iconY + ICON_SIZE / 2 + 10;
    const levelLabel = this.add
      .text(0, titleY, `${level}. ${name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '15px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    container.add(levelLabel);

    const desc = this.add
      .text(0, titleY + levelLabel.height + 8, description, {
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
    effectsBlock.setPosition(-CARD_W / 2 + EFFECTS_PAD, effectsY);
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
        align: 'left',
        wordWrap: { width: EFFECTS_TEXT_W },
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
        fontSize: '14px',
        color: isNew ? TEXT_COLORS.PRIMARY : TEXT_COLORS.DISABLED,
        align: 'left',
        wordWrap: { width: EFFECTS_TEXT_W },
        lineSpacing: 1,
      });
      line.setOrigin(0, 0);
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
    this.destroySeedInput();
    this.scene.restart();
  }

  private buildSeedControls(width: number, height: number): void {
    const rowY = height - 124;
    const checkboxSize = 22;
    const checkboxX = width / 2 - 210;
    const labelX = checkboxX + checkboxSize + 10;
    const seedLabelX = width / 2 + 56;
    const seedInputX = seedLabelX + 8;
    const seedInputW = 240;

    const checkboxBg = this.add.graphics().setDepth(90);
    const checkboxMark = this.add.graphics().setDepth(91);
    const seedLabel = this.add
      .text(seedLabelX, rowY, 'Seed', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(1, 0.5)
      .setDepth(92);
    const redraw = () => {
      checkboxBg.clear();
      checkboxMark.clear();
      checkboxBg.fillStyle(this.seededRunEnabled ? COLORS.SCORE_GREEN : COLORS.BTN_DEFAULT, 1);
      checkboxBg.fillRoundedRect(checkboxX, rowY - checkboxSize / 2, checkboxSize, checkboxSize, 4);
      checkboxBg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 1);
      checkboxBg.strokeRoundedRect(checkboxX, rowY - checkboxSize / 2, checkboxSize, checkboxSize, 4);
      if (this.seededRunEnabled) {
        checkboxMark.lineStyle(3, 0xffffff, 1);
        checkboxMark.beginPath();
        checkboxMark.moveTo(checkboxX + 5, rowY);
        checkboxMark.lineTo(checkboxX + 9, rowY + 5);
        checkboxMark.lineTo(checkboxX + 17, rowY - 6);
        checkboxMark.strokePath();
      }
      seedLabel.setVisible(this.seededRunEnabled);
      if (this.seedInput) {
        this.seedInput.style.display = this.seededRunEnabled ? 'block' : 'none';
      }
    };

    redraw();

    const hit = this.add.rectangle(checkboxX + checkboxSize / 2, rowY, checkboxSize + 10, checkboxSize + 10, 0x000000, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.seededRunEnabled = !this.seededRunEnabled;
      redraw();
    });

    const label = this.add
      .text(labelX, rowY, 'Seeded run?', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0, 0.5)
      .setDepth(92);
    label.setInteractive({ useHandCursor: true });
    label.on('pointerdown', () => {
      this.seededRunEnabled = !this.seededRunEnabled;
      redraw();
    });

    this.seedInput = this.createSeedInput(seedInputX, rowY - 16, seedInputW, 32);
    this.seedInput.value = '';
    this.seedInput.placeholder = 'Type a run seed';
    this.seedInput.maxLength = 32;
    this.seedInput.style.display = 'none';

    this.events.once('shutdown', () => this.destroySeedInput());
  }

  private createSeedInput(x: number, y: number, w: number, h: number): HTMLInputElement {
    const container = this.game.canvas.parentElement ?? document.body;
    const containerRect = container.getBoundingClientRect();
    const canvasRect = this.game.canvas.getBoundingClientRect();

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.position = 'absolute';
    input.style.left = `${canvasRect.left - containerRect.left + x}px`;
    input.style.top = `${canvasRect.top - containerRect.top + y}px`;
    input.style.width = `${w}px`;
    input.style.height = `${h}px`;
    input.style.padding = '6px 10px';
    input.style.border = '1px solid #5a4a3a';
    input.style.borderRadius = '6px';
    input.style.background = '#1f1a14';
    input.style.color = '#e5d9c5';
    input.style.fontFamily = FONTS.PRIMARY;
    input.style.fontSize = '14px';
    input.style.zIndex = '5';
    container.appendChild(input);
    return input;
  }

  private destroySeedInput(): void {
    if (!this.seedInput) return;
    this.seedInput.remove();
    this.seedInput = null;
  }
}
