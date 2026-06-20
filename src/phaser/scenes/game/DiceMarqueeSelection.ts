// ─── Drag-box (marquee) selection for dice rows ───

import type { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { DICE, MARQUEE } from '../../../game/Constants';
import type { DiceSprite } from '../../ui/DiceSprite';
import { attachPointerDragTrack, getPointerDragDistance } from '../../ui/pointerDragTrack';

export type DiceMarqueeSelectionDeps = {
  scene: Scene;
  canUseMarquee: () => boolean;
  getSprites: () => DiceSprite[];
  getZoneBounds: () => { width: number; height: number; cx: number; cy: number };
  onSpriteHit: (sprite: DiceSprite, playSound: boolean, isRightClick: boolean) => void;
  onSelectionComplete: () => void;
  onDragBegin: () => void;
  /** When false, only left-drag toggles selection (booster pack lineup). Default true. */
  supportsRightClick?: boolean;
};

export class DiceMarqueeSelection {
  private marqueeZone: Phaser.GameObjects.Zone | null = null;
  private marqueeGfx: Phaser.GameObjects.Graphics | null = null;
  private marqueeStartX = 0;
  private marqueeStartY = 0;
  private marqueeActive = false;
  private marqueePointerId: number | null = null;
  /** Left-drag = select/deselect; right-drag = lock/unlock (roll phase only). */
  private marqueeIsRightClick = false;
  private detachMarqueeTrack: (() => void) | null = null;

  constructor(private readonly deps: DiceMarqueeSelectionDeps) {}

  isActive(): boolean {
    return this.marqueeActive;
  }

  setup(): void {
    this.createZone();
    if (!this.marqueeZone) return;

    this.marqueeZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.deps.canUseMarquee()) return;

      const supportsRightClick = this.deps.supportsRightClick !== false;
      if (supportsRightClick) {
        if (!pointer.leftButtonDown() && !pointer.rightButtonDown()) return;
        this.marqueeIsRightClick = pointer.rightButtonDown();
      } else if (!pointer.leftButtonDown()) {
        return;
      } else {
        this.marqueeIsRightClick = false;
      }

      this.marqueeStartX = pointer.worldX;
      this.marqueeStartY = pointer.worldY;
      this.marqueePointerId = pointer.id;
      this.marqueeActive = false;

      this.stopTracking();
      this.detachMarqueeTrack = attachPointerDragTrack(this.deps.scene, this.marqueeZone, {
        onMove: this.onMarqueePointerMove,
        onEnd: this.onMarqueePointerUp,
      });
    });
  }

  stopTracking(): void {
    if (this.detachMarqueeTrack) {
      this.detachMarqueeTrack();
      this.detachMarqueeTrack = null;
    }
  }

  destroy(): void {
    this.stopTracking();
    this.cleanupMarquee();
    this.marqueeGfx?.destroy();
    this.marqueeGfx = null;
    this.marqueeZone?.destroy();
    this.marqueeZone = null;
  }

  private createZone(): void {
    this.destroy();
    const { width, height, cx, cy } = this.deps.getZoneBounds();
    this.marqueeZone = this.deps.scene.add.zone(cx, cy, width, height).setDepth(MARQUEE.ZONE_DEPTH).setInteractive();
  }

  private onMarqueePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.marqueePointerId === null || pointer.id !== this.marqueePointerId) return;

    const dx = pointer.worldX - this.marqueeStartX;
    const dy = pointer.worldY - this.marqueeStartY;
    if (!this.marqueeActive && Math.hypot(dx, dy) < getPointerDragDistance(pointer)) return;

    this.marqueeActive = true;
    this.deps.onDragBegin();
    this.drawMarqueeGfx(this.marqueeStartX, this.marqueeStartY, pointer.worldX, pointer.worldY);
  };

  private onMarqueePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.marqueePointerId === null || pointer.id !== this.marqueePointerId) return;

    this.stopTracking();

    if (this.marqueeActive) {
      const rect = this.getMarqueeRect(this.marqueeStartX, this.marqueeStartY, pointer.worldX, pointer.worldY);
      const hits = this.getDiceInMarquee(rect);
      let playSound = true;
      for (const sprite of hits) {
        this.deps.onSpriteHit(sprite, playSound, this.marqueeIsRightClick);
        playSound = false;
      }
      if (hits.length > 0) this.deps.onSelectionComplete();
    }

    this.cleanupMarquee();
  };

  private drawMarqueeGfx(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.marqueeGfx) {
      this.marqueeGfx = this.deps.scene.add.graphics().setDepth(MARQUEE.GFX_DEPTH);
    }
    const rect = this.getMarqueeRect(x1, y1, x2, y2);
    this.marqueeGfx.clear();
    const supportsRightClick = this.deps.supportsRightClick !== false;
    const stroke = supportsRightClick && this.marqueeIsRightClick ? MARQUEE.LOCK_STROKE : DICE.SELECTED_STROKE;
    this.marqueeGfx.fillStyle(stroke, MARQUEE.FILL_ALPHA);
    this.marqueeGfx.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.marqueeGfx.lineStyle(2, stroke, 1);
    this.marqueeGfx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  private getDiceWorldBounds(sprite: DiceSprite): Phaser.Geom.Rectangle {
    const half = DICE.SIZE / 2;
    return new Phaser.Geom.Rectangle(sprite.x - half, sprite.y - half, DICE.SIZE, DICE.SIZE);
  }

  private getMarqueeRect(x1: number, y1: number, x2: number, y2: number): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  private getDiceInMarquee(rect: Phaser.Geom.Rectangle): DiceSprite[] {
    const hits: DiceSprite[] = [];
    for (const sprite of this.deps.getSprites()) {
      if (Phaser.Geom.Rectangle.Overlaps(rect, this.getDiceWorldBounds(sprite))) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  private cleanupMarquee(): void {
    this.marqueeGfx?.clear();
    this.marqueeActive = false;
    this.marqueePointerId = null;
  }
}
