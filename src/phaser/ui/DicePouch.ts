// ─── DicePouch ───
// Bottom-right indicator showing dice collection count (available/total).
// Clicking opens a modal to view all dice with filter toggles.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { runStore } from '../../game/store/runStore';
import { selectDicePouchCounts } from '../../game/store/selectors/uiSelectors';
import { bindGameObject } from '../store/subscribe';

export class DicePouch extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private countText: GameObjects.Text;
  private onClick: (() => void) | null = null;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y);
    const size = UI.POUCH_SIZE;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.drawBg(false);

    // Dice icon (emoji or text)
    const icon = scene.add
      .text(size / 2, size / 2 - 8, '🎲', {
        fontSize: '22px',
      })
      .setOrigin(0.5);
    this.add(icon);

    // Count text
    this.countText = scene.add
      .text(size / 2, size / 2 + 14, '0/0', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5);
    this.add(this.countText);

    this.setSize(size, size);
    // Container input origin is center-based; graphics are drawn from local (0, 0).
    this.setInteractive(
      new Phaser.Geom.Rectangle(size / 2, size / 2, size, size),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on('pointerover', () => this.drawBg(true));
    this.on('pointerout', () => this.drawBg(false));
    this.on('pointerdown', () => {
      if (this.onClick) this.onClick();
    });

    this.setDepth(150);
    scene.add.existing(this);

    bindGameObject(this, runStore, selectDicePouchCounts, (counts) => {
      this.countText.setText(`${counts.available}/${counts.total}`);
    });
  }

  private drawBg(hover: boolean): void {
    const size = UI.POUCH_SIZE;
    this.bg.clear();
    this.bg.fillStyle(hover ? COLORS.BTN_HOVER : COLORS.SIDEBAR_SECTION, 1);
    this.bg.fillRoundedRect(0, 0, size, size, 8);
    this.bg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.8);
    this.bg.strokeRoundedRect(0, 0, size, size, 8);
  }

  setClickCallback(cb: () => void): void {
    this.onClick = cb;
  }
}
