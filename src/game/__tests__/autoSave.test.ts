import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { GAMEPLAY } from '../Constants';
import {
  writeAutoSaveToStorage,
  readAutoSaveFromStorage,
  readPreviousAutoSaveFromStorage,
  clearAutoSaveStorage,
  clearPreviousAutoSaveStorage,
  snapshotContentKey,
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
    clearPreviousAutoSaveStorage();
  });

  afterEach(() => {
    clearAutoSaveStorage();
    clearPreviousAutoSaveStorage();
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

  test('first write does not create previous slot', () => {
    resetPlayerState().applyProfession('farmer');
    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));
    expect(localStorage.getItem(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY)).toBeNull();
  });

  test('no-op when content unchanged (ignores exportedAt)', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.leg = 2;

    const first = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    writeAutoSaveToStorage(first);
    const rawAfterFirst = localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);

    const second = { ...first, exportedAt: '2099-01-01T00:00:00.000Z' };
    expect(snapshotContentKey(second)).toBe(snapshotContentKey(first));

    writeAutoSaveToStorage(second);

    expect(localStorage.getItem(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY)).toBe(rawAfterFirst);
  });

  test('copies current to previous slot when content changes', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.leg = 1;

    const first = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    writeAutoSaveToStorage(first);
    const rawFirst = localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);

    player.leg = 2;
    const second = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    writeAutoSaveToStorage(second);

    expect(localStorage.getItem(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY)).toBe(rawFirst);
    expect(readAutoSaveFromStorage()?.player.leg).toBe(2);
    expect(readPreviousAutoSaveFromStorage()?.player.leg).toBe(1);
  });

  test('clearAutoSaveStorage removes main slot only', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.leg = 1;

    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));
    player.leg = 2;
    writeAutoSaveToStorage(buildSaveSnapshot({ activeScene: 'RoundSelect' }));

    expect(readPreviousAutoSaveFromStorage()).not.toBeNull();

    clearAutoSaveStorage();

    expect(readAutoSaveFromStorage()).toBeNull();
    expect(readPreviousAutoSaveFromStorage()?.player.leg).toBe(1);
  });
});
