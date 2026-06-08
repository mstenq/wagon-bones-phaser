// ─── Shared consumable-bar targeting orchestration (Game + BoosterPack) ───

import {
  armBarConsumableTargeting,
  commitConsumableTargetingFlow,
} from '../../../game/consumables/consumableFlowHarness';
import type {
  ApplyConsumableTargetingResult,
  ConsumableEffectContext,
  ConsumableEligibilityContext,
  ConsumableInstance,
  ConsumableTargetSurface,
} from '../../../game/facade/consumable';
import { isDiceSelectionReady } from '../../../game/facade/diceSelection';
import { gameFacade } from '../../../game/facade';
import type {
  ConsumableBar,
  ConsumableBarTargetingState,
  ConsumableTargetingCommitRequest,
} from '../../ui/ConsumableBar';

export type ConsumableBarTargetingBridgeCallbacks = {
  surface: ConsumableTargetSurface;
  getEligibilityContext: () => ConsumableEligibilityContext;
  getEffectContext?: () => ConsumableEffectContext;
  seedDieIds: () => string[];
  onArmEnter?: () => void;
  onApplySuccess: (result: Extract<ApplyConsumableTargetingResult, { ok: true }>) => void | Promise<void>;
  onFailure: (message: string) => void;
};

export class ConsumableBarTargetingBridge {
  constructor(private readonly callbacks: ConsumableBarTargetingBridgeCallbacks) {}

  private flowOptions() {
    return {
      eligibilityContext: this.callbacks.getEligibilityContext(),
      surface: this.callbacks.surface,
      effectContext: this.callbacks.getEffectContext?.(),
    };
  }

  getTargetingState(): ConsumableBarTargetingState {
    const session = gameFacade.consumable.targeting.active();
    const snapshot = gameFacade.consumable.targeting.snapshot();
    if (!session || session.source.kind !== 'bar') {
      return { activeIndex: null, ready: false, diceReady: false, needsBumpDirection: false };
    }
    const diceReady = session.diceSelection
      ? isDiceSelectionReady(session.diceSelection, session.selectedDieIds.length)
      : false;
    return {
      activeIndex: session.source.consumableIndex,
      ready: snapshot.ready,
      diceReady,
      needsBumpDirection: snapshot.needsBumpDirection,
    };
  }

  refreshTabs(consumableBar: ConsumableBar, defer = false): void {
    if (defer) {
      this.deferRefreshTabs(consumableBar);
      return;
    }
    const session = gameFacade.consumable.targeting.active();
    if (session?.source.kind === 'bar') {
      consumableBar.refreshTargetingTabs(session.source.consumableIndex);
    }
  }

  /** Refresh after the current pointer gesture ends (avoids tab dismiss races on USE click). */
  deferRefreshTabs(consumableBar: ConsumableBar): void {
    consumableBar.scene.time.delayedCall(0, () => {
      const session = gameFacade.consumable.targeting.active();
      if (session?.source.kind === 'bar') {
        consumableBar.refreshTargetingTabs(session.source.consumableIndex);
      }
    });
  }

  cancel(onExit?: () => void): void {
    gameFacade.consumable.targeting.cancel();
    onExit?.();
  }

  async arm(consumableBar: ConsumableBar, index: number, instance: ConsumableInstance): Promise<void> {
    const def = instance.def;
    if (!def.diceSelection) return;

    const result = armBarConsumableTargeting(index, this.flowOptions(), this.callbacks.seedDieIds());
    if (!result.ok) {
      this.callbacks.onFailure(result.reason ?? 'Could not arm consumable');
      return;
    }

    if (result.autoCommitted && result.applied) {
      await this.finishApply(consumableBar, index, result.applied);
      return;
    }

    // Defer UI refresh and enter() so pointer-up does not dismiss tabs mid-gesture.
    this.deferRefreshTabs(consumableBar);
    consumableBar.scene.time.delayedCall(0, () => {
      this.callbacks.onArmEnter?.();
      this.deferRefreshTabs(consumableBar);
    });
  }

  async commit(consumableBar: ConsumableBar, payload: ConsumableTargetingCommitRequest): Promise<void> {
    const result = commitConsumableTargetingFlow(this.flowOptions(), payload.bumpDirection);
    if (!result.ok) {
      this.callbacks.onFailure(result.reason ?? 'Could not commit targeting');
      this.deferRefreshTabs(consumableBar);
      return;
    }

    if (!result.applied) {
      this.callbacks.onFailure('Targeting commit did not apply');
      return;
    }

    await this.finishApply(consumableBar, payload.index, result.applied);
  }

  private async finishApply(
    consumableBar: ConsumableBar,
    index: number,
    applied: Extract<ApplyConsumableTargetingResult, { ok: true }>,
  ): Promise<void> {
    const card = consumableBar.getCardAt(index);
    if (card) {
      consumableBar.playUseSuccessAnimation(card);
    }

    await this.callbacks.onApplySuccess(applied);
  }
}
