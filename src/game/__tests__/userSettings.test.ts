import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import { HandType } from '../types';
import { getGameplayPreferences, initGameplayPreferences, setGameplayPreferences } from '../GameplayPreferences';
import { writeStoredUserPreferences } from '../PreferencesStorage';
import {
  applyUserSettingsBundle,
  buildUserSettingsBundle,
  reloadUserSettingsCaches,
  validateUserSettingsBundle,
} from '../UserSettings';
import {
  clearUserStatsStorage,
  recordStoryVictory,
  resetUserStatsCacheForTests,
  getHighestDifficultyBeaten,
} from '../UserStats';

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

describe('UserSettings', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    clearUserStatsStorage();
    resetUserStatsCacheForTests();
    initGameplayPreferences();
  });

  afterEach(() => {
    clearUserStatsStorage();
    resetUserStatsCacheForTests();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('buildUserSettingsBundle combines preferences and user stats', () => {
    setGameplayPreferences({ autoRollFirstHand: false, stationaryStickers: true });
    recordStoryVictory('farmer', 2);

    const bundle = buildUserSettingsBundle();
    expect(bundle.preferences.gameplay?.autoRollFirstHand).toBe(false);
    expect(bundle.preferences.gameplay?.stationaryStickers).toBe(true);
    expect(bundle.userStats.professions.farmer?.highestDifficultyBeaten).toBe(2);
  });

  test('round-trip export and apply restores both storage keys', () => {
    setGameplayPreferences({ autoRollFirstHand: false, stationaryStickers: true });
    recordStoryVictory('farmer', 3);

    const bundle = buildUserSettingsBundle();
    localStorage.clear();
    resetUserStatsCacheForTests();
    initGameplayPreferences();

    applyUserSettingsBundle(bundle);

    const prefsRaw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    const statsRaw = localStorage.getItem(GAMEPLAY.USER_STATS_STORAGE_KEY);
    expect(prefsRaw).toContain('"autoRollFirstHand":false');
    expect(prefsRaw).toContain('"stationaryStickers":true');
    expect(statsRaw).toContain('"highestDifficultyBeaten":3');
  });

  test('validateUserSettingsBundle rejects missing preferences', () => {
    expect(validateUserSettingsBundle({ userStats: { professions: {} } })).toBeNull();
  });

  test('validateUserSettingsBundle rejects missing userStats', () => {
    expect(validateUserSettingsBundle({ preferences: {} })).toBeNull();
  });

  test('validateUserSettingsBundle rejects missing professions', () => {
    expect(validateUserSettingsBundle({ preferences: {}, userStats: {} })).toBeNull();
  });

  test('validateUserSettingsBundle normalizes missing equipment', () => {
    const bundle = validateUserSettingsBundle({
      preferences: { gameplay: { autoRollFirstHand: true } },
      userStats: { professions: { farmer: { highestDifficultyBeaten: 1 } } },
    });
    expect(bundle?.userStats.equipment).toEqual({});
  });

  test('validateUserSettingsBundle rejects invalid preference section', () => {
    expect(
      validateUserSettingsBundle({
        preferences: { gameplay: 'bad' },
        userStats: { professions: {}, equipment: {} },
      }),
    ).toBeNull();
  });

  test('validateUserSettingsBundle clamps corrupt profession beat levels', () => {
    const bundle = validateUserSettingsBundle({
      preferences: {},
      userStats: { professions: { farmer: { highestDifficultyBeaten: -1 } }, equipment: {} },
    });
    expect(bundle?.userStats.professions.farmer?.highestDifficultyBeaten).toBe(0);
  });

  test('round-trip bundle preserves equipment stats', () => {
    recordStoryVictory('farmer', 3);
    const bundle = buildUserSettingsBundle();
    bundle.userStats.equipment = { horseshoe: { highestDifficultyBeaten: 5 } };
    bundle.userStats.discoveredSecretHands = [HandType.FLUSH, HandType.FLUSH_HOUSE];

    localStorage.clear();
    resetUserStatsCacheForTests();
    applyUserSettingsBundle(bundle);

    expect(getHighestDifficultyBeaten('farmer')).toBe(3);
    expect(
      JSON.parse(localStorage.getItem(GAMEPLAY.USER_STATS_STORAGE_KEY)!).equipment.horseshoe.highestDifficultyBeaten,
    ).toBe(5);
    expect(JSON.parse(localStorage.getItem(GAMEPLAY.USER_STATS_STORAGE_KEY)!).discoveredSecretHands).toEqual([
      'FLUSH',
      'FLUSH_HOUSE',
    ]);
  });

  test('reloadUserSettingsCaches picks up storage written without going through setters', () => {
    writeStoredUserPreferences({
      gameplay: { autoRollFirstHand: false, stationaryStickers: true },
    });
    localStorage.setItem(
      GAMEPLAY.USER_STATS_STORAGE_KEY,
      JSON.stringify({ professions: { farmer: { highestDifficultyBeaten: 4 } }, equipment: {} }),
    );

    reloadUserSettingsCaches();

    expect(getGameplayPreferences()).toEqual({ autoRollFirstHand: false, stationaryStickers: true });
    expect(getHighestDifficultyBeaten('farmer')).toBe(4);
  });
});
