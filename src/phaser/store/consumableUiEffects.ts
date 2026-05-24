// ─── Consumable UI effect subscription (Phaser) ───

import type { Scene } from 'phaser';
import type { ConsumableAnimEvent } from '../../game/ConsumablesSystem';
import { runActions, runStore } from '../../game/store/runStore';
import { applyConsumableAnimEvents, playEquipmentCreatedPopIn } from '../animations/ConsumableAnimPlayback';
import type { EquipmentBar } from '../ui/EquipmentBar';
import { bindStore } from './subscribe';

export interface ConsumableUiEffectHandlers {
  destroyDice: (diceIds: string[]) => Promise<void>;
}

/** Subscribe once per scene; plays consumable-anim ui effects and removes them from the queue. */
export function bindConsumableUiEffects(
  scene: Scene,
  equipBar: EquipmentBar,
  handlers: ConsumableUiEffectHandlers,
): () => void {
  const playEffects = async (effects: ConsumableAnimEvent[], equipmentCreatedCount?: number) => {
    if (effects.length > 0) {
      await applyConsumableAnimEvents(scene, equipBar, effects, handlers);
    }
    await playEquipmentCreatedPopIn(scene, equipBar, equipmentCreatedCount);
  };

  return bindStore(
    scene,
    runStore,
    (state) => state.uiEffects.filter((e) => e.kind === 'consumable-anim' || e.kind === 'equipment-created-count'),
    (queued) => {
      if (queued.length === 0) return;
      void (async () => {
        const consumableTaken = runActions.takeUiEffects((e) => e.kind === 'consumable-anim');
        for (const effect of consumableTaken) {
          if (effect.kind !== 'consumable-anim') continue;
          await playEffects(effect.events, effect.equipmentCreatedCount);
        }
        const createdTaken = runActions.takeUiEffects((e) => e.kind === 'equipment-created-count');
        for (const effect of createdTaken) {
          if (effect.kind === 'equipment-created-count') {
            await playEquipmentCreatedPopIn(scene, equipBar, effect.count);
          }
        }
      })();
    },
    {
      equalityFn: (a, b) => a.length === b.length && a.every((e, i) => e === b[i]),
    },
  );
}
