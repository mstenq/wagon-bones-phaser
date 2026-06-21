import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import professions from '../../data/professions';
import { getAllEquipment } from '../ItemsSystem';
import { getCompletionistPlusPlusProgress, getCompletionistPlusProgress } from '../Achievements';
import {
  clearUserStatsStorage,
  recordEquipmentVictory,
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
});
