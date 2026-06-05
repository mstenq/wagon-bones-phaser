// ─── SELECT-phase hand dice row: sprites, layout, consumable-target pointer wiring ───

import type { Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import type { Die } from '../../../game/types';
import { DiceSprite } from '../../ui/DiceSprite';
import { getArcOffset, getRowXPositions } from './diceRowGeometry';

export type PlayAreaDiceControllerDeps = {
  scene: Scene;
  diceSpacing: number;
  getContentCenterX: () => number;
  isConsumableTargeting: () => boolean;
  isConsumableTargetDie: (sprite: DiceSprite) => boolean;
  onConsumableTargetClick: (sprite: DiceSprite) => void;
};

export class PlayAreaDiceController {
  private sprites: DiceSprite[] = [];
  private rowY = 0;

  constructor(private readonly deps: PlayAreaDiceControllerDeps) {}

  getSprites(): DiceSprite[] {
    return this.sprites;
  }

  getY(): number {
    return this.rowY;
  }

  setY(y: number): void {
    this.rowY = y;
  }

  /** Build the hand row at the current Y; sprites are non-interactive until targeting enables them. */
  buildHand(dice: Die[]): void {
    this.clear();
    const positions = getRowXPositions(dice.length, this.deps.getContentCenterX(), this.deps.diceSpacing);

    for (let i = 0; i < dice.length; i++) {
      const arc = getArcOffset(i, dice.length);
      const sprite = new DiceSprite(this.deps.scene, positions[i], this.rowY + arc.y, dice[i]);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      this.wireSprite(sprite);
      sprite.disableInteractive();
      this.sprites.push(sprite);
    }
  }

  getXPositions(count: number): number[] {
    return getRowXPositions(count, this.deps.getContentCenterX(), this.deps.diceSpacing);
  }

  reposition(animated: boolean, duration = 200): void {
    if (this.sprites.length === 0) return;

    const positions = this.getXPositions(this.sprites.length);
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const arc = getArcOffset(i, this.sprites.length);
      const targetY = this.getDieY(i, sprite);
      this.applyDieDepth(sprite);

      if (animated) {
        this.deps.scene.tweens.add({
          targets: sprite,
          x: positions[i],
          y: targetY,
          rotation: arc.rotation,
          duration,
          ease: 'Power2',
        });
      } else {
        sprite.setPosition(positions[i], targetY);
        sprite.rotation = arc.rotation;
      }
    }
  }

  setTargetingInteractive(enabled: boolean): void {
    for (const sprite of this.sprites) {
      if (enabled) {
        sprite.setInteractive({ useHandCursor: true });
      } else {
        sprite.disableInteractive();
      }
    }
  }

  removeSprite(sprite: DiceSprite): void {
    const idx = this.sprites.indexOf(sprite);
    if (idx >= 0) this.sprites.splice(idx, 1);
  }

  /** Append a sprite wired for consumable targeting; non-interactive by default. */
  addSprite(sprite: DiceSprite): void {
    this.wireSprite(sprite);
    sprite.disableInteractive();
    this.sprites.push(sprite);
  }

  clear(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
  }

  private wireSprite(sprite: DiceSprite): void {
    sprite.on('pointerup', () => {
      if (this.deps.isConsumableTargeting()) {
        this.deps.onConsumableTargetClick(sprite);
      }
    });
  }

  private getDieY(index: number, sprite: DiceSprite): number {
    const arc = getArcOffset(index, this.sprites.length);
    const lift = this.deps.isConsumableTargetDie(sprite) ? UI.DICE_LOCKED_LIFT_Y : 0;
    return this.rowY + arc.y - lift;
  }

  private applyDieDepth(sprite: DiceSprite): void {
    sprite.setDepth(this.deps.isConsumableTargetDie(sprite) ? 15 : 10);
  }
}
