// ─── Round store selectors (No Phaser imports) ───
// Render-focused slices for Phaser migration (step 5).

import type { Die, GameConfig, HandType, PhaseState } from '../../types';
import { DEFAULT_CONFIG } from '../../types';
import { getRoundState } from '../roundStore';
import type { RoundRuntimeState } from '../types';
import { resolveDiceByIds, rolledRefsToDice } from '../roundResolve';
import { getRunState } from '../runStore';
import { selectSpentDice } from './runSelectors';

export function selectRoundOrNull(state: RoundRuntimeState | null = getRoundState()): RoundRuntimeState | null {
  return state;
}

export function selectRoundPhase(state: RoundRuntimeState | null = getRoundState()): PhaseState | null {
  return state?.phase ?? null;
}

export function selectRoundTotalMiles(state: RoundRuntimeState | null = getRoundState()) {
  return state?.totalMiles ?? null;
}

export function selectRoundConfig(state: RoundRuntimeState | null = getRoundState()): GameConfig {
  return state?.config ?? DEFAULT_CONFIG;
}

export function selectHandDice(state: RoundRuntimeState | null = getRoundState()): Die[] {
  if (!state) return [];
  return resolveDiceByIds(state.handDiceIds, state);
}

export function selectRolledDice(state: RoundRuntimeState | null = getRoundState()): Die[] {
  if (!state) return [];
  return rolledRefsToDice(state.rolledDice, state);
}

export function selectSelectedForScore(state: RoundRuntimeState | null = getRoundState()): Die[] {
  if (!state) return [];
  return resolveDiceByIds(state.selectedForScoreIds, state);
}

export function selectSelectedForRoll(state: RoundRuntimeState | null = getRoundState()): Die[] {
  if (!state) return [];
  return resolveDiceByIds(state.selectedForRollIds, state);
}

export function selectCurrentHandType(state: RoundRuntimeState | null = getRoundState()): HandType | null {
  return state?.currentHandType ?? null;
}

export function selectRerollsRemaining(state: RoundRuntimeState | null = getRoundState()): number {
  return state?.rerollsRemaining ?? 0;
}

export function selectRoundDay(state: RoundRuntimeState | null = getRoundState()): number {
  return state?.day ?? 1;
}

export function selectRoundSidebarModel(state: RoundRuntimeState | null = getRoundState()) {
  if (!state) return null;
  const run = getRunState();
  return {
    day: state.day,
    maxDays: state.config.maxDays,
    rerollsRemaining: state.rerollsRemaining,
    totalMiles: state.totalMiles,
    targetMiles: state.config.targetMiles,
    phase: state.phase,
    spentCount: selectSpentDice(run).length,
  };
}

export function selectEquipmentHintRoundContext(state: RoundRuntimeState | null = getRoundState()) {
  if (!state) return null;
  return {
    phase: state.phase,
    day: state.day,
    maxDays: state.config.maxDays,
    rerollsRemaining: state.rerollsRemaining,
    currentHandType: state.currentHandType,
    handHistory: state.handHistory,
    rolledDice: selectRolledDice(state),
    selectedForScore: selectSelectedForScore(state),
  };
}
