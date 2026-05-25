// ─── Store serialization (No Phaser imports) ───
// JSON-safe shapes for save/load snapshots.

import { milesToSave, milesFromSave } from '../scoreMath';
import { createEmptyTrailRoundEffects } from '../TrailEventsSystem';
import type { RunState, RoundRuntimeState, SceneRuntimeState } from './types';

export type SerializedRunState = Omit<RunState, 'uiEffects'>;

export type SerializedRoundRuntimeState = Omit<RoundRuntimeState, 'totalMiles' | 'lastScoreResult'> & {
  totalMiles: string;
};

export type SerializedSceneRuntimeState = SceneRuntimeState;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function serializeRunState(state: RunState): SerializedRunState {
  const { uiEffects: _, ...rest } = state;
  return cloneJson(rest);
}

export function deserializeRunState(data: SerializedRunState): RunState {
  return {
    ...data,
    uiEffects: [],
    trailRoundEffects: data.trailRoundEffects ?? createEmptyTrailRoundEffects(),
    skippedRoundTagMeta: data.skippedRoundTagMeta ?? {},
    roundSkipPreviewMeta: data.roundSkipPreviewMeta ?? {},
    roundBackgroundIndex: data.roundBackgroundIndex ?? null,
  };
}

export function serializeRoundState(round: RoundRuntimeState | null): SerializedRoundRuntimeState | null {
  if (!round) return null;
  const { totalMiles, lastScoreResult: _, sidebarOverlay: __, ...rest } = round;
  return { ...rest, totalMiles: milesToSave(totalMiles) };
}

export function deserializeRoundState(data: SerializedRoundRuntimeState | null): RoundRuntimeState | null {
  if (!data) return null;
  const { totalMiles, ...rest } = data;
  return { ...rest, totalMiles: milesFromSave(totalMiles), lastScoreResult: null, sidebarOverlay: null };
}

export function serializeSceneState(state: SceneRuntimeState): SerializedSceneRuntimeState {
  return cloneJson(state);
}

export function deserializeSceneState(data: SerializedSceneRuntimeState): SceneRuntimeState {
  return cloneJson(data);
}
