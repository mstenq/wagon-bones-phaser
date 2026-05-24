// ─── Consumable animation playback (Phaser) ───

import type { Scene } from 'phaser';
import type { ConsumableAnimEvent } from '../../game/ConsumablesSystem';
import type { EquipmentBar } from '../ui/EquipmentBar';
import { getPlayerState } from '../../game/PlayerState';
import { animateEquipmentFireDestructionParallel } from './EquipmentFireDestroyAnimation';
import { animateEquipmentPopIn } from './EquipmentPopInAnimation';

export function applyConsumableAnimEvents(
  scene: Scene,
  equipBar: EquipmentBar,
  events: ConsumableAnimEvent[],
  diceHandlers: {
    destroyDice: (diceIds: string[]) => Promise<void>;
  },
): Promise<void> {
  let chain = Promise.resolve();
  for (const event of events) {
    chain = chain.then(() => playConsumableAnimEvent(scene, equipBar, event, diceHandlers));
  }
  return chain;
}

function playConsumableAnimEvent(
  scene: Scene,
  equipBar: EquipmentBar,
  event: ConsumableAnimEvent,
  diceHandlers: { destroyDice: (diceIds: string[]) => Promise<void> },
): Promise<void> {
  if (event.type === 'destroy_dice') {
    return diceHandlers.destroyDice(event.diceIds);
  }

  return new Promise((resolve) => {
    animateEquipmentFireDestructionParallel(scene, equipBar, event.destructions, () => {
      const player = getPlayerState();
      const addCount = event.equipmentToAdd?.length ?? 0;
      if (addCount > 0) {
        player.equipment.push(...event.equipmentToAdd!);
      }
      void animateEquipmentPopIn(scene, equipBar, addCount).then(resolve);
    });
  });
}

/** Pop in equipment granted synchronously by a consumable (Ingenuity, Magic Beans, etc.). */
export async function playEquipmentCreatedPopIn(
  scene: Scene,
  equipBar: EquipmentBar,
  count: number | undefined,
): Promise<void> {
  if (!count || count <= 0) return;
  await animateEquipmentPopIn(scene, equipBar, count);
}
