// ─── Dice Aura Definitions ───
// Display metadata for dice auras (holy, fire, icy).

// ─── Types ───

export interface DiceAuraDef {
  id: string;
  name: string;
  description: string;
  color: string;
}

// ─── Aura Definitions ───

const diceAuras: DiceAuraDef[] = [
  {
    id: 'holy',
    name: 'Holy',
    description: 'x1.5 Mult',
    color: '0xfffacd',
  },
  {
    id: 'fire',
    name: 'Fire',
    description: '+10 Mult',
    color: '0xff4500',
  },
  {
    id: 'icy',
    name: 'Icy',
    description: '+50 pips',
    color: '0x00bfff',
  },
];

export default diceAuras;

// ─── Lookup Helpers ───

/** Find a dice aura definition by ID */
export function getDiceAuraById(id: string): DiceAuraDef | undefined {
  return diceAuras.find((a) => a.id === id);
}
