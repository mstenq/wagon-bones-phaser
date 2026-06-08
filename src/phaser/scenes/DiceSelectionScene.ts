// ─── DiceSelectionScene ───
// Shows N dice drawn from player's pool. Player picks some to apply an effect.
// Used by supply cards and frontier encounters that operate on dice.
// Returns to the calling scene (Shop or wherever) when done.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import {
  DiceSelectionConfig,
  drawDiceForSelection,
  applyDiceSelectionEffect,
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
} from '../../game/DiceSelectionSystem';
import { Die } from '../../game/types';
import { UI } from '../../game/Constants';

interface DiceSpriteEntry {
  sprite: DiceSprite;
  die: Die;
  selected: boolean;
}

export class DiceSelectionScene extends Scene {
  private config: DiceSelectionConfig;
  private returnScene: string;
  private returnSceneData: Record<string, unknown> = {};
  private drawnDice: Die[] = [];
  private entries: DiceSpriteEntry[] = [];
  private diceRowY: number = 0;
  private confirmBtn: Button;
  private skipBtn: Button;
  private picksText: Phaser.GameObjects.Text;

  constructor() {
    super('DiceSelection');
  }

  init(
    data: {
      config?: DiceSelectionConfig;
      returnScene?: string;
      returnSceneData?: Record<string, unknown>;
    } = {},
  ) {
    if (!data.config || !data.returnScene) {
      throw new Error('DiceSelectionScene requires config and returnScene in scene data');
    }
    this.config = data.config;
    this.returnScene = data.returnScene;
    this.returnSceneData = data.returnSceneData ?? {};
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
    const DICE_SPACING = UI.DICE_SPACING;
    const totalWidth = (this.drawnDice.length - 1) * DICE_SPACING;
    const startX = width / 2 - totalWidth / 2;
    this.diceRowY = height * 0.45;

    for (let i = 0; i < this.drawnDice.length; i++) {
      const die = this.drawnDice[i];
      const x = startX + i * DICE_SPACING;
      const sprite = new DiceSprite(this, x, this.diceRowY, die);

      const entry: DiceSpriteEntry = { sprite, die, selected: false };
      this.entries.push(entry);

      sprite.on('pointerdown', () => this.onDieClick(entry));
    }

    // "No dice available" message
    if (this.drawnDice.length === 0) {
      this.add
        .text(width / 2, this.diceRowY, 'No dice available!', {
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
    } else if (selectedCount < getDiceSelectionMaxPicks(this.config)) {
      // Select
      entry.selected = true;
    }

    this.repositionDice(true);
    this.updatePicksText();
    const newCount = this.entries.filter((e) => e.selected).length;
    this.confirmBtn.setEnabled(isDiceSelectionReady(this.config, newCount));
  }

  private repositionDice(animated: boolean): void {
    for (const entry of this.entries) {
      const lift = entry.selected ? UI.DICE_LOCKED_LIFT_Y : 0;
      entry.sprite.setDepth(entry.selected ? 15 : 10);
      const targetY = this.diceRowY - lift;
      if (animated) {
        this.tweens.add({
          targets: entry.sprite,
          y: targetY,
          duration: 200,
          ease: 'Power2',
        });
      } else {
        entry.sprite.y = targetY;
      }
    }
  }

  private updatePicksText(): void {
    const selected = this.entries.filter((e) => e.selected).length;
    const min = getDiceSelectionMinPicks(this.config);
    const max = getDiceSelectionMaxPicks(this.config);
    if (min === max) {
      this.picksText.setText(`Select ${max - selected} more dice (${selected}/${max})`);
    } else if (selected < min) {
      this.picksText.setText(`Select at least ${min - selected} more (${selected}/${max} max)`);
    } else {
      this.picksText.setText(`Ready — ${selected}/${max} selected (optional: pick more)`);
    }
  }

  private onConfirm(): void {
    const selectedDice = this.entries.filter((e) => e.selected).map((e) => e.die);
    if (!isDiceSelectionReady(this.config, selectedDice.length)) return;

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
      .text(width / 2, height * 0.62, result.message, {
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
      this.scene.start(this.returnScene, this.returnSceneData);
    });
  }

  private onSkip(): void {
    this.scene.start(this.returnScene, this.returnSceneData);
  }

  private onResize(): void {
    this.entries = [];
    this.children.removeAll(true);
    this.buildLayout();
  }
}
