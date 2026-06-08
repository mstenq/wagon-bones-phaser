// ─── Pouch consumable dice-targeting during booster pack (lineup above cards) ───

import type { Scene } from 'phaser';
import type { DiceSelectionConfig } from '../../../game/facade/diceSelection';
import { getDiceSelectionMinPicks, isDiceSelectionReady } from '../../../game/facade/diceSelection';
import type { Die } from '../../../game/types';
import { Button } from '../../ui/Button';

export type BoosterPackDiceTargetingDeps = {
  scene: Scene;
  getContentCenterX: () => number;
  getContentBottom: () => number;
  getSelectedDiceIds: () => Set<string>;
  clearSelectedDiceIds: () => void;
  clearLineupSelections: () => void;
  setLineupInteractive: (enabled: boolean) => void;
  dismissActiveTab: () => void;
  updateInstructionText: () => void;
  getLineupDice: () => Die[];
  onApply: (config: DiceSelectionConfig, selectedDice: Die[]) => void;
};

export class BoosterPackDiceTargetingController {
  private config: DiceSelectionConfig | null = null;
  private applyBtn: Button | null = null;
  private cancelBtn: Button | null = null;

  constructor(private readonly deps: BoosterPackDiceTargetingDeps) {}

  getConfig(): DiceSelectionConfig | null {
    return this.config;
  }

  isActive(): boolean {
    return this.config !== null;
  }

  isTargetingPending(selectedCount: number): boolean {
    if (!this.config) return false;
    return selectedCount < getDiceSelectionMinPicks(this.config);
  }

  enter(config: DiceSelectionConfig, options?: { keepSelection?: boolean }): void {
    this.deps.dismissActiveTab();
    this.config = config;
    if (!options?.keepSelection) {
      this.deps.clearSelectedDiceIds();
      this.deps.clearLineupSelections();
    }
    this.deps.setLineupInteractive(true);
    this.createButtons();
    this.deps.updateInstructionText();
    this.updateApplyEnabled();
  }

  exit(): void {
    this.destroyButtons();
    this.config = null;
    this.deps.clearSelectedDiceIds();
    this.deps.clearLineupSelections();
    this.deps.setLineupInteractive(false);
    this.deps.updateInstructionText();
  }

  updateApplyEnabled(): void {
    if (!this.config || !this.applyBtn) return;
    this.applyBtn.setEnabled(isDiceSelectionReady(this.config, this.deps.getSelectedDiceIds().size));
  }

  private createButtons(): void {
    this.destroyButtons();
    const btnY = this.deps.getContentBottom() - 24;
    const cx = this.deps.getContentCenterX();

    this.applyBtn = new Button(this.deps.scene, cx - 80, btnY, 'Apply', 140, 40);
    this.applyBtn.setEnabled(false);
    this.applyBtn.onClick(() => this.apply());

    this.cancelBtn = new Button(this.deps.scene, cx + 80, btnY, 'Cancel', 120, 40);
    this.cancelBtn.onClick(() => this.exit());
  }

  private destroyButtons(): void {
    this.applyBtn?.destroy();
    this.applyBtn = null;
    this.cancelBtn?.destroy();
    this.cancelBtn = null;
  }

  private apply(): void {
    if (!this.config || !isDiceSelectionReady(this.config, this.deps.getSelectedDiceIds().size)) return;

    const selectedDice = this.deps.getLineupDice().filter((die) => this.deps.getSelectedDiceIds().has(die.id));
    const config = this.config;
    this.exit();
    this.deps.onApply(config, selectedDice);
  }
}
