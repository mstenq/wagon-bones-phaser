// ─── Trail Guide Definitions ───
// Typed trail guide data following the trail_tags.ts pattern.
// Each guide upgrades a hand type's miles and mult per level.

import { HandType } from '../game/types';

// ─── Types ───

export interface TrailGuideDef {
  id: string;
  name: string;
  description: string;
  handType: HandType;
  milesPerLevel: number;
  multPerLevel: number;
}

// ─── Trail Guide Definitions ───

const trailGuides: TrailGuideDef[] = [
  {
    id: 'tg_high_value',
    name: 'Jackrabbit Scout',
    description: 'High Value: +10 miles, +1 mult',
    handType: HandType.HIGH_VALUE,
    milesPerLevel: 10,
    multPerLevel: 1,
  },
  {
    id: 'tg_pair',
    name: 'Coyote Twins',
    description: 'Pair: +15 miles, +1 mult',
    handType: HandType.PAIR,
    milesPerLevel: 15,
    multPerLevel: 1,
  },
  {
    id: 'tg_two_pair',
    name: 'Mule & Buckboard',
    description: 'Two Pair: +20 miles, +1 mult',
    handType: HandType.TWO_PAIR,
    milesPerLevel: 20,
    multPerLevel: 1,
  },
  {
    id: 'tg_three_kind',
    name: 'Three Wolf Moon',
    description: 'Three of a Kind: +20 miles, +2 mult',
    handType: HandType.THREE_OF_A_KIND,
    milesPerLevel: 20,
    multPerLevel: 2,
  },
  {
    id: 'tg_full_house',
    name: 'Buffalo Herd',
    description: 'Full House: +25 miles, +2 mult',
    handType: HandType.FULL_HOUSE,
    milesPerLevel: 25,
    multPerLevel: 2,
  },
  {
    id: 'tg_four_kind',
    name: 'Wild Mustang',
    description: 'Four of a Kind: +30 miles, +3 mult',
    handType: HandType.FOUR_OF_A_KIND,
    milesPerLevel: 30,
    multPerLevel: 3,
  },
  {
    id: 'tg_five_kind',
    name: 'Five-Point Buck',
    description: 'Five of a Kind: +35 miles, +3 mult',
    handType: HandType.FIVE_OF_A_KIND,
    milesPerLevel: 35,
    multPerLevel: 3,
  },
  {
    id: 'tg_four_straight',
    name: 'Mountain Cougar',
    description: '4 Straight: +20 miles, +1 mult',
    handType: HandType.FOUR_STRAIGHT,
    milesPerLevel: 25,
    multPerLevel: 2,
  },
  {
    id: 'tg_five_straight',
    name: 'Diamondback',
    description: '5 Straight: +30 miles, +3 mult',
    handType: HandType.FIVE_STRAIGHT,
    milesPerLevel: 30,
    multPerLevel: 3,
  },
];

export default trailGuides;

// ─── Lookup Helpers ───

/** Find a trail guide definition by ID */
export function getTrailGuideById(id: string): TrailGuideDef | undefined {
  return trailGuides.find((tg) => tg.id === id);
}
