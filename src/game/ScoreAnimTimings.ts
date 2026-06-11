// ─── Score animation timings (No Phaser imports) ───
// Runtime-tweakable score playback pacing; persisted in user preferences.

import { patchStoredUserPreferences, readStoredUserPreferences } from './PreferencesStorage';
import { listScoreAnimTimingKeysGrouped } from './scoreAnimTimingsMeta';
import { buildScoreAnimTimingsForPreset, type ScoreAnimSpeedPreset } from './scoreAnimTimingsPresets';

export interface ScoreAnimTimings {
  DICE_SCORE_PUNCH_MULT: number;
  /** Tween duration when moving locked dice into the score line */
  DICE_SCORE_LAYOUT_DURATION: number;
  SCORE_STEP_DELAY: number;
  SCORE_SUBSTEP_DELAY: number;
  SCORE_FINAL_FLASH_DELAY: number;
  SCORE_COMPLETE_DELAY: number;
  /** Extra wait after round-total flash (formerly hardcoded +400 on SCORE_COMPLETE_DELAY). */
  SCORE_ROUND_TOTAL_DELAY: number;
  SCORE_ACCEL_MIN_EVENTS: number;
  SCORE_ACCEL_FULL_AT: number;
  SCORE_ACCEL_MAX: number;
  SCORE_ACCEL_MIN_GAP_MS: number;
  SCORE_ACCEL_DIE_PREAMBLE_MS: number;
  SCORE_ACCEL_AGAIN_DELAY: number;
  POPUP_POP_IN_MS: number;
  POPUP_SHAKE_STEP_MS: number;
  POPUP_SETTLE_MS: number;
  POPUP_FADE_MS: number;
  POPUP_FADE_DELAY_MS: number;
  GRANT_FLY_IN_MS: number;
  WIGGLE_OFFSET: number;
  WIGGLE_DURATION_MS: number;
  WIGGLE_REPEAT: number;
  AGAIN_STEP_MS: number;
  AGAIN_JITTER_STEPS: number;
  AGAIN_POS_INTENSITY: number;
  AGAIN_ROT_INTENSITY: number;
  AGAIN_SCALE_MULT: number;
  AGAIN_SCALE_PUNCH_MS: number;
  DIE_SHAKE_DURATION_MS: number;
  DIE_SHAKE_COUNT: number;
  DIE_SHAKE_INTENSITY: number;
  DIE_PUNCH_MS: number;
  STRIP_FLASH_MS: number;
  STRIP_WAIT_MS: number;
  ENHANCE_SYNC_WAIT_MS: number;
  ENHANCE_FINISH_WAIT_MS: number;
  CRACK_SHRINK_MS: number;
  CRACK_CLEANUP_MS: number;
  BALANCE_FIRST_WAIT_MS: number;
  BALANCE_SECOND_WAIT_MS: number;
}

/** Canonical default score animation timings (single source of truth). */
export const DEFAULT_SCORE_ANIM_TIMINGS: ScoreAnimTimings = {
  DICE_SCORE_PUNCH_MULT: 1.2,
  DICE_SCORE_LAYOUT_DURATION: 400,
  SCORE_STEP_DELAY: 200,
  SCORE_SUBSTEP_DELAY: 300,
  SCORE_FINAL_FLASH_DELAY: 300,
  SCORE_COMPLETE_DELAY: 400,
  SCORE_ROUND_TOTAL_DELAY: 400,
  SCORE_ACCEL_MIN_EVENTS: 20,
  SCORE_ACCEL_FULL_AT: 90,
  SCORE_ACCEL_MAX: 3,
  SCORE_ACCEL_MIN_GAP_MS: 56,
  SCORE_ACCEL_DIE_PREAMBLE_MS: 400,
  SCORE_ACCEL_AGAIN_DELAY: 400,
  POPUP_POP_IN_MS: 100,
  POPUP_SHAKE_STEP_MS: 30,
  POPUP_SETTLE_MS: 80,
  POPUP_FADE_MS: 300,
  POPUP_FADE_DELAY_MS: 100,
  GRANT_FLY_IN_MS: 480,
  WIGGLE_OFFSET: 3,
  WIGGLE_DURATION_MS: 40,
  WIGGLE_REPEAT: 2,
  AGAIN_STEP_MS: 36,
  AGAIN_JITTER_STEPS: 4,
  AGAIN_POS_INTENSITY: 2,
  AGAIN_ROT_INTENSITY: 10,
  AGAIN_SCALE_MULT: 1.14,
  AGAIN_SCALE_PUNCH_MS: 100,
  DIE_SHAKE_DURATION_MS: 60,
  DIE_SHAKE_COUNT: 3,
  DIE_SHAKE_INTENSITY: 3,
  DIE_PUNCH_MS: 100,
  STRIP_FLASH_MS: 80,
  STRIP_WAIT_MS: 120,
  ENHANCE_SYNC_WAIT_MS: 120,
  ENHANCE_FINISH_WAIT_MS: 200,
  CRACK_SHRINK_MS: 220,
  CRACK_CLEANUP_MS: 500,
  BALANCE_FIRST_WAIT_MS: 180,
  BALANCE_SECOND_WAIT_MS: 450,
};

