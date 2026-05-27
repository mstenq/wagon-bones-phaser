// ─── Supply Card Definitions ───
// Typed supply card data following the trail_tags.ts pattern.
// Each card may use dice selection, an instant effect, or explicit handler logic.

import type { DiceSelectionEffectParams, DiceSelectionEffectType } from '../game/DiceSelectionSystem';

// ─── Types ───

export type SupplyInstantEffectType = 'DOUBLE_MONEY' | 'TRADE_EQUIPMENT' | 'CREATE_EQUIPMENT';

export interface SupplyInstantEffect {
  type: SupplyInstantEffectType;
  maxGain?: number;
  rarity?: string;
  excludeRarity?: string;
  /** When true, granted equipment ignores difficulty modifiers (ingenuity). */
  noModifiers?: boolean;
}

export interface SupplyDiceSelectionDef {
  drawCount: number;
  pickCount: number;
  /** Minimum selections to apply (defaults to pickCount). */
  minPickCount?: number;
  effectType: DiceSelectionEffectType;
  effectParams: DiceSelectionEffectParams;
}

export interface SupplyCardDef {
  id: string;
  name: string;
  description: string;
  /** Show Buy & Use action in shop (for non-targeting cards). */
  shopBuyAndUse?: boolean;
  diceSelection?: SupplyDiceSelectionDef;
  instantEffect?: SupplyInstantEffect;
}

// ─── Supply Card Definitions ───

const supplyCards: SupplyCardDef[] = [
  {
    id: 'coffee_tin',
    name: 'Coffee Tin',
    description: 'Make 1 dice steel',
    diceSelection: {
      drawCount: 0,
      pickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'steel' },
    },
  },
  {
    id: 'buzzards',
    name: 'Buzzards',
    description: 'Make 2 dice bone',
    diceSelection: {
      drawCount: 0,
      pickCount: 2,
      minPickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'bone' },
    },
  },
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    description: 'Make 2 dice lucky',
    diceSelection: {
      drawCount: 0,
      pickCount: 2,
      minPickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'lucky' },
    },
  },
  {
    id: 'firewood',
    name: 'Firewood',
    description: 'Make 2 dice wooden',
    diceSelection: {
      drawCount: 0,
      pickCount: 2,
      minPickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'wooden' },
    },
  },
  {
    id: 'loaded',
    name: 'Loaded',
    description: 'Make two dice loaded',
    diceSelection: {
      drawCount: 0,
      pickCount: 2,
      minPickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'loaded' },
    },
  },
  {
    id: 'pick_axe',
    name: 'Pick Axe',
    description: 'Make one dice diamond',
    diceSelection: {
      drawCount: 0,
      pickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'diamond' },
    },
  },
  {
    id: 'pan_for_gold',
    name: 'Pan for Gold',
    description: 'Make 1 dice golden',
    diceSelection: {
      drawCount: 0,
      pickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'gold' },
    },
  },
  {
    id: 'treasure_map',
    name: 'Treasure Map',
    description: 'Double your money (max $20)',
    shopBuyAndUse: true,
    instantEffect: { type: 'DOUBLE_MONEY', maxGain: 20 },
  },
  {
    id: 'shallow_grave',
    name: 'Shallow Grave',
    description: 'Choose 2 from 5 random dice to destroy',
    diceSelection: {
      drawCount: 5,
      pickCount: 2,
      effectType: 'DESTROY',
      effectParams: {},
    },
  },
  {
    id: 'trade',
    name: 'Trade',
    description: 'Get money equal to equipment value (max $50)',
    shopBuyAndUse: true,
    instantEffect: { type: 'TRADE_EQUIPMENT', maxGain: 50 },
  },
  {
    id: 'doctor',
    name: 'Doctor',
    description: 'Creates 2 medicine cards',
    shopBuyAndUse: true,
  },
  {
    id: 'compass',
    name: 'Compass',
    description: 'Get 2 random trail guides',
    shopBuyAndUse: true,
  },
  {
    id: 'supply_cache',
    name: 'Supply Cache',
    description: 'Get 2 random supply cards',
    shopBuyAndUse: true,
  },
  {
    id: 'ingenuity',
    name: 'Ingenuity',
    description: 'Get 1 random piece of equipment',
    shopBuyAndUse: true,
    instantEffect: {
      type: 'CREATE_EQUIPMENT',
      excludeRarity: 'legendary',
      noModifiers: true,
    },
  },
  {
    id: 'mirage',
    name: 'Mirage',
    description: 'Pick 2 of 5 random dice — left becomes a copy of right',
    diceSelection: {
      drawCount: 5,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
    },
  },
  {
    id: 'bless',
    name: 'Bless',
    description: '1 in 4 chance to bless equipment with aura',
    shopBuyAndUse: true,
  },
  {
    id: 'second_helpings',
    name: 'Second Helpings',
    description: 'Creates last used supply/trail guide',
  },
  {
    id: 'medicine',
    name: 'Medicine',
    description: 'Choose a die — bump its value up or down by 1',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'BUMP_VALUE',
      effectParams: {},
    },
  },
  {
    id: 'omen_stone',
    name: 'Omen Stone',
    description: 'Prevent the next negative trail event effects',
    shopBuyAndUse: true,
  },
  {
    id: 'shop_pass',
    name: 'Shop Pass',
    description: 'Reroll shop for free on your next shop visit',
    shopBuyAndUse: true,
  },
  {
    id: 'fools_gold',
    name: "Fool's Gold",
    description: '50% chance to gain $30. Otherwise lose half your money',
    shopBuyAndUse: true,
  },
  {
    id: 'trading_post',
    name: 'Trading Post',
    description: 'Increase sell value of all equipment and consumables by $1',
    shopBuyAndUse: true,
  },
];

export default supplyCards;

// ─── Lookup Helpers ───

/** Find a supply card definition by ID */
export function getSupplyCardById(id: string): SupplyCardDef | undefined {
  return supplyCards.find((c) => c.id === id);
}
