// ─── Semi-transparent panel behind the active dice row (CardBar-style chrome) ───

import type { Scene } from 'phaser';
import { COLORS, UI } from '../../../game/Constants';
import {
  computeDiceRowBackdropBounds,
  type DiceRowBackdropBounds,
  type DiceRowBackdropLayout,
} from './diceRowGeometry';
import { diceRowElasticTweenProps } from './diceRowElasticTween';

const BACKDROP_DEPTH = 8;

export class DiceRowBackdrop {
  private readonly scene: Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private current: DiceRowBackdropBounds | null = null;
  private resizeTween: Phaser.Tweens.Tween | null = null;
  private readonly animState = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scene: Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(BACKDROP_DEPTH);
    this.hide();
  }

  sync(config: DiceRowBackdropLayout, immediate = false): void {
    if (config.diceCount <= 0) {
      this.hide();
      return;
    }

    const target = computeDiceRowBackdropBounds(config);
    this.gfx.setVisible(true);

    if (!this.current || immediate) {
      this.stopTween();
      this.current = { ...target };
      this.draw(this.current);
      return;
    }

    if (
      this.current.x === target.x &&
      this.current.y === target.y &&
      this.current.width === target.width &&
      this.current.height === target.height
    ) {
      return;
    }

    this.stopTween();
    this.animState.x = this.current.x;
    this.animState.y = this.current.y;
    this.animState.width = this.current.width;
    this.animState.height = this.current.height;

    this.resizeTween = this.scene.tweens.add({
      targets: this.animState,
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      ...diceRowElasticTweenProps(),
      onUpdate: () => {
        const bounds: DiceRowBackdropBounds = {
          x: this.animState.x,
          y: this.animState.y,
          width: this.animState.width,
          height: this.animState.height,
        };
        this.current = bounds;
        this.draw(bounds);
      },
      onComplete: () => {
        this.current = { ...target };
        this.draw(target);
        this.resizeTween = null;
      },
    });
  }

  hide(): void {
    this.stopTween();
    this.current = null;
    this.gfx.clear();
    this.gfx.setVisible(false);
  }

  destroy(): void {
    this.stopTween();
    this.gfx.destroy();
  }

  private stopTween(): void {
    this.resizeTween?.stop();
    this.resizeTween = null;
  }

  private draw(bounds: DiceRowBackdropBounds): void {
    this.gfx.clear();
    this.gfx.fillStyle(COLORS.BG_PRIMARY, 0.6);
    this.gfx.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, UI.DICE_ROW_BACKDROP_RADIUS);
    this.gfx.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    this.gfx.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, UI.DICE_ROW_BACKDROP_RADIUS);
  }
}
