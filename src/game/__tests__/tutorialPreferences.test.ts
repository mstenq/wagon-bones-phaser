import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import { TUTORIAL_MESSAGE_IDS } from '../../data/tutorialMessages';
import {
  getTutorialPreferences,
  initTutorialPreferences,
  isTutorialSeen,
  markAllTutorialsSeen,
  markTutorialSeen,
  resetAllTutorials,
} from '../TutorialPreferences';
import { initGameplayPreferences, setGameplayPreferences } from '../GameplayPreferences';

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

describe('TutorialPreferences', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    initTutorialPreferences();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('starts with no tutorials seen', () => {
    expect(getTutorialPreferences().seenIds).toEqual([]);
    expect(isTutorialSeen('round_select_intro')).toBe(false);
  });

  test('persists seen tutorial ids', () => {
    markTutorialSeen('round_select_intro');
    markTutorialSeen('first_round_play');

    initTutorialPreferences();
    expect(isTutorialSeen('round_select_intro')).toBe(true);
    expect(isTutorialSeen('first_round_play')).toBe(true);
    expect(isTutorialSeen('shop_welcome')).toBe(false);

    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    expect(raw).toContain('"round_select_intro"');
    expect(raw).toContain('"first_round_play"');
  });

  test('markAllTutorialsSeen marks every known id', () => {
    markAllTutorialsSeen();
    for (const id of TUTORIAL_MESSAGE_IDS) {
      expect(isTutorialSeen(id)).toBe(true);
    }
  });

  test('resetAllTutorials clears seen state', () => {
    markAllTutorialsSeen();
    resetAllTutorials();
    expect(getTutorialPreferences().seenIds).toEqual([]);
    expect(isTutorialSeen('round_select_intro')).toBe(false);
  });

  test('tutorial and gameplay preferences coexist in storage', () => {
    setGameplayPreferences({ autoRollFirstHand: false, stationaryStickers: true });
    markTutorialSeen('first_round_play');

    initGameplayPreferences();
    initTutorialPreferences();

    expect(isTutorialSeen('first_round_play')).toBe(true);
    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    expect(raw).toContain('"stationaryStickers":true');
    expect(raw).toContain('"first_round_play"');
  });
});
