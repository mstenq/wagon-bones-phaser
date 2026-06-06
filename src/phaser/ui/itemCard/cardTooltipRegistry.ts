// ─── Scene-level ItemCard tooltip tracking ───
// Tooltips live on the scene display list. The resize hook clears them before
// layout rebuilds; card destroy also hides via ItemCardTooltip.destroy().

import type { Scene } from 'phaser';
import type { ItemCardTooltip } from './ItemCardTooltip';

const tooltipsByScene = new Map<Scene, Set<ItemCardTooltip>>();
const resizeHookByScene = new WeakMap<Scene, () => void>();

function ensureResizeHook(scene: Scene): void {
  if (resizeHookByScene.has(scene)) return;

  const onResize = (): void => {
    clearSceneCardTooltips(scene);
  };

  scene.scale.on('resize', onResize);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', onResize);
    resizeHookByScene.delete(scene);
    tooltipsByScene.delete(scene);
  });

  resizeHookByScene.set(scene, onResize);
}

export function trackCardTooltip(scene: Scene, tooltip: ItemCardTooltip): () => void {
  ensureResizeHook(scene);

  let set = tooltipsByScene.get(scene);
  if (!set) {
    set = new Set();
    tooltipsByScene.set(scene, set);
  }
  set.add(tooltip);

  return () => {
    set?.delete(tooltip);
    if (set && set.size === 0) {
      tooltipsByScene.delete(scene);
    }
  };
}

/** Hide all tracked tooltips for a scene (called automatically on scale resize). */
export function clearSceneCardTooltips(scene: Scene): void {
  const set = tooltipsByScene.get(scene);
  if (!set) return;

  for (const tooltip of set) {
    tooltip.hide();
  }
  set.clear();
  tooltipsByScene.delete(scene);
}
