// ─── Roll-phase dice row: sprites, pointer wiring, drag reorder, reposition ───

import type { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { UI } from '../../../game/Constants';
import type { Die } from '../../../game/types';
import { DiceSprite } from '../../ui/DiceSprite';
import { RollDiceDragReorder } from '../../ui/rollDiceDragReorder';
import { getArcOffset } from './diceRowGeometry';

export type RollRowControllerDeps = {
  scene: Scene;
  diceSpacing: number;
  getContentCenterX: () => number;
  getSortOrder: () => 'asc' | 'desc';
  isAnimating: () => boolean;
  isMarqueeActive: () => boolean;
  isConsumableTargeting: () => boolean;
  isDieLifted: (sprite: DiceSprite) => boolean;
  onRollDieClick: (sprite: DiceSprite, isRightClick: boolean) => void;
  onConsumableTargetClick: (sprite: DiceSprite) => void;
  syncRolledDiceFromSprites: () => void;
  onDragBegin: () => void;
  getWasDragging: () => boolean;
  setWasDragging: (value: boolean) => void;
};

export class RollRowController {
  private rollSprites: DiceSprite[] = [];
  private readonly rollDiceDrag: RollDiceDragReorder;

  constructor(private readonly deps: RollRowControllerDeps) {
    this.rollDiceDrag = new RollDiceDragReorder({
      scene: deps.scene,
      getRollSprites: () => this.rollSprites,
      contentCenterX: deps.getContentCenterX,
      diceSpacing: deps.diceSpacing,
      getRollDieY: (index, sprite) => this.getRollDieY(index, sprite),
      getArcOffset,
      isDieLifted: deps.isDieLifted,
      syncRolledDiceFromSprites: deps.syncRolledDiceFromSprites,
      onTouchTap: (sprite) => {
        if (deps.isConsumableTargeting()) {
          deps.onConsumableTargetClick(sprite);
        } else {
          deps.onRollDieClick(sprite, false);
        }
      },
      onDragBegin: deps.onDragBegin,
      canStart: (sprite) => {
        if (deps.isAnimating() || this.rollDiceDrag.isDragging()) return false;
        return this.rollSprites.includes(sprite);
      },
      canTap: () => !deps.isAnimating() && !deps.isMarqueeActive(),
    });
  }

  getRollSprites(): DiceSprite[] {
    return this.rollSprites;
  }

  setRollSprites(sprites: DiceSprite[]): void {
    this.rollSprites = sprites;
  }

  createRollRow(dice: Die[], y: number): DiceSprite[] {
    const sprites: DiceSprite[] = [];
    const totalWidth = (dice.length - 1) * this.deps.diceSpacing;
    const startX = this.deps.getContentCenterX() - totalWidth / 2;

    for (let i = 0; i < dice.length; i++) {
      const arc = getArcOffset(i, dice.length);
      const sprite = new DiceSprite(this.deps.scene, startX + i * this.deps.diceSpacing, y + arc.y, dice[i]);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      sprites.push(sprite);
    }
    return sprites;
  }

  setupInteraction(): void {
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];

      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.deps.setWasDragging(false);
        sprite.setData('rollClickRight', pointer.rightButtonDown());
        this.rollDiceDrag.wirePointerDown(sprite, pointer);
      });

      sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch) return;
        if (this.deps.getWasDragging() || this.deps.isAnimating() || this.deps.isMarqueeActive()) return;

        if (this.deps.isConsumableTargeting()) {
          this.deps.onConsumableTargetClick(sprite);
          return;
        }

        const isRightClick = pointer.rightButtonReleased() || sprite.getData('rollClickRight') === true;
        this.deps.onRollDieClick(sprite, isRightClick);
      });
    }
  }

  /** Sort roll sprites by die value and reposition (selected dice stay raised). */
  sortAndReposition(): void {
    const sortValue = (d: Die) => (d.enhancement === 'stone' ? 13 : d.value);
    const order = this.deps.getSortOrder();
    const cmp =
      order === 'asc'
        ? (a: DiceSprite, b: DiceSprite) => sortValue(a.dieData) - sortValue(b.dieData)
        : (a: DiceSprite, b: DiceSprite) => sortValue(b.dieData) - sortValue(a.dieData);
    this.rollSprites.sort(cmp);
    this.reposition(true);
  }

  /** Reposition all roll sprites (row layout + selected lift + depth). */
  reposition(animated: boolean, duration = 250): void {
    if (this.rollSprites.length === 0) return;

    const totalWidth = (this.rollSprites.length - 1) * this.deps.diceSpacing;
    const startX = this.deps.getContentCenterX() - totalWidth / 2;
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      const arc = getArcOffset(i, this.rollSprites.length);
      const targetX = startX + i * this.deps.diceSpacing;
      const targetY = this.getRollDieY(i, sprite);
      this.applyRollDieDepth(sprite);

      if (animated) {
        this.deps.scene.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          rotation: arc.rotation,
          duration,
          ease: 'Power2',
        });
      } else {
        sprite.setPosition(targetX, targetY);
        sprite.rotation = arc.rotation;
      }
    }
    this.deps.syncRolledDiceFromSprites();
  }

  animateSelectLift(sprite: DiceSprite, index: number): void {
    this.applyRollDieDepth(sprite);
    this.deps.scene.tweens.add({
      targets: sprite,
      y: this.getRollDieY(index, sprite),
      duration: 200,
      ease: 'Power2',
    });
  }

  getRollDieY(index: number, sprite: DiceSprite): number {
    const rollY = this.deps.scene.scale.height * UI.ROLL_Y_RATIO;
    const arc = getArcOffset(index, this.rollSprites.length);
    const lift = this.deps.isDieLifted(sprite) ? UI.DICE_LOCKED_LIFT_Y : 0;
    return rollY + arc.y - lift;
  }

  destroyRollSprites(): void {
    for (const s of this.rollSprites) s.destroy();
    this.rollSprites = [];
  }

  stopDrag(): void {
    this.rollDiceDrag.stop();
  }

  private applyRollDieDepth(sprite: DiceSprite): void {
    sprite.setDepth(this.deps.isDieLifted(sprite) ? 15 : 10);
  }
}
