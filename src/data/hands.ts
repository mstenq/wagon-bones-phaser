// ─── Hand Definitions ───
// Base miles, mult, and rank for each poker-style hand type.

// ─── Types ───

export interface HandDef {
  type: string;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
}

// ─── Hand Definitions ───

const hands: HandDef[] = [
  {
    type: 'HIGH_VALUE',
    name: 'High Value',
    baseMiles: 5,
    baseMult: 1,
    rank: 1,
  },
  {
    type: 'PAIR',
    name: 'Pair',
    baseMiles: 10,
    baseMult: 1,
    rank: 2,
  },
  {
    type: 'TWO_PAIR',
    name: 'Two Pair',
    baseMiles: 15,
    baseMult: 2,
    rank: 3,
  },
  {
    type: 'FOUR_STRAIGHT',
    name: '4 Straight',
    baseMiles: 15,
    baseMult: 2,
    rank: 5,
  },
  {
    type: 'THREE_OF_A_KIND',
    name: 'Three of a Kind',
    baseMiles: 20,
    baseMult: 3,
    rank: 6,
  },
  {
    type: 'FULL_HOUSE',
    name: 'Full House',
    baseMiles: 25,
    baseMult: 4,
    rank: 7,
  },
  {
    type: 'FIVE_STRAIGHT',
    name: '5 Straight',
    baseMiles: 30,
    baseMult: 4,
    rank: 8,
  },
  {
    type: 'FOUR_OF_A_KIND',
    name: 'Four of a Kind',
    baseMiles: 40,
    baseMult: 5,
    rank: 9,
  },
  {
    type: 'FIVE_OF_A_KIND',
    name: 'Five of a Kind',
    baseMiles: 50,
    baseMult: 6,
    rank: 10,
  },
];

export default hands;

// ─── Lookup Helpers ───

/** Find a hand definition by type */
export function getHandByType(type: string): HandDef | undefined {
  return hands.find((h) => h.type === type);
}
