// ─── Score-phase dice row layout tweens ───

import type { Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import { getScoreAnimTimings } from '../../../game/ScoreAnimTimings';
import type { ScoreResult } from '../../../game/types';
import type { DiceSprite } from '../../ui/DiceSprite';
import { getArcOffset, getRowXPositions } from './diceRowGeometry';

export type ScoreRowLayoutDeps = {
  scene: Scene;
  contentCenterX: () => number;
  getRollRowY: () => number;
  getScoreRowY: () => number;
  getDiceSpacing: (count: number) => number;
  getDiceScale: () => number;
  onLayoutTransitionStart?: () => void;
  onLayoutTransitionEnd?: () => void;
};

export type ScoreLayoutGate = { promise: Promise<void>; release: () => void };

export class ScoreRowLayout {
  constructor(private readonly deps: ScoreRowLayoutDeps) {}

  static createGate(): ScoreLayoutGate {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  /** Move selected dice to score row; held dice stay in the roll row below. */
  layoutForScoring(
    result: ScoreResult,
    rollSprites: DiceSprite[],
    selectedDiceIds: Set<string>,
    onComplete: () => void,
  ): void {
    const scoringIds = new Set(result.handResult.scoringDice.map((d) => d.id));
    const selectedSprites = rollSprites.filter((s) => selectedDiceIds.has(s.dieData.id));
    const heldSprites = rollSprites.filter((s) => !selectedDiceIds.has(s.dieData.id));
    const tweenCount = selectedSprites.length + heldSprites.length;

    if (tweenCount === 0) {
      onComplete();
      return;
    }

    this.deps.onLayoutTransitionStart?.();

    const contentCX = this.deps.contentCenterX();
    const scale = this.deps.getDiceScale();
    const scoreSpacing = this.deps.getDiceSpacing(selectedSprites.length);
    const scorePositions = getRowXPositions(selectedSprites.length, contentCX, scoreSpacing);
    const scoreY = this.deps.getScoreRowY();
    const rollY = this.deps.getRollRowY();
    let finished = 0;

    const onSpriteDone = () => {
      finished++;
      if (finished >= tweenCount) {
        this.deps.onLayoutTransitionEnd?.();
        onComplete();
      }
    };

    const layoutDuration = getScoreAnimTimings().DICE_SCORE_LAYOUT_DURATION;

    for (let i = 0; i < selectedSprites.length; i++) {
      const sprite = selectedSprites[i];
      const isScoring = scoringIds.has(sprite.dieData.id);
      sprite.setSelected(false);
      sprite.setScorePresentation(isScoring ? 'none' : 'filler');
      sprite.setDepth(isScoring ? 22 : 18);
      sprite.setScale(scale);

      this.deps.scene.tweens.add({
        targets: sprite,
        x: scorePositions[i],
        y: isScoring ? scoreY : scoreY + UI.DICE_SCORE_FILLER_DROP_Y,
        rotation: 0,
        duration: layoutDuration,
        ease: 'Power2',
        onComplete: onSpriteDone,
      });
    }

    const heldSpacing = this.deps.getDiceSpacing(heldSprites.length);
    const heldPositions = getRowXPositions(heldSprites.length, contentCX, heldSpacing);
    for (let i = 0; i < heldSprites.length; i++) {
      const sprite = heldSprites[i];
      const arc = getArcOffset(i, heldSprites.length, scale);
      sprite.setSelected(false);
      sprite.setScorePresentation('none');
      sprite.setDepth(10);
      sprite.setScale(scale);

      this.deps.scene.tweens.add({
        targets: sprite,
        x: heldPositions[i],
        y: rollY + arc.y,
        rotation: arc.rotation,
        duration: layoutDuration,
        ease: 'Power2',
        onComplete: onSpriteDone,
      });
    }
  }
}
