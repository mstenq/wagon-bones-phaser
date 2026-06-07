// ─── Item Aura Definitions ───
// Shop equipment aura metadata and spawn chances (1× permit). Dice aura rates live in dice_auras.ts.
// Design source: AURA_PERCENTAGES.md at repo root.

// ─── Types ───

export interface ItemAura {
  id: string;
  name: string;
  description: string;
  costIncrease: number;
  /** Equipment/shop spawn (sequential roll); bless card uses this for weighted pick */
  equipmentChance: number;
}

// ─── Roll order (first match wins, independent rolls per type) ───

export const EQUIPMENT_AURA_ORDER = ['holy', 'fire', 'arcane', 'ghost'] as const;

/** Pip sticker spawn on dice from shop/packs — AURA_PERCENTAGES.md */
export const DICE_STICKER_CHANCE = 0.2;

// ─── Aura Definitions ───

const itemAuras: ItemAura[] = [
  {
    id: 'holy',
    name: 'Holy',
    description: 'x1.5 Mult',
    costIncrease: 5,
    equipmentChance: 0.005,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: '+10 Mult',
    costIncrease: 4,
    equipmentChance: 0.014,
  },
  {
    id: 'arcane',
    name: 'Arcane',
    description: '+50 miles',
    costIncrease: 3,
    equipmentChance: 0.02,
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: "Doesn't take up space in your inventory",
    costIncrease: 5,
    equipmentChance: 0.003,
  },
];

export default itemAuras;

// ─── Lookup Helpers ───

/** Find an item aura definition by ID */
export function getItemAuraDefById(id: string): ItemAura | undefined {
  return itemAuras.find((a) => a.id === id);
}

/** Auras eligible for equipment spawn rolls, in roll order */
export function getEquipmentRollableAuras(): ItemAura[] {
  return EQUIPMENT_AURA_ORDER.map((id) => getItemAuraDefById(id)!);
}
