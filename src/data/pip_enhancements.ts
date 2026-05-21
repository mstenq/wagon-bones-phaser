// ─── Pip Enhancement (Sticker) Definitions ───
// Display metadata for whole-die stickers (purple flower, red bullet, etc.).

// ─── Types ───

export interface PipEnhancementDef {
  id: string;
  name: string;
  description: string;
  color: string;
}

// ─── Sticker Definitions ───

const pipEnhancements: PipEnhancementDef[] = [
  {
    id: 'purple_flower',
    name: 'Purple Flower',
    description: 'When this die scores, gain a supply card',
    color: '0x9c27b0',
  },
  {
    id: 'red_bullet',
    name: 'Red Bullet',
    description: 'When this die scores, trigger it twice',
    color: '0xf44336',
  },
  {
    id: 'golden_dollar',
    name: 'Golden Dollar',
    description: 'When this die scores earn $3',
    color: '0xffd700',
  },
  {
    id: 'blue_moon',
    name: 'Blue Moon',
    description:
      'If this dice is not scored and held in hand at end of round, receive a trail guide for the scored hand',
    color: '0x2196f3',
  },
];

export default pipEnhancements;

// ─── Lookup Helpers ───

/** Find a pip enhancement definition by ID */
export function getPipEnhancementById(id: string): PipEnhancementDef | undefined {
  return pipEnhancements.find((s) => s.id === id);
}
