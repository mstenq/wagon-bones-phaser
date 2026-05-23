// ─── Auto-save timer (Phaser layer) ───
// Periodically writes GameSaveSnapshot to localStorage during an active run.

import type { Game, Scene } from 'phaser';
import { GAMEPLAY } from '../game/Constants';
import { getPlayerState } from '../game/PlayerState';
import { clearAutoSaveStorage, readAutoSaveFromStorage, writeAutoSaveToStorage } from '../game/AutoSave';
import { buildSnapshotFromScene, restoreSnapshotToScene } from './SaveLoadIO';
import { ensureBackgroundMusic } from './BackgroundMusic';
import type { ActiveScene } from '../game/SaveLoad';

const AUTOSAVE_SCENE_KEYS: ReadonlySet<ActiveScene> = new Set([
  'Game',
  'Shop',
  'BoosterPack',
  'TrailEvent',
  'RoundSelect',
]);

let gameRef: Game | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function initAutoSave(game: Game): void {
  gameRef = game;
}

export function startAutoSaveLoop(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(autoSaveTick, GAMEPLAY.AUTOSAVE_INTERVAL_MS);
}

export function stopAutoSaveLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Stop timer and remove persisted auto-save. */
export function clearAutoSave(): void {
  stopAutoSaveLoop();
  clearAutoSaveStorage();
}

function findActiveAutoSaveScene(): Scene | null {
  if (!gameRef) return null;
  for (const scene of gameRef.scene.scenes) {
    const key = scene.scene.key as ActiveScene;
    if (scene.scene.isActive() && AUTOSAVE_SCENE_KEYS.has(key)) {
      return scene;
    }
  }
  return null;
}

function autoSaveTick(): void {
  const scene = findActiveAutoSaveScene();
  if (!scene) return;
  if (!getPlayerState().profession) return;

  try {
    const snapshot = buildSnapshotFromScene(scene);
    writeAutoSaveToStorage(snapshot);
  } catch {
    // Scene mid-transition (e.g. resize) — skip this tick
  }
}

/**
 * Force an immediate autosave write for the currently active scene.
 * Use at critical state-change boundaries (e.g. after a trail event resolves)
 * to avoid losing in-memory state if the 10s timer hasn't fired yet.
 */
export function flushAutoSave(): void {
  autoSaveTick();
}

/** Restore from localStorage on boot. Returns true if a scene was started. */
export function tryRestoreAutoSaveOnBoot(hostScene: Scene): boolean {
  const snapshot = readAutoSaveFromStorage();
  if (!snapshot || !snapshot.player.professionId) {
    if (snapshot) clearAutoSaveStorage();
    return false;
  }

  try {
    restoreSnapshotToScene(hostScene, snapshot);
    ensureBackgroundMusic(hostScene);
    startAutoSaveLoop();
    return true;
  } catch {
    clearAutoSaveStorage();
    return false;
  }
}
