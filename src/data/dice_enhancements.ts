// ─── Dice Enhancement Definitions ───
// Display metadata for dice enhancements (bone, lucky, wooden, etc.).

// ─── Types ───

export interface DiceEnhancementDef {
  id: string;
  name: string;
  description: string;
  color: string;
  fontFamily: string | null;
}

// ─── Enhancement Definitions ───

const diceEnhancements: DiceEnhancementDef[] = [
  {
    id: 'bone',
    name: 'Bone',
    description: '+4 Mult',
    color: '0xd4c8b0',
    fontFamily: 'Freckle Face',
  },
  {
    id: 'lucky',
    name: 'Lucky',
    description: '1 in 5 chance for +20 Mult, 1 in 15 chance to win $20',
    color: '0xc8f0c8',
    fontFamily: 'Lobster',
  },
  {
    id: 'wooden',
    name: 'Wooden',
    description: '+10 base miles',
    color: '0xc4a055',
    fontFamily: 'Underdog',
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'x1.5 Mult when not part of scored hand',
    color: '0xa8a8b0',
    fontFamily: 'New Rocker',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Earn $3 when dice is not scored at end of round',
    color: '0xffe870',
    fontFamily: 'Rye',
  },
  {
    id: 'loaded',
    name: 'Loaded',
    description: 'Double the odds of one chosen value being rolled',
    color: '0xf0a0a0',
    fontFamily: 'Doto',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'x2 Mult, 25% chance of cracking',
    color: '0xa0e8f0',
    fontFamily: 'Agu Display',
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'No dice values, counts as 50 base miles and is always scored',
    color: '0x888888',
    fontFamily: null,
  },
];

export default diceEnhancements;

// ─── Lookup Helpers ───

/** Find a dice enhancement definition by ID */
export function getDiceEnhancementById(id: string): DiceEnhancementDef | undefined {
  return diceEnhancements.find((e) => e.id === id);
}
