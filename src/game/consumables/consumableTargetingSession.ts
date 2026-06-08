// ─── Consumable targeting session (No Phaser imports) ───
// Logic-owned dice targeting for consumable bar and pack cards. Cards are not
// removed until commit succeeds; cancel clears the session without mutation.

import type { DiceSelectionConfig } from '../DiceSelectionSystem';
import { getDiceSelectionMaxPicks, getDiceSelectionMinPicks, isDiceSelectionReady } from '../DiceSelectionSystem';
import { sceneActions, getSceneState } from '../store/sceneStore';
import type { ConsumableEligibilityContext } from './consumableUseContext';

export type ConsumableTargetingSource =
  | { kind: 'bar'; consumableIndex: number; defId: string }
  | { kind: 'pack_card'; cardIndex: number; defId: string };

export interface ConsumableTargetingSession {
  source: ConsumableTargetingSource;
  useContext: ConsumableEligibilityContext;
  diceSelection: DiceSelectionConfig | null;
  selectedDieIds: string[];
  bumpDirection?: 'up' | 'down';
}

export interface ConsumableTargetingSnapshot {
  active: boolean;
  session: ConsumableTargetingSession | null;
  cardName: string;
  description: string;
  minPicks: number;
  maxPicks: number;
  selectedCount: number;
  ready: boolean;
  needsBumpDirection: boolean;
  bumpDirection?: 'up' | 'down';
  validationReason: string | null;
}

export interface ConsumableTargetingCommit {
  source: ConsumableTargetingSource;
  useContext: ConsumableEligibilityContext;
  diceSelection: DiceSelectionConfig;
  selectedDieIds: string[];
  bumpDirection?: 'up' | 'down';
}

export type BeginConsumableTargetingResult =
  | { ok: true; session: ConsumableTargetingSession }
  | { ok: false; reason: string };

export type CommitConsumableTargetingResult =
  | { ok: true; commit: ConsumableTargetingCommit }
  | { ok: false; reason: string };

export type ToggleTargetDieResult = { ok: true; session: ConsumableTargetingSession } | { ok: false; reason: string };

function needsBumpDirection(config: DiceSelectionConfig): boolean {
  return config.effectType === 'BUMP_VALUE';
}

export function getTargetableDieIds(session: ConsumableTargetingSession): string[] {
  const { useContext, diceSelection } = session;
  if (useContext.scene === 'game') {
    if (
      diceSelection?.effectType === 'BUMP_VALUE' &&
      useContext.isScoreActionVisible &&
      useContext.scoreableDieIds.length > 0
    ) {
      return useContext.scoreableDieIds;
    }
    return useContext.visibleDieIds;
  }
  if (useContext.scene === 'booster_pack') {
    return useContext.visibleDieIds;
  }
  return [];
}

function toggleSelectedDieIds(
  current: string[],
  dieId: string,
  config: DiceSelectionConfig,
  targetableIds: Set<string>,
): string[] {
  if (!targetableIds.has(dieId)) return current;
  if (current.includes(dieId)) {
    return current.filter((id) => id !== dieId);
  }
  const max = getDiceSelectionMaxPicks(config);
  if (current.length >= max) return current;
  return [...current, dieId];
}

export function getValidationReason(session: ConsumableTargetingSession): string | null {
  const config = session.diceSelection;
  if (!config) return 'No dice effect configured';

  const count = session.selectedDieIds.length;
  const min = getDiceSelectionMinPicks(config);
  const max = getDiceSelectionMaxPicks(config);

  if (count < min) {
    const need = min - count;
    if (min === max) return `Select ${need} more die${need === 1 ? '' : 's'}`;
    return `Select at least ${need} more (up to ${max})`;
  }
  if (count > max) return 'Too many dice selected';
  if (needsBumpDirection(config) && !session.bumpDirection) return 'Choose bump direction';
  return null;
}

export function isTargetingCommitReady(session: ConsumableTargetingSession): boolean {
  const config = session.diceSelection;
  if (!config) return false;
  if (!isDiceSelectionReady(config, session.selectedDieIds.length)) return false;
  if (needsBumpDirection(config) && !session.bumpDirection) return false;
  return true;
}

