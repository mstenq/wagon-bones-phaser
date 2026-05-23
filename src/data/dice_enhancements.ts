// ─── Dice Enhancement Definitions ───
// Display metadata for dice enhancements (bone, lucky, wooden, etc.).

// ─── Types ───

export interface DiceEnhancementDef {
  id: string;
  name: string;
  description: string;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
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
    color: '371c06',
    strokeColor: 'd5bfa5',
    strokeWidth: 2,
    fontFamily: 'Freckle Face',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'lucky',
    name: 'Lucky',
    description: '1 in 5 chance for +20 Mult, 1 in 15 chance to win $20',
    color: 'ffffff',
    strokeColor: 'e3b555',
    strokeWidth: 0,
    fontFamily: 'Lobster',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'wooden',
    name: 'Wooden',
    description: '+30 base miles',
    color: 'efcc95',
    strokeColor: '120902',
    strokeWidth: 2,
    fontFamily: 'Underdog',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'x1.5 Mult when not part of scored hand',
    color: 'ffffff',
    strokeColor: '000000',
    strokeWidth: 2,
    fontFamily: 'New Rocker',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Earn $3 when dice is not scored at end of round',
    color: '3f3a02',
    strokeColor: 'feef94',
    strokeWidth: 2,
    fontFamily: 'Rye',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'loaded',
    name: 'Loaded',
    description: 'Double the odds of one chosen value being rolled',
    color: 'ffffff',
    strokeColor: '6b1106',
    strokeWidth: 2,
    fontFamily: 'Doto',
    scoreDestroyChance: [0, 1],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'x2 Mult, 25% chance of cracking',
    color: '000000',
    fontFamily: 'Agu Display',
    scoreDestroyChance: [1, 4],
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'No dice values, counts as 50 base miles and is always scored',
    color: '888888',
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
