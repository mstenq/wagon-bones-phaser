// ─── Equipment catalog (No Phaser imports) ───
// Static equipment pool + def lookup. Separate from ItemsSystem so resolve can
// look up defs without importing displayContext / full ItemsSystem.

import allItems from '../data/items';
import itemAuras, { type ItemAura } from '../data/item_auras';
import type { ItemDef } from '../data/items';

export type EquipmentCatalogDef = ItemDef;

export function getEquipmentPool(): EquipmentCatalogDef[] {
  return allItems as EquipmentCatalogDef[];
}

export function getEquipmentDefById(id: string): EquipmentCatalogDef | undefined {
  return getEquipmentPool().find((i) => i.id === id);
}

export function getItemAuraById(id: string): ItemAura | null {
  const aura = itemAuras.find((a) => a.id === id);
  return aura ? { ...aura } : null;
}
