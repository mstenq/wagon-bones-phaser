// ─── Boss Definitions ───
// Typed boss data following the trail_tags.ts pattern.
// Each boss defines its round modifier effect and earliest leg it can appear.

// ─── Types ───

export type BossEffectType =
  | 'SPEND_RANDOM_AFTER_SCORE'
  | 'ZERO_MONEY_ON_MOST_PLAYED'
  | 'DISTANCE_MULTIPLIER'
  | 'DISABLE_VALUES'
  | 'SINGLE_HAND_TYPE'
  | 'UNIQUE_HANDS_ONLY'
  | 'DOWNGRADE_TRAIL_KNOWLEDGE'
  | 'STRAIGHTS_ONLY'
  | 'MODIFY_REROLLS'
  | 'SET_HANDS'
  | 'LOSE_MONEY_PER_PLAYED'
  | 'HALVE_TRAIL_KNOWLEDGE'
  | 'DISABLE_RANDOM_EQUIPMENT'
  | 'DISABLE_ALL_DICE'
  | 'LOCK_RANDOM_DICE'
  | 'HIDE_EQUIPMENT';

export interface BossDef {
  id: string;
  name: string;
  description: string;
  effectType: BossEffectType;
  effectParams: Record<string, unknown>;
  minimumLeg?: number;
}

// ─── Boss Definitions ───

const bosses: BossDef[] = [
  {
    id: 'the_inspector',
    name: 'The Inspector',
    description: 'Spend 2 random dice after each day',
    effectType: 'SPEND_RANDOM_AFTER_SCORE',
    effectParams: { count: 2 },
    minimumLeg: 1,
  },
  {
    id: 'the_tax_man',
    name: 'The Tax Man',
    description: 'Playing your most played hand sets money to zero',
    effectType: 'ZERO_MONEY_ON_MOST_PLAYED',
    effectParams: {},
    minimumLeg: 6,
  },
  {
    id: 'the_marathon',
    name: 'The Marathon',
    description: 'Distance is 4x normal',
    effectType: 'DISTANCE_MULTIPLIER',
    effectParams: { multiplier: 4 },
    minimumLeg: 2,
  },
  {
    id: 'the_ghost_town',
    name: 'The Ghost Town',
    description:
      'All played even dice values are disabled (no additional miles or enhancements will trigger)',
    effectType: 'DISABLE_VALUES',
    effectParams: { parity: 'even' },
    minimumLeg: 1,
  },
  {
    id: 'the_undertaker',
    name: 'The Undertaker',
    description:
      'All played odd dice values are disabled (no additional miles or enhancements will trigger)',
    effectType: 'DISABLE_VALUES',
    effectParams: { parity: 'odd' },
    minimumLeg: 1,
  },
  {
    id: 'the_preacher',
    name: 'The Preacher',
    description: 'Only one hand type allowed for round',
    effectType: 'SINGLE_HAND_TYPE',
    effectParams: {},
    minimumLeg: 2,
  },
  {
    id: 'the_call_girl',
    name: 'The Call Girl',
    description: 'Must play different hands each round',
    effectType: 'UNIQUE_HANDS_ONLY',
    effectParams: {},
    minimumLeg: 3,
  },
  {
    id: 'the_trickster',
    name: 'The Trickster',
    description:
      'Every played hand reduces trail knowledge by one before scoring. (Capped at level 1)',
    effectType: 'DOWNGRADE_TRAIL_KNOWLEDGE',
    effectParams: { amount: 1 },
    minimumLeg: 2,
  },
  {
    id: 'the_river',
    name: 'The River',
    description: 'Only straights count when scoring',
    effectType: 'STRAIGHTS_ONLY',
    effectParams: {},
    minimumLeg: 1,
  },
  {
    id: 'the_chain_gang',
    name: 'The Chain Gang',
    description: 'Start with 0 rerolls',
    effectType: 'MODIFY_REROLLS',
    effectParams: {},
    minimumLeg: 2,
  },
  {
    id: 'the_standoff',
    name: 'The Standoff',
    description: 'Play only 1 hand',
    effectType: 'SET_HANDS',
    effectParams: { multiplier: 1, days: 1 },
    minimumLeg: 2,
  },
  {
    id: 'the_banker',
    name: 'The Banker',
    description: 'Lose $1 per die played when scoring (all dice you select, not just the hand)',
    effectType: 'LOSE_MONEY_PER_PLAYED',
    effectParams: { value: 1 },
    minimumLeg: 3,
  },
  {
    id: 'the_bottle',
    name: 'The Bottle',
    description: 'Base trail knowledge is halved for entire round',
    effectType: 'HALVE_TRAIL_KNOWLEDGE',
    effectParams: {},
    minimumLeg: 2,
  },
  {
    id: 'the_jinx',
    name: 'The Jinx',
    description: 'One random piece of equipment disabled per day',
    effectType: 'DISABLE_RANDOM_EQUIPMENT',
    effectParams: { count: 1 },
    minimumLeg: 8,
  },
  {
    id: 'the_bank_lien',
    name: 'The Bank Lien',
    description: 'All dice disabled (equipment still scores)',
    effectType: 'DISABLE_ALL_DICE',
    effectParams: {},
    minimumLeg: 8,
  },
  {
    id: 'the_bounty',
    name: 'The Bounty',
    description:
      'Forces 1 dice to be selected/locked randomly each day after first roll (Cannot unselect)',
    effectType: 'LOCK_RANDOM_DICE',
    effectParams: { count: 1 },
    minimumLeg: 8,
  },
  {
    id: 'the_land_slide',
    name: 'The Land Slide',
    description: "Flips and shuffles all equipment (can't see front of card)",
    effectType: 'HIDE_EQUIPMENT',
    effectParams: {},
    minimumLeg: 8,
  },
  {
    id: 'the_finish_line',
    name: 'The Finish Line',
    description: 'Distance is 6x normal',
    effectType: 'DISTANCE_MULTIPLIER',
    effectParams: { multiplier: 6 },
    minimumLeg: 8,
  },
];

export default bosses;

// ─── Lookup Helpers ───

/** Find a boss definition by ID */
export function getBossById(id: string): BossDef | undefined {
  return bosses.find((b) => b.id === id);
}
