// ─── Shared scene playback runner binding ───

import type { Scene } from 'phaser';
import type { ConsumableBar } from '../ui/ConsumableBar';
import type { EquipmentBar } from '../ui/EquipmentBar';
import type { Sidebar } from '../ui/Sidebar';
import { bindRunScenePlayback, type RunScenePlaybackOptions } from '../scenes/runSceneShell';
import type { PlaybackRunnerHandle } from './PlaybackRunner';

export interface ScenePlaybackBindOptions {
  scene: Scene;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  sidebar: Sidebar;
  getDiceSprites?: RunScenePlaybackOptions['getDiceSprites'];
  destroyDice?: RunScenePlaybackOptions['destroyDice'];
  scoreLayoutGate?: RunScenePlaybackOptions['scoreLayoutGate'];
  setAnimating?: RunScenePlaybackOptions['setAnimating'];
  onDiceAdded?: RunScenePlaybackOptions['onDiceAdded'];
  onScoreComplete?: RunScenePlaybackOptions['onScoreComplete'];
  showFloatingText?: RunScenePlaybackOptions['showFloatingText'];
  getTagEarnedOrigin?: RunScenePlaybackOptions['getTagEarnedOrigin'];
  getTagStackAnchor?: RunScenePlaybackOptions['getTagStackAnchor'];
}

/** Bind the standard playback runner for a scene with equipment/consumable UI. */
export function bindScenePlaybackRunner(scene: Scene, options: ScenePlaybackBindOptions): PlaybackRunnerHandle {
  const { equipBar, consumableBar, sidebar, scene: _scene, ...playback } = options;
  return bindRunScenePlayback(scene, { equipBar, consumableBar, sidebar }, playback);
}
