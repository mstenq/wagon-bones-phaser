// ─── Boss Definitions ───
// Typed boss data following the trail_tags.ts pattern.
// Each boss defines its round modifier effect and earliest leg it can appear.

// ─── Types ───

export type BossEffectType =
  | 'SHRINK_HAND_PER_DAY'
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

/** Distance multiplier for bosses that override round 3's default 2× (not stacked on top of it). */
export function getBossDistanceMultiplier(boss: BossDef): number | null {
  if (boss.effectType === 'DISTANCE_MULTIPLIER' || boss.effectType === 'SET_HANDS') {
    return (boss.effectParams.multiplier as number) ?? 1;
  }
  return null;
}

// ─── Boss Definitions ───

const bosses: BossDef[] = [
  {
    id: 'the_inspector',
    name: 'The Inspector',
    description: 'Hand size shrinks by 1 each day (8, 7, 6, …)',
    effectType: 'SHRINK_HAND_PER_DAY',
    effectParams: {},
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
    description: 'All played even dice values are disabled (no additional miles or enhancements will trigger)',
    effectType: 'DISABLE_VALUES',
    effectParams: { parity: 'even' },
    minimumLeg: 1,
  },
  {
    id: 'the_undertaker',
    name: 'The Undertaker',
    description: 'All played odd dice values are disabled (no additional miles or enhancements will trigger)',
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
    description: "Every scored hand permanently reduces that hand's trail knowledge by one (min level 1)",
    effectType: 'DOWNGRADE_TRAIL_KNOWLEDGE',
    effectParams: { amount: 1 },
    minimumLeg: 2,
  },
  {
    id: 'the_river',
    name: 'The River',
    description: 'Only straights or high value count when scoring',
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
    description: 'Lose $1 per played dice',
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
    description: 'All dice disabled until one piece of equipment is sold',
    effectType: 'DISABLE_ALL_DICE',
    effectParams: {},
    minimumLeg: 8,
  },
  {
    id: 'the_bounty',
    name: 'The Bounty',
    description: 'Forces 1 dice to be selected/locked randomly each day after first roll (Cannot unselect)',
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

const FINISHER_MINIMUM_LEG = 8;

/** Legs that use only finisher bosses (minimumLeg 8+) on the boss round. */
export function isFinisherLeg(leg: number): boolean {
  return leg > 0 && leg % 8 === 0;
}

/** Bosses eligible for a leg (finisher legs → finisher pool only). */
export function getEligibleBossesForLeg(leg: number): BossDef[] {
  if (isFinisherLeg(leg)) {
    return bosses.filter((b) => (b.minimumLeg ?? 1) >= FINISHER_MINIMUM_LEG);
  }
  return bosses.filter((b) => (b.minimumLeg ?? 1) <= leg);
}

// ─── Lookup Helpers ───

/** Find a boss definition by ID */
export function getBossById(id: string): BossDef | undefined {
  return bosses.find((b) => b.id === id);
}
