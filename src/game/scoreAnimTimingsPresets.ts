// ─── Score animation speed presets (No Phaser imports) ───
// Each preset resets to defaults, then applies hand-pace overrides.

import { DEFAULT_SCORE_ANIM_TIMINGS, type ScoreAnimTimings } from './ScoreAnimTimings';

export type ScoreAnimSpeedPreset = 'slow' | 'medium' | 'fast' | 'fastest';

export const SCORE_ANIM_SPEED_PRESETS: readonly ScoreAnimSpeedPreset[] = ['slow', 'medium', 'fast', 'fastest'] as const;

export const SCORE_ANIM_SPEED_PRESET_LABELS: Record<ScoreAnimSpeedPreset, string> = {
  slow: 'Slow',
  medium: 'Medium',
  fast: 'Fast',
  fastest: 'Fastest',
};

const PRESET_OVERRIDES: Record<ScoreAnimSpeedPreset, Partial<ScoreAnimTimings>> = {
  slow: {
    SCORE_SUBSTEP_DELAY: 1000,
    SCORE_ACCEL_DIE_PREAMBLE_MS: 1000,
    SCORE_ACCEL_AGAIN_DELAY: 500,
    POPUP_FADE_DELAY_MS: 300,
  },
  medium: {
    SCORE_SUBSTEP_DELAY: 600,
    SCORE_ACCEL_DIE_PREAMBLE_MS: 400,
    SCORE_ACCEL_AGAIN_DELAY: 400,
    POPUP_FADE_DELAY_MS: 150,
  },
  fast: {
    SCORE_SUBSTEP_DELAY: 300,
    SCORE_ACCEL_DIE_PREAMBLE_MS: 400,
    SCORE_ACCEL_AGAIN_DELAY: 400,
    POPUP_FADE_DELAY_MS: 100,
  },
  fastest: {
    SCORE_SUBSTEP_DELAY: 150,
    SCORE_ACCEL_DIE_PREAMBLE_MS: 200,
    SCORE_ACCEL_AGAIN_DELAY: 200,
    POPUP_FADE_DELAY_MS: 50,
  },
};

export function buildScoreAnimTimingsForPreset(preset: ScoreAnimSpeedPreset): ScoreAnimTimings {
  return { ...DEFAULT_SCORE_ANIM_TIMINGS, ...PRESET_OVERRIDES[preset] };
}
