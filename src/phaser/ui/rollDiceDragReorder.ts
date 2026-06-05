// ─── Roll-row dice drag-to-reorder (touch-safe manual pointer tracking) ───

import * as Phaser from 'phaser';
import { ANIM } from '../../game/Constants';
import { DiceSprite } from './DiceSprite';
import { createPointerDragSession, type PointerDragSession } from './pointerDragSession';

export type RollDiceDragReorderDeps = {
  scene: Phaser.Scene;
  getRollSprites: () => DiceSprite[];
  contentCenterX: () => number;
  diceSpacing: number;
  getRollDieY: (index: number, sprite: DiceSprite) => number;
  getArcOffset: (index: number, count: number) => { y: number; rotation: number };
  isDieLifted: (sprite: DiceSprite) => boolean;
  syncRolledDiceFromSprites: () => void;
  onTouchTap: (sprite: DiceSprite) => void;
  onDragBegin: () => void;
  canStart: (sprite: DiceSprite) => boolean;
  canTap: () => boolean;
};

export class RollDiceDragReorder {
  private draggingSprite: DiceSprite | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragPrevX = 0;
  private dragVelocityX = 0;
  private readonly session: PointerDragSession<DiceSprite>;

  constructor(private readonly deps: RollDiceDragReorderDeps) {
    this.session = createPointerDragSession(deps.scene, {
      canStart: (sprite) => deps.canStart(sprite),
      onPress: (_sprite, pointer) => {
        this.dragOffsetX = pointer.worldX - _sprite.x;
        this.dragOffsetY = pointer.worldY - _sprite.y;
        this.dragPrevX = pointer.worldX;
        this.dragVelocityX = 0;
      },
      onBeginDrag: (sprite) => {
        deps.onDragBegin();
        this.beginDrag(sprite);
      },
      onDragMove: (_sprite, pointer) => this.updateDrag(pointer),
      onDragEnd: () => this.finishDrag(),
      onTap: (sprite) => {
        if (deps.canTap()) deps.onTouchTap(sprite);
      },
    });
  }

  wirePointerDown(sprite: DiceSprite, pointer: Phaser.Input.Pointer): void {
    this.session.start(sprite, pointer, sprite);
  }

  stop(): void {
    this.session.stop();
    this.draggingSprite = null;
    this.dragVelocityX = 0;
  }

  isDragging(): boolean {
    return this.draggingSprite !== null;
  }

  private getRowXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * this.deps.diceSpacing;
    const startX = this.deps.contentCenterX() - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * this.deps.diceSpacing);
  }

  private beginDrag(sprite: DiceSprite): void {
    this.draggingSprite = sprite;

    sprite.emit('pointerout');
    DiceSprite.suppressTooltips = true;

    sprite.setDepth(30);
    sprite.scaleX = 1.1;
    sprite.scaleY = 1.1;
  }

  private updateDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.draggingSprite) return;
    const list = this.deps.getRollSprites();
    if (list.length === 0) return;

    const dx = pointer.worldX - this.dragPrevX;
    this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
    this.dragPrevX = pointer.worldX;

    const swing = Phaser.Math.Clamp(
      this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );
    this.draggingSprite.rotation = swing;
    this.draggingSprite.x = pointer.worldX - this.dragOffsetX;
    this.draggingSprite.y = pointer.worldY - this.dragOffsetY + ANIM.CARD_DRAG_LIFT_Y;

    const positions = this.getRowXPositions(list.length);
    let newIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dist = Math.abs(this.draggingSprite.x - positions[i]);
      if (dist < minDist) {
        minDist = dist;
        newIndex = i;
      }
    }

    const currentIndex = list.indexOf(this.draggingSprite);
    if (newIndex !== currentIndex) {
      list.splice(currentIndex, 1);
      list.splice(newIndex, 0, this.draggingSprite);

      for (let i = 0; i < list.length; i++) {
        if (list[i] === this.draggingSprite) continue;
        const arc = this.deps.getArcOffset(i, list.length);
        this.deps.scene.tweens.add({
          targets: list[i],
          x: positions[i],
          y: this.deps.getRollDieY(i, list[i]),
          rotation: arc.rotation,
          duration: 150,
          ease: 'Power2',
        });
      }
    }
  }

  private finishDrag(): void {
    if (!this.draggingSprite) return;
    const list = this.deps.getRollSprites();
    if (list.length === 0) return;

    const sprite = this.draggingSprite;
    const finalVelocity = this.dragVelocityX;
    const lifted = this.deps.isDieLifted(sprite);
    sprite.setDepth(lifted ? 15 : 10);
    this.deps.scene.sound.play('sfx_dice_land', { volume: 0.2 });

    this.draggingSprite = null;
    this.dragVelocityX = 0;
    DiceSprite.suppressTooltips = false;

    const positions = this.getRowXPositions(list.length);
    const idx = list.indexOf(sprite);
    const arc = this.deps.getArcOffset(idx, list.length);
    const settleY = this.deps.getRollDieY(idx, sprite);

    const overshoot = Phaser.Math.Clamp(
      finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );
    const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

    this.deps.scene.tweens.chain({
      targets: sprite,
      tweens: [
        {
          x: positions[idx],
          y: settleY,
          rotation: overshoot + arc.rotation,
          scaleX: 1,
          scaleY: 1,
          duration: dur * 0.3,
          ease: 'Sine.easeOut',
        },
        {
          rotation: -overshoot * 0.4 + arc.rotation,
          duration: dur * 0.25,
          ease: 'Sine.easeInOut',
        },
        {
          rotation: overshoot * 0.1 + arc.rotation,
          duration: dur * 0.2,
          ease: 'Sine.easeInOut',
        },
        {
          rotation: arc.rotation,
          duration: dur * 0.25,
          ease: 'Sine.easeIn',
        },
      ],
    });

    this.deps.syncRolledDiceFromSprites();
  }
}
