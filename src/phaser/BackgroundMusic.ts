// ─── Background music helper ───
// MainMenu normally starts bg_music_1; other entry paths must call this too.

import type { Scene } from 'phaser';

const BG_MUSIC_KEY = 'bg_music_1';
const BG_MUSIC_VOLUME = 0.3;

/** Start looping background music if it is not already playing. */
export function ensureBackgroundMusic(scene: Scene): void {
  if (!scene.cache?.audio?.exists(BG_MUSIC_KEY)) return;
  if (scene.sound.get(BG_MUSIC_KEY)?.isPlaying) return;
  scene.sound.play(BG_MUSIC_KEY, { loop: true, volume: BG_MUSIC_VOLUME });
}
