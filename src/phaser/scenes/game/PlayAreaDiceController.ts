// ─── SELECT-phase hand dice row: sprites, layout, drag reorder, consumable-target pointer wiring ───

import * as Phaser from 'phaser';
import type { Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import type { Die } from '../../../game/types';
import { DiceSprite } from '../../ui/DiceSprite';
import { PlayAreaDiceDragReorder } from '../../ui/playAreaDiceDragReorder';
import { getArcOffset, getRowXPositions } from './diceRowGeometry';
import { tweenDieRowSpriteLayout } from './diceRowElasticTween';

export type PlayAreaDiceControllerDeps = {
  scene: Scene;
  getDiceSpacing: (count: number) => number;
  getDiceScale: () => number;
  getContentCenterX: () => number;
  isAnimating: () => boolean;
  isConsumableTargeting: () => boolean;
  isConsumableTargetDie: (sprite: DiceSprite) => boolean;
  isConsumablePrePickDie?: (sprite: DiceSprite) => boolean;
  isConsumablePrePickActive?: () => boolean;
  onConsumableTargetClick: (sprite: DiceSprite) => void;
  onConsumablePrePickClick?: (sprite: DiceSprite) => void;
  syncHandDiceFromSprites: () => void;
  onDragBegin: () => void;
  getWasDragging: () => boolean;
  setWasDragging: (value: boolean) => void;
  onLayoutChange?: () => void;
};

export class PlayAreaDiceController {
  private sprites: DiceSprite[] = [];
  private rowY = 0;
  private readonly handDiceDrag: PlayAreaDiceDragReorder;

  constructor(private readonly deps: PlayAreaDiceControllerDeps) {
    this.handDiceDrag = new PlayAreaDiceDragReorder({
      scene: deps.scene,
      getSprites: () => this.sprites,
      contentCenterX: deps.getContentCenterX,
      getDiceSpacing: deps.getDiceSpacing,
      getDiceScale: deps.getDiceScale,
      getDieY: (index, sprite) => this.getDieY(index, sprite),
      getArcOffset,
      isDieLifted: (sprite) => this.isDieHighlighted(sprite),
      syncHandDiceFromSprites: deps.syncHandDiceFromSprites,
      onTouchTap: (sprite) => this.onSpriteTap(sprite),
      onDragBegin: deps.onDragBegin,
      canStart: (sprite) => {
        if (deps.isAnimating() || this.handDiceDrag.isDragging()) return false;
        if (deps.isConsumableTargeting()) return false;
        return this.sprites.includes(sprite);
      },
      canTap: () => !deps.isAnimating() && !deps.isConsumableTargeting(),
    });
  }

  getSprites(): DiceSprite[] {
    return this.sprites;
  }

  getY(): number {
    return this.rowY;
  }

  setY(y: number): void {
    this.rowY = y;
  }

  /** Build the hand row at the current Y; sprites are non-interactive until pre-pick enables them. */
  buildHand(dice: Die[]): void {
    this.clear();
    const scale = this.deps.getDiceScale();
    const spacing = this.deps.getDiceSpacing(dice.length);
    const positions = getRowXPositions(dice.length, this.deps.getContentCenterX(), spacing);

    for (let i = 0; i < dice.length; i++) {
      const arc = getArcOffset(i, dice.length, scale);
      const sprite = new DiceSprite(this.deps.scene, positions[i], this.rowY + arc.y, dice[i]);
      sprite.setScale(scale);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      this.wireSpriteInteraction(sprite);
      sprite.disableInteractive();
      this.sprites.push(sprite);
    }
    this.deps.onLayoutChange?.();
  }

  getXPositions(count: number): number[] {
    const spacing = this.deps.getDiceSpacing(count);
    return getRowXPositions(count, this.deps.getContentCenterX(), spacing);
  }

  reposition(animated: boolean, duration = 200, elasticLift?: boolean): void {
    if (this.sprites.length === 0) return;

    const useElasticY = elasticLift ?? this.deps.isConsumableTargeting();
    const positions = this.getXPositions(this.sprites.length);
    const scale = this.deps.getDiceScale();
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const arc = getArcOffset(i, this.sprites.length, scale);
      const targetY = this.getDieY(i, sprite);
      sprite.setScale(scale);
      this.applyDieDepth(sprite);

      tweenDieRowSpriteLayout(
        this.deps.scene,
        sprite,
        { x: positions[i], y: targetY, rotation: arc.rotation },
        animated,
        duration,
        useElasticY,
        { onYUpdate: () => sprite.syncTooltipPosition() },
      );
    }
    this.deps.onLayoutChange?.();
  }

  setTargetingInteractive(enabled: boolean): void {
    for (const sprite of this.sprites) {
      if (enabled) {
        sprite.setInteractive({ useHandCursor: true });
      } else if (!this.deps.isConsumablePrePickActive?.()) {
        sprite.disableInteractive();
      }
    }
  }

  setPrePickInteractive(enabled: boolean): void {
    for (const sprite of this.sprites) {
      if (this.deps.isConsumableTargeting()) continue;
      if (enabled) {
        sprite.setInteractive({ useHandCursor: true });
      } else {
        sprite.disableInteractive();
      }
    }
    if (!enabled) {
      this.stopDrag();
    }
  }

  stopDrag(): void {
    this.handDiceDrag.stop();
    DiceSprite.suppressTooltips = false;
  }

  removeSprite(sprite: DiceSprite): void {
    const idx = this.sprites.indexOf(sprite);
    if (idx >= 0) this.sprites.splice(idx, 1);
  }

  /** Append a sprite wired for consumable targeting; non-interactive by default. */
  addSprite(sprite: DiceSprite): void {
    this.wireSpriteInteraction(sprite);
    sprite.disableInteractive();
    this.sprites.push(sprite);
  }

  clear(): void {
    this.stopDrag();
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
  }

  private wireSpriteInteraction(sprite: DiceSprite): void {
    sprite.off('pointerdown');
    sprite.off('pointerup');

    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.deps.setWasDragging(false);
      this.handDiceDrag.wirePointerDown(sprite, pointer);
    });

    sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      if (this.deps.getWasDragging() || this.deps.isAnimating()) return;
      this.onSpriteTap(sprite);
    });
  }

  private onSpriteTap(sprite: DiceSprite): void {
    if (this.deps.isConsumableTargeting()) {
      this.deps.onConsumableTargetClick(sprite);
      return;
    }
    if (this.deps.isConsumablePrePickActive?.()) {
      this.deps.onConsumablePrePickClick?.(sprite);
    }
  }

  private isDieHighlighted(sprite: DiceSprite): boolean {
    if (this.deps.isConsumableTargetDie(sprite)) return true;
    return this.deps.isConsumablePrePickDie?.(sprite) ?? false;
  }

  private getDieY(index: number, sprite: DiceSprite): number {
    const scale = this.deps.getDiceScale();
    const arc = getArcOffset(index, this.sprites.length, scale);
    const lift = this.isDieHighlighted(sprite) ? UI.DICE_LOCKED_LIFT_Y : 0;
    return this.rowY + arc.y - lift;
  }

  private applyDieDepth(sprite: DiceSprite): void {
    sprite.setDepth(this.isDieHighlighted(sprite) ? 15 : 10);
  }
}
