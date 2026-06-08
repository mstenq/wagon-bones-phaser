// ─── Headless consumable targeting flows (No Phaser imports) ───
// Mirrors ConsumableBarTargetingBridge + BoosterPackScene pack-card orchestration.
// Used by integration tests and (after refactor) by Phaser bridges/scenes.

import type { DiceSelectionConfig } from '../DiceSelectionSystem';
import { getDiceSelectionMaxPicks, isDiceSelectionReady } from '../DiceSelectionSystem';
import { resolveConsumableList } from '../store/resolve';
import type { ConsumableEffectContext } from '../ConsumablesSystem';
import type { ConsumableEligibilityContext } from './consumableTypes';
import {
  applyConsumableTargetingCommit,
  type ApplyConsumableTargetingResult,
  type ConsumableTargetSurface,
} from './applyConsumableTargeting';
import {
  beginConsumableTargeting,
  cancelConsumableTargeting,
  commitConsumableTargeting,
  getActiveConsumableTargeting,
  getConsumableTargetingSnapshot,
  setBumpDirection,
  toggleTargetDie,
  type ConsumableTargetingSource,
} from './consumableTargetingSession';
import { getPackLineupSelectedDieIds, setPackLineupSelectedDieIds } from './packLineupSelection';

export type ConsumableFlowStep =
  | { action: 'set_seed'; dieIds: string[] }
  | { action: 'preselect_pack'; dieIds: string[] }
  | { action: 'arm_bar'; consumableIndex: number }
  | { action: 'arm_pack_card'; cardIndex: number; defId: string; diceSelection: DiceSelectionConfig }
  | { action: 'toggle'; dieId: string }
  | { action: 'bump'; direction: 'up' | 'down' }
  | { action: 'commit' }
  | { action: 'cancel' };

export type ConsumableFlowOptions = {
  eligibilityContext: ConsumableEligibilityContext;
  surface: ConsumableTargetSurface;
  effectContext?: ConsumableEffectContext;
  /** Seed die ids for the next `arm_bar` (game pre-pick). Overwritten by `set_seed`. */
  seedDieIds?: string[];
};

export type ConsumableFlowPhase = 'idle' | 'armed' | 'auto_committed' | 'committed' | 'cancelled' | 'failed';

export type ConsumableFlowResult = {
  ok: boolean;
  phase: ConsumableFlowPhase;
  reason?: string;
  applied?: Extract<ApplyConsumableTargetingResult, { ok: true }>;
  autoCommitted?: boolean;
};

function fail(phase: ConsumableFlowPhase, reason: string): ConsumableFlowResult {
  return { ok: false, phase, reason };
}

/** Bar arm — mirrors ConsumableBarTargetingBridge.arm (without Phaser deferrals). */
export function armBarConsumableTargeting(
  consumableIndex: number,
  options: ConsumableFlowOptions,
  seedDieIds: string[],
): ConsumableFlowResult {
  const consumable = resolveConsumableList()[consumableIndex];
  if (!consumable) {
    return fail('failed', 'Consumable not found');
  }

  const def = consumable.def;
  if (!def.diceSelection) {
    return fail('failed', 'Consumable has no dice selection');
  }

  const maxPicks = getDiceSelectionMaxPicks(def.diceSelection);
  if (seedDieIds.length > maxPicks) {
    return fail('failed', `Select at most ${maxPicks} dice`);
  }

  cancelConsumableTargeting();

  const beginResult = beginConsumableTargeting(
    { kind: 'bar', consumableIndex, defId: def.id },
    options.eligibilityContext,
    def.diceSelection,
  );
  if (!beginResult.ok) {
    return fail('failed', beginResult.reason);
  }

  for (const dieId of seedDieIds) {
    toggleTargetDie(dieId);
  }

  const snapshot = getConsumableTargetingSnapshot();
  if (!snapshot.needsBumpDirection && snapshot.ready) {
    const committed = commitBarConsumableTargeting(consumableIndex, options);
    if (!committed.ok) return committed;
    return { ok: true, phase: 'auto_committed', autoCommitted: true, applied: committed.applied };
  }

  return { ok: true, phase: 'armed' };
}

