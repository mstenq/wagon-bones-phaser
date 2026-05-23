import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  DEFAULT_AUDIO_PREFERENCES,
  getAudioPreferences,
  initAudioPreferences,
  setAudioPreferences,
} from '../AudioPreferences';

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

describe('AudioPreferences', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    initAudioPreferences();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('uses defaults when storage is empty', () => {
    expect(getAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  test('persists and restores preferences', () => {
    setAudioPreferences({
      musicEnabled: false,
      musicVolume: 0.5,
      sfxEnabled: true,
      sfxVolume: 0.25,
    });

    initAudioPreferences();
    expect(getAudioPreferences()).toEqual({
      musicEnabled: false,
      musicVolume: 0.5,
      sfxEnabled: true,
      sfxVolume: 0.25,
    });

    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    expect(raw).toContain('"musicEnabled":false');
    expect(raw).toContain('"sfxVolume":0.25');
  });

  test('clamps invalid volume values', () => {
    localStorage.setItem(
      GAMEPLAY.PREFERENCES_STORAGE_KEY,
      JSON.stringify({ audio: { musicVolume: 2, sfxVolume: -1 } }),
    );
    initAudioPreferences();
    expect(getAudioPreferences().musicVolume).toBe(1);
    expect(getAudioPreferences().sfxVolume).toBe(0);
  });
});
