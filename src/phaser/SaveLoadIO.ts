// ─── Save / Load browser I/O (Phaser layer) ───

import type { Scene } from 'phaser';
import {
  buildSaveSnapshot,
  applySaveSnapshot,
  validateSaveSnapshot,
  getSaveFilename,
  assertSaveIntegrity,
  type GameSaveSnapshot,
  type ActiveScene,
} from '../game/SaveLoad';
import { getRunState } from '../game/store/runStore';
import { readPreviousAutoSaveFromStorage } from '../game/AutoSave';
import { startAutoSaveLoop } from './AutoSaveManager';
import { ensureBackgroundMusic } from './BackgroundMusic';
import { sceneActions } from '../game/store/sceneStore';

export function downloadSave(snapshot: GameSaveSnapshot, filename?: string): void {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? getSaveFilename(snapshot);
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeDebugSaveFilename(name: string): string {
  const trimmed = name.trim() || 'debug';
  return trimmed.replace(/[<>:"/\\|?*]/g, '-');
}

export function exportPreviousAutoSaveFromStorage(): void {
  const snapshot = readPreviousAutoSaveFromStorage();
  if (!snapshot) {
    window.alert('No previous save state available.');
    return;
  }

  const name = window.prompt('Name this debug save:', '');
  if (name === null) return;

  const filename = `${sanitizeDebugSaveFilename(name)}.json`;
  downloadSave(snapshot, filename);
}

export function pickAndParseSave(): Promise<GameSaveSnapshot> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as unknown;
          const snapshot = validateSaveSnapshot(parsed);
          if (!snapshot) {
            reject(new Error('Invalid or unsupported save file'));
            return;
          }
          assertSaveIntegrity(snapshot);
          resolve(snapshot);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to parse save file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };

    input.click();
  });
}

/** Ensure sceneStore activeScene matches the Phaser scene before snapshotting. */
export function syncSceneStoreFromScene(scene: Scene): ActiveScene {
  const key = scene.scene.key as ActiveScene;
  sceneActions.setActiveScene(key);
  return key;
}

export function buildSnapshotFromScene(scene: Scene): GameSaveSnapshot {
  syncSceneStoreFromScene(scene);
  return buildSaveSnapshot();
}

export function restoreSnapshotToScene(hostScene: Scene, snapshot: GameSaveSnapshot): void {
  const { scene: targetScene } = applySaveSnapshot(snapshot);
  hostScene.scene.start(targetScene, {});
}

export function exportGameFromScene(scene: Scene): void {
  try {
    const snapshot = buildSnapshotFromScene(scene);
    downloadSave(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    window.alert(msg);
  }
}

export async function performLoadGame(scene: Scene, options?: { confirmOverwrite?: boolean }): Promise<void> {
  const needsConfirm = options?.confirmOverwrite ?? getRunState().professionId !== null;

  if (needsConfirm) {
    const ok = window.confirm('Load a save file? Your current run will be replaced.');
    if (!ok) return;
  }

  try {
    const snapshot = await pickAndParseSave();
    restoreSnapshotToScene(scene, snapshot);
    ensureBackgroundMusic(scene);
    startAutoSaveLoop();
  } catch (err) {
    if (err instanceof Error && err.message === 'No file selected') return;
    const msg = err instanceof Error ? err.message : 'Load failed';
    window.alert(msg);
  }
}
