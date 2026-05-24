// ─── UI effect helpers (No Phaser imports) ───

import type { UseConsumableResult } from '../ConsumablesSystem';
import { runActions } from './runStore';

/** Queue consumable destruction / pop-in playback for Phaser scenes to consume once. */
export function enqueueConsumablePlayback(
  result: Pick<UseConsumableResult, 'consumableAnimEvents' | 'equipmentCreatedCount'>,
): void {
  const events = result.consumableAnimEvents ?? [];
  const equipmentCreatedCount = result.equipmentCreatedCount ?? 0;
  if (events.length === 0 && equipmentCreatedCount <= 0) return;
  runActions.enqueueUiEffect({
    kind: 'consumable-anim',
    events,
    equipmentCreatedCount: equipmentCreatedCount > 0 ? equipmentCreatedCount : undefined,
  });
}
