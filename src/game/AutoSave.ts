// ─── Auto-save persistence (No Phaser imports) ───
// Uses the same GameSaveSnapshot format as manual export/load.

import { GAMEPLAY } from './Constants';
import { validateSaveSnapshot, assertSaveIntegrity, type GameSaveSnapshot } from './SaveLoad';

export function writeAutoSaveToStorage(snapshot: GameSaveSnapshot): void {
  try {
    localStorage.setItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or private browsing — ignore
  }
}

export function readAutoSaveFromStorage(): GameSaveSnapshot | null {
  try {
    const raw = localStorage.getItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);
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

export function clearAutoSaveStorage(): void {
  try {
    localStorage.removeItem(GAMEPLAY.AUTOSAVE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasRunnableAutoSave(): boolean {
  const snapshot = readAutoSaveFromStorage();
  return snapshot !== null && snapshot.player.professionId !== null;
}
