// ─── Auto-save persistence (No Phaser imports) ───
// Uses the same GameSaveSnapshot format as manual export/load.

import { GAMEPLAY } from './Constants';
import { validateSaveSnapshot, assertSaveIntegrity, type GameSaveSnapshot } from './SaveLoad';

/** Stable serialization for change detection (ignores exportedAt). */
export function snapshotContentKey(snapshot: GameSaveSnapshot): string {
  const { exportedAt: _, ...rest } = snapshot;
  return JSON.stringify(rest);
}

export function writeAutoSaveToStorage(snapshot: GameSaveSnapshot): void {
  try {
    const rawCurrent = localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);
    const newKey = snapshotContentKey(snapshot);

    if (rawCurrent) {
      const parsed = JSON.parse(rawCurrent) as unknown;
      const current = validateSaveSnapshot(parsed);
      if (current && snapshotContentKey(current) === newKey) {
        return;
      }
      localStorage.setItem(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY, rawCurrent);
    }

    localStorage.setItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or private browsing — ignore
  }
}

function readSnapshotFromKey(key: string): GameSaveSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const snapshot = validateSaveSnapshot(parsed);
    if (!snapshot) return null;
    assertSaveIntegrity(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function readAutoSaveFromStorage(): GameSaveSnapshot | null {
  return readSnapshotFromKey(GAMEPLAY.AUTOSAVE_STORAGE_KEY);
}

export function readPreviousAutoSaveFromStorage(): GameSaveSnapshot | null {
  return readSnapshotFromKey(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY);
}

export function clearAutoSaveStorage(): void {
  try {
    localStorage.removeItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearPreviousAutoSaveStorage(): void {
  try {
    localStorage.removeItem(GAMEPLAY.AUTOSAVE_PREV_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasRunnableAutoSave(): boolean {
  const snapshot = readAutoSaveFromStorage();
  return snapshot !== null && snapshot.run.professionId !== null;
}
