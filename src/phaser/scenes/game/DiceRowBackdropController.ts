// ─── Phase-aware dice row backdrop sync (keeps GameScene wiring-only) ───

import type { Scene } from 'phaser';
import { selectRoundPhase } from '../../../game/store/selectors/roundSelectors';
import type { DiceSprite } from '../../ui/DiceSprite';
import { DiceRowBackdrop } from './DiceRowBackdrop';

export type DiceRowBackdropControllerDeps = {
  getRollSprites: () => DiceSprite[];
  getPlayAreaSprites: () => DiceSprite[];
  getSelectedDiceIds: () => Set<string>;
  isConsumableTargeting: () => boolean;
  isConsumableTargetDie: (sprite: DiceSprite) => boolean;
  getRollRowY: () => number;
  getScoreRowY: () => number;
  getDiceSpacing: (count: number) => number;
  getDiceScale: () => number;
  getContentCenterX: () => number;
};

export class DiceRowBackdropController {
  private backdrop: DiceRowBackdrop | null = null;
  private scoreLayoutAnimating = false;

  constructor(private readonly deps: DiceRowBackdropControllerDeps) {}

  rebuild(scene: Scene): void {
    this.backdrop?.destroy();
    this.backdrop = new DiceRowBackdrop(scene);
    this.sync();
  }

  sync(): void {
    if (!this.backdrop) return;

    const phase = selectRoundPhase();
    const sprites = this.getActiveSprites(phase);
    const diceCount = sprites.length;

    if (diceCount === 0) {
      this.backdrop.hide();
      return;
    }

    const hasLiftedDice = this.hasLiftedSelection(sprites, phase);
    const capScoreRow = (phase === 'SCORE' || phase === 'DAY_END') && !this.scoreLayoutAnimating;

    this.backdrop.sync({
      rowY: this.deps.getRollRowY(),
      diceCount,
      diceSpacing: this.deps.getDiceSpacing(diceCount),
      diceScale: this.deps.getDiceScale(),
      contentCenterX: this.deps.getContentCenterX(),
      hasLiftedDice,
      scoreRowY: capScoreRow ? this.deps.getScoreRowY() : undefined,
    });
  }

  onScoreLayoutStart(): void {
    this.scoreLayoutAnimating = true;
    this.sync();
  }

  onScoreLayoutEnd(): void {
    this.scoreLayoutAnimating = false;
    this.sync();
  }

  reset(): void {
    this.scoreLayoutAnimating = false;
    this.backdrop?.hide();
  }

  destroy(): void {
    this.backdrop?.destroy();
    this.backdrop = null;
  }

  private getActiveSprites(phase: ReturnType<typeof selectRoundPhase>): DiceSprite[] {
    if (phase === 'SELECT') {
      return this.deps.getPlayAreaSprites();
    }
    if (phase === 'SCORE' || phase === 'DAY_END') {
      const rollSprites = this.deps.getRollSprites();
      if (this.scoreLayoutAnimating) {
        return rollSprites;
      }
      const selected = this.deps.getSelectedDiceIds();
      return rollSprites.filter((sprite) => !selected.has(sprite.dieData.id));
    }
    return this.deps.getRollSprites();
  }

  private hasLiftedSelection(sprites: DiceSprite[], phase: ReturnType<typeof selectRoundPhase>): boolean {
    if (this.scoreLayoutAnimating) {
      const selected = this.deps.getSelectedDiceIds();
      return sprites.some((sprite) => selected.has(sprite.dieData.id));
    }
    if (phase === 'ROLL') {
      return this.deps.getSelectedDiceIds().size > 0;
    }
    if (phase === 'SELECT' && this.deps.isConsumableTargeting()) {
      return sprites.some((sprite) => this.deps.isConsumableTargetDie(sprite));
    }
    return false;
  }
}
