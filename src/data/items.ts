// ─── Equipment Item Definitions ───
// Each item defines its hint display as a function returning styled segments.
// Segments are rendered below the card image in the equipment bar.

// ─── Hint System Types ───

/** Card template overlay identifier — matches filename in assets/card-templates/ */
export type CardTemplate = 'white-text' | 
'white-text-noborder' | 
'black-text' | 
'black-text-noborder' | 
'white-text-black-outline' | 
'white-text-black-outline-noborder' | 
'black-text-white-outline' | 
'black-text-white-outline-noborder' | 
'marked' | 
'hellfire';

/** Visual style for a hint segment */
export type HintStyle =
  | 'miles' // blue text — distance/miles values
  | 'mult' // red rounded-rect background, white text — multiplier chips
  | 'xmult' // red rounded-rect background, white text — xMult values
  | 'odds' // green text — probability displays like "1 in 6"
  | 'inactive' // gray text — "Inactive" when condition not met
  | 'condition' // amber text — activation requirement label
  | 'active' // bright green text — "Active!" when condition is met
  | 'money' // gold text — dollar amounts
  | 'text' // default light text — plain labels
  | 'aura_fire' // fire aura label (orange-red)
  | 'aura_icy' // icy aura label (cyan)
  | 'aura_holy'; // holy aura label (golden-white)

/** A single styled text chunk in a hint line */
export interface HintSegment {
  text: string;
  style: HintStyle;
}

import type { GameState } from '../game/GameState';
import type { PlayerState } from '../game/PlayerState';
import { HandType } from '../game/types';
import { getLoadedDiceMultiplier, resolveCopyTarget } from '../game/Constants';
import { resolveEffectParam, resolveChance } from '../game/effectParams';

/** Raw item definition shape (matches the old JSON + hintDisplay) */
export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  description: string;
  effectType: string;
  cardTemplate?: CardTemplate;
  effectParams: Record<string, unknown>;
  initialState?: Record<string, number>;
  hintDisplay: (game: GameState | null, player: PlayerState) => HintSegment[][];
}

// ─── Helper constructors for readability ───
const miles = (text: string): HintSegment => ({ text, style: 'miles' });
const mult = (text: string): HintSegment => ({ text, style: 'mult' });
const odds = (text: string): HintSegment => ({ text, style: 'odds' });
const inactive = (text: string): HintSegment => ({ text, style: 'inactive' });
const condition = (text: string): HintSegment => ({ text, style: 'condition' });
const active = (text: string): HintSegment => ({ text, style: 'active' });
const money = (text: string): HintSegment => ({ text, style: 'money' });
const text = (t: string): HintSegment => ({ text: t, style: 'text' });

/** Format odds display accounting for Loaded Dice multiplier */
const oddsDisplay = (chance: [number, number], player: PlayerState): HintSegment => {
  const ldm = getLoadedDiceMultiplier(player.equipment);
  const effectiveNum = chance[0] * ldm;
  return odds(`${effectiveNum} in ${chance[1]}`);
};

// ─── Hand type display names ───
const HAND_NAMES: Record<HandType, string> = {
  [HandType.PAIR]: 'Pair',
  [HandType.TWO_PAIR]: 'Two Pair',
  [HandType.THREE_OF_A_KIND]: '3 of a Kind',
  [HandType.FOUR_OF_A_KIND]: '4 of a Kind',
  [HandType.FOUR_STRAIGHT]: '4 Straight',
  [HandType.FULL_HOUSE]: 'Full House',
  [HandType.FIVE_OF_A_KIND]: '5 of a Kind',
  [HandType.FIVE_STRAIGHT]: '5 Straight',
  [HandType.HIGH_VALUE]: 'High Value',
};

/** Check if a played hand type contains the required hand type */
type HandsWithContainment = Extract<
  HandType,
  | HandType.FIVE_OF_A_KIND
  | HandType.FOUR_OF_A_KIND
  | HandType.FULL_HOUSE
  | HandType.THREE_OF_A_KIND
  | HandType.TWO_PAIR
  | HandType.FIVE_STRAIGHT
  | HandType.FOUR_STRAIGHT
>;
function handContains(played: HandType | null, required: HandType): boolean {
  if (!played) return false;
  const CONTAINMENT: Record<HandsWithContainment, HandType[]> = {
    FIVE_OF_A_KIND: [HandType.FIVE_OF_A_KIND, HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.FOUR_OF_A_KIND],
    FOUR_OF_A_KIND: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
    FULL_HOUSE: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
    THREE_OF_A_KIND: [HandType.PAIR],
    TWO_PAIR: [HandType.PAIR],
    FIVE_STRAIGHT: [HandType.FOUR_STRAIGHT,],
    FOUR_STRAIGHT: [],
  };
  if (played === required) return true;
  return CONTAINMENT[played as HandsWithContainment]?.includes(required) ?? false;
}

// ─── Item Definitions ───

