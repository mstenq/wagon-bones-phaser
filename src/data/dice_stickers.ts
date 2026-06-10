// ─── Dice Sticker Definitions ───
// Display metadata for whole-die stickers (purple flower, red bullet, etc.).

// ─── Types ───

export interface DiceStickerDef {
  id: string;
  name: string;
  description: string;
  color: string;
}

// ─── Sticker Definitions ───

const diceStickers = [
  {
    id: 'purple_flower',
    name: 'Purple Flower',
    description: 'When this die is played but does not score, gain a supply card',
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
  {
    id: 'green_contagion',
    name: 'Green Contagion',
    description: 'When played, 1 in 2 chance to spread this sticker and enhancement to each neighboring played die',
    color: '0x4caf50',
  },
] as const satisfies readonly DiceStickerDef[];

export default diceStickers;

export type DiceStickerId = (typeof diceStickers)[number]['id'];

/** All non-null sticker ids — used for grab bags, mystery dice, pickRandomSticker */
export const DICE_STICKER_IDS: DiceStickerId[] = diceStickers.map((s) => s.id);

// ─── Lookup Helpers ───

/** Find a dice sticker definition by ID */
export function getDiceStickerById(id: string): DiceStickerDef | undefined {
  return diceStickers.find((s) => s.id === id);
}
