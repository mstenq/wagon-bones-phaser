// ─── Game audio ───
// Patches Phaser sound prototypes so every play path respects preferences.

import * as Phaser from 'phaser';
import type { Scene } from 'phaser';
import { getAudioPreferences } from '../game/AudioPreferences';
import {
  applyBackgroundMusicPreferences,
  BG_MUSIC_KEY,
} from './BackgroundMusic';

const MUSIC_KEYS = new Set([BG_MUSIC_KEY]);

type SoundConfig = Phaser.Types.Sound.SoundConfig;
type SoundMarker = Phaser.Types.Sound.SoundMarker;
type SoundPlayExtra = SoundConfig | SoundMarker;

/** Runtime config on BaseSound instances (not exposed on Phaser's public types). */
type SoundWithConfig = Phaser.Sound.BaseSound & { config?: SoundConfig };

/** HTML5/WebAudio sounds expose setVolume; used for live music volume updates. */
type VolumeControllableSound = Phaser.Sound.BaseSound & {
  setVolume(value: number): unknown;
};

let audioPatched = false;

function isSoundMarker(extra: SoundPlayExtra | undefined): extra is SoundMarker {
  return extra !== undefined && 'name' in extra;
}

function scaleSoundConfig(config: SoundConfig | undefined, scale: number): SoundConfig | undefined {
  if (!config) return config;
  return { ...config, volume: (config.volume ?? 1) * scale };
}

function scaleSfxPlayArgs(
  markerName: string | SoundConfig | undefined,
  config: SoundConfig | undefined,
  defaultVolume: number,
  sfxVolume: number,
): [string | SoundConfig | undefined, SoundConfig | undefined] {
  if (typeof markerName === 'object') {
    return [scaleSoundConfig(markerName, sfxVolume), config];
  }
  if (config !== undefined) {
    return [markerName, scaleSoundConfig(config, sfxVolume)];
  }
  return [markerName, { volume: defaultVolume * sfxVolume }];
}

function getSoundDefaultVolume(sound: Phaser.Sound.BaseSound): number {
  return (sound as SoundWithConfig).config?.volume ?? 1;
}

function setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  (sound as VolumeControllableSound).setVolume(volume);
}

/**
 * Patch Phaser sound prototypes once at boot.
 * WebAudio/HTML5 managers override `add`, so instance wrapping on add never ran;
 * patching BaseSound#play covers manager.play() and sound.add().play().
 */
export function patchGameAudio(): void {
  if (audioPatched) return;
  audioPatched = true;

  const originalSoundPlay = Phaser.Sound.BaseSound.prototype.play;
  Phaser.Sound.BaseSound.prototype.play = function (
    this: Phaser.Sound.BaseSound,
    markerName?: string | SoundConfig,
    config?: SoundConfig,
  ): boolean {
    const prefs = getAudioPreferences();
    const key = this.key;

    if (MUSIC_KEYS.has(key)) {
      return originalSoundPlay.call(this, markerName, config);
    }

    if (!prefs.sfxEnabled) return false;

    const [scaledMarker, scaledConfig] = scaleSfxPlayArgs(
      markerName,
      config,
      getSoundDefaultVolume(this),
      prefs.sfxVolume,
    );
    return originalSoundPlay.call(this, scaledMarker, scaledConfig);
  };

  const managerProto = Phaser.Sound.BaseSoundManager.prototype;
  const originalManagerPlay = managerProto.play;

  managerProto.play = function (
    this: Phaser.Sound.BaseSoundManager,
    key: string,
    extra?: SoundPlayExtra,
  ): boolean {
    const prefs = getAudioPreferences();

    if (MUSIC_KEYS.has(key)) {
      if (!prefs.musicEnabled) {
        this.stopByKey(key);
        return false;
      }
      if (this.isPlaying(key)) {
        for (const instance of this.getAll(BG_MUSIC_KEY)) {
          setSoundVolume(instance, prefs.musicVolume);
        }
        return true;
      }
      const musicExtra: SoundPlayExtra = isSoundMarker(extra)
        ? extra
        : { ...(extra ?? {}), volume: prefs.musicVolume };
      return originalManagerPlay.call(this, key, musicExtra);
    }

    if (!prefs.sfxEnabled) return false;
    return originalManagerPlay.call(this, key, extra);
  };
}

/** Stop, start, or retarget volume on the looping background track. */
export function applyMusicPreferences(scene: Scene): void {
  applyBackgroundMusicPreferences(scene);
}