const items: ItemDef[] = [
  {
    id: 'horseshoe',
    name: 'Horseshoe',
    cardTemplate: "white-text-black-outline",
    cost: 2,
    rarity: 'common',
    description: '+4 mult',
    effectType: 'ADD_MULT',
    effectParams: { value: 4 },
    hintDisplay: () => [[mult('+4')]],
  },
  // {
  //   id: 'snake_eyes',
  //   name: 'Snake Eyes',
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 1s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 1, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 1')]],
  // },
  // {
  //   id: 'double_deuces',
  //   name: 'Double Deuces',
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 2s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 2, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 2')]],
  // },
  // {
  //   id: 'triad_totem',
  //   name: 'Triad Totem',
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 3s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 3, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 3')]],
  // },
  // {
  //   id: 'four_aces_brand',
  //   name: 'Four Aces Brand',
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 4s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 4, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 4')]],
  // },
  // {
  //   id: 'high_five',
  //   name: 'High Five',
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 5s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 5, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 5')]],
  // },
  // {
  //   id: 'devils_dice',
  //   name: "Devil's Dice",
  //   cost: 5,
  //   rarity: 'common',
  //   description: 'Scored 6s give +3 mult',
  //   effectType: 'PIP_MULT',
  //   effectParams: { pip: 6, value: 3 },
  //   hintDisplay: () => [[mult('+3'), condition('per 6')]],
  // },
  {
    id: 'wedding_ring',
    name: 'Wedding Ring',
    cardTemplate: "white-text",
    cost: 3,
    rarity: 'common',
    description: 'If played hand contains a pair +8 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.PAIR, value: 8 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.PAIR))
        return [[mult('+8'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
      return [[mult('+8'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'town_choir',
    name: 'Town Choir',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains three of a kind +12 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 12 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
        return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
      return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
    },
  },
  {
    id: 'deputy_brothers',
    name: 'Deputy Brothers',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains two pair +10 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.TWO_PAIR, value: 10 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.TWO_PAIR))
        return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]];
      return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'work_boots',
    name: 'Work Boots',
    cardTemplate: "white-text",
    cost: 3,
    rarity: 'common',
    description: 'If played hand contains pair +50 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.PAIR, value: 50 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.PAIR))
        return [[miles('+50'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
      return [[miles('+50'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'buffalo_stampede',
    name: 'Buffalo Stampede',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains three of a kind +100 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 100 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
        return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
      return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
    },
  },
  {
    id: 'trail_rations',
    name: 'Trail Rations',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',
    description: '+30 miles per unused re-roll',
    effectType: 'MILES_PER_UNUSED_REROLL',
    effectParams: { value: 30 },
    hintDisplay: (game) => {
      const rerolls = game?.state.rerollsRemaining ?? 0;
      const total = rerolls * 30;
      if (total > 0) return [[miles(`+${total}`), text('mi')]];
      return [[inactive(`+0`), text(' mi')]];
    },
  },
  {
    id: 'deadeye',
    name: 'Deadeye',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'common',
    description: '+20 mult if 3 or fewer dice are scored',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'SCORED_DICE_LTE', threshold: 3, value: 20 },
    hintDisplay: (game) => {
      console.log(game);
      const diceCount = game?.state.rolledDice?.length ?? 0;
      if (diceCount > 0 && diceCount <= 3) return [[mult('+20'), condition('3 or less dice')], [active('Active!')]];
      return [[mult('+20'), condition('3 or less dice')], [inactive('Inactive')]];
    },
  },
  {
    id: 'stubborn_mule',
    name: 'Stubborn Mule',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'common',
    description: '+15 mult when 0 re-rolls remaining',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'NO_REROLLS', value: 15 },
    hintDisplay: (game) => {
      if (!game) return [[mult('+15'), condition('No rerolls')]];
      if (game.state.rerollsRemaining === 0)
        return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [active('Active!')]];
      return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [inactive('Inactive')]];
    },
  },
  {
    id: 'toolbelt',
    name: 'Toolbelt',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: '+3 mult for each piece of equipment',
    effectType: 'MULT_PER_EQUIPMENT',
    effectParams: { value: 3 },
    hintDisplay: (_game, player) => {
      const total = player.equipment.length * 3;
      return [[mult(`+${total}`)]];
    },
  },
  // {
  //   id: 'trail_boss',
  //   name: 'Trail Boss',
  //   cost: 4,
  //   rarity: 'common',
  //   description: 'Sixes add +30 miles when scored',
  //   effectType: 'PIP_MILES',
  //   effectParams: { pip: 6, value: 30 },
  //   hintDisplay: () => [[miles('+30'), condition('per 6')]],
  // },
  {
    id: 'even_odds',
    name: 'Even Odds',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: '+4 mult when an even value is scored',
    effectType: 'PARITY_MULT',
    effectParams: { parity: 'even', value: 4 },
    hintDisplay: () => [[mult('+4'), condition('per even')]],
  },
  {
    id: 'odd_fellow',
    name: 'Odd Fellow',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: '+31 miles when an odd value is scored',
    effectType: 'PARITY_MILES',
    effectParams: { parity: 'odd', value: 31 },
    hintDisplay: () => [[miles('+31'), condition('per odd')]],
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',
    description: '+15 mult. 1 in 6 chance to be destroyed at end of round.',
    effectType: 'ADD_MULT_RISKY',
    effectParams: { value: 15, destroyChance: [1, 6] },
    hintDisplay: (_game, player) => [[mult('+15'), oddsDisplay([1, 6], player)]],
  },
  {
    id: 'extra_saddlebag',
    name: 'Extra Saddlebag',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: 'Refresh your spent dice for free 1 time a round',
    effectType: 'REFRESH_SPENT_DICE',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('Available!')]],
  },
  {
    id: 'spare_holster',
    name: 'Spare Holster',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: '+1 re-roll per leg',
    effectType: 'MODIFY_REROLLS',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('+1 reroll')]],
  },
  {
    id: 'payday',
    name: 'Payday',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'common',
    description: 'Earn $4 at end of round. Jesse Rawlins (Outlaw) earns $12.',
    effectType: 'END_ROUND_MONEY',
    effectParams: { value: 4, professionOverrides: { outlaw: { value: 12 } } },
    hintDisplay: (_game, player) => {
      const amount = resolveEffectParam<number>(
        { value: 4, professionOverrides: { outlaw: { value: 12 } } },
        'value',
        player.profession?.id,
      );
      return [[money(`+$${amount}`)]];
    },
  },

  // ─── Held-in-Hand Items ───
  // Deprecated in favor of silver_bullets item
  // {
  //   id: 'double_down',
  //   name: 'Double Down',
  //   cardTemplate: "white-text-black-outline",
  //   cost: 5,
  //   rarity: 'uncommon',
  //   description: 'Retrigger all held-in-hand abilities',
  //   effectType: 'HELD_RETRIGGER',
  //   effectParams: { value: 1 },
  //   hintDisplay: () => [[text('Retrigger'), condition('held dice')]],
  // },
  {
    id: 'bottom_dollar',
    name: 'Bottom Dollar',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'common',
    description: 'Adds double the rank of lowest held-in-hand die to mult',
    effectType: 'HELD_LOWEST_MULT',
    effectParams: {},
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      if (held.length > 0) {
        const lowest = Math.min(...held.map((d) => d.value));
        return [[mult(`+${lowest * 2}`), condition('lowest held')]];
      }
      return [[mult('+?'), condition('lowest held')]];
    },
  },
  {
    id: 'ace_in_the_hole',
    name: 'Ace in the Hole',
    cost: 8,
    rarity: 'rare',
    description: 'Each 1 held in hand gives x1.5 mult',
    effectType: 'HELD_PIP_XMULT',
    effectParams: { pip: 1, value: 1.5 },
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 1).length;
      if (count > 0) return [[mult(`x${1.5 ** count}`), condition(`${count}x 1s held`)]];
      return [[mult('x1.5'), condition('per 1 held')], [inactive('Inactive')]];
    },
  },
  {
    id: 'prospectors_pouch',
    name: "Prospector's Pouch",
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'common',
    description: 'Each enhanced die held in hand has a 1 in 2 chance to give $1',
    effectType: 'HELD_ENHANCED_MONEY',
    effectParams: { chance: [1, 2], value: 1 },
    hintDisplay: (game, player) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const enhanced = held.filter((d) => d.enhancement !== null).length;
      if (enhanced > 0) return [[money(`$1`), oddsDisplay([1, 2], player), condition(`${enhanced} enhanced`)]];
      return [[money('$1'), oddsDisplay([1, 2], player), condition('enhanced held')]];
    },
  },
  {
    id: 'eleventh_crossing',
    name: 'The Eleventh Crossing',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',
    description: 'Each 11 held in hand gives +11 mult',
    effectType: 'HELD_PIP_MULT',
    effectParams: { pip: 11, value: 11 },
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 11).length;
      if (count > 0) return [[mult(`+${count * 11}`), condition(`${count}x 11s held`)]];
      return [[mult('+11'), condition('per 11 held')], [inactive('Inactive')]];
    },
  },

  // ─── Phase 2 Items ───
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains x0.25 for every lucky dice trigger',
    effectType: 'LUCKY_TRIGGER_XMULT',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'rabbits_foot');
      const xm = equip?.state.xMult ?? 1;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'collectors_case',
    name: "Collector's Case",
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',
    description: 'Uncommon equipment each give x1.5 mult',
    effectType: 'UNCOMMON_EQUIP_XMULT',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const count = player.equipment.filter((e) => e.def.rarity === 'uncommon').length;
      if (count > 0) return [[mult(`x${(1.5 ** count).toFixed(2)}`), condition(`${count} uncommon`)]];
      return [[mult('x1.5'), condition('per uncommon')], [inactive('None')]];
    },
  },
  {
    id: 'money_wagon',
    name: 'Money Wagon',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: '+2 miles for every $1 you have',
    effectType: 'MILES_PER_DOLLAR',
    effectParams: { value: 2 },
    hintDisplay: (_game, player) => {
      const total = player.economy.balance * 2;
      return [[miles(`+${total}`), text('mi')]];
    },
  },
  {
    id: 'bargain_bin',
    name: 'Bargain Bin',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains +2 mult per reroll in the shop',
    effectType: 'SHOP_REROLL_MULT_GAIN',
    effectParams: { value: 2 },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'bargain_bin');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`)]];
    },
  },
  {
    id: 'fading_memory',
    name: 'Fading Memory',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',
    description: '+20 mult, -4 mult per round played, removed after 5 rounds',
    effectType: 'DECAYING_MULT',
    effectParams: { decayPerRound: 4, maxRounds: 5 },
    initialState: { mult: 20, roundsPlayed: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'fading_memory');
      const m = equip?.state.mult ?? 20;
      const rounds = equip?.state.roundsPlayed ?? 0;
      return [[mult(`+${m}`), condition(`${5 - rounds} rounds left`)]];
    },
  },
  {
    id: 'card_counter',
    name: 'Card Counter',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    description:
      'Item gains +2 mult if played hand contains 2 pair. Victor Hale (Con Artist) gains +4 mult if played hand contains 2 pair.',
    effectType: 'HAND_MULT_GAIN',
    effectParams: {
      handType: HandType.TWO_PAIR,
      value: 2,
      professionOverrides: { con_artist: { value: 4 } },
    },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'card_counter');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`), condition(HAND_NAMES.TWO_PAIR)]];
    },
  },
  {
    id: 'lucky_number',
    name: 'Lucky Number',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',
    description:
      'Each played [number changes each round] gives x1.5 mult when scored. Thomas "Tommy" Reeve (Gambler) gains x2 mult when lucky number scores.',
    effectType: 'LUCKY_NUMBER_PIP_XMULT',
    effectParams: { value: 1.5, professionOverrides: { gambler: { value: 2 } } },
    initialState: { pip: 7 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'lucky_number');
      const pip = equip?.state.pip ?? '?';
      const xVal = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 1.5 }, 'value', player.profession?.id);
      return [[mult(`x${xVal}`), condition(`per ${pip}`)]];
    },
  },
  {
    id: 'worn_deck',
    name: 'Worn Deck',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'x2 Mult. Loses x0.01 mult per dice re-rolled',
    effectType: 'DECAYING_XMULT',
    effectParams: { decayPerDie: 0.01 },
    initialState: { xMult: 2 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'worn_deck');
      const xm = equip?.state.xMult ?? 2;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'war_drums',
    name: 'War Drums',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'Retrigger all dice played for the next 10 days of travel',
    effectType: 'SCORED_RETRIGGER_TIMED',
    effectParams: {},
    initialState: { daysRemaining: 10 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'war_drums');
      const days = equip?.state.daysRemaining ?? 0;
      if (days > 0) return [[active(`${days} days left`)]];
      return [[inactive('Expired')]];
    },
  },
  {
    id: 'bone_collector',
    name: 'Bone Collector',
    cost: 6,
    rarity: 'uncommon',
    cardTemplate: 'white-text',
    description: 'Gains +3 miles per each enhanced dice that is spent',
    effectType: 'ENHANCED_SPENT_MILES_GAIN',
    effectParams: { value: 3 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'bone_collector');
      const m = equip?.state.miles ?? 0;
      return [[miles(`+${m}`)]];
    },
  },
  {
    id: 'snake_oil_ledger',
    name: 'Snake Oil Ledger',
    cardTemplate: "white-text",
    cost: 9,
    rarity: 'rare',
    description: 'Item gains x0.25 mult for each card sold. Resets when boss is defeated.',
    effectType: 'SELL_XMULT_GAIN',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'snake_oil_ledger');
      const xm = equip?.state.xMult ?? 1;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'gold_tooth',
    name: 'Gold Tooth',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: 'Played gold dice earn $4',
    effectType: 'GOLD_DICE_MONEY',
    effectParams: { value: 4 },
    hintDisplay: () => [[money('+$4'), condition('per gold')]],
  },
  {
    id: 'guardian_totem',
    name: 'Guardian Totem',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Prevents death if miles travelled is at least 25% of required distance. Card is destroyed if used.',
    effectType: 'PREVENT_DEATH',
    effectParams: { threshold: 0.25 },
    hintDisplay: () => [[active('Protected')]],
  },
  {
    id: 'high_noon',
    name: 'High Noon',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'x3 mult on final day of round',
    effectType: 'FINAL_DAY_XMULT',
    effectParams: { value: 3 },
    hintDisplay: (game) => {
      if (game && game.state.day >= game.config.maxDays) return [[mult('x3')], [active('Active!')]];
      return [[mult('x3'), condition('final day')], [inactive('Inactive')]];
    },
  },
  {
    id: 'desperado',
    name: 'Desperado',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: 'Add the sell value of all other owned equipment as mult',
    effectType: 'SELL_VALUE_AS_MULT',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'desperado');
      let total = 0;
      for (const e of player.equipment) {
        if (e !== equip) total += e.sellValue;
      }
      return [[mult(`+${total}`)]];
    },
  },
  {
    id: 'stagecoach',
    name: 'Stagecoach',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'Dice are automatically refreshed when supply reaches 50% or below. -1 day per round.',
    effectType: 'AUTO_REFRESH_REDUCE_DAYS',
    effectParams: { daysPenalty: 1 },
    hintDisplay: () => [[active('Auto-refresh'), condition('-1 day')]],
  },
  {
    id: 'mystery_crate',
    name: 'Mystery Crate',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'Add a dice at the start of each round with a random sticker',
    effectType: 'ROUND_START_ADD_DICE',
    effectParams: {},
    hintDisplay: () => [[active('+1 die'), condition('round start')]],
  },
  {
    id: 'spare_wagon_parts',
    name: 'Spare Wagon Parts',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Negates one wagon-damage trail event, then destroys itself. +4 mult.',
    effectType: 'NEGATE_WAGON_DAMAGE',
    effectParams: { value: 4 },
    hintDisplay: () => [[mult('+4'), text(' mult')], [text('Negates wagon damage')]],
  },
  {
    id: 'scouts_spyglass',
    name: "Scout's Spyglass",
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    description: 'See the next trail event before it happens. Skip it for $3. +25 miles.',
    effectType: 'NONE',
    effectParams: {},
    hintDisplay: () => [[miles('+25'), text(' miles')], [text('Preview trail events')]],
  },
  {
    id: 'saint_elmos_shield',
    name: "Saint Elmo's Shield",
    cardTemplate: "white-text-black-outline",
    cost: 20,
    rarity: 'legendary',
    description: 'Disables all boss effects and negative effects from trail events are prevented. Divine favor intervenes.',
    effectType: 'NONE',
    effectParams: {},
    hintDisplay: () => [[active('Negates'), text(' boss & trail penalties')]],
  },
  {
    id: 'book_of_the_dead',
    name: 'Book of the Dead',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    description: 'Gains x1 mult for each destroyed enhanced dice',
    effectType: 'ENHANCED_DESTROYED_XMULT',
    effectParams: { value: 1 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'book_of_the_dead');
      const xm = equip?.state.xMult ?? 1;
      if (xm > 1) return [[mult(`x${xm}`)]];
      return [[mult('x1'), condition('per enhanced destroyed')], [inactive('None')]];
    },
  },
  {
    id: 'devils_hand',
    name: "The Devil's Hand",
    cardTemplate: 'hellfire',
    cost: 20,
    rarity: 'legendary',
    description: "Played 6's give x2 mult when scored",
    effectType: 'PIP_XMULT',
    effectParams: { pip: 6, value: 2 },
    hintDisplay: () => [[mult('x2'), condition('per 6 scored')]],
  },
  {
    id: 'twenty_third_psalm',
    name: 'The 23rd Psalm',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    description: 'Item gains x1 mult for every 23 dice re-rolled',
    effectType: 'REROLL_COUNT_XMULT',
    effectParams: { threshold: 23, value: 1 },
    initialState: { xMult: 1, rerollsTotal: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'twenty_third_psalm');
      const xm = equip?.state.xMult ?? 1;
      const total = equip?.state.rerollsTotal ?? 0;
      const remaining = 23 - (total % 23);
      if (xm > 1) return [[mult(`x${xm}`)], [condition(`${remaining} to next`)]];
      return [[mult('x1'), condition('per 23 rerolled')], [text(`${total % 23}/23`)]];
    },
  },
  {
    id: 'ghost_lantern',
    name: 'Ghost Lantern',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    description: 'Creates a ghost copy of a random consumable card in your possession at the end of the shop phase',
    effectType: 'SHOP_END_GHOST_CONSUMABLE',
    effectParams: {},
    hintDisplay: () => [[active('Ghost copy'), condition('end of shop')]],
  },
  {
    id: 'seventh_trumpet',
    name: 'The Seventh Trumpet',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    description: 'Retriggers all played dice, and all held in hand effects',
    effectType: 'ALL_RETRIGGER',
    effectParams: { value: 1 },
    hintDisplay: () => [[text('Retrigger'), condition('all played & held')]],
  },

  // ─── Phase 3 Items ───
  {
    id: 'twin_colts',
    name: 'Twin Colts',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains two pair +80 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.TWO_PAIR, value: 80 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.TWO_PAIR))
        return [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]];
      return [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'rail_line',
    name: 'Rail Line',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains a 4 straight +80 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 80 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT))
        return [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]];
      return [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]];
    },
  },
  {
    id: 'long_haul',
    name: 'Long Haul',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains a 5 straight +100 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 100 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
        return [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
      return [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [inactive('Inactive')]];
    },
  },
  {
    id: 'silver_bullets',
    name: 'Silver Bullets',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Retrigger all dice held in hand',
    effectType: 'HELD_RETRIGGER',
    effectParams: { value: 1 },
    hintDisplay: () => [[text('Retrigger'), condition('held dice')]],
  },
  {
    id: 'funeral_pyre',
    name: 'Funeral Pyre',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'When starting round, destroy equipment to right and add double its sell value as mult',
    effectType: 'ROUND_START_DESTROY_RIGHT',
    effectParams: {},
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'funeral_pyre');
      const m = equip?.state.mult ?? 0;
      if (m > 0) return [[mult(`+${m}`)]];
      return [[text('Destroys right'), condition('round start')]];
    },
  },
  {
    id: 'quarry_stone',
    name: 'Quarry Stone',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'Add one stone die to collection when starting round',
    effectType: 'ROUND_START_ADD_STONE',
    effectParams: {},
    hintDisplay: () => [[active('+1 stone'), condition('round start')]],
  },
  {
    id: 'six_shooter',
    name: 'Six Shooter',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',
    description: 'x4 mult every 6th hand played',
    effectType: 'EVERY_NTH_HAND_XMULT',
    effectParams: { n: 6, value: 4 },
    initialState: { handsPlayed: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'six_shooter');
      const hands = equip?.state.handsPlayed ?? 0;
      const remaining = 6 - (hands % 6);
      if (remaining === 6 && hands > 0) return [[mult('x4')], [active('Active!')]];
      return [[mult('x4'), condition(`in ${remaining}`)]];
    },
  },
  {
    id: 'wild_card',
    name: 'Wild Card',
    cost: 4,
    rarity: 'common',
    description: '+0 to +23 mult (random)',
    effectType: 'RANDOM_MULT',
    effectParams: { min: 0, max: 23 },
    hintDisplay: () => [[mult('+0-23'), odds('random')]],
  },
  {
    id: 'bank_note',
    name: 'Bank Note',
    cardTemplate: 'white-text',
    cost: 1,
    rarity: 'common',
    description:
      'Go up to $20 in debt. When Charles Whitlock (Banker) sells this item, his debt is wiped clean.',
    effectType: 'BANK_NOTE',
    effectParams: { maxDebt: 20 },
    hintDisplay: (_game, player) => {
      const debt = player.debtLimit;
      if (player.economy.balance < 0) {
        return [[money(`$${player.economy.balance}`), condition('in debt')]];
      }
      return [[money(`-$${debt} max`), condition('debt limit')]];
    },
  },
  {
    id: 'snake_eyes',
    name: 'Snake Eyes',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',
    description:
      '1 in 4 chance to get a supply card when a 1 is scored. Abigail Turner (Merchant) has a 1 in 2 chance.',
    effectType: 'PIP_SUPPLY_CHANCE',
    effectParams: { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } },
    hintDisplay: (_game, player) => {
      const p = { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } };
      return [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('supply per 1')]];
    },
  },
  {
    id: 'coupon_book',
    name: 'Coupon Book',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description: '1 free reroll per shop visit',
    effectType: 'FREE_SHOP_REROLL',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('1 free reroll'), condition('per shop')]],
  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',
    description: 'Retrigger all played dice on final day of round',
    effectType: 'SCORED_RETRIGGER_FINAL_DAY',
    effectParams: {},
    hintDisplay: (game) => {
      if (game && game.state.day >= game.config.maxDays) return [[text('Retrigger all'), active('Final day!')]];
      return [[text('Retrigger all'), condition('final day')], [inactive('Inactive')]];
    },
  },
  {
    id: 'lucky_find',
    name: 'Lucky Find',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',
    description: 'If one die is scored alone on first day, add a random enhancement',
    effectType: 'SOLO_FIRST_DAY_ENHANCE',
    effectParams: {},
    hintDisplay: (game) => {
      if (game && game.state.day === 1 && game.state.selectedForScore?.length === 1)
        return [[active('Enhancing!')]];
      return [[condition('Solo first day'), inactive('Inactive')]];
    },
  },
  {
    id: 'iron_furnace',
    name: 'Iron Furnace',
    cardTemplate: "white-text",
    cost: 7,
    rarity: 'uncommon',
    description: 'x0.2 mult for each steel die in collection',
    effectType: 'ENHANCEMENT_COUNT_XMULT',
    effectParams: { enhancement: 'steel', value: 0.2 },
    hintDisplay: (_game, player) => {
      const count = player.dice.filter((d) => d.enhancement === 'steel').length;
      const xm = 1 + count * 0.2;
      if (count > 0) return [[mult(`x${xm.toFixed(1)}`), condition(`${count} steel`)]];
      return [[mult('x0.2'), condition('per steel')], [inactive('None')]];
    },
  },
  {
    id: 'rainy_day_fund',
    name: 'Rainy Day Fund',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: '$1 per unused re-roll at end of round',
    effectType: 'END_ROUND_MONEY_PER_REROLL',
    effectParams: { value: 1 },
    hintDisplay: () => [[money('$1'), condition('per unused reroll')]],
  },
  {
    id: 'one_eyed_jack',
    name: 'One-Eyed Jack',
    cost: 6,
    rarity: 'uncommon',
    description: 'Retrigger each played 1',
    effectType: 'PIP_RETRIGGER',
    effectParams: { pip: 1 },
    hintDisplay: () => [[text('Retrigger'), condition('each 1')]],
  },
  {
    id: 'gold_pan',
    name: 'Gold Pan',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',
    description:
      '1 in 2 chance to give $2 when an enhanced die scores. Davis Holler (Prospector) has a guaranteed chance.',
    effectType: 'ENHANCED_SCORE_MONEY',
    effectParams: { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } },
    hintDisplay: (_game, player) => {
      const p = { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } };
      const chance = resolveChance(p, player.profession?.id);
      if (chance[0] >= chance[1]) return [[money('$2'), oddsDisplay([1,1], player), condition('enhanced scored')]];
      return [[money('$2'), oddsDisplay(chance, player), condition('enhanced scored')]];
    },
  },

  // ─── Phase 4 Items ───
  {
    id: 'trail_journal',
    name: 'Trail Journal',
    cost: 5,
    rarity: 'uncommon',
    description: 'Adds the number of times the hand has been played this trip as mult',
    effectType: 'HAND_TIMES_PLAYED_MULT',
    effectParams: {},
    hintDisplay: (game, player) => {
      const handType = game?.state.currentHandType;
      if (handType) {
        const stats = player.getHandStats(handType);
        return [[mult(`+${stats.timesPlayed}`), condition(HAND_NAMES[handType])]];
      }
      return [[mult('+?'), condition('times played')]];
    },
  },
  {
    id: 'marked',
    name: 'Marked',
    cardTemplate: "marked",
    cost: 6,
    rarity: 'uncommon',
    description:
      '+1 mult per hand played without scoring a 6. Scoring a 6 resets mult to 0. Isaac Granger (Demon Hunter) gets +2 per hand.',
    effectType: 'MARKED_NO_SIX_MULT',
    effectParams: { multPerHand: 1, professionOverrides: { demon_hunter: { multPerHand: 2 } } },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'marked');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`), condition('no 6s')]];
    },
  },
  {
    id: 'surveyors_transit',
    name: "Surveyor's Transit",
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',
    description:
      "1 in 4 chance to upgrade trail knowledge of hand type played. 1 in 2 chance if used by Elias Mercer (Surveyor).",
    effectType: 'HAND_UPGRADE_CHANCE',
    effectParams: { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } },
    hintDisplay: (_game, player) => {
      const p = { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } };
      return [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('upgrade hand')]];
    },
  },
  {
    id: 'guide_lantern',
    name: 'Guide Lantern',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    description:
      'Gain x0.1 mult for every trail guide used. Caleb Winters (Scout) gains x0.2 mult for every trail guide used.',
    effectType: 'TRAIL_GUIDE_XMULT',
    effectParams: { value: 0.1, professionOverrides: { scout: { value: 0.2 } } },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'guide_lantern');
      const xm = equip?.state.xMult ?? 1;
      const gain = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 0.1 }, 'value', player.profession?.id);
      if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
      return [[mult(`x${gain}`), condition('per guide used')], [inactive('None')]];
    },
  },
  {
    id: 'steam_engine',
    name: 'Steam Engine',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Gains +100 miles. -5 miles per hand played.',
    effectType: 'STATEFUL_ADD_MILES',
    effectParams: { decayPerHand: 5 },
    initialState: { miles: 100 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'steam_engine');
      const m = equip?.state.miles ?? 100;
      if (m > 0) return [[miles(`+${m}`)]];
      return [[inactive('+0 miles')]];
    },
  },
  {
    id: 'bloodline',
    name: 'Bloodline',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',
    description: 'If first day of round only scores one die, add a permanent copy to your collection',
    effectType: 'FIRST_DAY_SOLO_COPY',
    effectParams: {},
    hintDisplay: (game) => {
      if (game && game.state.day === 1 && game.state.selectedForScore?.length === 1)
        return [[active('Copying!')]];
      return [[condition('Solo first day')], [inactive('Inactive')]];
    },
  },
  {
    id: 'open_palm',
    name: 'Open Palm',
    cardTemplate: "white-text-black-outline",
    cost: 3,
    rarity: 'common',
    description: 'All dice count when scoring',
    effectType: 'ALL_DICE_SCORE',
    effectParams: {},
    hintDisplay: () => [[active('All dice score')]],
  },
  {
    id: 'hellfire_round',
    name: 'Hellfire Round',
    cardTemplate: "hellfire",
    cost: 6,
    rarity: 'rare',
    description: 'If first hand of round is an enhanced 6, destroy it and gain a Frontier Encounter card',
    effectType: 'FIRST_HAND_ENHANCED_SIX',
    effectParams: {},
    hintDisplay: (game) => {
      if (game && game.state.day === 1) return [[condition('First hand'), active('Ready')]];
      return [[condition('First hand'), inactive('Inactive')]];
    },
  },
  {
    id: 'cowboy_boots',
    name: 'Cowboy Boots',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Every played die permanently gains +5 miles when scored',
    effectType: 'PERMANENT_DIE_MILES_GAIN',
    effectParams: { value: 5 },
    hintDisplay: () => [[miles('+5'), condition('per die (permanent)')]],
  },
  {
    id: 'trail_tax',
    name: 'Trail Tax',
    cost: 4,
    rarity: 'common',
    description: '+2 mult per day travelled, -1 mult per re-roll used',
    effectType: 'TRAIL_TAX',
    effectParams: { multPerDay: 2, multLostPerReroll: 1 },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'trail_tax');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`)]];
    },
  },
  {
    id: 'wanted_poster',
    name: 'Wanted Poster',
    cost: 4,
    rarity: 'common',
    description:
      'Earn $4 if hand is [hand]. Changes each round of journey. Nathan Cole (Hunter) gains $8.',
    effectType: 'WANTED_HAND_MONEY',
    effectParams: { value: 4, professionOverrides: { hunter: { value: 8 } } },
    initialState: { targetHand: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'wanted_poster');
      const handIdx = equip?.state.targetHand ?? 0;
      const handTypes = Object.values(HandType);
      const handType = handTypes[handIdx % handTypes.length] as HandType;
      const amount = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 4 }, 'value', player.profession?.id);
      return [[money(`$${amount}`), condition(HAND_NAMES[handType] ?? '?')]];
    },
  },

  // ─── Phase 5 Items ───
  {
    id: 'nitro',
    name: 'Nitro',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'rare',
    description: 'x3 mult. 1 in 1000 chance of being destroyed at end of round.',
    effectType: 'XMULT_RISKY',
    effectParams: { value: 3, destroyChance: [1, 1000] },
    hintDisplay: (_game, player) => [[mult('x3')], [oddsDisplay([1, 1000], player), text('self-destruct')]],
  },
  {
    id: 'repeat_offender',
    name: 'Repeat Offender',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'x3 mult if played hand has already been played this round',
    effectType: 'REPEAT_HAND_XMULT',
    effectParams: { value: 3 },
    hintDisplay: (game) => {
      if (game && game.state.currentHandType && game.state.handHistory.filter((h) => h === game.state.currentHandType).length > 1)
        return [[mult('x3')], [active('Repeat!')]];
      return [[mult('x3'), condition('repeat hand')]];
    },
  },
  {
    id: 'tight_fist',
    name: 'Tight Fist',
    cardTemplate: "black-text-white-outline-noborder",
    cost: 5,
    rarity: 'uncommon',
    description: 'Gains +3 mult when any booster pack is skipped',
    effectType: 'STATEFUL_ADD_MULT',
    effectParams: { gainOnPackSkip: 3 },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'tight_fist');
      const m = equip?.state.mult ?? 0;
      if (m > 0) return [[mult(`+${m}`)]];
      return [[mult('+3'), condition('per pack skipped')]];
    },
  },
  {
    id: 'haunted_totem',
    name: 'Haunted Totem',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'uncommon',
    description: 'Gains x0.5 mult when round starts (not boss rounds). Destroys one random equipment.',
    effectType: 'ROUND_START_XMULT_DESTROY',
    effectParams: { value: 0.5 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'haunted_totem');
      const xm = equip?.state.xMult ?? 1;
      if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
      return [[mult('x0.5'), condition('per round start')]];
    },
  },
  {
    id: 'square_dance',
    name: 'Square Dance',
    cardTemplate: "black-text-white-outline",
    cost: 4,
    rarity: 'common',
    description: 'Gains +4 miles if played hand has exactly 4 dice',
    effectType: 'EXACT_DICE_COUNT_MILES',
    effectParams: { count: 4, value: 4 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'square_dance');
      const m = equip?.state.miles ?? 0;
      if (m > 0) return [[miles(`+${m}`), condition('4 dice played')]];
      return [[miles('+4')],[condition('when 4 dice played')]];
    },
  },
  {
    id: 'junk_dealer',
    name: 'Junk Dealer',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'When round starts, create 2 common pieces of equipment',
    effectType: 'ROUND_START_CREATE_EQUIPMENT',
    effectParams: { count: 2, rarity: 'common' },
    hintDisplay: () => [[text('2 common equip')],[condition('per round')]],
  },
  {
    id: 'new_blood',
    name: 'New Blood',
    cardTemplate: "black-text-white-outline",
    cost: 7,
    rarity: 'uncommon',
    description: 'Gains x0.25 mult for every new dice added to collection',
    effectType: 'STATEFUL_XMULT',
    effectParams: { gainOnDiceAdded: 0.25 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'new_blood');
      const xm = equip?.state.xMult ?? 1;
      if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
      return [[mult('x0.25'), condition('per new dice')]];
    },
  },
  {
    id: 'emergency_supplies',
    name: 'Emergency Supplies',
    cardTemplate: "black-text",
    cost: 8,
    rarity: 'uncommon',
    description:
      'Create a random supply card if hand is played with $4 or less. Dr. Eleanor Sykes (Doctor) gets a supply card if hand is played with $8 or less.',
    effectType: 'LOW_MONEY_SUPPLY',
    effectParams: { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } },
    hintDisplay: (_game, player) => {
      const p = { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } };
      const threshold = resolveEffectParam<number>(p, 'threshold', player.profession?.id);
      if (player.economy.balance <= threshold) return [[text('Supply card!'), active('Active')]];
      return [[text('Supply card'), condition(`≤$${threshold}`)]];
    },
  },
  {
    id: 'railroad_bonds',
    name: 'Railroad Bonds',
    cost: 6,
    rarity: 'uncommon',
    description: 'Earn $1 at end of round, increased by $2 for every boss defeated',
    effectType: 'END_ROUND_MONEY_SCALING',
    effectParams: { base: 1, perBoss: 2 },
    initialState: { bossesDefeated: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'railroad_bonds');
      const bossesDefeated = (equip?.state?.bossesDefeated as number) ?? 0;
      const total = 1 + bossesDefeated * 2;
      return [[money(`$${total}`), condition('end of round')]];
    },
  },
  {
    id: 'leftovers',
    name: 'Leftovers',
    cardTemplate: "black-text-white-outline",
    cost: 4,
    rarity: 'common',
    description:
      '1 in 2 chance to gain a supply card when opening a booster pack. Martha Delaney (Cook) has a guaranteed chance.',
    effectType: 'PACK_OPEN_SUPPLY_CHANCE',
    effectParams: { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } },
    hintDisplay: (_game, player) => {
      const p = { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } };
      const chance = resolveChance(p, player.profession?.id);
      return [[oddsDisplay(chance, player), text('supply'), condition('on pack open')]];
    },
  },
  {
    id: 'campfire_stories',
    name: 'Campfire Stories',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: '+1 mult per supply card used this journey',
    effectType: 'SUPPLY_USED_MULT',
    effectParams: { value: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'campfire_stories');
      const m = equip?.state.mult ?? 0;
      if (m > 0) return [[mult(`+${m}`)]];
      return [[mult('+1'), condition('per supply used')]];
    },
  },
  {
    id: 'quarry_mine',
    name: 'Quarry Mine',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',
    description: '+25 miles for each stone die in collection',
    effectType: 'ENHANCEMENT_COUNT_MILES',
    effectParams: { enhancement: 'stone', value: 25 },
    hintDisplay: (_game, player) => {
      const count = player.dice.filter((d) => d.enhancement === 'stone').length;
      const total = count * 25;
      if (count > 0) return [[miles(`+${total}`), condition(`${count} stone`)]];
      return [[miles('+25'), condition('per stone die')]];
    },
  },
  {
    id: 'antique_revolver',
    name: 'Antique Revolver',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',
    description: 'When round starts, gain $3 of sell value to current card',
    effectType: 'ROUND_START_SELL_VALUE',
    effectParams: { value: 3 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'antique_revolver');
      const sv = equip?.sellValue ?? 2;
      return [[money(`$${sv}`), text('sell value')]];
    },
  },
  {
    id: 'hardtack',
    name: 'Hardtack',
    cardTemplate: "black-text-white-outline",
    cost: 6,
    rarity: 'uncommon',
    description: 'When round starts, gain +3 days and lose all rerolls',
    effectType: 'ROUND_START_DAYS_NO_REROLLS',
    effectParams: { days: 3 },
    hintDisplay: () => [[text('+3 days'), condition('no rerolls')]],
  },
  {
    id: 'manifest_destiny',
    name: 'Manifest Destiny',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'uncommon',
    description: 'Gains +15 miles if hand contains a 5 straight',
    effectType: 'HAND_MILES_GAIN',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 15 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'manifest_destiny');
      const m = equip?.state.miles ?? 0;
      if (m > 0) return [[miles(`+${m}`), condition(HAND_NAMES.FIVE_STRAIGHT)]];
      return [[miles('+15'), condition(HAND_NAMES.FIVE_STRAIGHT)]];
    },
  },

  // ─── Phase 6 Items ───
  {
    id: 'rail_splitter',
    name: 'Rail Splitter',
    cardTemplate: 'black-text-white-outline',
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains a 4 straight +8 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 8 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT))
        return [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]];
      return [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]];
    },
  },
  {
    id: 'open_range',
    name: 'Open Range',
    cardTemplate: 'white-text-black-outline',
    cost: 3,
    rarity: 'common',
    description: 'If played hand contains a 5 straight +12 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 12 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
        return [[mult('+12'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
      return [[mult('+12'), condition(HAND_NAMES.FIVE_STRAIGHT)], [inactive('Inactive')]];
    },
  },
  {
    id: 'one_man_posse',
    name: 'One-Man Posse',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    description: 'x1 mult for each empty equipment slot',
    effectType: 'EMPTY_SLOT_XMULT',
    effectParams: { value: 1 },
    hintDisplay: (_game, player) => {
      const emptySlots = player.maxEquipmentSlots - player.usedEquipmentSlots;
      if (emptySlots > 0) return [[mult(`x${1 + emptySlots}`), condition(`${emptySlots} empty`)]];
      return [[mult('x1'), condition('no empty slots')], [inactive('Inactive')]];
    },
  },
  {
    id: 'covered_wagon',
    name: 'Covered Wagon',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    description: 'Gains +30 miles for every Wood die scored',
    effectType: 'ENHANCEMENT_SCORED_MILES',
    effectParams: { enhancement: 'wooden', value: 30 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'covered_wagon');
      const m = equip?.state.miles ?? 0;
      if (m > 0) return [[miles(`+${m}`), condition('wooden scored')]];
      return [[miles('+30'), condition('per wooden scored')]];
    },
  },
  {
    id: 'moonshine',
    name: 'Moonshine',
    cardTemplate: 'white-text-noborder',
    cost: 6,
    rarity: 'uncommon',
    description: 'Retrigger all enhanced dice. Enhanced dice have 1 in 6 chance of being destroyed, diamond dice 1 in 3.',
    effectType: 'ENHANCED_RETRIGGER',
    effectParams: { destroyChance: [1, 6], diamondDestroyChance: [1, 3] },
    hintDisplay: (_game, player) => [[text('Retrigger'), condition('enhanced dice')], [oddsDisplay([1, 6], player), text('destroy')]],
  },
  {
    id: 'burn_barrel',
    name: 'Burn Barrel',
    cardTemplate: 'black-text',
    cost: 6,
    rarity: 'uncommon',
    description: 'At start of each round, destroy one standard non-enhanced die. If destroyed, earn $3.',
    effectType: 'ROUND_START_DESTROY_STANDARD_DICE',
    effectParams: { value: 3 },
    hintDisplay: () => [[money('+$3'), condition('destroy standard die')]],
  },
  {
    id: 'shortcut_trail',
    name: 'Shortcut Trail',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    description: 'x0.25 mult for each round of journey skipped',
    effectType: 'ROUNDS_SKIPPED_XMULT',
    effectParams: { value: 0.25 },
    initialState: { roundsSkipped: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'shortcut_trail');
      const skipped = equip?.state.roundsSkipped ?? 0;
      const xm = 1 + skipped * 0.25;
      if (skipped > 0) return [[mult(`x${xm.toFixed(2)}`), condition(`${skipped} skipped`)]];
      return [[mult('x0.25'), condition('per round skipped')], [inactive('None')]];
    },
  },
  {
    id: 'quick_draw',
    name: 'Quick Draw',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    description: 'Retrigger first played die 2 additional times',
    effectType: 'FIRST_DICE_RETRIGGER',
    effectParams: { value: 2 },
    hintDisplay: () => [[text('Retrigger first'), condition('×2')]],
  },
  {
    id: 'last_laugh',
    name: 'Last Laugh',
    cardTemplate: 'white-text-noborder',
    cost: 5,
    rarity: 'uncommon',
    description: 'Retrigger last played die 1 additional time',
    effectType: 'LAST_DICE_RETRIGGER',
    effectParams: { value: 1 },
    hintDisplay: () => [[text('Retrigger last'), condition('×1')]],
  },
  {
    id: 'lucky_penny',
    name: 'Lucky Penny',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    description: 'Played lucky dice earn $1 when scored',
    effectType: 'LUCKY_DICE_MONEY',
    effectParams: { value: 1 },
    hintDisplay: () => [[money('+$1'), condition('per lucky scored')]],
  },
  {
    id: 'bone_charm',
    name: 'Bone Charm',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',
    description: 'Played bone dice have 1 in 2 chance to give x1.5 mult',
    effectType: 'BONE_DICE_XMULT_CHANCE',
    effectParams: { chance: [1, 2], value: 1.5 },
    hintDisplay: (_game, player) => [[mult('x1.5'), oddsDisplay([1, 2], player), condition('per bone')]],
  },
  {
    id: 'wood_axe',
    name: 'Wood Axe',
    cardTemplate: 'black-text',
    cost: 7,
    rarity: 'uncommon',
    description: 'Played wooden dice give +50 miles when scored',
    effectType: 'WOODEN_DICE_MILES',
    effectParams: { value: 50 },
    hintDisplay: () => [[miles('+50'), condition('per wooden')]],
  },
  {
    id: 'iron_spurs',
    name: 'Iron Spurs',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    description: 'Played iron dice give +7 mult when scored',
    effectType: 'IRON_DICE_MULT',
    effectParams: { value: 7 },
    hintDisplay: () => [[mult('+7'), condition('per steel')]],
  },
  {
    id: 'diamond_coffin',
    name: 'Diamond Coffin',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains x0.75 mult for every diamond die that is destroyed',
    effectType: 'DIAMOND_DESTROYED_XMULT',
    effectParams: { value: 0.75 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'diamond_coffin');
      const xm = equip?.state.xMult ?? 1;
      if (xm > 1) return [[mult(`x${xm.toFixed(2)}`)]];
      return [[mult('x0.75'), condition('per diamond destroyed')], [inactive('None')]];
    },
  },
  {
    id: 'counterfeit_goods',
    name: 'Counterfeit Goods',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    description: 'Allows items/trail guides/supplies/frontier encounter cards to appear multiple times in the shop and packs',
    effectType: 'ALLOW_DUPLICATES',
    effectParams: {},
    hintDisplay: () => [[active('Duplicates allowed')]],
  },
  {
    id: 'rainbow_trail',
    name: 'Rainbow Trail',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    description: 'x2 if 2 different enhanced dice score, x3 if 3, x4 if 4, x5 if 5 different',
    effectType: 'RAINBOW_TRAIL_XMULT',
    effectParams: {},
    hintDisplay: (game) => {
      if (game && game.state.selectedForScore?.length > 0) {
        const types = new Set(game.state.selectedForScore.filter((d) => d.enhancement !== null).map((d) => d.enhancement));
        if (types.size >= 2) return [[mult(`x${types.size}`), active(`${types.size} types`)]];
      }
      return [[mult('x1')], [condition('per enhancement')]];
    },
  },
  {
    id: 'loaded_dice',
    name: 'Loaded Dice',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'uncommon',
    description: 'Doubles all listed probabilities',
    effectType: 'LOADED_DICE',
    effectParams: {},
    hintDisplay: () => [[odds('x2'), text('all listed odds')]],
  },
  {
    id: 'mirror_lake',
    name: 'Mirror Lake',
    cardTemplate: 'white-text-black-outline',
    cost: 10,
    rarity: 'rare',
    description: 'Copies the ability of the item to the right',
    effectType: 'COPY_RIGHT',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const idx = player.equipment.findIndex((e) => e.def.id === 'mirror_lake');
      if (idx >= 0) {
        const resolved = resolveCopyTarget(player.equipment, idx, player.equipment.length);
        if (resolved) return [[text('Copying')], [active(resolved.def.name)]];
        if (idx < player.equipment.length - 1) return [[inactive('Incompatible')]];
      }
      return [[inactive('Nothing to copy')]];
    },
  },
  {
    id: 'echo_chamber',
    name: 'Echo Chamber',
    cardTemplate: undefined,
    cost: 10,
    rarity: 'rare',
    description: 'Copies the ability of the leftmost item',
    effectType: 'COPY_LEFTMOST',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const idx = player.equipment.findIndex((e) => e.def.id === 'echo_chamber');
      if (idx > 0) {
        const resolved = resolveCopyTarget(player.equipment, idx, player.equipment.length);
        if (resolved) return [[text('Copying')], [active(resolved.def.name)]];
        return [[inactive('Incompatible')]];
      }
      return [[inactive('Nothing to copy')]];
    },
  },

  // ─── Phase 9 Items ───
  {
    id: 'five_mile_marker',
    name: '5 Mile Marker',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'Gains +5 miles each time a 5 pip is scored',
    effectType: 'PIP_SCORED_MILES_GAIN',
    effectParams: { pip: 5, value: 5 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'five_mile_marker');
      const m = equip?.state.miles ?? 0;
      if (m > 0) return [[miles(`+${m}`), condition('5s scored')]];
      return [[miles('+5'), condition('per 5 scored')]];
    },
  },
  {
    id: 'trail_backpack',
    name: 'Trail Backpack',
    cardTemplate: 'black-text-white-outline',
    cost: 7,
    rarity: 'uncommon',
    description: '+2 re-rolls per day, -1 dice when rolling',
    effectType: 'TRAIL_BACKPACK',
    effectParams: { rerollsBonus: 2, rollSizePenalty: 1 },
    hintDisplay: () => [[active('+2 rerolls')], [condition('-1 roll size')]],
  },
  {
    id: 'hitched_pair',
    name: 'Hitched Pair',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'x2 mult if hand contains a pair',
    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.PAIR, value: 2 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.PAIR))
        return [[mult('x2'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
      return [[mult('x2'), condition(HAND_NAMES.PAIR)]];
    },
  },
  {
    id: 'hat_trick',
    name: 'Hat Trick',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'x3 mult if hand contains a three of a kind',
    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 3 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
        return [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
      return [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)]];
    },
  },
  {
    id: 'posse_wagon',
    name: 'Posse Wagon',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'x4 mult if hand contains a four of a kind',
    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FOUR_OF_A_KIND, value: 4 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FOUR_OF_A_KIND))
        return [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)], [active('Active!')]];
      return [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)]];
    },
  },
  {
    id: 'five_finger_fillet',
    name: 'Five Finger Fillet',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'x5 mult if hand contains a five of a kind',
    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FIVE_OF_A_KIND, value: 5 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FIVE_OF_A_KIND))
        return [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)], [active('Active!')]];
      return [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)]];
    },
  },
  {
    id: 'snake_river',
    name: 'Snake River',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    description: 'x3 mult if hand contains a 5 straight',
    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 3 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
        return [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
      return [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)]];
    },
  },
  {
    id: 'express_train',
    name: 'Express Train',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    description: '+250 miles, -2 re-rolls',
    effectType: 'EXPRESS_TRAIN',
    effectParams: { miles: 250, rerollsPenalty: 2 },
    hintDisplay: () => [[miles('+250')], [condition('-2 rerolls')]],
  },
  {
    id: 'phantom_wagon',
    name: 'Phantom Wagon',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    description: 'After 2 rounds, sell this card to duplicate a random item (removes ghost aura)',
    effectType: 'PHANTOM_WAGON',
    effectParams: { roundsNeeded: 2 },
    initialState: { roundsHeld: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'phantom_wagon');
      const held = equip?.state.roundsHeld ?? 0;
      const needed = 2;
      if (held >= needed) return [[active('Ready to sell!')], [text('Duplicates random item')]];
      return [[condition(`${held}/${needed} rounds`)], [text('Sell to duplicate')]];
    },
  },
  {
    id: 'trail_almanac',
    name: 'Trail Almanac',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    description: '$1 at end of round for every type of trail guide discovered',
    effectType: 'TRAIL_ALMANAC_MONEY',
    effectParams: { value: 1 },
    hintDisplay: (_game, player) => {
      let discoveredCount = 0;
      for (const [, stats] of player.handStats) {
        if (stats.level > 1) discoveredCount++;
      }
      return [[money(`+$${discoveredCount}`), condition('trail guides')]];
    },
  },
  {
    id: 'blessed_herd',
    name: 'Blessed Herd',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    description: 'x3 mult if you have at least 16 enhanced dice in collection',
    effectType: 'ENHANCED_DICE_COUNT_XMULT',
    effectParams: { threshold: 16, value: 3 },
    hintDisplay: (_game, player) => {
      const enhCount = player.dice.filter((d) => d.enhancement !== null).length;
      if (enhCount >= 16) return [[mult('x3')], [active(`${enhCount} enhanced`)]];
      return [[mult('x3'), condition(`${enhCount}/16 enhanced`)]];
    },
  },
  {
    id: 'supply_drop',
    name: 'Supply Drop',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    description: 'Create a random supply card at start of round',
    effectType: 'ROUND_START_SUPPLY',
    effectParams: {},
    hintDisplay: () => [[active('Supply at round start')]],
  },
  {
    id: 'explorers_guild',
    name: "Explorer's Guild",
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    description: 'All trail guides and trail guide packs are free in the shop',
    effectType: 'EXPLORER_GUILD',
    effectParams: {},
    hintDisplay: () => [[active('Trail guides free')]],
  },
  {
    id: 'graverobber',
    name: 'Graverobber',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',
    description: 'Gains x0.1 mult per scored enhanced dice, removes dice enhancement',
    effectType: 'GRAVEROBBER_XMULT',
    effectParams: { value: 0.1 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'graverobber');
      const xm = equip?.state.xMult ?? 1;
      if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
      return [[mult('x0.1'), condition('per enhanced scored')]];
    },
  },
  {
    id: 'pack_saddle',
    name: 'Pack Saddle',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    description: '+1 hand size',
    effectType: 'PACK_SADDLE',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('+1 hand size')]],
  },
  {
    id: 'coffee',
    name: 'Coffee',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    description: '+2 hand size, -1 day per round',
    effectType: 'COFFEE',
    effectParams: { handSizeBonus: 2, daysPenalty: 1 },
    hintDisplay: () => [[active('+2 hand size')], [condition('-1 day')]],
  },
  {
    id: 'flour_sack',
    name: 'Flour Sack',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    description:
      '+5 hand size, reduces by 1 each round. Hank Caldwell (Farmer) keeps the full +5 with no decay.',
    effectType: 'FLOUR_SACK',
    effectParams: { decayPerRound: 1, professionOverrides: { farmer: { decayPerRound: 0 } } },
    initialState: { handSizeBonus: 5 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'flour_sack');
      const bonus = equip?.state.handSizeBonus ?? 5;
      const decay = resolveEffectParam<number>(
        equip?.def.effectParams ?? { decayPerRound: 1 },
        'decayPerRound',
        player.profession?.id,
      );
      if (bonus > 0) {
        if (decay === 0) return [[active(`+${bonus} hand size`), condition('no decay')]];
        return [[active(`+${bonus} hand size`), condition(`-${decay}/round`)]];
      }
      return [[inactive('Empty')]];
    },
  },

  // ─── Phase 10 Items ───
  {
    id: 'oil_baron',
    name: 'Oil Baron',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    description: '+2 mult for every $5 you have',
    effectType: 'MULT_PER_MONEY_CHUNK',
    effectParams: { chunk: 5, value: 2 },
    hintDisplay: (_game, player) => {
      const multGain = Math.floor(player.economy.balance / 5) * 2;
      if (multGain > 0) return [[mult(`+${multGain}`), condition('per $5 held')]];
      return [[mult('+2'), condition('per $5 held')]];
    },
  },
  {
    id: 'trailblazer',
    name: 'Trailblazer',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    description: 'Earns x0.2 mult per consecutive hand played without playing your most played hand',
    effectType: 'TRAILBLAZER_XMULT',
    effectParams: { value: 0.2 },
    initialState: { streak: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'trailblazer');
      const streak = equip?.state.streak ?? 0;
      if (streak > 0) {
        const xm = 1 + streak * 0.2;
        return [[mult(`x${xm.toFixed(1)}`), condition(`${streak} hands`)], [active('Active!')]];
      }
      return [[mult('x0.2'), condition('per hand off-meta')], [inactive('None')]];
    },
  },
  {
    id: 'golden_spike',
    name: 'Golden Spike',
    cardTemplate: 'black-text',
    cost: 7,
    rarity: 'uncommon',
    description: 'All scored dice have a 1 in 4 chance to turn into a gold dice',
    effectType: 'SCORED_GOLD_CHANCE',
    effectParams: { chance: [1, 4] },
    hintDisplay: (_game, player) => [[oddsDisplay([1, 4], player), condition('per scored die')]],
  },
  {
    id: 'sheriffs_badge',
    name: "Sheriff's Badge",
    cardTemplate: 'black-text',
    cost: 5,
    rarity: 'uncommon',
    description: 'Sell this item to disable the current boss effect',
    effectType: 'SELL_DISABLE_BOSS',
    effectParams: {},
    hintDisplay: () => [[text('Sell to'), condition('disable boss')]],
  },
  {
    id: 'bounty_contract',
    name: 'Bounty Contract',
    cardTemplate: 'black-text',
    cost: 6,
    rarity: 'uncommon',
    description: 'Sell this item to gain a free Twin Wagon tag',
    effectType: 'SELL_GRANT_TAG',
    effectParams: { tagId: 'tag_twin_wagon' },
    hintDisplay: () => [[text('Sell to'), condition('Twin Wagon')]],
  },
  {
    id: 'double_barrel',
    name: 'Double Barrel',
    cardTemplate: 'black-text',
    cost: 5,
    rarity: 'common',
    description: 'First played 2 pip dice gives x2 mult when scored',
    effectType: 'FIRST_PIP_XMULT',
    effectParams: { pip: 2, value: 2 },
    hintDisplay: () => [[mult('x2'), condition('first 2 scored')]],
  },
  {
    id: 'raffle_ticket',
    name: 'Raffle Ticket',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    description: 'At the end of each round add $1 of sell value to each piece of equipment',
    effectType: 'END_ROUND_SELL_VALUE_ALL',
    effectParams: { value: 1 },
    hintDisplay: () => [[money('+$1'), condition('sell value each item')]],
  },
  {
    id: 'ghost_town',
    name: 'Ghost Town',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    description: '+10 mult for each dice below the collections starting size',
    effectType: 'MULT_PER_MISSING_DICE',
    effectParams: { value: 10 },
    hintDisplay: (_game, player) => {
      const missing = Math.max(0, player.startingDiceCount - player.dice.length);
      if (missing > 0) return [[mult(`+${missing * 10}`), condition(`${missing} dice lost`)]];
      return [[mult('+10'), condition('per missing die')], [inactive('Full herd')]];
    },
  },
  {
    id: 'savings_account',
    name: 'Savings Account',
    cardTemplate: 'black-text-white-outline',
    cost: 5,
    rarity: 'uncommon',
    description:
      'Earn an extra $1 of interest for every $5 you have at end of round. Henry Pritchard (Accountant) earns an additional $1 for every $5.',
    effectType: 'SAVINGS_ACCOUNT_INTEREST',
    effectParams: { perChunk: 5, value: 1, accountantBonus: 1 },
    hintDisplay: (_game, player) => {
      const perChunk = Math.floor(Math.min(player.economy.balance, player.interestCap) / 5);
      const isAccountant = player.profession?.id === 'accountant';
      const perDollar = isAccountant ? 2 : 1;
      if (perChunk > 0) return [[money(`+$${perChunk * perDollar}`), condition('extra interest')]];
      return [[money('+$1'), condition('per $5 held')]];
    },
  },
  {
    id: 'six_feet_under',
    name: 'Six Feet Under',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'common',
    description: 'Item gains 66 miles for every dice that is destroyed',
    effectType: 'DICE_DESTROYED_MILES_GAIN',
    effectParams: { value: 66 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'six_feet_under');
      const m = equip?.state.miles ?? 0;
      if (m > 0) return [[miles(`+${m}`), condition('dice destroyed')]];
      return [[miles('+66'), condition('per die destroyed')]];
    },
  },
  {
    id: 'eight_second_ride',
    name: 'Eight Second Ride',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    description: 'Each consecutive scored 8 gains +0.5 xMult over the previous (x1, x1.5, x2, x2.5, x3...)',
    effectType: 'CONSECUTIVE_PIP_XMULT',
    effectParams: { pip: 8, increment: 0.5 },
    hintDisplay: () => [[mult('x1→x3+'), condition('consecutive 8s')]],
  },
  {
    id: 'stacked_deck',
    name: 'Stacked Deck',
    cardTemplate: 'white-text-black-outline',
    cost: 10,
    rarity: 'rare',
    description: 'Loaded dice are considered all pip values for equipment effects',
    effectType: 'STACKED_DECK',
    effectParams: {},
    hintDisplay: () => [[active('Loaded = all pips')]],
  },
];

export default items;
