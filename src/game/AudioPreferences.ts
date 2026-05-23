// ─── Audio preferences (No Phaser imports) ───
// Persisted separately from auto-save / run state.

import { patchStoredUserPreferences, readStoredUserPreferences } from './PreferencesStorage';

export interface AudioPreferences {
  musicEnabled: boolean;
  musicVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  musicEnabled: true,
  musicVolume: 0.3,
  sfxEnabled: true,
  sfxVolume: 1,
};

let cached: AudioPreferences | null = null;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeAudio(partial?: Partial<AudioPreferences>): AudioPreferences {
  const base = DEFAULT_AUDIO_PREFERENCES;
  return {
    musicEnabled: typeof partial?.musicEnabled === 'boolean' ? partial.musicEnabled : base.musicEnabled,
    musicVolume: clamp01(partial?.musicVolume ?? base.musicVolume),
    sfxEnabled: typeof partial?.sfxEnabled === 'boolean' ? partial.sfxEnabled : base.sfxEnabled,
    sfxVolume: clamp01(partial?.sfxVolume ?? base.sfxVolume),
  };
}

function readFromStorage(): AudioPreferences {
  try {
    const parsed = readStoredUserPreferences();
    return normalizeAudio(parsed.audio);
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

function writeToStorage(prefs: AudioPreferences): void {
  patchStoredUserPreferences({ audio: prefs });
}

/** Load preferences from localStorage into memory (idempotent). */
export function initAudioPreferences(): void {
  cached = readFromStorage();
}

/** Current audio preferences (loads from storage on first access). */
export function getAudioPreferences(): AudioPreferences {
  if (!cached) cached = readFromStorage();
  return cached;
}

/** Update in-memory preferences and persist to localStorage. */
export function setAudioPreferences(prefs: AudioPreferences): void {
  cached = normalizeAudio(prefs);
  writeToStorage(cached);
}
