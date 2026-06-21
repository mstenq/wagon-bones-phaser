// ─── User settings browser I/O (Phaser layer) ───

import type { Scene } from 'phaser';
import {
  applyUserSettingsBundle,
  buildUserSettingsBundle,
  reloadUserSettingsCaches,
  validateUserSettingsBundle,
} from '../game/UserSettings';
import { applyBackgroundMusicPreferences } from './BackgroundMusic';
import { downloadJson, pickAndParseJson } from './JsonFileIO';

const USER_SETTINGS_FILENAME = 'wagon-bones-user-settings.json';

export function exportUserSettings(): void {
  try {
    const bundle = buildUserSettingsBundle();
    downloadJson(bundle, USER_SETTINGS_FILENAME);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    window.alert(msg);
  }
}

export async function performLoadUserSettings(scene: Scene): Promise<void> {
  const ok = window.confirm(
    'Load user settings? Your current preferences and progression stats will be replaced. This cannot be undone.',
  );
  if (!ok) return;

  try {
    const parsed = await pickAndParseJson();
    const bundle = validateUserSettingsBundle(parsed);
    if (!bundle) {
      window.alert('Invalid or unsupported user settings file.');
      return;
    }

    applyUserSettingsBundle(bundle);
    reloadUserSettingsCaches();
    applyBackgroundMusicPreferences(scene);
    window.alert('User settings loaded.');
  } catch (err) {
    if (err instanceof Error && err.message === 'No file selected') return;
    const msg = err instanceof Error ? err.message : 'Load failed';
    window.alert(msg);
  }
}
