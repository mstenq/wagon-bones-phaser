// ─── Dice Enhancement Definitions ───
// Display metadata for dice enhancements (bone, lucky, wooden, etc.).

// ─── Types ───

export interface DiceEnhancementDef {
  id: string;
  name: string;
  description: string;
  color: string;
  fontFamily: string | null;
  /** When scored, chance the die is destroyed ([num, den]). [0, 1] = never. */
  scoreDestroyChance: [number, number];
}

// ─── Enhancement Definitions ───

const diceEnhancements: DiceEnhancementDef[] = [
  {
    id: 'bone',
    name: 'Bone',
    description: '+4 Mult',
    color: '0xd4c8b0',
    fontFamily: 'Freckle Face',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'lucky',
    name: 'Lucky',
    description: '1 in 5 chance for +20 Mult, 1 in 15 chance to win $20',
    color: '0xc8f0c8',
    fontFamily: 'Lobster',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'wooden',
    name: 'Wooden',
    description: '+10 base miles',
    color: '0xc4a055',
    fontFamily: 'Underdog',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'x1.5 Mult when not part of scored hand',
    color: '0xa8a8b0',
    fontFamily: 'New Rocker',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Earn $3 when dice is not scored at end of round',
    color: '0xffe870',
    fontFamily: 'Rye',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'loaded',
    name: 'Loaded',
    description: 'Double the odds of one chosen value being rolled',
    color: '0xf0a0a0',
    fontFamily: 'Doto',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'x2 Mult, 25% chance of cracking',
    color: '0xa0e8f0',
    fontFamily: 'Agu Display',
    scoreDestroyChance: [1, 4],
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'No dice values, counts as 50 base miles and is always scored',
    color: '0x888888',
    fontFamily: null,
    scoreDestroyChance: [0, 1],
  },
];

export default diceEnhancements;

// ─── Lookup Helpers ───

/** Find a dice enhancement definition by ID */
export function getDiceEnhancementById(id: string): DiceEnhancementDef | undefined {
  return diceEnhancements.find((e) => e.id === id);
}

/** Default score-time destroy chance for an enhancement id ([0, 1] when unknown). */
export function getEnhancementScoreDestroyChance(enhancement: string): [number, number] {
  return getDiceEnhancementById(enhancement)?.scoreDestroyChance ?? [0, 1];
}
