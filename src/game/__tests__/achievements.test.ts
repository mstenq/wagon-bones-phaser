import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import professions from '../../data/professions';
import { getAllEquipment } from '../ItemsSystem';
import { HandType } from '../types';
import {
  getCompletionistPlusPlusProgress,
  getCompletionistPlusProgress,
  getTrailMysticProgress,
} from '../Achievements';
import {
  clearUserStatsStorage,
  recordEquipmentVictory,
  recordSecretHandDiscovered,
  getDiscoveredSecretHands,
  recordStoryVictory,
  resetUserStatsCacheForTests,
} from '../UserStats';
import { getSecretHandTypes } from '../../data/hands';

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

describe('Achievements', () => {
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

  test('getCompletionistPlusProgress counts professions beaten at level 8', () => {
    const playableCount = professions.filter((p) => p.id !== 'developer').length;
    const progress = getCompletionistPlusProgress();
    expect(progress.total).toBe(playableCount);
    expect(progress.done).toBe(0);
    expect(progress.complete).toBe(false);

    for (const profession of professions) {
      if (profession.id === 'developer') continue;
      recordStoryVictory(profession.id, 8);
    }

    const complete = getCompletionistPlusProgress();
    expect(complete.done).toBe(playableCount);
    expect(complete.complete).toBe(true);
  });

  test('getCompletionistPlusPlusProgress counts equipment with level 8 wins', () => {
    const total = getAllEquipment().length;
    const progress = getCompletionistPlusPlusProgress();
    expect(progress.total).toBe(total);
    expect(progress.done).toBe(0);
    expect(progress.complete).toBe(false);

    const allIds = getAllEquipment().map((def) => def.id);
    recordEquipmentVictory(allIds, 8);

    const complete = getCompletionistPlusPlusProgress();
    expect(complete.done).toBe(total);
    expect(complete.complete).toBe(true);
  });

  test('recordSecretHandDiscovered ignores non-secret hands', () => {
    recordSecretHandDiscovered(HandType.PAIR);
    expect(getDiscoveredSecretHands()).toEqual([]);
  });

  test('getTrailMysticProgress completes when every secret hand is discovered', () => {
    const secretTypes = getSecretHandTypes();
    const progress = getTrailMysticProgress();
    expect(progress.total).toBe(secretTypes.length);
    expect(progress.complete).toBe(false);

    for (const handType of secretTypes) {
      recordSecretHandDiscovered(handType);
    }

    const complete = getTrailMysticProgress();
    expect(complete.done).toBe(secretTypes.length);
    expect(complete.complete).toBe(true);
  });
});
