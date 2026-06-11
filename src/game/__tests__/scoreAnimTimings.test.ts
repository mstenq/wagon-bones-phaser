import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  applyScoreAnimSpeedPreset,
  DEFAULT_SCORE_ANIM_TIMINGS,
  getScoreAnimTimings,
  initScoreAnimTimings,
  listScoreAnimTimingKeys,
  patchScoreAnimTimings,
  setScoreAnimTimings,
} from '../ScoreAnimTimings';
import { buildScoreAnimTimingsForPreset } from '../scoreAnimTimingsPresets';
import { listScoreAnimTimingKeysGrouped } from '../scoreAnimTimingsMeta';
import { initGameplayPreferences } from '../GameplayPreferences';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('ScoreAnimTimings', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    initScoreAnimTimings();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('uses defaults when storage is empty', () => {
    expect(getScoreAnimTimings()).toEqual(DEFAULT_SCORE_ANIM_TIMINGS);
  });

  test('persists and restores patched timings', () => {
    patchScoreAnimTimings({ SCORE_STEP_DELAY: 350, SCORE_SUBSTEP_DELAY: 120 });

    initScoreAnimTimings();
    expect(getScoreAnimTimings().SCORE_STEP_DELAY).toBe(350);
    expect(getScoreAnimTimings().SCORE_SUBSTEP_DELAY).toBe(120);

    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    expect(raw).toContain('"SCORE_STEP_DELAY":350');
  });

  test('clamps invalid numbers to defaults', () => {
    patchScoreAnimTimings({ SCORE_STEP_DELAY: Number.NaN, DICE_SCORE_PUNCH_MULT: -1 });
    expect(getScoreAnimTimings().SCORE_STEP_DELAY).toBe(DEFAULT_SCORE_ANIM_TIMINGS.SCORE_STEP_DELAY);
    expect(getScoreAnimTimings().DICE_SCORE_PUNCH_MULT).toBeGreaterThan(0);
  });

  test('speed presets reset to defaults then apply hand-pace overrides', () => {
    patchScoreAnimTimings({ SCORE_SUBSTEP_DELAY: 999, WIGGLE_OFFSET: 99 });
    applyScoreAnimSpeedPreset('fast');

    expect(getScoreAnimTimings().SCORE_SUBSTEP_DELAY).toBe(300);
    expect(getScoreAnimTimings().POPUP_FADE_DELAY_MS).toBe(100);
    expect(getScoreAnimTimings().WIGGLE_OFFSET).toBe(DEFAULT_SCORE_ANIM_TIMINGS.WIGGLE_OFFSET);

    const slow = buildScoreAnimTimingsForPreset('slow');
    expect(slow.SCORE_SUBSTEP_DELAY).toBe(1000);
    expect(slow.SCORE_ACCEL_DIE_PREAMBLE_MS).toBe(1000);
    expect(slow.DIE_PUNCH_MS).toBe(DEFAULT_SCORE_ANIM_TIMINGS.DIE_PUNCH_MS);
  });

  test('grouped UI metadata covers every timing key exactly once', () => {
    const grouped = listScoreAnimTimingKeysGrouped();
    const defaults = Object.keys(DEFAULT_SCORE_ANIM_TIMINGS) as (keyof typeof DEFAULT_SCORE_ANIM_TIMINGS)[];
    expect([...grouped].sort()).toEqual([...defaults].sort());
    expect(listScoreAnimTimingKeys()).toEqual(grouped);
  });

  test('score anim and gameplay preferences coexist in storage', () => {
    initGameplayPreferences();
    setScoreAnimTimings({ ...DEFAULT_SCORE_ANIM_TIMINGS, SCORE_ACCEL_MAX: 2.5 });

    initScoreAnimTimings();
    initGameplayPreferences();

    expect(getScoreAnimTimings().SCORE_ACCEL_MAX).toBe(2.5);
    expect(localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY)).toContain('"scoreAnim"');
  });
});
