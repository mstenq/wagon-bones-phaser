// ─── Dice Aura Definitions ───
// Display metadata for dice auras (holy, fire, icy).

// ─── Types ───

export interface DiceAuraDef {
  id: string;
  name: string;
  description: string;
  color: string;
  /** Dice spawn chance (sequential roll); design source: AURA_PERCENTAGES.md */
  diceChance: number;
}

/** Roll order for dice auras (first match wins, independent rolls per type). */
export const DICE_AURA_ORDER = ['holy', 'fire', 'icy'] as const;

// ─── Aura Definitions ───

const diceAuras: DiceAuraDef[] = [
  {
    id: 'holy',
    name: 'Holy',
    description: 'x1.5 Mult',
    color: '0xfffacd',
    diceChance: 0.012,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: '+10 Mult',
    color: '0xff4500',
    diceChance: 0.028,
  },
  {
    id: 'icy',
    name: 'Icy',
    description: '+50 pips',
    color: '0x00bfff',
    diceChance: 0.04,
  },
];

export default diceAuras;

// ─── Lookup Helpers ───

/** Find a dice aura definition by ID */
export function getDiceAuraById(id: string): DiceAuraDef | undefined {
  return diceAuras.find((a) => a.id === id);
}
