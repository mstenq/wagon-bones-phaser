// ─── Shared consumable-bar targeting orchestration (Game + BoosterPack) ───

import { gameFacade } from '../../../game/facade';
import type {
  ApplyConsumableTargetingResult,
  ConsumableEffectContext,
  ConsumableEligibilityContext,
  ConsumableInstance,
  ConsumableTargetSurface,
} from '../../../game/facade/consumable';
import { getDiceSelectionMaxPicks, isDiceSelectionReady } from '../../../game/facade/diceSelection';
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

    const seedIds = this.callbacks.seedDieIds();
    const maxPicks = getDiceSelectionMaxPicks(def.diceSelection);
    if (seedIds.length > maxPicks) {
      this.callbacks.onFailure(`Select at most ${maxPicks} dice`);
      return;
    }

    gameFacade.consumable.targeting.cancel();

    const beginResult = gameFacade.consumable.targeting.begin(
      { kind: 'bar', consumableIndex: index, defId: def.id },
      this.callbacks.getEligibilityContext(),
      def.diceSelection,
    );
    if (!beginResult.ok) {
      console.log('[consumable-tabs] arm begin failed', beginResult.reason);
      this.callbacks.onFailure(beginResult.reason);
      return;
    }

    for (const dieId of seedIds) {
      const toggleResult = gameFacade.consumable.targeting.toggleDie(dieId);
      if (!toggleResult.ok) {
        console.log('[consumable-tabs] seed toggle failed', dieId, toggleResult.reason);
      }
    }

    const snapshot = gameFacade.consumable.targeting.snapshot();
    console.log('[consumable-tabs] armed', {
      defId: def.id,
      seedIds,
      needsBumpDirection: snapshot.needsBumpDirection,
      ready: snapshot.ready,
      selectedCount: snapshot.selectedCount,
      diceReady: isDiceSelectionReady(def.diceSelection, snapshot.selectedCount),
    });

    if (!snapshot.needsBumpDirection && snapshot.ready) {
      await this.commit(consumableBar, { index, instance });
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
    if (payload.bumpDirection) {
      gameFacade.consumable.targeting.setBumpDirection(payload.bumpDirection);
    }

    const commitResult = gameFacade.consumable.targeting.commit();
    if (!commitResult.ok) {
      this.callbacks.onFailure(commitResult.reason);
      this.deferRefreshTabs(consumableBar);
      return;
    }

    const result = gameFacade.consumable.targeting.applyCommit(commitResult.commit, {
      surface: this.callbacks.surface,
      effectContext: this.callbacks.getEffectContext?.(),
    });
    if (!result.ok) {
      this.callbacks.onFailure(result.reason);
      return;
    }

    const card = consumableBar.getCardAt(payload.index);
    if (card) {
      consumableBar.playUseSuccessAnimation(card);
    }

    await this.callbacks.onApplySuccess(result);
  }
}
