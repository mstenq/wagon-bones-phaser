// ─── Immediate pack tag → BoosterPack chain (Phaser only) ───

import type { Scene } from 'phaser';
import { gameFacade } from '../../game/facade';

/** Open the first pack in `packDefIds` and queue the rest for back-to-back opens. */
export function startImmediatePackOpens(scene: Scene, packDefIds: string[], returnScene: string): boolean {
  if (packDefIds.length === 0) return false;
  const packDef = gameFacade.meta.getPackDefById(packDefIds[0]!);
  if (!packDef) return false;
  scene.scene.start('BoosterPack', {
    packDef,
    returnScene,
    free: true,
    queuedPackDefIds: packDefIds.slice(1),
  });
  return true;
}

/** Consume pending immediate_pack tags (incl. Twin Wagon copies) and start the chain. */
export function consumeAndStartImmediatePackOpens(scene: Scene, returnScene: string): boolean {
  const packTags = gameFacade.meta.consumeTagsByCategory('immediate_pack');
  const packDefIds = gameFacade.meta.expandImmediatePackTagsToPackDefIds(packTags);
  return startImmediatePackOpens(scene, packDefIds, returnScene);
}
