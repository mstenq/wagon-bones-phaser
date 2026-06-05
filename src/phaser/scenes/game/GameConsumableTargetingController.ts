// ─── Consumable dice-targeting UI (SELECT/ROLL phase inline selection) ───

import * as Phaser from 'phaser';
import type { Scene } from 'phaser';
import type { DiceSelectionConfig } from '../../../game/facade/diceSelection';
import {
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
} from '../../../game/facade/diceSelection';
import { selectHandDice, selectRolledDice, selectRoundPhase } from '../../../game/store/selectors/roundSelectors';
import type { Die } from '../../../game/types';
import { Button } from '../../ui/Button';
import { DiceSprite } from '../../ui/DiceSprite';

export type GameConsumableTargetingDeps = {
  scene: Scene;
  getContentCenterX: () => number;
  getInstructionText: () => Phaser.GameObjects.Text;
  getRollSprites: () => DiceSprite[];
  getPlayAreaSprites: () => DiceSprite[];
  hideAllButtons: () => void;
  restorePhaseUi: () => void;
  syncRollDieVisuals: () => void;
  repositionRollRow: (animated: boolean, duration?: number) => void;
  repositionPlayArea: (animated: boolean, duration?: number) => void;
  setPlayAreaTargetingInteractive: (enabled: boolean) => void;
  getSelectedDiceIds: () => Set<string>;
  setSelectedDiceIds: (ids: Set<string>) => void;
  getRerollLockedDiceIds: () => Set<string>;
  setRerollLockedDiceIds: (ids: Set<string>) => void;
  onApply: (config: DiceSelectionConfig, selectedDice: Die[]) => void | Promise<void>;
};

export class GameConsumableTargetingController {
  private config: DiceSelectionConfig | null = null;
  private targetIds = new Set<string>();
  private confirmBtn: Button | null = null;
  private cancelBtn: Button | null = null;
  private savedInstructionText = '';
  private savedSelectedDiceIds = new Set<string>();
  private savedRerollLockedDiceIds = new Set<string>();

  constructor(private readonly deps: GameConsumableTargetingDeps) {}

  isActive(): boolean {
    return this.config !== null;
  }

  isTargetDie(sprite: DiceSprite): boolean {
    return this.config !== null && this.targetIds.has(sprite.dieData.id);
  }

  getVisibleDiceIds(): string[] {
    return this.getTargetableDice().dice.map((d) => d.id);
  }

  enter(config: DiceSelectionConfig): void {
    this.config = config;
    this.targetIds = new Set();

    if (selectRoundPhase() === 'SELECT') {
      this.deps.setPlayAreaTargetingInteractive(true);
    }

    this.savedInstructionText = this.deps.getInstructionText().text;
    this.savedSelectedDiceIds = new Set(this.deps.getSelectedDiceIds());
    this.savedRerollLockedDiceIds = new Set(this.deps.getRerollLockedDiceIds());

    this.deps.setSelectedDiceIds(new Set());
    this.deps.setRerollLockedDiceIds(new Set());
    this.deps.syncRollDieVisuals();
    this.deps.repositionRollRow(true, 150);

    this.deps.hideAllButtons();
    this.createTargetingButtons(config);

    for (const sprite of this.getTargetableDice().sprites) {
      sprite.setSelected(false);
    }

    this.updateInstructionText();
  }