export function getActiveConsumableTargeting(): ConsumableTargetingSession | null {
  return getSceneState().consumableTargeting;
}

export function beginConsumableTargeting(
  source: ConsumableTargetingSource,
  useContext: ConsumableEligibilityContext,
  diceSelection: DiceSelectionConfig,
): BeginConsumableTargetingResult {
  if (getActiveConsumableTargeting()) {
    return { ok: false, reason: 'A consumable is already being targeted' };
  }

  const session: ConsumableTargetingSession = {
    source,
    useContext,
    diceSelection,
    selectedDieIds: [],
  };
  sceneActions.setConsumableTargeting(session);
  return { ok: true, session };
}

export function toggleTargetDie(dieId: string): ToggleTargetDieResult {
  const session = getActiveConsumableTargeting();
  if (!session) return { ok: false, reason: 'No active targeting session' };

  const config = session.diceSelection;
  if (!config) return { ok: false, reason: 'No dice effect configured' };

  const targetable = new Set(getTargetableDieIds(session));
  if (!targetable.has(dieId)) {
    return { ok: false, reason: 'Die is not targetable' };
  }

  const selectedDieIds = toggleSelectedDieIds(session.selectedDieIds, dieId, config, targetable);
  const next: ConsumableTargetingSession = { ...session, selectedDieIds };
  sceneActions.setConsumableTargeting(next);
  return { ok: true, session: next };
}

export function setBumpDirection(direction: 'up' | 'down'): ToggleTargetDieResult {
  const session = getActiveConsumableTargeting();
  if (!session) return { ok: false, reason: 'No active targeting session' };

  const config = session.diceSelection;
  if (!config) return { ok: false, reason: 'No dice effect configured' };
  if (!needsBumpDirection(config)) {
    return { ok: false, reason: 'This card does not use bump direction' };
  }

  const next: ConsumableTargetingSession = { ...session, bumpDirection: direction };
  sceneActions.setConsumableTargeting(next);
  return { ok: true, session: next };
}

export function getConsumableTargetingSnapshot(): ConsumableTargetingSnapshot {
  const session = getActiveConsumableTargeting();
  if (!session || !session.diceSelection) {
    return {
      active: false,
      session: null,
      cardName: '',
      description: '',
      minPicks: 0,
      maxPicks: 0,
      selectedCount: 0,
      ready: false,
      needsBumpDirection: false,
      validationReason: null,
    };
  }

  const config = session.diceSelection;
  return {
    active: true,
    session,
    cardName: config.cardName,
    description: config.description,
    minPicks: getDiceSelectionMinPicks(config),
    maxPicks: getDiceSelectionMaxPicks(config),
    selectedCount: session.selectedDieIds.length,
    ready: isTargetingCommitReady(session),
    needsBumpDirection: needsBumpDirection(config),
    bumpDirection: session.bumpDirection,
    validationReason: getValidationReason(session),
  };
}

export function cancelConsumableTargeting(): void {
  const session = getActiveConsumableTargeting();
  if (session?.useContext.scene === 'booster_pack') {
    sceneActions.patchPackLineupSelection([...session.selectedDieIds]);
  }
  sceneActions.setConsumableTargeting(null);
}

export function commitConsumableTargeting(): CommitConsumableTargetingResult {
  const session = getActiveConsumableTargeting();
  if (!session) return { ok: false, reason: 'No active targeting session' };

  const config = session.diceSelection;
  if (!config) return { ok: false, reason: 'No dice effect configured' };

  const reason = getValidationReason(session);
  if (reason) return { ok: false, reason };

  const commit: ConsumableTargetingCommit = {
    source: session.source,
    useContext: session.useContext,
    diceSelection: config,
    selectedDieIds: [...session.selectedDieIds],
    bumpDirection: session.bumpDirection,
  };
  sceneActions.setConsumableTargeting(null);
  return { ok: true, commit };
}