/** Pack card arm — mirrors BoosterPackScene.beginPackCardTargeting. */
export function armPackCardTargeting(
  cardIndex: number,
  defId: string,
  diceSelection: DiceSelectionConfig,
  options: ConsumableFlowOptions,
): ConsumableFlowResult {
  const existing = getActiveConsumableTargeting();
  if (existing?.source.kind === 'pack_card' && existing.source.cardIndex === cardIndex) {
    return { ok: true, phase: 'armed' };
  }

  cancelConsumableTargeting();

  const seedIds = getPackLineupSelectedDieIds();
  const begin = beginConsumableTargeting(
    { kind: 'pack_card', cardIndex, defId },
    options.eligibilityContext,
    diceSelection,
  );
  if (!begin.ok) {
    return fail('failed', begin.reason);
  }

  for (const dieId of seedIds) {
    toggleTargetDie(dieId);
  }

  return { ok: true, phase: 'armed' };
}

/** Commit + apply — mirrors bridge commit and BoosterPackScene.onUsePackDiceCard tail. */
export function commitConsumableTargetingFlow(
  options: ConsumableFlowOptions,
  bumpDirection?: 'up' | 'down',
): ConsumableFlowResult {
  if (bumpDirection) {
    const bumpResult = setBumpDirection(bumpDirection);
    if (!bumpResult.ok) {
      return fail('failed', bumpResult.reason);
    }
  }

  const commitResult = commitConsumableTargeting();
  if (!commitResult.ok) {
    return fail('armed', commitResult.reason);
  }

  const applied = applyConsumableTargetingCommit(commitResult.commit, {
    surface: options.surface,
    effectContext: options.effectContext,
  });
  if (!applied.ok) {
    return fail('failed', applied.reason);
  }

  return { ok: true, phase: 'committed', applied };
}

function commitBarConsumableTargeting(
  consumableIndex: number,
  options: ConsumableFlowOptions,
  bumpDirection?: 'up' | 'down',
): ConsumableFlowResult {
  const session = getActiveConsumableTargeting();
  if (!session || session.source.kind !== 'bar' || session.source.consumableIndex !== consumableIndex) {
    return fail('failed', 'No matching bar targeting session');
  }
  return commitConsumableTargetingFlow(options, bumpDirection);
}

export function runConsumableFlow(steps: ConsumableFlowStep[], options: ConsumableFlowOptions): ConsumableFlowResult {
  let seedDieIds = [...(options.seedDieIds ?? [])];
  let lastResult: ConsumableFlowResult = { ok: true, phase: 'idle' };

  for (const step of steps) {
    if (step.action === 'set_seed') {
      seedDieIds = [...step.dieIds];
      continue;
    }

    if (step.action === 'preselect_pack') {
      setPackLineupSelectedDieIds(step.dieIds);
      continue;
    }

    if (step.action === 'arm_bar') {
      let seeds = seedDieIds;
      if (seeds.length === 0 && options.eligibilityContext.scene === 'booster_pack') {
        seeds = getPackLineupSelectedDieIds();
      }
      lastResult = armBarConsumableTargeting(step.consumableIndex, options, seeds);
      if (!lastResult.ok) return lastResult;
      if (lastResult.autoCommitted) return lastResult;
      continue;
    }

    if (step.action === 'arm_pack_card') {
      lastResult = armPackCardTargeting(step.cardIndex, step.defId, step.diceSelection, options);
      if (!lastResult.ok) return lastResult;
      continue;
    }

    if (step.action === 'toggle') {
      const toggleResult = toggleTargetDie(step.dieId);
      if (!toggleResult.ok) {
        return fail('armed', toggleResult.reason);
      }
      continue;
    }

    if (step.action === 'bump') {
      const bumpResult = setBumpDirection(step.direction);
      if (!bumpResult.ok) {
        return fail('armed', bumpResult.reason);
      }
      continue;
    }

    if (step.action === 'commit') {
      lastResult = commitConsumableTargetingFlow(options);
      if (!lastResult.ok) return lastResult;
      continue;
    }

    if (step.action === 'cancel') {
      cancelConsumableTargeting();
      lastResult = { ok: true, phase: 'cancelled' };
    }
  }

  return lastResult;
}

export function getActiveTargetingSource(): ConsumableTargetingSource | null {
  return getActiveConsumableTargeting()?.source ?? null;
}

export function isBarTargetingReady(consumableIndex: number): boolean {
  const session = getActiveConsumableTargeting();
  if (!session || session.source.kind !== 'bar' || session.source.consumableIndex !== consumableIndex) {
    return false;
  }
  if (!session.diceSelection) return false;
  return isDiceSelectionReady(session.diceSelection, session.selectedDieIds.length);
}
