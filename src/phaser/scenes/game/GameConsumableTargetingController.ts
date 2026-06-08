// ─── Consumable dice-targeting UI (SELECT/ROLL phase inline selection) ───

import * as Phaser from 'phaser';
import type { Scene } from 'phaser';
import type { DiceSelectionConfig } from '../../../game/facade/diceSelection';
import { gameFacade } from '../../../game/facade';
import { getTargetableDieIds } from '../../../game/facade/consumable';
import { formatTargetingInstruction } from '../../../game/consumables/formatTargetingInstruction';
import { selectHandDice, selectRolledDice, selectRoundPhase } from '../../../game/store/selectors/roundSelectors';
import { DiceSprite } from '../../ui/DiceSprite';

export type GameConsumableTargetingDeps = {
  scene: Scene;
  getInstructionText: () => Phaser.GameObjects.Text;
  getRollSprites: () => DiceSprite[];
  getPlayAreaSprites: () => DiceSprite[];
  restorePhaseUi: () => void;
  repositionRollRow: (animated: boolean, duration?: number, elasticLift?: boolean) => void;
  repositionPlayArea: (animated: boolean, duration?: number, elasticLift?: boolean) => void;
  setPlayAreaTargetingInteractive: (enabled: boolean) => void;
  onSelectionChange: () => void;
};

export class GameConsumableTargetingController {
  private uiActive = false;
  private savedInstructionText = '';

  constructor(private readonly deps: GameConsumableTargetingDeps) {}

  isActive(): boolean {
    return gameFacade.consumable.targeting.active() !== null;
  }

  isTargetDie(sprite: DiceSprite): boolean {
    const session = gameFacade.consumable.targeting.active();
    if (!session) return false;
    return session.selectedDieIds.includes(sprite.dieData.id);
  }

  getVisibleDiceIds(): string[] {
    const session = gameFacade.consumable.targeting.active();
    if (session) return getTargetableDieIds(session);
    return this.getFallbackVisibleDieIds();
  }

  enter(_config: DiceSelectionConfig): void {
    this.uiActive = true;
    if (selectRoundPhase() === 'SELECT') {
      this.deps.setPlayAreaTargetingInteractive(true);
    }

    this.savedInstructionText = this.deps.getInstructionText().text;

    this.updateInstructionText();
    this.repositionTargets(true, 150);
    this.deps.onSelectionChange();
  }

  onTargetClick(sprite: DiceSprite): void {
    if (!gameFacade.consumable.targeting.active()) return;

    const result = gameFacade.consumable.targeting.toggleDie(sprite.dieData.id);
    if (!result.ok) return;

    if (this.isTargetDie(sprite)) {
      this.deps.scene.sound.play('sfx_highlight1', { volume: 0.3 });
    } else {
      this.deps.scene.sound.play('sfx_card_slide2', { volume: 0.25 });
    }

    this.repositionTargets(true);
    this.updateInstructionText();
    this.deps.onSelectionChange();
  }

  cancel(): void {
    gameFacade.consumable.targeting.cancel();
    if (this.uiActive) {
      this.exit();
    }
  }

  complete(): void {
    if (this.uiActive) {
      this.exit();
    }
  }

  private exit(): void {
    this.uiActive = false;
    for (const sprite of this.getTargetableSprites()) {
      sprite.setSelected(false);
    }

    this.deps.getInstructionText().setText(this.savedInstructionText);

    if (this.deps.getRollSprites().length > 0) {
      this.deps.repositionRollRow(true, 150, true);
    } else if (this.deps.getPlayAreaSprites().length > 0) {
      this.deps.repositionPlayArea(true, 150, true);
    }

    this.deps.restorePhaseUi();
  }

  private repositionTargets(animated: boolean, duration = 200): void {
    const phase = selectRoundPhase();
    if (phase === 'ROLL' && this.deps.getRollSprites().length > 0) {
      this.deps.repositionRollRow(animated, duration);
    } else if (phase === 'SELECT' && this.deps.getPlayAreaSprites().length > 0) {
      this.deps.repositionPlayArea(animated, duration);
    }
  }

  private getTargetableSprites(): DiceSprite[] {
    const targetableIds = new Set(this.getVisibleDiceIds());
    const rollSprites = this.deps.getRollSprites();
    const playAreaSprites = this.deps.getPlayAreaSprites();

    if (rollSprites.length > 0) {
      return rollSprites.filter((sprite) => targetableIds.has(sprite.dieData.id));
    }
    return playAreaSprites.filter((sprite) => targetableIds.has(sprite.dieData.id));
  }

  private getFallbackVisibleDieIds(): string[] {
    const phase = selectRoundPhase();
    if (phase === 'ROLL') return selectRolledDice().map((d) => d.id);
    if (phase === 'SELECT') return selectHandDice().map((d) => d.id);
    return [];
  }

  private updateInstructionText(): void {
    const snap = gameFacade.consumable.targeting.snapshot();
    if (!snap.active) return;

    this.deps.getInstructionText().setText(formatTargetingInstruction(snap));
  }
}
