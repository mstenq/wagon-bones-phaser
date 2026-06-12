// ─── Roll-phase score-slot dots below the dice row backdrop ───

import type { Scene } from 'phaser';
import { COLORS, UI } from '../../../game/Constants';

const DOT_DEPTH = 9;
const DOT_WHITE = COLORS.SIDEBAR_SECTION_BORDER;

export type DiceSelectionDotsSync = {
  centerX: number;
  y: number;
  slotCount: number;
  filledCount: number;
  overLimit: boolean;
  /** When true, reposition only — skip fill/color updates and pulse. */
  layoutOnly?: boolean;
};

type DotSlot = {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  filled: boolean;
  overLimit: boolean;
};

export class DiceSelectionDots {
  private readonly scene: Scene;
  private readonly root: Phaser.GameObjects.Container;
  private slots: DotSlot[] = [];
  private rowOverLimit = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(DOT_DEPTH);
    this.hide();
  }

  sync(config: DiceSelectionDotsSync): void {
    const { centerX, y, slotCount, filledCount, overLimit, layoutOnly = false } = config;
    if (slotCount <= 0) {
      this.hide();
      return;
    }

    this.ensureSlotCount(slotCount);
    this.root.setVisible(true);

    const spacing = UI.DICE_SELECTION_DOT_GAP;
    const totalWidth = slotCount <= 1 ? 0 : (slotCount - 1) * spacing;
    const startX = centerX - totalWidth / 2;

    const overLimitEntered = !layoutOnly && overLimit && !this.rowOverLimit;

    for (let i = 0; i < slotCount; i++) {
      const slot = this.slots[i];
      slot.container.setPosition(startX + i * spacing, y);

      if (layoutOnly) {
        continue;
      }

      const filled = i < filledCount;
      const fillChanged = slot.filled !== filled;
      this.drawDot(slot.gfx, filled, overLimit);
      slot.filled = filled;
      slot.overLimit = overLimit;

      if (fillChanged) {
        if (filled) {
          this.playFillGrow(slot.container);
        } else {
          this.playUnfillShrink(slot.container);
        }
      }
    }

    if (!layoutOnly) {
      this.rowOverLimit = overLimit;
    }

    if (overLimitEntered) {
      for (let i = 0; i < slotCount; i++) {
        this.playFillGrow(this.slots[i].container);
      }
    }

    for (let i = slotCount; i < this.slots.length; i++) {
      this.slots[i].container.setVisible(false);
    }
  }

  hide(): void {
    this.killPulseTweens();
    this.rowOverLimit = false;
    this.root.setVisible(false);
    for (const slot of this.slots) {
      slot.container.setVisible(false);
      slot.container.setScale(1);
    }
  }

  destroy(): void {
    this.killPulseTweens();
    this.root.destroy(true);
    this.slots = [];
    this.rowOverLimit = false;
  }

  private ensureSlotCount(count: number): void {
    while (this.slots.length < count) {
      const gfx = this.scene.add.graphics();
      const container = this.scene.add.container(0, 0, [gfx]);
      this.root.add(container);
      this.slots.push({ container, gfx, filled: false, overLimit: false });
    }

    for (let i = 0; i < count; i++) {
      this.slots[i].container.setVisible(true);
    }
  }

  private drawDot(gfx: Phaser.GameObjects.Graphics, filled: boolean, overLimit: boolean): void {
    gfx.clear();
    const radius = UI.DICE_SELECTION_DOT_RADIUS;
    const stroke = UI.DICE_SELECTION_DOT_STROKE;
    const color = filled && overLimit ? COLORS.ERROR_RED : DOT_WHITE;

    if (filled) {
      gfx.fillStyle(color, 1);
      gfx.fillCircle(0, 0, radius);
    }

    gfx.lineStyle(stroke, color, 1);
    gfx.strokeCircle(0, 0, radius);
  }

  private playFillGrow(container: Phaser.GameObjects.Container): void {
    this.scene.tweens.killTweensOf(container);
    container.setScale(1);
    this.scene.tweens.add({
      targets: container,
      scale: UI.DICE_SELECTION_DOT_PULSE_SCALE,
      duration: UI.DICE_SELECTION_DOT_PULSE_UP_MS,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: UI.DICE_SELECTION_DOT_PULSE_HOLD_MS,
    });
  }

  private playUnfillShrink(container: Phaser.GameObjects.Container): void {
    this.scene.tweens.killTweensOf(container);
    container.setScale(1);
    this.scene.tweens.add({
      targets: container,
      scale: UI.DICE_SELECTION_DOT_SHRINK_SCALE,
      duration: UI.DICE_SELECTION_DOT_PULSE_UP_MS,
      ease: 'Back.easeIn',
      yoyo: true,
      hold: UI.DICE_SELECTION_DOT_PULSE_HOLD_MS,
    });
  }

  private killPulseTweens(): void {
    for (const slot of this.slots) {
      this.scene.tweens.killTweensOf(slot.container);
    }
  }
}
