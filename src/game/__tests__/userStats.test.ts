import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  clearUserStatsStorage,
  getDifficultyBeatColor,
  getHighestDifficultyBeaten,
  getHighestUnlockedDifficulty,
  isDifficultyUnlocked,
  readUserStats,
  recordStoryVictory,
  resetUserStatsCacheForTests,
} from '../UserStats';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('UserStats', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    clearUserStatsStorage();
    resetUserStatsCacheForTests();
  });

  afterEach(() => {
    clearUserStatsStorage();
    resetUserStatsCacheForTests();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('empty storage returns beaten 0 and unlocked 1', () => {
    expect(getHighestDifficultyBeaten('farmer')).toBe(0);
    expect(getHighestUnlockedDifficulty('farmer')).toBe(1);
    expect(isDifficultyUnlocked('farmer', 1)).toBe(true);
    expect(isDifficultyUnlocked('farmer', 2)).toBe(false);
  });

  test('recordStoryVictory updates highest difficulty beaten', () => {
    recordStoryVictory('farmer', 1);
    expect(getHighestDifficultyBeaten('farmer')).toBe(1);
    expect(getHighestUnlockedDifficulty('farmer')).toBe(2);

    recordStoryVictory('farmer', 3);
    expect(getHighestDifficultyBeaten('farmer')).toBe(3);
    expect(isDifficultyUnlocked('farmer', 4)).toBe(true);
    expect(isDifficultyUnlocked('farmer', 5)).toBe(false);
  });

  test('recordStoryVictory does not downgrade', () => {
    recordStoryVictory('farmer', 3);
    recordStoryVictory('farmer', 2);
    expect(getHighestDifficultyBeaten('farmer')).toBe(3);
  });

  test('recordStoryVictory is idempotent for same difficulty', () => {
    recordStoryVictory('farmer', 2);
    recordStoryVictory('farmer', 2);
    expect(getHighestDifficultyBeaten('farmer')).toBe(2);

    const raw = localStorage.getItem(GAMEPLAY.USER_STATS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stats = JSON.parse(raw!);
    expect(stats.professions.farmer.highestDifficultyBeaten).toBe(2);
  });

  test('developer profession always has beaten 8 and all difficulties unlocked', () => {
    expect(getHighestDifficultyBeaten('developer')).toBe(8);
    expect(getHighestUnlockedDifficulty('developer')).toBe(8);
    expect(isDifficultyUnlocked('developer', 8)).toBe(true);

    recordStoryVictory('developer', 1);
    expect(readUserStats().professions.developer).toBeUndefined();
  });

  test('getDifficultyBeatColor returns palette colors for levels 1-8', () => {
    expect(getDifficultyBeatColor(0)).toBeNull();
    expect(getDifficultyBeatColor(1)).toBe(0xffffff);
    expect(getDifficultyBeatColor(8)).toBe(0xffd700);
    expect(getDifficultyBeatColor(9)).toBeNull();
  });
});
