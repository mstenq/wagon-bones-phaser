// ─── Frontier Encounter Definitions ───
// Typed encounter data following the trail_tags.ts pattern.
// Each encounter may use dice selection, an instant effect, or explicit handler logic.

import type { DiceSelectionEffectParams, DiceSelectionEffectType } from '../game/DiceSelectionSystem';

// ─── Types ───

export type FrontierInstantEffectType = 'CREATE_EQUIPMENT' | 'UPGRADE_ALL_HANDS';

export interface FrontierInstantEffect {
  type: FrontierInstantEffectType;
  enhancement?: string;
  count?: number;
  maxGain?: number;
  rarity?: string;
  excludeRarity?: string;
  setMoneyZero?: boolean;
  /** When true, granted equipment ignores difficulty modifiers (ingenuity, magic beans). */
  noModifiers?: boolean;
}

export interface FrontierDiceSelectionDef {
  drawCount: number;
  pickCount: number;
  effectType: DiceSelectionEffectType;
  effectParams: DiceSelectionEffectParams;
}

export interface FrontierEncounterDef {
  id: string;
  name: string;
  description: string;
  diceSelection?: FrontierDiceSelectionDef;
  instantEffect?: FrontierInstantEffect;
}

// ─── Encounter Definitions ───

const frontierEncounters: FrontierEncounterDef[] = [
  {
    id: 'gold_rush',
    name: 'Gold Rush',
    description: 'Add golden dollar sticker to one die',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'ADD_STICKER',
      effectParams: { sticker: 'golden_dollar' },
    },
  },
  {
    id: 'snake_oil_salesman',
    name: 'Snake Oil Salesman',
    description: 'Add purple flower sticker to one die',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'ADD_STICKER',
      effectParams: { sticker: 'purple_flower' },
    },
  },
  {
    id: 'spirit_guide',
    name: 'Spirit Guide',
    description: 'Add blue moon sticker to one die',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'ADD_STICKER',
      effectParams: { sticker: 'blue_moon' },
    },
  },
  {
    id: 'deputize',
    name: 'Deputize',
    description: 'Add red bullet sticker to one die',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'ADD_STICKER',
      effectParams: { sticker: 'red_bullet' },
    },
  },
  {
    id: 'blood_moon',
    name: 'Blood Moon',
    description: 'Add ghost aura to random item, -1 re-roll',
  },
  {
    id: 'spirit_shaman',
    name: 'Spirit Shaman',
    description: 'Bless one dice with random aura',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'APPLY_AURA',
      effectParams: {},
    },
  },
  {
    id: 'raid',
    name: 'Raid',
    description: 'Destroy 5 random dice from active pool, gain $20',
  },
  {
    id: 'skin_walker',
    name: 'Skin Walker',
    description: 'Copy random item, destroy all others',
  },
  {
    id: 'priests_blessing',
    name: "Priest's Blessing",
    description: 'Add holy aura to random item, delete all others',
  },
  {
    id: 'seeing_double',
    name: 'Seeing Double',
    description: 'Create 2 copies of a dice',
    diceSelection: {
      drawCount: 5,
      pickCount: 1,
      effectType: 'COPY',
      effectParams: { copyCount: 2 },
    },
  },
  {
    id: 'magic_beans',
    name: 'Magic Beans',
    description: 'Create rare item, money is set to $0',
    instantEffect: {
      type: 'CREATE_EQUIPMENT',
      rarity: 'rare',
      setMoneyZero: true,
      noModifiers: true,
    },
  },
  {
    id: 'pandoras_box',
    name: "Pandora's Box",
    description: 'Create legendary item (very rare)',
    instantEffect: {
      type: 'CREATE_EQUIPMENT',
      rarity: 'legendary',
      noModifiers: true,
    },
  },
  {
    id: 'spiritual_journey',
    name: 'Spiritual Journey',
    description: 'Increase all trail knowledge by 1 (very rare)',
    instantEffect: { type: 'UPGRADE_ALL_HANDS' },
  },
];

export default frontierEncounters;

// ─── Lookup Helpers ───

/** Find a frontier encounter definition by ID */
export function getFrontierEncounterById(id: string): FrontierEncounterDef | undefined {
  return frontierEncounters.find((fe) => fe.id === id);
}
