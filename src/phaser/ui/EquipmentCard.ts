// ─── EquipmentCard ───
// Displays an equipment item as a card in the shop or equipment bar.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { EquipmentDef } from '../../game/ItemsSystem';

const CARD_W = 140;
const CARD_H = 190;
const CARD_RADIUS = 8;

const RARITY_COLORS: Record<string, number> = {
  common: 0x4a6a4a,
  uncommon: 0x4a4a8a,
  rare: 0x8a6a2a,
  legendary: 0x8a3a6a,
};

export class EquipmentCard extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private _def: EquipmentDef;
  private _sold: boolean = false;
  private costText: GameObjects.Text;
  private soldOverlay: GameObjects.Graphics;

  constructor(scene: Scene, x: number, y: number, def: EquipmentDef) {
    super(scene, x, y);
    this._def = def;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    // Name
    const nameText = scene.add
      .text(0, -CARD_H / 2 + 16, def.name, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      })
      .setOrigin(0.5, 0);
    this.add(nameText);

    // Description
    const descText = scene.add
      .text(0, -10, '', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      })
      .setOrigin(0.5, 0.5);
    this.add(descText);

    // Cost
    this.costText = scene.add
      .text(0, CARD_H / 2 - 24, `$${def.cost}`, {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#ffd700',
        align: 'center',
      })
      .setOrigin(0.5);
    this.add(this.costText);

    // Sold overlay (hidden initially)
    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.add(this.soldOverlay);

    this.drawCard();

    this.setSize(CARD_W, CARD_H);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);

    scene.add.existing(this);
  }

  get def(): EquipmentDef {
    return this._def;
  }

  get sold(): boolean {
    return this._sold;
  }

  markSold(): void {
    this._sold = true;
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    this.soldOverlay.setVisible(true);
    this.costText.setText('SOLD');
    this.costText.setColor('#888888');
  }

  setAffordable(canAfford: boolean): void {
    if (this._sold) return;
    this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
  }

  private drawCard(): void {
    this.bg.clear();
    const color = RARITY_COLORS[this._def.rarity] ?? RARITY_COLORS.common;
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    this.bg.lineStyle(2, 0x888888, 0.7);
    this.bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
  }
}
