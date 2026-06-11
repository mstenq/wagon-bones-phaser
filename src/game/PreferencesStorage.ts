// ─── User preferences storage (No Phaser imports) ───
// Merges audio, gameplay, and future preference sections in one localStorage blob.

import { GAMEPLAY } from './Constants';
import type { AudioPreferences } from './AudioPreferences';
import type { GameplayPreferences } from './GameplayPreferences';
import type { ScoreAnimTimings } from './ScoreAnimTimings';

export interface StoredUserPreferences {
  audio?: Partial<AudioPreferences>;
  gameplay?: Partial<GameplayPreferences>;
  scoreAnim?: Partial<ScoreAnimTimings>;
}

export function readStoredUserPreferences(): StoredUserPreferences {
  try {
    const raw = localStorage.getItem(GAMEPLAY.PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredUserPreferences;
  } catch {
    return {};
  }
}

export function writeStoredUserPreferences(next: StoredUserPreferences): void {
  try {
    localStorage.setItem(GAMEPLAY.PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or private browsing — ignore
  }
}

/** Merge a partial update into the stored preferences blob. */
export function patchStoredUserPreferences(patch: Partial<StoredUserPreferences>): void {
  const current = readStoredUserPreferences();
  writeStoredUserPreferences({
    audio: patch.audio !== undefined ? { ...current.audio, ...patch.audio } : current.audio,
    gameplay: patch.gameplay !== undefined ? { ...current.gameplay, ...patch.gameplay } : current.gameplay,
    scoreAnim: patch.scoreAnim !== undefined ? { ...current.scoreAnim, ...patch.scoreAnim } : current.scoreAnim,
  });
}
