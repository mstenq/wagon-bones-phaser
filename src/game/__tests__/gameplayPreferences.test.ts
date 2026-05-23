import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  DEFAULT_GAMEPLAY_PREFERENCES,
  getGameplayPreferences,
  initGameplayPreferences,
  setGameplayPreferences,
} from '../GameplayPreferences';
import { getAudioPreferences, initAudioPreferences, setAudioPreferences } from '../AudioPreferences';

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

describe('GameplayPreferences', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    initGameplayPreferences();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('uses defaults when storage is empty', () => {
    expect(getGameplayPreferences()).toEqual(DEFAULT_GAMEPLAY_PREFERENCES);
  });

  test('persists and restores preferences', () => {
    setGameplayPreferences({ autoRollFirstHand: true });

    initGameplayPreferences();
    expect(getGameplayPreferences()).toEqual({ autoRollFirstHand: true });

    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    expect(raw).toContain('"autoRollFirstHand":true');
  });

  test('audio and gameplay preferences coexist in storage', () => {
    setGameplayPreferences({ autoRollFirstHand: true });
    initAudioPreferences();
    setAudioPreferences({
      musicEnabled: false,
      musicVolume: 0.4,
      sfxEnabled: true,
      sfxVolume: 0.8,
    });

    initGameplayPreferences();
    initAudioPreferences();

    expect(getGameplayPreferences().autoRollFirstHand).toBe(true);
    expect(getAudioPreferences().musicEnabled).toBe(false);
    expect(getAudioPreferences().musicVolume).toBe(0.4);
  });
});
