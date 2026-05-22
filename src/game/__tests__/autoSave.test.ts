import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  writeAutoSaveToStorage,
  readAutoSaveFromStorage,
  clearAutoSaveStorage,
  hasRunnableAutoSave,
} from '../AutoSave';
import { buildSaveSnapshot, SAVE_VERSION } from '../SaveLoad';
import { resetPlayerState } from '../PlayerState';

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

describe('AutoSave', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = createMockStorage();
    clearAutoSaveStorage();
  });

  afterEach(() => {
    clearAutoSaveStorage();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('writes and reads snapshot from localStorage', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.leg = 2;

    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    writeAutoSaveToStorage(snapshot);

    const restored = readAutoSaveFromStorage();
    expect(restored?.version).toBe(SAVE_VERSION);
    expect(restored?.player.leg).toBe(2);
    expect(restored?.player.professionId).toBe('outlaw');
  });

  test('hasRunnableAutoSave requires profession', () => {
    resetPlayerState();
    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    writeAutoSaveToStorage(snapshot);
    expect(hasRunnableAutoSave()).toBe(false);

    resetPlayerState().applyProfession('farmer');
    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));
    expect(hasRunnableAutoSave()).toBe(true);
  });

  test('clearAutoSaveStorage removes data', () => {
    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));
    clearAutoSaveStorage();
    expect(readAutoSaveFromStorage()).toBeNull();
  });

  test('uses configured storage key', () => {
    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));
    expect(localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY)).not.toBeNull();
  });
});
