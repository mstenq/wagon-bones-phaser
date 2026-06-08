// ─── Consumable dice-targeting commit (No Phaser imports) ───

import {
  executeConsumableEffect,
  getConsumableDefById,
  trackConsumableUse,
  type ConsumableEffectContext,
  type ConsumableInstance,
  type UseConsumableResult,
} from '../ConsumablesSystem';
import { applyDiceSelectionEffect, type DiceSelectionConfig, type DiceSelectionResult } from '../DiceSelectionSystem';
import { selectHandDice, selectRolledDice } from '../store/selectors/roundSelectors';
import { consumableActions } from '../store/actions/consumableActions';
import { applyCopyAfterSelection, selectPackLineupDice, syncPackLineupAfterSelection } from '../visibleDiceRow';
import type { Die } from '../types';
import type { ConsumableTargetingCommit } from './consumableTargetingSession';

export type ConsumableTargetSurface = 'game' | 'pack_lineup';

export type ApplyConsumableTargetingResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      config: DiceSelectionConfig;
      diceResult: DiceSelectionResult;
      selectedDice: Die[];
      consumed?: ConsumableInstance;
      useResult?: UseConsumableResult;
    };

export type ApplyConsumableTargetingOptions = {
  surface: ConsumableTargetSurface;
  effectContext?: ConsumableEffectContext;
};

function withBumpDirection(
  config: DiceSelectionConfig,
  bumpDirection: ConsumableTargetingCommit['bumpDirection'],
): DiceSelectionConfig {
  const next: DiceSelectionConfig = {
    ...config,
    effectParams: { ...config.effectParams },
  };
  if (bumpDirection) {
    next.effectParams.bumpDirection = bumpDirection;
  }
  return next;
}

function selectGameDice(commit: ConsumableTargetingCommit): Die[] {
  const context = commit.useContext;
  if (context.scene !== 'game') return [];
  const pool = context.phase === 'ROLL' ? selectRolledDice() : selectHandDice();
  return pool.filter((die) => commit.selectedDieIds.includes(die.id));
}

function selectPackDice(commit: ConsumableTargetingCommit): Die[] {
  return selectPackLineupDice().filter((die) => commit.selectedDieIds.includes(die.id));
}

function applyToSurface(
  surface: ConsumableTargetSurface,
  config: DiceSelectionConfig,
  selectedDice: Die[],
): DiceSelectionResult {
  const result = applyDiceSelectionEffect(config, selectedDice);
  if (surface === 'pack_lineup') {
    syncPackLineupAfterSelection(result, selectedDice);
    return result;
  }
  if (config.effectType === 'COPY' && result.addedDice && result.addedDice.length > 0) {
    applyCopyAfterSelection(result, selectedDice[0]);
  }
  return result;
}

function resolveSelectedDice(surface: ConsumableTargetSurface, commit: ConsumableTargetingCommit): Die[] {
  if (surface === 'pack_lineup') {
    return selectPackDice(commit);
  }
  return selectGameDice(commit);
}

function recordCommittedConsumableUse(
  commit: ConsumableTargetingCommit,
  effectContext: ConsumableEffectContext,
): { consumed?: ConsumableInstance; useResult?: UseConsumableResult; reason?: string } {
  if (commit.source.kind === 'bar') {
    const consumed = consumableActions.useConsumable(commit.source.consumableIndex);
    if (!consumed) {
      return { reason: 'Could not use consumable' };
    }
    return {
      consumed,
      useResult: executeConsumableEffect(consumed, effectContext),
    };
  }

  if (commit.source.kind === 'pack_card') {
    const def = getConsumableDefById(commit.source.defId);
    if (def) {
      trackConsumableUse(def);
    }
  }
  return {};
}

export function applyConsumableTargetingCommit(
  commit: ConsumableTargetingCommit,
  options: ApplyConsumableTargetingOptions,
): ApplyConsumableTargetingResult {
  const selectedDice = resolveSelectedDice(options.surface, commit);
  if (selectedDice.length !== commit.selectedDieIds.length) {
    return { ok: false, reason: 'Selected dice are no longer available' };
  }

  const config = withBumpDirection(commit.diceSelection, commit.bumpDirection);
  const diceResult = applyToSurface(options.surface, config, selectedDice);

  const usage = recordCommittedConsumableUse(commit, options.effectContext ?? {});
  if (usage.reason) {
    return { ok: false, reason: usage.reason };
  }

  return {
    ok: true,
    config,
    diceResult,
    selectedDice,
    consumed: usage.consumed,
    useResult: usage.useResult,
  };
}
