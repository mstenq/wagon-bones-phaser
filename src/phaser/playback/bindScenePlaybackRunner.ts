// ─── Shared scene playback runner binding ───

import type { Scene } from 'phaser';
import type { ConsumableBar } from '../ui/ConsumableBar';
import type { DiceSprite } from '../ui/DiceSprite';
import type { EquipmentBar } from '../ui/EquipmentBar';
import type { Sidebar } from '../ui/Sidebar';
import { bindPlaybackRunner, type PlaybackRunnerHandle } from './PlaybackRunner';

export interface ScenePlaybackBindOptions {
  scene: Scene;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  sidebar: Sidebar;
  getDiceSprites?: () => DiceSprite[];
  destroyDice?: (diceIds: string[]) => Promise<void>;
  scoreLayoutGate?: { promise: Promise<void> } | null;
  setAnimating?: (value: boolean) => void;
  onDiceAdded?: (dieIds: string[]) => void;
  onScoreComplete?: () => void;
  showFloatingText?: (message: string, color: number) => void;
  getTagEarnedOrigin?: (round: number) => { x: number; y: number };
  getTagStackAnchor?: () => { x: number; y: number };
}

/** Bind the standard playback runner for a scene with equipment/consumable UI. */
export function bindScenePlaybackRunner(scene: Scene, options: ScenePlaybackBindOptions): PlaybackRunnerHandle {
  return bindPlaybackRunner(scene, {
    scene: options.scene,
    equipBar: options.equipBar,
    consumableBar: options.consumableBar,
    sidebar: options.sidebar,
    getDiceSprites: options.getDiceSprites ?? (() => []),
    destroyDice: options.destroyDice ?? (async () => {}),
    scoreLayoutGate: options.scoreLayoutGate ?? null,
    setAnimating: options.setAnimating ?? (() => {}),
    onDiceAdded: options.onDiceAdded ?? (() => {}),
    onScoreComplete: options.onScoreComplete ?? (() => {}),
    showFloatingText: options.showFloatingText,
    getTagEarnedOrigin: options.getTagEarnedOrigin,
    getTagStackAnchor: options.getTagStackAnchor,
  });
}
