// ─── Resolve pack item → consumable def id (No Phaser imports) ───

import type { PackItem } from '../BoosterPackSystem';

export function resolvePackItemDefId(item: PackItem): string | null {
  if (item.category === 'supply' && item.supplyCardId) return item.supplyCardId;
  if (item.category === 'trail_guide' && item.trailGuideId) return item.trailGuideId;
  if (item.category === 'frontier' && item.frontierEncounterId) return item.frontierEncounterId;
  return null;
}
