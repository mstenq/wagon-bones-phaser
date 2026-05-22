// ─── DiceSelectionScene ───
// Shows N dice drawn from player's pool. Player picks some to apply an effect.
// Used by supply cards and frontier encounters that operate on dice.
// Returns to the calling scene (Shop or wherever) when done.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { DiceSelectionConfig, drawDiceForSelection, applyDiceSelectionEffect } from '../../game/DiceSelectionSystem';
import { Die } from '../../game/types';

interface DiceSpriteEntry {
  sprite: DiceSprite;
  die: Die;
  selected: boolean;
}

export class DiceSelectionScene extends Scene {
  private config: DiceSelectionConfig;
  private returnScene: string;
  private drawnDice: Die[] = [];
  private entries: DiceSpriteEntry[] = [];
  private confirmBtn: Button;
  private skipBtn: Button;
  private picksText: Phaser.GameObjects.Text;

  constructor() {
    super('DiceSelection');
  }

  init(data: { config?: DiceSelectionConfig; returnScene?: string } = {}) {
    if (!data.config || !data.returnScene) {
      throw new Error('DiceSelectionScene requires config and returnScene in scene data');
    }
    this.config = data.config;
    this.returnScene = data.returnScene;
  }

  create() {
    this.drawnDice = drawDiceForSelection(this.config.drawCount);
    this.entries = [];

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.buildLayout();
  }

  private buildLayout(): void {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    // Card/effect name
    this.add
      .text(width / 2, height * 0.08, this.config.cardName, {
        fontFamily: 'Arial Black',
        fontSize: '32px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Description
    this.add
      .text(width / 2, height * 0.15, this.config.description, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // Picks remaining
    this.picksText = this.add
      .text(width / 2, height * 0.22, '', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
    this.updatePicksText();

    // Dice display
    const DICE_SPACING = 84;
    const totalWidth = (this.drawnDice.length - 1) * DICE_SPACING;
    const startX = width / 2 - totalWidth / 2;
    const diceY = height * 0.45;

    for (let i = 0; i < this.drawnDice.length; i++) {
      const die = this.drawnDice[i];
      const x = startX + i * DICE_SPACING;
      const sprite = new DiceSprite(this, x, diceY, die);

      const entry: DiceSpriteEntry = { sprite, die, selected: false };
      this.entries.push(entry);

      sprite.on('pointerdown', () => this.onDieClick(entry));
    }

    // "No dice available" message
    if (this.drawnDice.length === 0) {
      this.add
        .text(width / 2, diceY, 'No dice available!', {
          fontFamily: 'Arial',
          fontSize: '20px',
          color: '#ff6666',
        })
        .setOrigin(0.5);
    }

    // Buttons
    const btnY = height * 0.75;
    this.confirmBtn = new Button(this, width / 2 - 100, btnY, 'Apply Effect', 180, 44);
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.onClick(() => this.onConfirm());

    this.skipBtn = new Button(this, width / 2 + 100, btnY, 'Skip', 120, 44);
    this.skipBtn.onClick(() => this.onSkip());

    // Result text area (hidden until confirm)
  }

  private onDieClick(entry: DiceSpriteEntry): void {
    const selectedCount = this.entries.filter((e) => e.selected).length;

    if (entry.selected) {
      // Deselect
      entry.selected = false;
      entry.sprite.setSelected(false);
    } else if (selectedCount < this.config.pickCount) {
      // Select
      entry.selected = true;
      entry.sprite.setSelected(true);
    }

    this.updatePicksText();
    const newCount = this.entries.filter((e) => e.selected).length;
    this.confirmBtn.setEnabled(newCount === this.config.pickCount);
  }

  private updatePicksText(): void {
    const selected = this.entries.filter((e) => e.selected).length;
    const total = this.config.pickCount;
    this.picksText.setText(`Select ${total - selected} more dice (${selected}/${total})`);
  }

  private onConfirm(): void {
    const selectedDice = this.entries.filter((e) => e.selected).map((e) => e.die);

    // BUMP_VALUE needs a direction choice before applying
    if (this.config.effectType === 'BUMP_VALUE') {
      this.showBumpDirectionChoice(selectedDice);
      return;
    }

    this.applyAndShowResult(selectedDice);
  }

  private showBumpDirectionChoice(selectedDice: Die[]): void {
    const { width, height } = this.scale;
    const btnY = height * 0.62;

    this.confirmBtn.setEnabled(false);
    this.skipBtn.setEnabled(false);

    this.add
      .text(width / 2, btnY - 40, 'Bump value...', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    const upBtn = new Button(this, width / 2 - 70, btnY, '+1 Up', 120, 44);
    upBtn.onClick(() => {
      this.config.effectParams.bumpDirection = 'up';
      this.applyAndShowResult(selectedDice);
    });

    const downBtn = new Button(this, width / 2 + 70, btnY, '-1 Down', 120, 44);
    downBtn.onClick(() => {
      this.config.effectParams.bumpDirection = 'down';
      this.applyAndShowResult(selectedDice);
    });
  }

  private applyAndShowResult(selectedDice: Die[]): void {
    const result = applyDiceSelectionEffect(this.config, selectedDice);

    // Show result briefly then return
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height * 0.62, result, {
        fontFamily: 'Arial Black',
        fontSize: '24px',
        color: '#66ff66',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    this.confirmBtn.setEnabled(false);
    this.skipBtn.setEnabled(false);

    this.time.delayedCall(1200, () => {
      this.scene.start(this.returnScene, {});
    });
  }

  private onSkip(): void {
    this.scene.start(this.returnScene, {});
  }

  private onResize(): void {
    this.entries = [];
    this.children.removeAll(true);
    this.buildLayout();
  }
}
