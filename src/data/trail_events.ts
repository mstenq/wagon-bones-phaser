// ─── Trail Event Definitions ───
// Typed trail event data following the trail_tags.ts pattern.
// Narrative choose-your-adventure events between rounds.

import type { DiceAura, DiceEnhancement, DiceSticker } from '../game/types';

// ─── Types ───

export type TrailEventCategory =
  | 'positive'
  | 'animal'
  | 'bandits'
  | 'demon_hunter'
  | 'navigation'
  | 'stranger'
  | 'uneventful'
  | 'wagon_damage'
  | 'water'
  | 'weather';

export type TrailEventEffectType =
  | 'LOSE_MONEY'
  | 'LOSE_MONEY_PERCENT'
  | 'GAIN_MONEY'
  | 'LOSE_DAYS'
  | 'LOSE_REROLLS'
  | 'LOSE_REROLLS_PER_DAY'
  | 'LOSE_ALL_REROLLS'
  | 'LOSE_HAND_SIZE'
  | 'LOSE_RANDOM_DICE'
  | 'LOSE_RANDOM_EQUIPMENT'
  | 'LOSE_EQUIPMENT_CHOICE'
  | 'LOSE_ALL_SUPPLY_CARDS'
  | 'LOSE_RANDOM_SUPPLY_CARD'
  | 'LOSE_MONEY_PER_DAY'
  | 'LOSE_EQUIPMENT_SLOT_PERMANENT'
  | 'GAIN_DICE'
  | 'GAIN_RANDOM_SUPPLY_CARD'
  | 'GAIN_SPECIFIC_SUPPLY_CARD'
  | 'GAIN_RANDOM_EQUIPMENT'
  | 'GAIN_TRAIL_GUIDES'
  | 'GAIN_MEDICINE_CARD'
  | 'GAIN_FRONTIER_ENCOUNTER'
  | 'USE_MEDICINE'
  | 'DESTROY_EQUIPMENT'
  | 'ADD_AURA_TO_RANDOM_DICE'
  | 'BOSS_UPGRADE'
  | 'SCORE_MULTIPLIER'
  | 'FLAT_MILES_PENALTY'
  | 'SKIP_NEXT_SHOP'
  | 'DISABLE_REROLL_DAY1'
  | 'STANDARD_DICE_DAY1'
  | 'DIAMOND_CRACK_DOUBLED'
  | 'LUCKY_ODDS_HALVED'
  | 'SCORED_DICE_DESTROY_CHANCE';

export type TrailEventConditionType =
  | 'HAS_MONEY'
  | 'HAS_EQUIPMENT'
  | 'HAS_EQUIPMENT_ANY'
  | 'HAS_MEDICINE'
  | 'HAS_WEAPON'
  | 'HAS_SUPPLY_CARDS'
  | 'HAS_CONSUMABLE_ANY'
  | 'NOT_HAS_CONSUMABLE_ANY'
  | 'IS_PROFESSION';

export interface TrailEventEffect {
  type: TrailEventEffectType;
  amount?: number;
  count?: number;
  percent?: number;
  enhancement?: DiceEnhancement | null;
  aura?: DiceAura | string | null;
  sticker?: DiceSticker | null;
  id?: string;
  rarity?: string;
  multiplier?: number;
  chance?: number;
}

export interface TrailEventCondition {
  type: TrailEventConditionType;
  id?: string;
  amount?: number;
}

export interface TrailEventOutcome {
  probability: number;
  effects: TrailEventEffect[];
  message?: string;
}

export interface TrailEventChoice {
  id: string;
  label: string;
  condition?: TrailEventCondition;
  outcomes: TrailEventOutcome[];
}

export interface TrailEventDef {
  id: string;
  name: string;
  description: string;
  category: TrailEventCategory;
  weight: number;
  demonHunterOnly: boolean;
  /** Earliest leg this event can be selected (default 1). */
  minimumLeg?: number;
  choices: TrailEventChoice[];
}

/** Effective minimum leg for selection (explicit field or defaults). */
export function getTrailEventMinimumLeg(event: TrailEventDef): number {
  if (event.minimumLeg !== undefined) return event.minimumLeg;
  if (event.demonHunterOnly) return 4;
  return 1;
}

// ─── Event Definitions ───

