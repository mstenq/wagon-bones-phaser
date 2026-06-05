// ─── Roll-row dice drag-to-reorder (touch-safe manual pointer tracking) ───

import * as Phaser from 'phaser';
import { ANIM } from '../../game/Constants';
import { DiceSprite } from './DiceSprite';
import { createHorizontalDragReorder, type HorizontalDragReorder } from './horizontalDragReorder';

export type RollDiceDragReorderDeps = {
  scene: Phaser.Scene;
  getRollSprites: () => DiceSprite[];
  contentCenterX: () => number;
  getDiceSpacing: (count: number) => number;
  getDiceScale: () => number;
  getRollDieY: (index: number, sprite: DiceSprite) => number;
  getArcOffset: (index: number, count: number, scale?: number) => { y: number; rotation: number };
  isDieLifted: (sprite: DiceSprite) => boolean;
  syncRolledDiceFromSprites: () => void;
  onTouchTap: (sprite: DiceSprite) => void;
  onDragBegin: () => void;
  canStart: (sprite: DiceSprite) => boolean;
  canTap: () => boolean;
};

export class RollDiceDragReorder {
  private readonly reorder: HorizontalDragReorder<DiceSprite>;

  constructor(private readonly deps: RollDiceDragReorderDeps) {
    this.reorder = createHorizontalDragReorder({
      scene: deps.scene,
      getItems: () => deps.getRollSprites(),
      getSlotPositions: (count) => {
        const scale = deps.getDiceScale();
        const positions = this.getRowXPositions(count);
        return positions.map((x, i) => {
          const arc = deps.getArcOffset(i, count, scale);
          return { x, y: deps.getRollDieY(i, deps.getRollSprites()[i]!), rotation: arc.rotation };
        });
      },
      canStart: (sprite) => deps.canStart(sprite),
      getPointerOffset: (sprite, pointer) => ({
        x: pointer.worldX - sprite.x,
        y: pointer.worldY - sprite.y,
      }),
      onBegin: (sprite) => {
        deps.onDragBegin();
        sprite.emit('pointerout');
        DiceSprite.suppressTooltips = true;
        sprite.setDepth(30);
        sprite.scaleX = 1.1;
        sprite.scaleY = 1.1;
      },
      onMoveItem: (sprite, pointer, ctx) => {
        sprite.rotation = ctx.swing;
        sprite.x = pointer.worldX - ctx.offsetX;
        sprite.y = pointer.worldY - ctx.offsetY + ANIM.CARD_DRAG_LIFT_Y;
      },
      onSiblingMove: (sibling, index, _slot) => {
        const list = deps.getRollSprites();
        const scale = deps.getDiceScale();
        const positions = this.getRowXPositions(list.length);
        const arc = deps.getArcOffset(index, list.length, scale);
        deps.scene.tweens.add({
          targets: sibling,
          x: positions[index],
          y: deps.getRollDieY(index, sibling),
          rotation: arc.rotation,
          duration: 150,
          ease: 'Power2',
        });
      },
      getSettleSlot: (sprite, index, count) => {
        const scale = deps.getDiceScale();
        const positions = this.getRowXPositions(count);
        const arc = deps.getArcOffset(index, count, scale);
        return {
          x: positions[index],
          y: deps.getRollDieY(index, sprite),
          rotation: arc.rotation,
        };
      },
      onSettleStart: (sprite) => {
        const lifted = deps.isDieLifted(sprite);
        sprite.setDepth(lifted ? 15 : 10);
        DiceSprite.suppressTooltips = false;
      },
      onDragEnd: () => {
        deps.syncRolledDiceFromSprites();
      },
      playSettleSound: true,
      onTap: (sprite) => {
        if (deps.canTap()) deps.onTouchTap(sprite);
      },
      canTap: () => deps.canTap(),
    });
  }

  wirePointerDown(sprite: DiceSprite, pointer: Phaser.Input.Pointer): void {
    this.reorder.wirePointerDown(sprite, pointer, sprite);
  }

  stop(): void {
    this.reorder.stop();
  }

  isDragging(): boolean {
    return this.reorder.isDragging();
  }

  private getRowXPositions(count: number): number[] {
    if (count === 0) return [];
    const spacing = this.deps.getDiceSpacing(count);
    const totalWidth = (count - 1) * spacing;
    const startX = this.deps.contentCenterX() - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * spacing);
  }
}
