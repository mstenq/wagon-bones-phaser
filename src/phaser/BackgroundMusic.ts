// ─── Background music helper ───
// Single looping track; Phaser's play() creates a new instance each call — never stack them.

import type { Scene } from 'phaser';
import { getAudioPreferences } from '../game/AudioPreferences';

export const BG_MUSIC_KEY = 'bg_music_1';

function soundManager(scene: Scene): Phaser.Sound.BaseSoundManager {
  return scene.sound;
}

/** True if any instance of the background track is currently playing. */
export function isBackgroundMusicPlaying(scene: Scene): boolean {
  return soundManager(scene).isPlaying(BG_MUSIC_KEY);
}

/** Stop every background-music instance (Phaser may hold more than one). */
export function stopBackgroundMusic(scene: Scene): void {
  soundManager(scene).stopByKey(BG_MUSIC_KEY);
}

/** Set volume on all background-music instances (normally only one). */
export function setBackgroundMusicVolume(scene: Scene, volume: number): void {
  for (const sound of soundManager(scene).getAll(BG_MUSIC_KEY)) {
    sound.setVolume(volume);
  }
}

/** Start looping background music if enabled and not already playing. */
export function ensureBackgroundMusic(scene: Scene): void {
  if (!scene.cache?.audio?.exists(BG_MUSIC_KEY)) return;

  const prefs = getAudioPreferences();
  if (!prefs.musicEnabled) return;
  if (isBackgroundMusicPlaying(scene)) {
    setBackgroundMusicVolume(scene, prefs.musicVolume);
    return;
  }

  scene.sound.play(BG_MUSIC_KEY, { loop: true, volume: prefs.musicVolume });
}

/** Apply enable/volume preferences (settings UI and toggles). */
export function applyBackgroundMusicPreferences(scene: Scene): void {
  if (!scene.cache?.audio?.exists(BG_MUSIC_KEY)) return;

  const prefs = getAudioPreferences();

  if (!prefs.musicEnabled) {
    stopBackgroundMusic(scene);
    return;
  }

  if (isBackgroundMusicPlaying(scene)) {
    setBackgroundMusicVolume(scene, prefs.musicVolume);
    return;
  }

  scene.sound.play(BG_MUSIC_KEY, { loop: true, volume: prefs.musicVolume });
}
