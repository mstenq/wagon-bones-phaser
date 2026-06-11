// ─── Score animation pacing ───
// One steady gap scale per hand, shared through the round-end held payout pass.

import type { Scene } from 'phaser';
import { getScoreAnimTimings } from '../../game/ScoreAnimTimings';

/** Locked when a hand score starts; reused for round-end-held payout on the same hand. */
let sessionGapScale: number | null = null;

/** Gap compression from event count: 1× below min, linear to SCORE_ACCEL_MAX at SCORE_ACCEL_FULL_AT. */
export function scoreAnimGapScaleFromCount(eventCount: number): number {
  const T = getScoreAnimTimings();
  const { SCORE_ACCEL_MIN_EVENTS, SCORE_ACCEL_FULL_AT, SCORE_ACCEL_MAX } = T;
  if (eventCount <= SCORE_ACCEL_MIN_EVENTS) return 1;
  const span = Math.max(SCORE_ACCEL_FULL_AT - SCORE_ACCEL_MIN_EVENTS, 1);
  const t = Math.min((eventCount - SCORE_ACCEL_MIN_EVENTS) / span, 1);
  return 1 + t * (SCORE_ACCEL_MAX - 1);
}

export function beginScoreAnimSession(eventCount: number): number {
  sessionGapScale = scoreAnimGapScaleFromCount(eventCount);
  return sessionGapScale;
}

export function endScoreAnimSession(): void {
  sessionGapScale = null;
}

function resolveGapScale(fallbackEventCount: number): number {
  return sessionGapScale ?? scoreAnimGapScaleFromCount(fallbackEventCount);
}

export interface ScoreAnimPacing {
  gapScale: number;
  /** Skip die shake preamble and use light Again FX when compressed. */
  trimFx: boolean;
  gapMs: (baseMs: number) => number;
  wait: (scene: Scene, baseMs: number, cb: () => void) => void;
}

export function createScoreAnimPacing(gapScale: number): ScoreAnimPacing {
  const trimFx = gapScale > 1;
  return {
    gapScale,
    trimFx,
    gapMs: (baseMs) => {
      const T = getScoreAnimTimings();
      return Math.max(T.SCORE_ACCEL_MIN_GAP_MS, Math.round(baseMs / gapScale));
    },
    wait: (scene, baseMs, cb) => {
      const T = getScoreAnimTimings();
      scene.time.delayedCall(Math.max(T.SCORE_ACCEL_MIN_GAP_MS, Math.round(baseMs / gapScale)), cb);
    },
  };
}

/** Start a new session (hand score) and return its pacing. */
export function pacingForHandScore(eventCount: number): ScoreAnimPacing {
  beginScoreAnimSession(eventCount);
  return createScoreAnimPacing(sessionGapScale!);
}

/** Continue an existing session (round-end held) or derive pace from event count alone. */
export function pacingForFollowUp(eventCount: number): ScoreAnimPacing {
  return createScoreAnimPacing(resolveGapScale(eventCount));
}
