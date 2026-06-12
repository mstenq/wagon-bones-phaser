// ─── Background music helper ───
// Ordered playlist; advances on track complete. Phaser play() stacks instances — use add() once per track.

import type { Game, Scene } from 'phaser';
import { getAudioPreferences } from '../game/AudioPreferences';

/** Ordered background music playlist — plays through then repeats. Add keys here and in Preloader. */
export const BG_MUSIC_PLAYLIST = ['bg_music_1', 'bg_music_2'] as const;

export type BgMusicTrackKey = (typeof BG_MUSIC_PLAYLIST)[number];

/** First playlist track; kept for callers that reference a single music key. */
export const BG_MUSIC_KEY: BgMusicTrackKey = BG_MUSIC_PLAYLIST[0];

let playlistTrackIndex = 0;
let currentPlaylistSound: Phaser.Sound.BaseSound | null = null;

function soundManager(scene: Scene): Phaser.Sound.BaseSoundManager {
  return scene.sound;
}

function gameSoundManager(game: Game): Phaser.Sound.BaseSoundManager {
  return game.sound;
}

function isPlaylistTrackCached(game: Game, key: BgMusicTrackKey): boolean {
  return game.cache?.audio?.exists(key) ?? false;
}

function hasAnyCachedPlaylistTrack(scene: Scene): boolean {
  return BG_MUSIC_PLAYLIST.some((key) => scene.cache?.audio?.exists(key));
}

function detachPlaylistCompleteHandler(): void {
  if (!currentPlaylistSound) return;
  currentPlaylistSound.off('complete');
  currentPlaylistSound = null;
}

function playPlaylistTrackAt(game: Game, trackIndex: number): void {
  const key = BG_MUSIC_PLAYLIST[trackIndex];
  if (!key || !isPlaylistTrackCached(game, key)) return;

  const prefs = getAudioPreferences();
  if (!prefs.musicEnabled) return;

  const manager = gameSoundManager(game);
  detachPlaylistCompleteHandler();
  manager.stopByKey(key);

  const sound = manager.add(key, { loop: false, volume: prefs.musicVolume });
  playlistTrackIndex = trackIndex;
  currentPlaylistSound = sound;

  sound.once('complete', () => {
    currentPlaylistSound = null;
    if (!getAudioPreferences().musicEnabled) return;
    const nextIndex = (trackIndex + 1) % BG_MUSIC_PLAYLIST.length;
    playPlaylistTrackAt(game, nextIndex);
  });

  sound.play();
}

/** True if any playlist track is currently playing. */
export function isBackgroundMusicPlaying(scene: Scene): boolean {
  const manager = soundManager(scene);
  return BG_MUSIC_PLAYLIST.some((key) => manager.isPlaying(key));
}

/** Stop every background-music instance (Phaser may hold more than one). */
export function stopBackgroundMusic(scene: Scene): void {
  detachPlaylistCompleteHandler();
  const manager = soundManager(scene);
  for (const key of BG_MUSIC_PLAYLIST) {
    manager.stopByKey(key);
  }
}

/** Set volume on all background-music instances (normally only one). */
export function setBackgroundMusicVolume(scene: Scene, volume: number): void {
  const manager = soundManager(scene);
  for (const key of BG_MUSIC_PLAYLIST) {
    for (const sound of manager.getAll(key)) {
      if ('setVolume' in sound && typeof sound.setVolume === 'function') {
        sound.setVolume(volume);
      }
    }
  }
}

/** Start the background playlist if enabled and not already playing. */
export function ensureBackgroundMusic(scene: Scene): void {
  if (!hasAnyCachedPlaylistTrack(scene)) return;

  const prefs = getAudioPreferences();
  if (!prefs.musicEnabled) return;
  if (isBackgroundMusicPlaying(scene)) {
    setBackgroundMusicVolume(scene, prefs.musicVolume);
    return;
  }

  playPlaylistTrackAt(scene.game, playlistTrackIndex);
}

/** Apply enable/volume preferences (settings UI and toggles). */
export function applyBackgroundMusicPreferences(scene: Scene): void {
  if (!hasAnyCachedPlaylistTrack(scene)) return;

  const prefs = getAudioPreferences();

  if (!prefs.musicEnabled) {
    stopBackgroundMusic(scene);
    return;
  }

  if (isBackgroundMusicPlaying(scene)) {
    setBackgroundMusicVolume(scene, prefs.musicVolume);
    return;
  }

  playPlaylistTrackAt(scene.game, playlistTrackIndex);
}