const trailEvents: TrailEventDef[] = [
  {
    id: 'abandoned_wagon',
    name: 'Abandoned Wagon',
    description: 'A wagon lies overturned on the trail, its contents scattered.',
    category: 'positive',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 5,
    choices: [
      {
        id: 'take',
        label: 'Scavenge the wreckage',
        outcomes: [
          {
            probability: 1,
            message:
              'You found 2 bone dice with purple flower stickers! However you feel a dark aura and your lucky will change soon.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'bone',
                aura: null,
                sticker: 'purple_flower',
              },
              {
                type: 'BOSS_UPGRADE',
                multiplier: 1.5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'animal_quicksand',
    name: 'Animal Caught in Quicksand',
    description: 'One of your pack animals is sinking fast in quicksand.',
    category: 'animal',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'lose_die',
        label: 'Let it go',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'rescue',
        label: 'Risk rescue (-2 rerolls next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'animal_injured',
    name: 'Animal Injured Stepping in a Hole',
    description: 'A pack animal stepped in a prairie dog hole and injured its leg.',
    category: 'animal',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'slow_down',
        label: 'Let it slow the group (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'medicine',
        label: 'Use medicine to heal it',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'animals_exhausted',
    name: 'Animals Exhausted',
    description: 'The animals are worn out and need rest.',
    category: 'animal',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'push_on',
        label: 'Push on (-1 hand size next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_HAND_SIZE',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Rest them ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bad_mosquitos',
    name: 'Bad Mosquitos',
    description: 'Thick clouds of mosquitos torment the animals all night.',
    category: 'animal',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'endure',
        label: 'Endure it (-1 reroll next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bad_water',
    name: 'Bad Water',
    description: 'The water source ahead looks murky and foul.',
    category: 'water',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Buy clean water ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
            ],
          },
        ],
      },
      {
        id: 'drink',
        label: 'Drink it (-2 rerolls next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bandit_ambush',
    name: 'Bandit Ambush',
    description: 'Armed bandits block the trail ahead, demanding payment.',
    category: 'bandits',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Pay them (lose half your money)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY_PERCENT',
                percent: 50,
              },
            ],
          },
        ],
      },
      {
        id: 'fight',
        label: 'Sacrifice equipment to fight back',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_MONEY',
                amount: 10,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    description: 'A fierce blizzard descends, blinding everything in white.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push through (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Hunker down ($10)',
        condition: {
          type: 'HAS_MONEY',
          amount: 10,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 10,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'broken_axle',
    name: 'Broken Wagon Axle',
    description: 'A terrible crack — the axle has snapped clean through.',
    category: 'wagon_damage',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Lose 2 days repairing',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 2,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $12 to replace it',
        condition: {
          type: 'HAS_MONEY',
          amount: 12,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 12,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'broken_tongue',
    name: 'Broken Wagon Tongue',
    description: "The wagon tongue snaps — you can't steer without it.",
    category: 'wagon_damage',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Lose 1 day repairing',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $6 to fix',
        condition: {
          type: 'HAS_MONEY',
          amount: 6,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 6,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'broken_wheel',
    name: 'Broken Wagon Wheel',
    description: 'The wheel hits a rock and splinters apart.',
    category: 'wagon_damage',
    weight: 4,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Lose 1 day repairing',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $8 to fix immediately',
        condition: {
          type: 'HAS_MONEY',
          amount: 8,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 8,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'broken_yoke',
    name: 'Broken Yoke',
    description: "The ox yoke has cracked — can't haul the full load.",
    category: 'wagon_damage',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push on (-1 hand size next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_HAND_SIZE',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $7 to replace',
        condition: {
          type: 'HAS_MONEY',
          amount: 7,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 7,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'buffalo_stampede',
    name: 'Buffalo Stampede',
    description: 'The ground shakes as a herd of buffalo barrels toward the wagon.',
    category: 'animal',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'risk',
        label: 'Stand your ground',
        outcomes: [
          {
            probability: 0.6,
            message: 'The herd parts around you! You collect bones from the fallen.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'bone',
                aura: null,
                sticker: null,
              },
            ],
          },
          {
            probability: 0.4,
            message: 'Trampled! Equipment destroyed in the stampede.',
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'caught_fish',
    name: 'Caught Some Fish',
    description: 'The stream is teeming with fish. Easy catching.',
    category: 'positive',
    weight: 4,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Sell extra to travelers',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 4,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'dead_livestock',
    name: 'Dead Livestock',
    description: 'One of your pack animals has died in the night.',
    category: 'animal',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Accept the loss',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'dust_storm',
    name: 'Dust Storm',
    description: "A wall of dust engulfs the wagon train. Can't see a thing.",
    category: 'weather',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push through (-1 reroll per day next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS_PER_DAY',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'extreme_cold',
    name: 'Extreme Cold',
    description: 'Biting cold sweeps across the plains. Everything is freezing.',
    category: 'weather',
    weight: 200,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Endure (diamond dice crack odds doubled)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'DIAMOND_CRACK_DOUBLED',
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Buy firewood ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'wooden',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'extreme_heat',
    name: 'Extreme Heat',
    description: 'The sun beats down mercilessly. Water is running low.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Pay for water ($3 per day next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY_PER_DAY',
                amount: 3,
              },
            ],
          },
        ],
      },
      {
        id: 'sacrifice',
        label: 'Sacrifice 2 dice (animals drank supplies)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fallen_rocks',
    name: 'Fallen Rocks',
    description: 'Rocks tumble down from the ridge above without warning.',
    category: 'navigation',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'risk',
        label: 'Take your chances',
        outcomes: [
          {
            probability: 0.3,
            message: 'A boulder crashes down on the wagon!',
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
          {
            probability: 0.7,
            message: 'The rocks miss! You salvage a fine stone from the rubble.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'stone',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fallen_timbers',
    name: 'Fallen Timbers',
    description: 'Massive trees block the trail ahead.',
    category: 'navigation',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Pay $4 to clear the path',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
            ],
          },
        ],
      },
      {
        id: 'cut',
        label: 'Cut through (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'wooden',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fellow_traveler',
    name: 'Fellow Traveler',
    description: 'A stranger offers to trade equipment — sight unseen.',
    category: 'stranger',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'trade',
        label: 'Trade 1 equipment',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 0.5,
            message: "The stranger's eyes glow — this gear is haunted.",
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: 'ghost',
              },
            ],
          },
          {
            probability: 0.5,
            message: 'A fair trade. Solid equipment.',
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: null,
              },
            ],
          },
        ],
      },
      {
        id: 'decline',
        label: 'Decline',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'fire_in_wagon',
    name: 'Fire in a Wagon',
    description: 'Smoke rises from one of the wagons. Fire!',
    category: 'wagon_damage',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'let_burn',
        label: 'Let it burn (lose all supply cards)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_ALL_SUPPLY_CARDS',
              },
            ],
          },
        ],
      },
      {
        id: 'save',
        label: 'Try to save supplies',
        outcomes: [
          {
            probability: 0.5,
            message: 'The fire spreads too fast. Days lost fighting it.',
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 2,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'Pulled a smoldering die from the ashes!',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'wooden',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'flooded_trail',
    name: 'Flooded Trail',
    description: 'Recent rains have turned the trail into a muddy river.',
    category: 'water',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Hire a ferry ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
      {
        id: 'risk',
        label: 'Risk the crossing',
        outcomes: [
          {
            probability: 0.6,
            message: 'Made it across without a scratch!',
            effects: [],
          },
          {
            probability: 0.4,
            message: 'The current swept away part of the load!',
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'found_fruit',
    name: 'Found Fruit',
    description: 'Wild fruit trees line both sides of the trail.',
    category: 'positive',
    weight: 4,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Gather provisions',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_RANDOM_SUPPLY_CARD',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'gold_strike',
    name: 'Gold Strike!',
    description: 'You spot a glint of gold in the creek bed!',
    category: 'positive',
    weight: 1,
    demonHunterOnly: false,
    choices: [
      {
        id: 'mine',
        label: 'Mine it (-1 reroll)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 1,
              },
              {
                type: 'GAIN_MONEY',
                amount: 10,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'gold',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'skip',
        label: 'Skip it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'hailstorm',
    name: 'Hailstorm',
    description: 'Chunks of ice hammer down from dark clouds above.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wait',
        label: 'Wait it out (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'risk',
        label: 'Chance it',
        outcomes: [
          {
            probability: 0.5,
            message: 'A chunk of ice smashes into the wagon!',
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'Found a perfect ice-encased stone after the storm.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'stone',
                aura: 'arcane',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'heavy_fog',
    name: 'Heavy Fog',
    description: "A thick fog rolls in. Can't see past the wagon ahead.",
    category: 'weather',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push through (no rerolls on day 1)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'DISABLE_REROLL_DAY1',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'locusts',
    name: 'Locusts',
    description: 'A swarm of locusts descends on the wagons, eating everything in sight.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'let_eat',
        label: 'Let them eat (lose all supply cards)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_ALL_SUPPLY_CARDS',
              },
            ],
          },
        ],
      },
      {
        id: 'sacrifice',
        label: 'Sacrifice 1 equipment to protect supplies',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'lose_trail',
    name: 'Lose Trail',
    description: 'The trail vanishes into scrubland. Which way?',
    category: 'navigation',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wander',
        label: 'Wander (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'lost_trail',
    name: 'Lost Trail',
    description: 'No landmarks in sight. The group is turned around.',
    category: 'navigation',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wander',
        label: 'Figure it out (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay for a guide ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'lost_severe',
    name: 'Lost!',
    description: 'You are hopelessly lost. Days pass with no progress.',
    category: 'navigation',
    weight: 1,
    demonHunterOnly: false,
    minimumLeg: 5,
    choices: [
      {
        id: 'wander',
        label: 'Wander (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $8 for rescue',
        condition: {
          type: 'HAS_MONEY',
          amount: 8,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 8,
              },
              {
                type: 'GAIN_SPECIFIC_SUPPLY_CARD',
                id: 'bless',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'missing_livestock',
    name: 'Missing Livestock',
    description: 'Two pack animals have wandered off in the night.',
    category: 'animal',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Press on without them (-2 dice)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 2,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $6 to search and recover',
        condition: {
          type: 'HAS_MONEY',
          amount: 6,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 6,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'missing_person',
    name: 'Missing Person',
    description: "Someone from the wagon train hasn't been seen since last night.",
    category: 'stranger',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'press_on',
        label: 'Press on (presumed dead)',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
      {
        id: 'search',
        label: 'Search ($5, -1 day)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 0.5,
            message: 'Found them alive! They give you some gear.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'rare',
                aura: null,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'Found them dead. Only a bone die remains.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'bone',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'native_guide',
    name: 'Native Guide',
    description: 'A knowledgeable guide offers to share trail wisdom.',
    category: 'stranger',
    weight: 1,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Accept guidance (skip next shop)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_TRAIL_GUIDES',
                count: 3,
              },
              {
                type: 'SKIP_NEXT_SHOP',
              },
            ],
          },
        ],
      },
      {
        id: 'decline',
        label: 'Decline politely',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'no_grass',
    name: 'No Grass',
    description: 'The prairie is parched — no feed for the animals anywhere.',
    category: 'animal',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push on (-1 day next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Buy feed ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'no_water',
    name: 'No Water',
    description: 'The springs have dried up. Water must be bought at a premium.',
    category: 'water',
    weight: 3,
    demonHunterOnly: false,
    choices: [
      {
        id: 'pay',
        label: 'Buy water ($6)',
        condition: {
          type: 'HAS_MONEY',
          amount: 6,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 6,
              },
            ],
          },
        ],
      },
      {
        id: 'endure',
        label: "Ration what's left (-2 rerolls)",
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'prairie_fire',
    name: 'Prairie Fire',
    description: 'The horizon glows orange — wildfire sweeps across the plains.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'sacrifice',
        label: 'Lose 1 random equipment',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_EQUIPMENT',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Drive through fast ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            message: 'You drive through the fire with only a little damage and gain a lucky die.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'quicksand',
    name: 'Quicksand',
    description: 'The ground gives way beneath the wagon. Quicksand!',
    category: 'water',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'lose_dice',
        label: 'Struggle through (-1 die)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'sacrifice',
        label: 'Sacrifice 1 equipment to pull free',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'rough_trail',
    name: 'Rough Trail',
    description: 'The trail ahead is rocky and punishing, but passable.',
    category: 'navigation',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Push through (x1.5 target score)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'SCORE_MULTIPLIER',
                multiplier: 1.5,
              },
            ],
          },
        ],
      },
      {
        id: 'other_route',
        label: 'Look for another route (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'river_crossing',
    name: 'River Crossing',
    description: 'A wide river blocks the path. The current looks strong.',
    category: 'water',
    weight: 3,
    demonHunterOnly: false,
    choices: [
      {
        id: 'pay',
        label: 'Ford safely ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
      {
        id: 'risk',
        label: 'Risk the crossing',
        outcomes: [
          {
            probability: 0.5,
            message: "Crossed safely. The current wasn't as bad as it looked.",
            effects: [],
          },
          {
            probability: 0.3,
            message: 'The river pulls supplies downstream!',
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
          {
            probability: 0.2,
            message: 'Found something wedged between the rocks!',
            effects: [
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'rare',
                aura: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'severe_thunderstorm',
    name: 'Severe Thunderstorm',
    description: 'Lightning cracks and thunder shakes the earth.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Endure (lucky dice odds halved next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LUCKY_ODDS_HALVED',
              },
            ],
          },
        ],
      },
      {
        id: 'medicine',
        label: 'Use medicine to calm animals',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'sick_oxen',
    name: 'Sick Oxen',
    description: 'The oxen are sluggish and feverish this morning.',
    category: 'animal',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'pay',
        label: 'Pay for treatment ($3/day next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY_PER_DAY',
                amount: 3,
              },
            ],
          },
        ],
      },
      {
        id: 'sacrifice',
        label: 'Sacrifice a die to cure them',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'snowbound',
    name: 'Snowbound',
    description: 'Heavy snow has trapped the wagon train.',
    category: 'weather',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wait',
        label: 'Wait for thaw (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $10 to dig out',
        condition: {
          type: 'HAS_MONEY',
          amount: 10,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 10,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'spoiled_food',
    name: 'Spoiled Food',
    description: 'The food stores have gone bad in the heat.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Throw it out (lose 1 random supply card)',
        condition: {
          type: 'HAS_CONSUMABLE_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_SUPPLY_CARD',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'nothing',
        label: 'Nothing to throw out',
        condition: {
          type: 'NOT_HAS_CONSUMABLE_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [],
            message: 'You had nothing to lose.',
          },
        ],
      },
    ],
  },
  {
    id: 'strangers_ahead',
    name: 'Strangers Ahead',
    description: 'Figures on the trail ahead. Friend or foe?',
    category: 'stranger',
    weight: 3,
    demonHunterOnly: false,
    choices: [
      {
        id: 'avoid',
        label: 'Avoid them',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
      {
        id: 'approach',
        label: 'Approach',
        outcomes: [
          {
            probability: 0.5,
            message: 'Friendly traders! They share their surplus.',
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 5,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'Bandits in disguise! They take what they can.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'strangers_approach',
    name: 'Strangers Approach',
    description: 'A group approaches with a proposition — a gamble.',
    category: 'stranger',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'gamble',
        label: 'Pay $5 for the gamble',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 0.5,
            message: 'Winner! The strangers pay up and toss in a gold die.',
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 10,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'gold',
                aura: null,
                sticker: null,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'You lose! They vanish with your money.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
      {
        id: 'decline',
        label: 'Decline',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'swamped_wagon',
    name: 'Swamped Wagon',
    description: 'Water seeps into the wagon bed, soaking everything.',
    category: 'water',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'lose',
        label: 'Accept losses (-2 random supply/trail cards)',
        condition: {
          type: 'HAS_CONSUMABLE_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_SUPPLY_CARD',
                count: 2,
              },
            ],
          },
        ],
      },
      {
        id: 'nothing',
        label: 'Nothing was damaged',
        condition: {
          type: 'NOT_HAS_CONSUMABLE_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [],
            message: 'You had nothing to lose.',
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $7 to salvage',
        condition: {
          type: 'HAS_MONEY',
          amount: 7,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 7,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'theft_from_wagon',
    name: 'Theft From a Wagon',
    description: 'Someone has been rummaging through your wagon at night.',
    category: 'bandits',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Accept loss (lose random equipment)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_EQUIPMENT',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'hunter_chase',
        label: 'Chase down the thieves',
        condition: {
          type: 'IS_PROFESSION',
          id: 'hunter',
        },
        outcomes: [
          {
            probability: 0.3,
            message: 'You are unable to catch the thieves.',
            effects: [
              {
                type: 'LOSE_RANDOM_EQUIPMENT',
                count: 1,
              },
            ],
          },
          {
            probability: 0.7,
            message: 'You chase down the thieves and they are caught red-handed.',
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 3,
              },
            ],
          },
        ],
      },
      {
        id: 'weapon',
        label: 'Scare them off with weapon',
        condition: {
          type: 'HAS_WEAPON',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 3,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'thick_dust',
    name: 'Thick Dust From Other Wagons',
    description: 'The wagons ahead kick up choking clouds of dust.',
    category: 'navigation',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'endure',
        label: 'Endure it (-1 reroll next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'thief',
    name: 'Thief!',
    description: 'A thief is caught red-handed in the night!',
    category: 'bandits',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'accept',
        label: 'Let them go (lose $8)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 8,
              },
            ],
          },
        ],
      },
      {
        id: 'chase',
        label: 'Chase them (sacrifice a die)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
              {
                type: 'GAIN_MONEY',
                amount: 12,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'tipped_wagon',
    name: 'Tipped Wagon',
    description: 'The wagon tilts too far on a slope and tips over completely.',
    category: 'wagon_damage',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 5,
    choices: [
      {
        id: 'accept',
        label: 'Accept losses (lose 1 equipment + 1 die)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_EQUIPMENT',
                count: 1,
              },
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay $10 to right it (keep everything)',
        condition: {
          type: 'HAS_MONEY',
          amount: 10,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 10,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'too_many_at_river',
    name: 'Too Many People At the River',
    description: 'A long queue of wagons waits at the river crossing.',
    category: 'water',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wait',
        label: 'Wait in line (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Pay to cut in line ($6)',
        condition: {
          type: 'HAS_MONEY',
          amount: 6,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 6,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wagon_fell_through_ice',
    name: 'Wagon Fell Through Ice',
    description: 'The ice cracks and the wagon plunges into freezing water.',
    category: 'water',
    weight: 1,
    demonHunterOnly: false,
    minimumLeg: 5,
    choices: [
      {
        id: 'accept',
        label: 'Accept losses (-3 dice, -1 equipment)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 3,
              },
              {
                type: 'LOSE_RANDOM_EQUIPMENT',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Hire help ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wagon_deep_sand',
    name: 'Wagon Stuck in Deep Sand',
    description: "The wheels sink deep into loose sand. Won't budge.",
    category: 'wagon_damage',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wait',
        label: 'Dig out (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'lighten',
        label: 'Lighten the load (sacrifice 2 dice)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wagon_stuck_mud',
    name: 'Wagon Stuck in the Mud',
    description: 'The wheels are mired deep in thick mud.',
    category: 'wagon_damage',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'wait',
        label: 'Push it out (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Hire oxen team ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wagon_morale_low',
    name: 'Wagon Train Morale Is Low',
    description: 'The group is disheartened. Nobody wants to keep going.',
    category: 'stranger',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'endure',
        label: 'Push through (standard dice day 1)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'STANDARD_DICE_DAY1',
              },
            ],
          },
        ],
      },
      {
        id: 'pay',
        label: 'Buy whiskey ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wild_fruit',
    name: 'Wild Fruit',
    description: 'Bushes heavy with berries line the trail.',
    category: 'positive',
    weight: 3,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Gather what you can',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 3,
              },
              {
                type: 'GAIN_RANDOM_SUPPLY_CARD',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wild_vegetables',
    name: 'Wild Vegetables',
    description: 'Edible roots and vegetables grow wild along the creek.',
    category: 'positive',
    weight: 3,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Harvest them',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_MEDICINE_CARD',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wrong_trail',
    name: 'Wrong Trail',
    description: 'You realize too late — this trail goes nowhere good.',
    category: 'navigation',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 5,
    choices: [
      {
        id: 'accept',
        label: 'Turn back (-1 day, boss miles x1.1)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'BOSS_UPGRADE',
                multiplier: 1.1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'abandoned_mine',
    name: 'Abandoned Mine',
    description: 'A dark mine shaft beckons from the hillside.',
    category: 'positive',
    weight: 3,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'explore',
        label: 'Explore the shaft',
        outcomes: [
          {
            probability: 0.5,
            message: 'Struck steel! The mine still had ore left.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'steel',
                aura: null,
                sticker: null,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'Cave-in! Barely escaped with your life.',
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'skip',
        label: 'Skip it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'traveling_blacksmith',
    name: 'Traveling Blacksmith',
    description: 'A blacksmith with a portable forge offers his services.',
    category: 'stranger',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'forge',
        label: 'Forge a steel die ($6, sacrifice 2 dice)',
        condition: {
          type: 'HAS_MONEY',
          amount: 6,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 6,
              },
              {
                type: 'LOSE_RANDOM_DICE',
                count: 2,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'decline',
        label: 'Decline',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'crystal_cave',
    name: 'Crystal Cave',
    description: 'Crystals glitter in a cave mouth just off the trail.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'explore',
        label: 'Explore (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'diamond',
                aura: 'arcane',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'skip',
        label: 'Skip it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'old_prospectors_cache',
    name: "Old Prospector's Cache",
    description: 'A dying prospector presses a pouch into your hands.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Accept his stash',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'diamond',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'medicine',
        label: 'Give him medicine',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'diamond',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'iron_vein',
    name: 'Iron Vein',
    description: 'Rich iron ore is exposed in the cliff face.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'mine_cheap',
        label: 'Try to mine it yourself ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            message: 'You had some difficulty mining the ore and lost 1 random enhanced dice. Gained 2 steel die.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'steel',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'hire_miners',
        label: 'Hire miners ($8)',
        condition: {
          type: 'HAS_MONEY',
          amount: 8,
        },
        outcomes: [
          {
            probability: 1,
            message: 'The miners do the work, but take a cut. Gained 1 steel die with a red bullet sticker.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 8,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: null,
                sticker: 'red_bullet',
              },
            ],
          },
        ],
      },
      {
        id: 'skip',
        label: 'Skip it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'sunken_chest',
    name: 'Sunken Chest',
    description: 'Something glints beneath the river surface — a chest!',
    category: 'positive',
    weight: 1,
    demonHunterOnly: false,
    choices: [
      {
        id: 'fish',
        label: 'Fish it out ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 0.4,
            message: 'A glowing gold die, still warm from some ancient fire!',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'gold',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
          {
            probability: 0.3,
            message: 'Two gold dice rattling inside! Jackpot.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'gold',
                aura: null,
                sticker: null,
              },
            ],
          },
          {
            probability: 0.3,
            message: 'Empty. Just rocks and river muck.',
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
            ],
          },
        ],
      },
      {
        id: 'skip',
        label: 'Leave it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'old_burial_ground',
    name: 'Old Burial Ground',
    description: 'Ancient graves mark the path ahead. Tread carefully.',
    category: 'stranger',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'respect',
        label: 'Pass respectfully',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'bone',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'disturb',
        label: 'Disturb the graves (-2 rerolls)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 4,
                enhancement: 'bone',
                aura: null,
                sticker: null,
              },
              {
                type: 'LOSE_REROLLS',
                amount: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'whale_bones',
    name: 'Whale Bones',
    description: 'A massive skeleton half-buried in desert sand. Incredible.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'harvest',
        label: 'Harvest the bones',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 3,
                enhancement: 'bone',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'carve',
        label: 'Carve them ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'bone',
                aura: 'fire',
                sticker: null,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'bone',
                aura: 'arcane',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'four_leaf_clover',
    name: 'Four-Leaf Clover Patch',
    description: 'A field of clover stretches before you. Lucky spot.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'quick',
        label: 'Grab one',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'search',
        label: 'Search the whole field (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'lucky',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'rabbit_warren',
    name: 'Rabbit Warren',
    description: 'Rabbits dart everywhere. Easy pickings.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'catch',
        label: 'Catch rabbits',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 3,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'trap',
        label: 'Set traps ($4)',
        condition: {
          type: 'HAS_MONEY',
          amount: 4,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 4,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: null,
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'shooting_star',
    name: 'Shooting Star',
    description: 'A brilliant streak crosses the night sky. Make a wish.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'wish',
        label: 'Make a wish',
        outcomes: [
          {
            probability: 0.5,
            message: 'A warm light descends. Your wish was heard.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
          {
            probability: 0.5,
            message: 'A cold wind answers. The star leaves a frozen gift.',
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'lucky',
                aura: 'arcane',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'quarry_site',
    name: 'Quarry Site',
    description: 'An abandoned quarry with good stone still exposed.',
    category: 'positive',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'take',
        label: 'Take what you can',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'stone',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'hire',
        label: 'Hire a crew ($5)',
        condition: {
          type: 'HAS_MONEY',
          amount: 5,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'stone',
                aura: 'arcane',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'petrified_forest',
    name: 'Petrified Forest',
    description: 'Ancient trees turned to stone. Beautiful and valuable.',
    category: 'positive',
    weight: 1,
    demonHunterOnly: false,
    minimumLeg: 2,
    choices: [
      {
        id: 'careful',
        label: 'Harvest carefully (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'stone',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'blast',
        label: 'Use dynamite (sacrifice 1 equipment)',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 3,
                enhancement: 'stone',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'clear_skies',
    name: 'Clear Skies',
    description: 'Blue sky stretches to the horizon. A perfect day on the trail.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'beautiful_sunset',
    name: 'Beautiful Sunset',
    description: 'The wagon train stops early to watch the sun dip behind the mountains.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'campfire_songs',
    name: 'Campfire Songs',
    description: 'The group gathers around the fire and shares songs from back home.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'deer_spotted',
    name: 'Deer Spotted',
    description: 'A buck watches from a ridge, then vanishes into the pines.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'calm_river',
    name: 'Calm River',
    description: 'A gentle stream runs alongside the trail. Good water, easy crossing.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'wildflowers',
    name: 'Wildflowers',
    description: 'The prairie is carpeted in color for miles. Morale is high.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'cool_breeze',
    name: 'Cool Breeze',
    description: 'A welcome wind rolls through after days of heat. Everyone breathes easier.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'starry_night',
    name: 'Starry Night',
    description: 'Thousands of stars overhead. The children try to count them.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'morning_frost',
    name: 'Morning Frost',
    description: 'A thin layer of ice on the grass catches the dawn light. Beautiful and brief.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'eagles_overhead',
    name: 'Eagles Overhead',
    description: 'A pair of bald eagles circle above the wagon train. Good omen.',
    category: 'uneventful',
    weight: 2,
    demonHunterOnly: false,
    choices: [
      {
        id: 'continue',
        label: 'Continue on',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'crossroads_deal',
    name: 'Crossroads Deal',
    description: 'A well-dressed stranger at the crossroads offers a bargain.',
    category: 'demon_hunter',
    weight: 3,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'accept',
        label: 'Accept the deal and sell your soul? (lose 1 equipment slot)',
        outcomes: [
          {
            probability: 1,
            message:
              "You shake the stanger's hand. A cold sensation runs through you. The stranger smiles, here are your rewards...",
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'diamond',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'legendary',
                aura: 'ghost',
              },
              {
                type: 'LOSE_EQUIPMENT_SLOT_PERMANENT',
              },
            ],
          },
        ],
      },
      {
        id: 'refuse',
        label: 'Refuse',
        outcomes: [
          {
            probability: 1,
            message: 'The strangers laughs and disappears leaving behind a pouch of coins and a bone die.',
            effects: [
              {
                type: 'GAIN_MONEY',
                amount: 5,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'bone',
                aura: null,
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'possessed_wagon',
    name: 'Possessed Wagon',
    description: 'Your wagon shakes and groans at night. Something is inside.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'exorcise',
        label: 'Exorcise (use medicine)',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: 'ghost',
              },
            ],
          },
        ],
      },
      {
        id: 'abandon',
        label: 'Abandon wagon (lose supplies, -1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_ALL_SUPPLY_CARDS',
              },
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'steel',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fallen_angel',
    name: 'Fallen Angel',
    description: 'A wounded celestial being lies on the trail, radiating faint light.',
    category: 'demon_hunter',
    weight: 1,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'help',
        label: 'Help it ($10, -1 day)',
        condition: {
          type: 'HAS_MONEY',
          amount: 10,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 10,
              },
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'gold',
                aura: 'holy',
                sticker: 'blue_moon',
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: 'holy',
              },
            ],
          },
        ],
      },
      {
        id: 'ignore',
        label: 'Ignore it',
        outcomes: [
          {
            probability: 1,
            effects: [],
          },
        ],
      },
      {
        id: 'betray',
        label: 'Betray it (sacrifice equipment, lose all rerolls)',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'diamond',
                aura: 'fire',
                sticker: null,
              },
              {
                type: 'LOSE_ALL_REROLLS',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'demons_bounty',
    name: "Demon's Bounty",
    description: 'You slay a lesser demon. Its remains smolder on the ground.',
    category: 'demon_hunter',
    weight: 3,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'collect',
        label: 'Collect the remains',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_MONEY',
                amount: 8,
              },
            ],
          },
        ],
      },
      {
        id: 'purify',
        label: 'Purify the remains (use medicine)',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: 'holy',
                sticker: 'golden_dollar',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'blood_moon_rising',
    name: 'Blood Moon Rising',
    description: 'The moon turns crimson. Your dice feel heavy with dread.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'endure',
        label: 'Endure (25% scored dice destroyed)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'SCORED_DICE_DESTROY_CHANCE',
                chance: 0.25,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'lucky',
                aura: 'fire',
                sticker: 'purple_flower',
              },
            ],
          },
        ],
      },
      {
        id: 'ritual',
        label: 'Perform ritual ($12, skip curse)',
        condition: {
          type: 'HAS_MONEY',
          amount: 12,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 12,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'preachers_ghost',
    name: "The Preacher's Ghost",
    description: 'A spectral preacher appears and blesses your journey.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'accept',
        label: 'Accept the blessing',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: 'ghost',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'hellmouth',
    name: 'Hellmouth',
    description: 'A crack in the earth belches fire and brimstone.',
    category: 'demon_hunter',
    weight: 1,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'descend',
        label: 'Descend (-2 days, sacrifice 2 dice)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 2,
              },
              {
                type: 'LOSE_RANDOM_DICE',
                count: 2,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'diamond',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'gold',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'seal',
        label: 'Seal it (sacrifice equipment)',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 3,
                enhancement: 'stone',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
      {
        id: 'walk_away',
        label: 'Walk away (-1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'cursed_graveyard',
    name: 'Cursed Graveyard',
    description: 'Unholy ground radiates dark power. The air crackles.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'desecrate',
        label: 'Desecrate (boss x2)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 3,
                enhancement: 'bone',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'BOSS_UPGRADE',
                multiplier: 2,
              },
            ],
          },
        ],
      },
      {
        id: 'consecrate',
        label: 'Consecrate (use medicine)',
        condition: {
          type: 'HAS_MEDICINE',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'USE_MEDICINE',
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'bone',
                aura: 'holy',
                sticker: 'golden_dollar',
              },
            ],
          },
        ],
      },
      {
        id: 'pass',
        label: 'Pass through carefully',
        outcomes: [
          {
            probability: 0.5,
            message: 'The spirits let you pass undisturbed.',
            effects: [],
          },
          {
            probability: 0.5,
            message: 'A skeletal hand reaches up and drags something down.',
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'angels_armory',
    name: "Angel's Armory",
    description: 'Hidden behind a waterfall — a cache of holy weapons.',
    category: 'demon_hunter',
    weight: 1,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'buy',
        label: 'Unlock it ($15)',
        condition: {
          type: 'HAS_MONEY',
          amount: 15,
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 15,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'rare',
                aura: 'holy',
              },
            ],
          },
        ],
      },
      {
        id: 'consolation',
        label: 'Take what you can',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: 'holy',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'demonic_duel',
    name: 'Demonic Duel',
    description: 'A demon blocks the trail and challenges you directly.',
    category: 'demon_hunter',
    weight: 1,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'fight',
        label: 'Fight (sacrifice equipment)',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'diamond',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_MONEY',
                amount: 15,
              },
              {
                type: 'GAIN_FRONTIER_ENCOUNTER',
              },
            ],
          },
        ],
      },
      {
        id: 'flee',
        label: 'Flee (-$10, -1 day)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_MONEY',
                amount: 10,
              },
              {
                type: 'LOSE_DAYS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'bargain',
        label: 'Bargain (sacrifice 3 dice)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 3,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'rare',
                aura: 'ghost',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'witchs_offer',
    name: "The Witch's Offer",
    description: 'A crone emerges from the shadows with glowing eyes.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'accept',
        label: 'Accept her offer',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'ADD_AURA_TO_RANDOM_DICE',
                count: 3,
                aura: 'fire',
              },
            ],
          },
        ],
      },
      {
        id: 'decline',
        label: 'Decline (cursed: -1 reroll next round)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_REROLLS',
                amount: 1,
              },
            ],
          },
        ],
      },
      {
        id: 'burn',
        label: 'Burn her (sacrifice equipment)',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'lucky',
                aura: 'holy',
                sticker: 'purple_flower',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'infernal_forge',
    name: 'Infernal Forge',
    description: 'A demonic blacksmith offers his services — at a cost.',
    category: 'demon_hunter',
    weight: 2,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'sacrifice_dice',
        label: 'Sacrifice 3 dice',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_RANDOM_DICE',
                count: 3,
              },
              {
                type: 'GAIN_DICE',
                count: 1,
                enhancement: 'steel',
                aura: 'fire',
                sticker: 'red_bullet',
              },
            ],
          },
        ],
      },
      {
        id: 'sacrifice_equip',
        label: 'Sacrifice equipment',
        condition: {
          type: 'HAS_EQUIPMENT_ANY',
        },
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_EQUIPMENT_CHOICE',
                count: 1,
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'steel',
                aura: 'fire',
                sticker: null,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'the_harrowing',
    name: 'The Harrowing',
    description: 'Demons assault the wagon train all night. Screams fill the darkness.',
    category: 'demon_hunter',
    weight: 1,
    demonHunterOnly: true,
    minimumLeg: 4,
    choices: [
      {
        id: 'endure',
        label: 'Survive (-2 days, -1 hand size)',
        outcomes: [
          {
            probability: 1,
            effects: [
              {
                type: 'LOSE_DAYS',
                amount: 2,
              },
              {
                type: 'LOSE_HAND_SIZE',
                amount: 1,
              },
              {
                type: 'GAIN_RANDOM_EQUIPMENT',
                rarity: 'uncommon',
                aura: 'ghost',
              },
              {
                type: 'GAIN_DICE',
                count: 2,
                enhancement: 'bone',
                aura: 'fire',
                sticker: 'red_bullet',
              },
              {
                type: 'GAIN_MONEY',
                amount: 10,
              },
            ],
          },
        ],
      },
    ],
  },
];

export default trailEvents;

// ─── Lookup Helpers ───

/** Find a trail event definition by ID */
export function getTrailEventById(id: string): TrailEventDef | undefined {
  return trailEvents.find((e) => e.id === id);
}
