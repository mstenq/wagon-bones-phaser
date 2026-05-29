// ─── on-supply-used lifecycle ───
// Run-wide supplyCardsUsed counter (Campfire Stories reads it at score time).

import type { EquipmentInstance } from '../../ItemsSystem';
import { getRunState, runActions } from '../../store/runStore';

export function processEquipmentOnSupplyUsed(_equipment: EquipmentInstance[]): void {
  const run = getRunState();
  runActions.patch({ supplyCardsUsed: run.supplyCardsUsed + 1 });
}