const SCORE_ANIM_TIMING_KEYS = Object.keys(DEFAULT_SCORE_ANIM_TIMINGS) as (keyof ScoreAnimTimings)[];

let cached: ScoreAnimTimings | null = null;

function clampMin(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value);
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampMin(value, min);
}

function normalizeTimings(partial?: Partial<ScoreAnimTimings>): ScoreAnimTimings {
  const base = DEFAULT_SCORE_ANIM_TIMINGS;
  const next = { ...base };
  for (const key of SCORE_ANIM_TIMING_KEYS) {
    const raw = partial?.[key];
    if (raw === undefined) continue;
    if (key === 'DICE_SCORE_PUNCH_MULT' || key === 'AGAIN_SCALE_MULT') {
      next[key] = normalizeNumber(raw, base[key], 0.01);
    } else if (key === 'SCORE_ACCEL_MAX') {
      next[key] = normalizeNumber(raw, base[key], 1);
    } else if (
      key === 'SCORE_ACCEL_MIN_EVENTS' ||
      key === 'SCORE_ACCEL_FULL_AT' ||
      key === 'WIGGLE_REPEAT' ||
      key === 'AGAIN_JITTER_STEPS' ||
      key === 'DIE_SHAKE_COUNT'
    ) {
      next[key] = Math.max(1, Math.round(normalizeNumber(raw, base[key], 1)));
    } else {
      next[key] = normalizeNumber(raw, base[key], 0);
    }
  }
  return next;
}

function readFromStorage(): ScoreAnimTimings {
  const parsed = readStoredUserPreferences();
  return normalizeTimings(parsed.scoreAnim);
}

/** Load timings from localStorage into memory (idempotent). */
export function initScoreAnimTimings(): void {
  cached = readFromStorage();
}

/** Current score animation timings (loads from storage on first access). */
export function getScoreAnimTimings(): ScoreAnimTimings {
  if (!cached) cached = readFromStorage();
  return cached;
}

/** Update in-memory timings and persist to localStorage. */
export function setScoreAnimTimings(timings: ScoreAnimTimings): void {
  cached = normalizeTimings(timings);
  patchStoredUserPreferences({ scoreAnim: cached });
}

/** Merge a partial update into timings and persist. */
export function patchScoreAnimTimings(patch: Partial<ScoreAnimTimings>): void {
  setScoreAnimTimings({ ...getScoreAnimTimings(), ...patch });
}

/** All tweakable timing keys (grouped UI order). */
export function listScoreAnimTimingKeys(): (keyof ScoreAnimTimings)[] {
  return listScoreAnimTimingKeysGrouped();
}

export { SCORE_ANIM_TIMING_GROUPS, type ScoreAnimTimingGroupMeta } from './scoreAnimTimingsMeta';
export {
  SCORE_ANIM_SPEED_PRESETS,
  SCORE_ANIM_SPEED_PRESET_LABELS,
  buildScoreAnimTimingsForPreset,
  type ScoreAnimSpeedPreset,
} from './scoreAnimTimingsPresets';

/** Reset to defaults, then apply a speed preset (Slow / Medium / Fast / Fastest). */
export function applyScoreAnimSpeedPreset(preset: ScoreAnimSpeedPreset): void {
  setScoreAnimTimings(buildScoreAnimTimingsForPreset(preset));
}
