// ─── Auto-save timer (Phaser layer) ───
// Periodically writes GameSaveSnapshot to localStorage during an active run.

import type { Game, Scene } from 'phaser';
import { GAMEPLAY } from '../game/Constants';
import { getRunState } from '../game/store/runStore';
import { clearAutoSaveStorage, readAutoSaveCandidates, writeAutoSaveToStorage } from '../game/AutoSave';
import type { GameSaveSnapshot } from '../game/SaveLoad';
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
let pagehideRegistered = false;

function devAutoSaveWarn(message: string, err?: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[AutoSave] ${message}`, err ?? '');
  }
}

function registerPagehideFlushOnce(): void {
  if (pagehideRegistered || typeof window === 'undefined') return;
  pagehideRegistered = true;
  window.addEventListener('pagehide', () => {
    flushAutoSave();
  });
}

export function initAutoSave(game: Game): void {
  stopAutoSaveLoop();
  gameRef = game;
  registerPagehideFlushOnce();
}

/** Flush pending state and stop the timer — call before destroying the Phaser game (e.g. HMR). */
export function shutdownAutoSave(): void {
  flushAutoSave();
  stopAutoSaveLoop();
  gameRef = null;
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
  if (!getRunState().professionId) return;

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

function tryRestoreSnapshot(hostScene: Scene, snapshot: GameSaveSnapshot): boolean {
  try {
    restoreSnapshotToScene(hostScene, snapshot);
    ensureBackgroundMusic(hostScene);
    startAutoSaveLoop();
    return true;
  } catch (err) {
    devAutoSaveWarn('Restore failed for snapshot', err);
    return false;
  }
}

/** Restore from localStorage on boot. Returns true if a scene was started. */
export function tryRestoreAutoSaveOnBoot(hostScene: Scene): boolean {
  const candidates = readAutoSaveCandidates();
  if (candidates.length === 0) {
    return false;
  }

  for (const snapshot of candidates) {
    if (tryRestoreSnapshot(hostScene, snapshot)) {
      writeAutoSaveToStorage(snapshot);
      return true;
    }
  }

  if (!import.meta.env.DEV) {
    clearAutoSaveStorage();
  } else {
    devAutoSaveWarn('All auto-save candidates failed restore; keeping localStorage for inspection');
  }

  return false;
}
