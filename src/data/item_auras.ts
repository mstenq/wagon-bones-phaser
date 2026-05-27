// ─── Item Aura Definitions ───
// Shop equipment + dice aura metadata and spawn chances (1× permit).
// Design source: AURA_PERCENTAGES.md at repo root.

// ─── Types ───

export interface ItemAura {
  id: string;
  name: string;
  description: string;
  costIncrease: number;
  /** Equipment/shop spawn (sequential roll); bless card uses this for weighted pick */
  equipmentChance: number;
  /** Dice spawn (sequential roll); omit for equipment-only auras (e.g. ghost) */
  diceChance?: number;
}

// ─── Roll order (first match wins, independent rolls per type) ───

export const EQUIPMENT_AURA_ORDER = ['holy', 'fire', 'icy', 'ghost'] as const;
export const DICE_AURA_ORDER = ['holy', 'fire', 'icy'] as const;

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
    diceChance: 0.012,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: '+10 Mult',
    costIncrease: 4,
    equipmentChance: 0.014,
    diceChance: 0.028,
  },
  {
    id: 'icy',
    name: 'Icy',
    description: '+50 miles',
    costIncrease: 3,
    equipmentChance: 0.02,
    diceChance: 0.04,
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

/** Auras eligible for dice spawn rolls, in roll order */
export function getDiceRollableAuras(): ItemAura[] {
  return DICE_AURA_ORDER.map((id) => getItemAuraDefById(id)!);
}

/** Auras eligible for equipment spawn rolls, in roll order */
export function getEquipmentRollableAuras(): ItemAura[] {
  return EQUIPMENT_AURA_ORDER.map((id) => getItemAuraDefById(id)!);
}
