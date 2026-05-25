// ─── Gameplay preferences (No Phaser imports) ───
// Persisted separately from auto-save / run state.

import { patchStoredUserPreferences, readStoredUserPreferences } from './PreferencesStorage';

export interface GameplayPreferences {
  autoRollFirstHand: boolean;
  /** When true, sticker icons stay fixed on the die face instead of orbiting */
  stationaryStickers: boolean;
}

export const DEFAULT_GAMEPLAY_PREFERENCES: GameplayPreferences = {
  autoRollFirstHand: false,
  stationaryStickers: false,
};

let cached: GameplayPreferences | null = null;

function normalizeGameplay(partial?: Partial<GameplayPreferences>): GameplayPreferences {
  const base = DEFAULT_GAMEPLAY_PREFERENCES;
  return {
    autoRollFirstHand:
      typeof partial?.autoRollFirstHand === 'boolean' ? partial.autoRollFirstHand : base.autoRollFirstHand,
    stationaryStickers:
      typeof partial?.stationaryStickers === 'boolean' ? partial.stationaryStickers : base.stationaryStickers,
  };
}

function readFromStorage(): GameplayPreferences {
  const parsed = readStoredUserPreferences();
  return normalizeGameplay(parsed.gameplay);
}

/** Load preferences from localStorage into memory (idempotent). */
export function initGameplayPreferences(): void {
  cached = readFromStorage();
}

/** Current gameplay preferences (loads from storage on first access). */
export function getGameplayPreferences(): GameplayPreferences {
  if (!cached) cached = readFromStorage();
  return cached;
}

/** Update in-memory preferences and persist to localStorage. */
export function setGameplayPreferences(prefs: GameplayPreferences): void {
  cached = normalizeGameplay(prefs);
  patchStoredUserPreferences({ gameplay: cached });
}
