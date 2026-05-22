// ─── Booster Pack Definitions ───
// Typed pack data following the trail_tags.ts pattern.
// Each pack defines category, tier, shop weight, and display color.

// ─── Types ───

export type PackCategory = 'dice' | 'supply' | 'trail_guide' | 'frontier' | 'equipment';
export type PackTier = 'normal' | 'jumbo' | 'mega';

export interface PackDef {
  id: string;
  category: PackCategory;
  tier: PackTier;
  name: string;
  cost: number;
  totalCards: number;
  pickCount: number;
  weight: number;
  color: number;
}

// ─── Pack Definitions ───

const packs: PackDef[] = [
  {
    id: 'dice_standard',
    category: 'dice',
    tier: 'normal',
    name: 'Dice Grab Bag',
    cost: 4,
    totalCards: 3,
    pickCount: 1,
    weight: 4,
    color: 0x8b4513,
  },
  {
    id: 'dice_jumbo',
    category: 'dice',
    tier: 'jumbo',
    name: 'Jumbo Grab Bag',
    cost: 6,
    totalCards: 5,
    pickCount: 1,
    weight: 2,
    color: 0xa0522d,
  },
  {
    id: 'dice_mega',
    category: 'dice',
    tier: 'mega',
    name: 'Mega Grab Bag',
    cost: 8,
    totalCards: 5,
    pickCount: 2,
    weight: 0.5,
    color: 0xcd853f,
  },
  {
    id: 'supply_standard',
    category: 'supply',
    tier: 'normal',
    name: 'Supply Pack',
    cost: 4,
    totalCards: 3,
    pickCount: 1,
    weight: 4,
    color: 0x2e8b57,
  },
  {
    id: 'supply_jumbo',
    category: 'supply',
    tier: 'jumbo',
    name: 'Jumbo Supply Pack',
    cost: 6,
    totalCards: 5,
    pickCount: 1,
    weight: 2,
    color: 0x3cb371,
  },
  {
    id: 'supply_mega',
    category: 'supply',
    tier: 'mega',
    name: 'Mega Supply Pack',
    cost: 8,
    totalCards: 5,
    pickCount: 2,
    weight: 0.5,
    color: 0x66cdaa,
  },
  {
    id: 'trail_guide_standard',
    category: 'trail_guide',
    tier: 'normal',
    name: 'Trail Guide Pack',
    cost: 4,
    totalCards: 3,
    pickCount: 1,
    weight: 4,
    color: 0x4682b4,
  },
  {
    id: 'trail_guide_jumbo',
    category: 'trail_guide',
    tier: 'jumbo',
    name: 'Jumbo Trail Guide Pack',
    cost: 6,
    totalCards: 5,
    pickCount: 1,
    weight: 2,
    color: 0x5b9bd5,
  },
  {
    id: 'trail_guide_mega',
    category: 'trail_guide',
    tier: 'mega',
    name: 'Mega Trail Guide Pack',
    cost: 8,
    totalCards: 5,
    pickCount: 2,
    weight: 0.5,
    color: 0x87ceeb,
  },
  {
    id: 'frontier_standard',
    category: 'frontier',
    tier: 'normal',
    name: 'Frontier Pack',
    cost: 4,
    totalCards: 2,
    pickCount: 1,
    weight: 0.6,
    color: 0x8b008b,
  },
  {
    id: 'frontier_jumbo',
    category: 'frontier',
    tier: 'jumbo',
    name: 'Jumbo Frontier Pack',
    cost: 6,
    totalCards: 4,
    pickCount: 1,
    weight: 0.3,
    color: 0x9932cc,
  },
  {
    id: 'frontier_mega',
    category: 'frontier',
    tier: 'mega',
    name: 'Mega Frontier Pack',
    cost: 8,
    totalCards: 4,
    pickCount: 2,
    weight: 0.07,
    color: 0xba55d3,
  },
  {
    id: 'equipment_standard',
    category: 'equipment',
    tier: 'normal',
    name: 'Equipment Pack',
    cost: 4,
    totalCards: 2,
    pickCount: 1,
    weight: 1.2,
    color: 0xb8860b,
  },
  {
    id: 'equipment_jumbo',
    category: 'equipment',
    tier: 'jumbo',
    name: 'Jumbo Equipment Pack',
    cost: 6,
    totalCards: 4,
    pickCount: 1,
    weight: 0.6,
    color: 0xdaa520,
  },
  {
    id: 'equipment_mega',
    category: 'equipment',
    tier: 'mega',
    name: 'Mega Equipment Pack',
    cost: 8,
    totalCards: 4,
    pickCount: 2,
    weight: 0.15,
    color: 0xffd700,
  },
];

export default packs;

// ─── Lookup Helpers ───

/** Find a pack definition by ID */
export function getPackById(id: string): PackDef | undefined {
  return packs.find((p) => p.id === id);
}
