// ─── Phase-aware score-slot dot sync (keeps GameScene wiring-only) ───

import type { Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import { selectRoundConfig, selectRoundPhase } from '../../../game/store/selectors/roundSelectors';
import type { DiceSprite } from '../../ui/DiceSprite';
import { computeDiceRowBackdropBounds } from './diceRowGeometry';
import { DiceSelectionDots } from './DiceSelectionDots';

export type DiceSelectionDotsControllerDeps = {
  getRollSprites: () => DiceSprite[];
  getSelectedCount: () => number;
  getRollRowY: () => number;
  getDiceSpacing: (count: number) => number;
  getDiceScale: () => number;
  getContentCenterX: () => number;
};

export class DiceSelectionDotsController {
  private dots: DiceSelectionDots | null = null;

  constructor(private readonly deps: DiceSelectionDotsControllerDeps) {}

  rebuild(scene: Scene): void {
    this.dots?.destroy();
    this.dots = new DiceSelectionDots(scene);
    this.sync();
  }

  sync(layoutOnly = false): void {
    if (!this.dots) return;

    const phase = selectRoundPhase();
    const sprites = this.deps.getRollSprites();
    if (phase !== 'ROLL' || sprites.length === 0) {
      this.dots.hide();
      return;
    }

    const selectedCount = this.deps.getSelectedCount();
    const scoreSize = selectRoundConfig().scoreSize;
    const bounds = computeDiceRowBackdropBounds({
      rowY: this.deps.getRollRowY(),
      diceCount: sprites.length,
      diceSpacing: this.deps.getDiceSpacing(sprites.length),
      diceScale: this.deps.getDiceScale(),
      contentCenterX: this.deps.getContentCenterX(),
      hasLiftedDice: selectedCount > 0,
    });

    const dotY = bounds.y + bounds.height + UI.DICE_SELECTION_DOT_GAP_BELOW + UI.DICE_SELECTION_DOT_RADIUS;

    this.dots.sync({
      centerX: this.deps.getContentCenterX(),
      y: dotY,
      slotCount: scoreSize,
      filledCount: Math.min(selectedCount, scoreSize),
      overLimit: selectedCount > scoreSize,
      layoutOnly,
    });
  }

  reset(): void {
    this.dots?.hide();
  }

  destroy(): void {
    this.dots?.destroy();
    this.dots = null;
  }
}
