// ─── Item Aura Definitions ───
// Shop equipment auras: cost increase, roll chance, and display text.

// ─── Types ───

export interface ItemAura {
  id: string;
  name: string;
  description: string;
  costIncrease: number;
  chance: number;
}

// ─── Aura Definitions ───

const itemAuras: ItemAura[] = [
  {
    id: 'holy',
    name: 'Holy',
    description: 'x1.5 Mult',
    costIncrease: 5,
    chance: 0.003,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: '+10 Mult',
    costIncrease: 4,
    chance: 0.014,
  },
  {
    id: 'icy',
    name: 'Icy',
    description: '+50 miles',
    costIncrease: 3,
    chance: 0.02,
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: "Doesn't take up space in your inventory",
    costIncrease: 5,
    chance: 0.003,
  },
];

export default itemAuras;

// ─── Lookup Helpers ───

/** Find an item aura definition by ID */
export function getItemAuraDefById(id: string): ItemAura | undefined {
  return itemAuras.find((a) => a.id === id);
}
