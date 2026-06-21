// ─── User settings export / load (No Phaser imports) ───
// Bundles preferences and cross-run stats for file export and import.

import { initAudioPreferences } from './AudioPreferences';
import { initGameplayPreferences } from './GameplayPreferences';
import {
  readStoredUserPreferences,
  writeStoredUserPreferences,
  type StoredUserPreferences,
} from './PreferencesStorage';
import { initScoreAnimTimings } from './ScoreAnimTimings';
import { initTutorialPreferences } from './TutorialPreferences';
import {
  invalidateUserStatsCache,
  normalizeUserStatsData,
  readUserStats,
  writeUserStats,
  type UserStatsData,
} from './UserStats';

export interface UserSettingsBundle {
  preferences: StoredUserPreferences;
  userStats: UserStatsData;
}

export function buildUserSettingsBundle(): UserSettingsBundle {
  return {
    preferences: readStoredUserPreferences(),
    userStats: readUserStats(),
  };
}

const PREFERENCE_SECTIONS = ['audio', 'gameplay', 'scoreAnim', 'tutorial'] as const;

function validatePreferences(raw: unknown): StoredUserPreferences | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const preferences: StoredUserPreferences = {};

  for (const key of PREFERENCE_SECTIONS) {
    const section = obj[key];
    if (section === undefined) continue;
    if (typeof section !== 'object' || section === null) return null;
    preferences[key] = section as StoredUserPreferences[typeof key];
  }

  return preferences;
}

export function validateUserSettingsBundle(parsed: unknown): UserSettingsBundle | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const preferences = validatePreferences(obj.preferences);
  if (!preferences) return null;
  if (!obj.userStats || typeof obj.userStats !== 'object') return null;

  const rawStats = obj.userStats as UserStatsData;
  if (!rawStats.professions || typeof rawStats.professions !== 'object') return null;

  const equipment = rawStats.equipment && typeof rawStats.equipment === 'object' ? rawStats.equipment : {};
  const discoveredSecretHands = Array.isArray(rawStats.discoveredSecretHands) ? rawStats.discoveredSecretHands : [];

  return {
    preferences,
    userStats: normalizeUserStatsData({
      professions: rawStats.professions,
      equipment,
      discoveredSecretHands,
    }),
  };
}

export function applyUserSettingsBundle(bundle: UserSettingsBundle): void {
  writeStoredUserPreferences(bundle.preferences);
  writeUserStats(bundle.userStats);
}

export function reloadUserSettingsCaches(): void {
  initAudioPreferences();
  initGameplayPreferences();
  initTutorialPreferences();
  initScoreAnimTimings();
  invalidateUserStatsCache();
  readUserStats();
}
