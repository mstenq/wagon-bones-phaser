// ─── Hand Definitions ───
// Base miles, mult, and rank for each poker-style hand type.

import { HandType } from '../game/types';

// ─── Types ───

export interface HandDef {
  type: string;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
  /** Hidden from journal until played once this run */
  secret?: boolean;
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
  {
    type: 'FLUSH',
    name: 'Flush',
    baseMiles: 100,
    baseMult: 8,
    rank: 11,
    secret: true,
  },
  {
    type: 'FLUSH_HOUSE',
    name: 'Flush House',
    baseMiles: 140,
    baseMult: 14,
    rank: 12,
    secret: true,
  },
  {
    type: 'STRAIGHT_FLUSH',
    name: 'Straight Flush',
    baseMiles: 160,
    baseMult: 16,
    rank: 13,
    secret: true,
  },
  {
    type: 'FLUSH_FIVE',
    name: 'Flush Five',
    baseMiles: 180,
    baseMult: 18,
    rank: 14,
    secret: true,
  },
];

export default hands;

// ─── Lookup Helpers ───

/** Find a hand definition by type */
export function getHandByType(type: string): HandDef | undefined {
  return hands.find((h) => h.type === type);
}

/** Hand type ids marked secret in data */
export function getSecretHandTypes(): HandType[] {
  return hands.filter((h) => h.secret).map((h) => h.type as HandType);
}
