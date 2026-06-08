// ─── Shared elastic easing for dice row backdrop + select lift/drop ───

import type { Scene } from 'phaser';
import { ANIM } from '../../../game/Constants';

const DICE_ROW_ELASTIC_EASE = 'Elastic.easeOut';

export type DieRowSpriteLayout = {
  x: number;
  y: number;
  rotation: number;
};

export type DieRowSpriteTweenHooks = {
  onYUpdate?: () => void;
  onYComplete?: () => void;
};

type DieRowTweenSprite = DieRowSpriteLayout & {
  setPosition(x: number, y: number): void;
};

export function diceRowElasticTweenProps(duration = ANIM.DICE_ROW_ELASTIC_DURATION): {
  duration: number;
  ease: string;
  easeParams: [number, number];
} {
  return {
    duration,
    ease: DICE_ROW_ELASTIC_EASE,
    easeParams: ANIM.DICE_ROW_ELASTIC_EASE_PARAMS,
  };
}

/** Vertical lift/drop tween for dice selection (matches backdrop resize feel). */
export function tweenDiceSelectLiftY(
  scene: Scene,
  targets: object | object[],
  y: number,
  hooks?: DieRowSpriteTweenHooks,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets,
    y,
    ...diceRowElasticTweenProps(),
    onUpdate: hooks?.onYUpdate,
    onComplete: hooks?.onYComplete,
  });
}

/** Animate or snap a die to row layout; elastic Y uses a separate tween for the shared feel. */
export function tweenDieRowSpriteLayout(
  scene: Scene,
  sprite: DieRowTweenSprite,
  target: DieRowSpriteLayout,
  animated: boolean,
  duration: number,
  elasticY: boolean,
  hooks?: DieRowSpriteTweenHooks,
): void {
  if (!animated) {
    sprite.setPosition(target.x, target.y);
    sprite.rotation = target.rotation;
    hooks?.onYUpdate?.();
    return;
  }

  if (elasticY) {
    scene.tweens.add({
      targets: sprite,
      x: target.x,
      rotation: target.rotation,
      duration,
      ease: 'Power2',
    });
    tweenDiceSelectLiftY(scene, sprite, target.y, hooks);
    return;
  }

  scene.tweens.add({
    targets: sprite,
    x: target.x,
    y: target.y,
    rotation: target.rotation,
    duration,
    ease: 'Power2',
  });
}