  onTargetClick(sprite: DiceSprite): void {
    if (!this.config) return;
    const id = sprite.dieData.id;
    const max = getDiceSelectionMaxPicks(this.config);

    if (this.targetIds.has(id)) {
      this.targetIds.delete(id);
      this.deps.scene.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.targetIds.size < max) {
      this.targetIds.add(id);
      this.deps.scene.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    this.repositionTargets(true);

    const enough = isDiceSelectionReady(this.config, this.targetIds.size);
    if (this.confirmBtn) this.confirmBtn.setEnabled(enough);
    if (this.config.effectType === 'BUMP_VALUE' && this.cancelBtn) {
      this.cancelBtn.setEnabled(enough);
    }
    this.updateInstructionText();
  }

  cancel(): void {
    this.exit();
  }

  private createTargetingButtons(config: DiceSelectionConfig): void {
    const btnY = this.deps.scene.scale.height - 30;
    const cx = this.deps.getContentCenterX();

    if (config.effectType === 'BUMP_VALUE') {
      this.confirmBtn = new Button(this.deps.scene, cx - 70, btnY, '+1 Up', 120, 40);
      this.confirmBtn.setEnabled(false);
      this.confirmBtn.onClick(() => {
        config.effectParams.bumpDirection = 'up';
        void this.apply();
      });

      this.cancelBtn = new Button(this.deps.scene, cx + 70, btnY, '-1 Down', 120, 40);
      this.cancelBtn.onClick(() => {
        config.effectParams.bumpDirection = 'down';
        void this.apply();
      });
      this.cancelBtn.setEnabled(false);
      return;
    }

    this.confirmBtn = new Button(this.deps.scene, cx - 80, btnY, 'Apply', 140, 40);
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.onClick(() => void this.apply());

    this.cancelBtn = new Button(this.deps.scene, cx + 80, btnY, 'Cancel', 120, 40);
    this.cancelBtn.onClick(() => this.cancel());
  }

  private async apply(): Promise<void> {
    if (!this.config) return;
    if (!isDiceSelectionReady(this.config, this.targetIds.size)) return;

    const { dice } = this.getTargetableDice();
    const selectedDice = dice.filter((d) => this.targetIds.has(d.id));
    const config = this.config;

    this.exit();
    await this.deps.onApply(config, selectedDice);
  }

  private exit(): void {
    if (this.confirmBtn) {
      this.confirmBtn.destroy();
      this.confirmBtn = null;
    }
    if (this.cancelBtn) {
      this.cancelBtn.destroy();
      this.cancelBtn = null;
    }

    const { sprites } = this.getTargetableDice();
    for (const sprite of sprites) {
      sprite.setSelected(false);
    }

    this.config = null;
    this.targetIds.clear();

    this.deps.setSelectedDiceIds(new Set(this.savedSelectedDiceIds));
    this.deps.setRerollLockedDiceIds(new Set(this.savedRerollLockedDiceIds));
    this.deps.syncRollDieVisuals();
    this.deps.getInstructionText().setText(this.savedInstructionText);

    if (this.deps.getRollSprites().length > 0) {
      this.deps.repositionRollRow(true, 150);
    } else if (this.deps.getPlayAreaSprites().length > 0) {
      this.deps.repositionPlayArea(true, 150);
    }

    this.deps.restorePhaseUi();
  }

  private repositionTargets(animated: boolean, duration = 200): void {
    if (!this.config) return;

    const phase = selectRoundPhase();
    if (phase === 'ROLL' && this.deps.getRollSprites().length > 0) {
      this.deps.repositionRollRow(animated, duration);
    } else if (phase === 'SELECT' && this.deps.getPlayAreaSprites().length > 0) {
      this.deps.repositionPlayArea(animated, duration);
    }
  }

  private getTargetableDice(): { sprites: DiceSprite[]; dice: Die[] } {
    const phase = selectRoundPhase();
    const rollSprites = this.deps.getRollSprites();
    const playAreaSprites = this.deps.getPlayAreaSprites();

    if (phase === 'ROLL' && rollSprites.length > 0) {
      return { sprites: rollSprites, dice: selectRolledDice() };
    }
    if (phase === 'SELECT' && playAreaSprites.length > 0) {
      return { sprites: playAreaSprites, dice: selectHandDice() };
    }
    if (rollSprites.length > 0) {
      return { sprites: rollSprites, dice: selectRolledDice() };
    }
    return { sprites: [], dice: [] };
  }

  private updateInstructionText(): void {
    if (!this.config) return;
    const config = this.config;
    const min = getDiceSelectionMinPicks(config);
    const max = getDiceSelectionMaxPicks(config);
    const selected = this.targetIds.size;
    const name = config.cardName || 'Effect';
    const text = this.deps.getInstructionText();

    if (selected < min) {
      const need = min - selected;
      if (min === max) {
        text.setText(`${name}: Select ${need} more dice`);
      } else {
        text.setText(`${name}: Select at least ${need} more (up to ${max})`);
      }
    } else if (selected < max) {
      text.setText(`${name}: Ready! Pick another die or click Apply`);
    } else {
      text.setText(`${name}: Ready! Click Apply`);
    }
  }
}
