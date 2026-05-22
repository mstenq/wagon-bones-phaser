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

export interface ItemDisplayResult {
  hint: HintSegment[][];
  tooltip: HintSegment[][];
}

import type { GameState } from '../game/GameState';
import type { PlayerState } from '../game/PlayerState';
import { HandType } from '../game/types';
import { getLoadedDiceMultiplier, resolveCopyTarget } from '../game/Constants';
import { resolveEffectParam, resolveChance } from '../game/effectParams';
import {
  unlockAnyEnhanced,
  unlockByEnhancement,
  unlockNitro,
  unlockTwoEnhancedTypes,
  type EquipmentUnlockCondition,
} from '../game/equipmentUnlock';

/** Raw item definition shape (matches the old JSON + hintDisplay) */
export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  effectType: string;
  cardTemplate?: CardTemplate;
  effectParams: Record<string, unknown>;
  initialState?: Record<string, number>;
  display: (game: GameState | null, player: PlayerState) => ItemDisplayResult;
  unlockCondition?: EquipmentUnlockCondition;
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

const findOwnedEquip = (player: PlayerState, id: string) => player.equipment.find((e) => e.def.id === id);

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

    effectType: 'ADD_MULT',
    effectParams: { value: 4 },
    display: (game, player) => ({
      hint: (() => [[mult('+4')]])(game, player),
      tooltip: [[text('+4 mult')]],
    }),

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

    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.PAIR, value: 8 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.PAIR))
          return [[mult('+8'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
        return [[mult('+8'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains a pair +8 mult')]],
    }),

  },
  {
    id: 'town_choir',
    name: 'Town Choir',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 12 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
          return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
        return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains three of a kind +12 mult')]],
    }),

  },
  {
    id: 'deputy_brothers',
    name: 'Deputy Brothers',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.TWO_PAIR, value: 10 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.TWO_PAIR))
          return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]];
        return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains two pair +10 mult')]],
    }),

  },
  {
    id: 'work_boots',
    name: 'Work Boots',
    cardTemplate: "white-text",
    cost: 3,
    rarity: 'common',

    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.PAIR, value: 50 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.PAIR))
          return [[miles('+50'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
        return [[miles('+50'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains pair +50 miles')]],
    }),

  },
  {
    id: 'buffalo_stampede',
    name: 'Buffalo Stampede',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 100 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
          return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
        return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains three of a kind +100 miles')]],
    }),

  },
  {
    id: 'trail_rations',
    name: 'Trail Rations',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',

    effectType: 'MILES_PER_UNUSED_REROLL',
    effectParams: { value: 30 },
    display: (game, player) => ({
      hint: ((game) => {
        const rerolls = game?.state.rerollsRemaining ?? 0;
        const total = rerolls * 30;
        if (total > 0) return [[miles(`+${total}`), text('mi')]];
        return [[inactive(`+0`), text(' mi')]];
      })(game, player),
      tooltip: [[text('+30 miles per unused re-roll')]],
    }),

  },
  {
    id: 'deadeye',
    name: 'Deadeye',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'common',

    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'SCORED_DICE_LTE', threshold: 3, value: 20 },
    display: (game, player) => ({
      hint: ((game) => {
        const diceCount = game?.state.rolledDice?.length ?? 0;
        if (diceCount > 0 && diceCount <= 3) return [[mult('+20'), condition('3 or less dice')], [active('Active!')]];
        return [[mult('+20'), condition('3 or less dice')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('+20 mult if 3 or fewer dice are scored')]],
    }),

  },
  {
    id: 'stubborn_mule',
    name: 'Stubborn Mule',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'common',

    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'NO_REROLLS', value: 15 },
    display: (game, player) => ({
      hint: ((game) => {
        if (!game) return [[mult('+15'), condition('No rerolls')]];
        if (game.state.rerollsRemaining === 0)
          return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [active('Active!')]];
        return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('+15 mult when 0 re-rolls remaining')]],
    }),

  },
  {
    id: 'toolbelt',
    name: 'Toolbelt',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'MULT_PER_EQUIPMENT',
    effectParams: { value: 3 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const total = player.equipment.length * 3;
        return [[mult(`+${total}`)]];
      })(game, player),
      tooltip: [[text('+3 mult for each piece of equipment')]],
    }),

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

    effectType: 'PARITY_MULT',
    effectParams: { parity: 'even', value: 4 },
    display: (game, player) => ({
      hint: (() => [[mult('+4'), condition('per even')]])(game, player),
      tooltip: [[text('+4 mult when an even value is scored')]],
    }),

  },
  {
    id: 'odd_fellow',
    name: 'Odd Fellow',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'PARITY_MILES',
    effectParams: { parity: 'odd', value: 31 },
    display: (game, player) => ({
      hint: (() => [[miles('+31'), condition('per odd')]])(game, player),
      tooltip: [[text('+31 miles when an odd value is scored')]],
    }),

  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',

    effectType: 'ADD_MULT_RISKY',
    effectParams: { value: 15, destroyChance: [1, 6] },
    display: (game, player) => ({
      hint: ((_game, player) => [[mult('+15'), oddsDisplay([1, 6], player)]])(game, player),
      tooltip: [[text('+15 mult. 1 in 6 chance to be destroyed at end of round.')]],
    }),

  },
  {
    id: 'extra_saddlebag',
    name: 'Extra Saddlebag',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'deprecated',

    effectType: 'NONE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[inactive('Deprecated')]])(game, player),
      tooltip: [[text('Deprecated: removed with auto-draw round flow.')]],
    }),

  },
  {
    id: 'spare_holster',
    name: 'Spare Holster',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'MODIFY_REROLLS',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[active('+1 reroll')]])(game, player),
      tooltip: [[text('+1 re-roll per leg')]],
    }),

  },
  {
    id: 'payday',
    name: 'Payday',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'common',

    effectType: 'END_ROUND_MONEY',
    effectParams: { value: 4, professionOverrides: { outlaw: { value: 12 } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const amount = resolveEffectParam<number>(
          { value: 4, professionOverrides: { outlaw: { value: 12 } } },
          'value',
          player.profession?.id,
        );
        return [[money(`+$${amount}`)]];
      })(game, player),
      tooltip: [[text('Earn $4 at end of round. Jesse Rawlins (Outlaw) earns $12.')]],
    }),

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

    effectType: 'HELD_LOWEST_MULT',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
        if (held.length > 0) {
          const lowest = Math.min(...held.map((d) => d.value));
          return [[mult(`+${lowest * 2}`), condition('lowest held')]];
        }
        return [[mult('+?'), condition('lowest held')]];
      })(game, player),
      tooltip: [[text('Adds double the rank of lowest held-in-hand die to mult')]],
    }),

  },
  {
    id: 'ace_in_the_hole',
    name: 'Ace in the Hole',
    cost: 8,
    rarity: 'rare',

    effectType: 'HELD_PIP_XMULT',
    effectParams: { pip: 1, value: 1.5 },
    display: (game, player) => ({
      hint: ((game) => {
        const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
        const count = held.filter((d) => d.value === 1).length;
        if (count > 0) return [[mult(`x${1.5 ** count}`), condition(`${count}x 1s held`)]];
        return [[mult('x1.5'), condition('per 1 held')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('Each 1 held in hand gives x1.5 mult')]],
    }),

  },
  {
    id: 'prospectors_pouch',
    name: "Prospector's Pouch",
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'common',

    effectType: 'HELD_ENHANCED_MONEY',
    effectParams: { chance: [1, 2], value: 1 },
    display: (game, player) => ({
      hint: ((game, player) => {
        const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
        const enhanced = held.filter((d) => d.enhancement !== null).length;
        if (enhanced > 0) return [[money(`$1`), oddsDisplay([1, 2], player), condition(`${enhanced} enhanced`)]];
        return [[money('$1'), oddsDisplay([1, 2], player), condition('enhanced held')]];
      })(game, player),
      tooltip: [[text('Each enhanced die held in hand has a 1 in 2 chance to give $1')]],
    }),

    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'eleventh_crossing',
    name: 'The Eleventh Crossing',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',

    effectType: 'HELD_PIP_MULT',
    effectParams: { pip: 11, value: 11 },
    display: (game, player) => ({
      hint: ((game) => {
        const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
        const count = held.filter((d) => d.value === 11).length;
        if (count > 0) return [[mult(`+${count * 11}`), condition(`${count}x 11s held`)]];
        return [[mult('+11'), condition('per 11 held')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('Each 11 held in hand gives +11 mult')]],
    }),

  },

  // ─── Phase 2 Items ───
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',
    unlockCondition: unlockByEnhancement('lucky'),

    effectType: 'LUCKY_TRIGGER_XMULT',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'rabbits_foot');
        const xm = equip?.state.xMult ?? 1;
        return [[mult(`x${xm.toFixed(2)}`)]];
      })(game, player),
      tooltip: [[text('Item gains x0.25 for every lucky dice trigger')]],
    }),

  },
  {
    id: 'collectors_case',
    name: "Collector's Case",
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',

    effectType: 'UNCOMMON_EQUIP_XMULT',
    effectParams: {},
    display: (game, player) => ({
      hint: ((_game, player) => {
        const count = player.equipment.filter((e) => e.def.rarity === 'uncommon').length;
        if (count > 0) return [[mult(`x${(1.5 ** count).toFixed(2)}`), condition(`${count} uncommon`)]];
        return [[mult('x1.5'), condition('per uncommon')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('Uncommon equipment each give x1.5 mult')]],
    }),

  },
  {
    id: 'money_wagon',
    name: 'Money Wagon',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'MILES_PER_DOLLAR',
    effectParams: { value: 2 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const total = player.economy.balance * 2;
        return [[miles(`+${total}`), text('mi')]];
      })(game, player),
      tooltip: [[text('+2 miles for every $1 you have')]],
    }),

  },
  {
    id: 'bargain_bin',
    name: 'Bargain Bin',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'SHOP_REROLL_MULT_GAIN',
    effectParams: { value: 2 },
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'bargain_bin');
        const m = equip?.state.mult ?? 0;
        return [[mult(`+${m}`)]];
      })(game, player),
      tooltip: [[text('Item gains +2 mult per reroll in the shop')]],
    }),

  },
  {
    id: 'fading_memory',
    name: 'Fading Memory',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'common',

    effectType: 'DECAYING_MULT',
    effectParams: { decayPerRound: 4, maxRounds: 5 },
    initialState: { mult: 20, roundsPlayed: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'fading_memory');
        const m = equip?.state.mult ?? 20;
        const rounds = equip?.state.roundsPlayed ?? 0;
        return [[mult(`+${m}`), condition(`${5 - rounds} rounds left`)]];
      })(game, player),
      tooltip: [[text('+20 mult, -4 mult per round played, removed after 5 rounds')]],
    }),

  },
  {
    id: 'card_counter',
    name: 'Card Counter',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'HAND_MULT_GAIN',
    effectParams: {
      handType: HandType.TWO_PAIR,
      value: 2,
      professionOverrides: { con_artist: { value: 4 } },
    },
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'card_counter');
        const m = equip?.state.mult ?? 0;
        return [[mult(`+${m}`), condition(HAND_NAMES.TWO_PAIR)]];
      })(game, player),
      tooltip: [[text('Item gains +2 mult if played hand contains 2 pair. Victor Hale (Con Artist) gains +4 mult if played hand contains 2 pair.')]],
    }),

  },
  {
    id: 'lucky_number',
    name: 'Lucky Number',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',

    effectType: 'LUCKY_NUMBER_PIP_XMULT',
    effectParams: { value: 1.5, professionOverrides: { gambler: { value: 2 } } },
    initialState: { pip: 7 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'lucky_number');
      const pip = equip?.state.pip ?? 7;
      const xVal = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 1.5 }, 'value', player.profession?.id);
      const hint = [[mult(`x${xVal}`), condition(`per ${pip}`)]];
      return {
        hint,
        tooltip: [[text('Each played '), mult(String(pip)), text(` gives x${xVal} mult when scored.`)]],
      };
    },

  },
  {
    id: 'worn_deck',
    name: 'Worn Deck',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'DECAYING_XMULT',
    effectParams: { decayPerDie: 0.01 },
    initialState: { xMult: 2 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'worn_deck');
        const xm = equip?.state.xMult ?? 2;
        return [[mult(`x${xm.toFixed(2)}`)]];
      })(game, player),
      tooltip: [[text('x2 Mult. Loses x0.01 mult per dice re-rolled')]],
    }),

  },
  {
    id: 'war_drums',
    name: 'War Drums',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'SCORED_RETRIGGER_TIMED',
    effectParams: {},
    initialState: { daysRemaining: 10 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'war_drums');
        const days = equip?.state.daysRemaining ?? 0;
        if (days > 0) return [[active(`${days} days left`)]];
        return [[inactive('Expired')]];
      })(game, player),
      tooltip: [[text('Retrigger all dice played for the next 10 days of travel')]],
    }),

  },
  // {
  //   id: 'bone_collector',
  //   name: 'Bone Collector',
  //   cost: 6,
  //   rarity: 'uncommon',
  //   cardTemplate: 'white-text',
  //   description: 'Gains +3 miles per each enhanced dice that is spent',
  //   effectType: 'ENHANCED_SPENT_MILES_GAIN',
  //   effectParams: { value: 3 },
  //   initialState: { miles: 0 },
  //   hintDisplay: (_game, player) => {
  //     const equip = player.equipment.find((e) => e.def.id === 'bone_collector');
  //     const m = equip?.state.miles ?? 0;
  //     return [[miles(`+${m}`)]];
  //   },
  //   unlockCondition: unlockByEnhancement('bone'),
  // },
  {
    id: 'snake_oil_ledger',
    name: 'Snake Oil Ledger',
    cardTemplate: "white-text",
    cost: 9,
    rarity: 'rare',

    effectType: 'SELL_XMULT_GAIN',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'snake_oil_ledger');
        const xm = equip?.state.xMult ?? 1;
        return [[mult(`x${xm.toFixed(2)}`)]];
      })(game, player),
      tooltip: [[text('Item gains x0.25 mult for each card sold. Resets when boss is defeated.')]],
    }),

  },
  {
    id: 'gold_tooth',
    name: 'Gold Tooth',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'GOLD_DICE_MONEY',
    effectParams: { value: 4 },
    display: (game, player) => ({
      hint: (() => [[money('+$4'), condition('per gold')]])(game, player),
      tooltip: [[text('Played gold dice earn $4')]],
    }),

    unlockCondition: unlockByEnhancement('gold'),
  },
  {
    id: 'guardian_totem',
    name: 'Guardian Totem',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'PREVENT_DEATH',
    effectParams: { threshold: 0.25 },
    display: (game, player) => ({
      hint: (() => [[active('Protected')]])(game, player),
      tooltip: [[text('Prevents death if miles travelled is at least 25% of required distance. Card is destroyed if used.')]],
    }),

  },
  {
    id: 'high_noon',
    name: 'High Noon',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'FINAL_DAY_XMULT',
    effectParams: { value: 3 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.day >= game.config.maxDays) return [[mult('x3')], [active('Active!')]];
        return [[mult('x3'), condition('final day')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('x3 mult on final day of round')]],
    }),

  },
  {
    id: 'desperado',
    name: 'Desperado',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'SELL_VALUE_AS_MULT',
    effectParams: {},
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'desperado');
        let total = 0;
        for (const e of player.equipment) {
          if (e !== equip) total += e.sellValue;
        }
        return [[mult(`+${total}`)]];
      })(game, player),
      tooltip: [[text('Add the sell value of all other owned equipment as mult')]],
    }),

  },
  {
    id: 'stagecoach',
    name: 'Stagecoach',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'deprecated',

    effectType: 'NONE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[inactive('Deprecated')]])(game, player),
      tooltip: [[text('Deprecated: removed with auto-draw round flow.')]],
    }),

  },
  {
    id: 'mystery_crate',
    name: 'Mystery Crate',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_ADD_DICE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('+1 die'), condition('round start')]])(game, player),
      tooltip: [[text('Add a dice at the start of each round with a random sticker')]],
    }),

  },
  {
    id: 'trail_repair_kit',
    name: 'Trail Repair Kit',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'STATEFUL_XMULT',
    effectParams: {},
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const inst = player.equipment.find((e) => e.def.id === 'trail_repair_kit');
        const xm = inst?.state.xMult ?? 1;
        return [
          [active('Negates'), text(' trail penalties')],
          xm > 1 ? [text('x'), mult(xm.toFixed(2))] : [inactive('x1'), text(' until first save')],
        ];
      })(game, player),
      tooltip: [[text('Negates negative trail event penalties. Gains x0.75 mult each time it prevents a penalty.')]],
    }),

  },
  {
    id: 'scouts_spyglass',
    name: "Scout's Spyglass",
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'STATEFUL_ADD_MILES',
    effectParams: {},
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const inst = player.equipment.find((e) => e.def.id === 'scouts_spyglass');
        const stored = inst?.state.miles ?? 0;
        return [
          [text('Preview'), condition('trail events')],
          stored > 0 ? [miles(`+${stored}`), text(' stored miles')] : [miles('+50'), text(' if avoided')],
        ];
      })(game, player),
      tooltip: [[text('Preview the next trail event category. Avoid it for +50 miles (stored on this item) or face the event.')]],
    }),

  },
  {
    id: 'saint_elmos_shield',
    name: "Saint Elmo's Shield",
    cardTemplate: "white-text-black-outline",
    cost: 20,
    rarity: 'legendary',

    effectType: 'NONE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Negates'), text(' boss & trail penalties')]])(game, player),
      tooltip: [[text('Disables all boss effects and negative effects from trail events are prevented. Divine favor intervenes.')]],
    }),

  },
  {
    id: 'book_of_the_dead',
    name: 'Book of the Dead',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',

    effectType: 'ENHANCED_DESTROYED_XMULT',
    effectParams: { value: 1 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'book_of_the_dead');
        const xm = equip?.state.xMult ?? 1;
        if (xm > 1) return [[mult(`x${xm}`)]];
        return [[mult('x1'), condition('per enhanced destroyed')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('Gains x1 mult for each destroyed enhanced dice')]],
    }),

  },
  {
    id: 'devils_hand',
    name: "The Devil's Hand",
    cardTemplate: 'white-text-noborder',
    cost: 20,
    rarity: 'legendary',

    effectType: 'PIP_XMULT',
    effectParams: { pip: 6, value: 2 },
    display: (game, player) => ({
      hint: (() => [[mult('x2'), condition('per 6 scored')]])(game, player),
      tooltip: [[text("Played 6's give x2 mult when scored")]],
    }),

  },
  {
    id: 'twenty_third_psalm',
    name: 'The 23rd Psalm',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',

    effectType: 'REROLL_COUNT_XMULT',
    effectParams: { threshold: 23, value: 1 },
    initialState: { xMult: 1, rerollsTotal: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'twenty_third_psalm');
        const xm = equip?.state.xMult ?? 1;
        const total = equip?.state.rerollsTotal ?? 0;
        const remaining = 23 - (total % 23);
        if (xm > 1) return [[mult(`x${xm}`)], [condition(`${remaining} to next`)]];
        return [[mult('x1'), condition('per 23 rerolled')], [text(`${total % 23}/23`)]];
      })(game, player),
      tooltip: [[text('Item gains x1 mult for every 23 dice re-rolled')]],
    }),

  },
  {
    id: 'ghost_lantern',
    name: 'Ghost Lantern',
    cardTemplate: 'white-text-noborder',
    cost: 20,
    rarity: 'legendary',

    effectType: 'SHOP_END_GHOST_CONSUMABLE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Ghost copy'), condition('end of shop')]])(game, player),
      tooltip: [[text('Creates a ghost copy of a random consumable card in your possession at the end of the shop phase')]],
    }),

  },
  {
    id: 'seventh_trumpet',
    name: 'The Seventh Trumpet',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',

    effectType: 'ALL_RETRIGGER',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[text('Retrigger'), condition('all played & held')]])(game, player),
      tooltip: [[text('Retriggers all played dice, and all held in hand effects')]],
    }),

  },

  // ─── Phase 3 Items ───
  {
    id: 'twin_colts',
    name: 'Twin Colts',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.TWO_PAIR, value: 80 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.TWO_PAIR))
          return [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]];
        return [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains two pair +80 miles')]],
    }),

  },
  {
    id: 'rail_line',
    name: 'Rail Line',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 80 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT))
          return [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]];
        return [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains a 4 straight +80 miles')]],
    }),

  },
  {
    id: 'long_haul',
    name: 'Long Haul',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 100 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
          return [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
        return [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains a 5 straight +100 miles')]],
    }),

  },
  {
    id: 'silver_bullets',
    name: 'Silver Bullets',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'HELD_RETRIGGER',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[text('Retrigger'), condition('held dice')]])(game, player),
      tooltip: [[text('Retrigger all dice held in hand')]],
    }),

  },
  {
    id: 'funeral_pyre',
    name: 'Funeral Pyre',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_DESTROY_RIGHT',
    effectParams: {},
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'funeral_pyre');
        const m = equip?.state.mult ?? 0;
        if (m > 0) return [[mult(`+${m}`)]];
        return [[text('Destroys right'), condition('round start')]];
      })(game, player),
      tooltip: [[text('When starting round, destroy equipment to right and add double its sell value as mult')]],
    }),

  },
  {
    id: 'quarry_stone',
    name: 'Quarry Stone',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_ADD_STONE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('+1 stone'), condition('round start')]])(game, player),
      tooltip: [[text('Add one stone die to collection when starting round')]],
    }),

  },
  {
    id: 'six_shooter',
    name: 'Six Shooter',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'EVERY_NTH_HAND_XMULT',
    effectParams: { n: 6, value: 4 },
    initialState: { handsPlayed: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'six_shooter');
        const hands = equip?.state.handsPlayed ?? 0;
        const remaining = 6 - (hands % 6);
        if (remaining === 6 && hands > 0) return [[mult('x4')], [active('Active!')]];
        return [[mult('x4'), condition(`in ${remaining}`)]];
      })(game, player),
      tooltip: [[text('x4 mult every 6th hand played')]],
    }),

  },
  {
    id: 'wild_card',
    name: 'Wild Card',
    cost: 4,
    rarity: 'common',

    effectType: 'RANDOM_MULT',
    effectParams: { min: 0, max: 23 },
    display: (game, player) => ({
      hint: (() => [[mult('+0-23'), odds('random')]])(game, player),
      tooltip: [[text('+0 to +23 mult (random)')]],
    }),

  },
  {
    id: 'bank_note',
    name: 'Bank Note',
    cardTemplate: 'white-text-black-outline',
    cost: 1,
    rarity: 'common',

    effectType: 'BANK_NOTE',
    effectParams: { maxDebt: 20 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const debt = player.debtLimit;
        if (player.economy.balance < 0) {
          return [[money(`$${player.economy.balance}`), condition('in debt')]];
        }
        return [[money(`-$${debt} max`), condition('debt limit')]];
      })(game, player),
      tooltip: [[text('Go up to $20 in debt. When Charles Whitlock (Banker) sells this item, his debt is wiped clean.')]],
    }),

  },
  {
    id: 'snake_eyes',
    name: 'Snake Eyes',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'PIP_SUPPLY_CHANCE',
    effectParams: { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const p = { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } };
        return [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('supply per 1')]];
      })(game, player),
      tooltip: [[text('1 in 4 chance to get a supply card when a 1 is scored. Abigail Turner (Merchant) has a 1 in 2 chance.')]],
    }),

  },
  {
    id: 'coupon_book',
    name: 'Coupon Book',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'FREE_SHOP_REROLL',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[active('1 free reroll'), condition('per shop')]])(game, player),
      tooltip: [[text('1 free reroll per shop visit')]],
    }),

  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    cardTemplate: "white-text",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'SCORED_RETRIGGER_FINAL_DAY',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.day >= game.config.maxDays) return [[text('Retrigger all'), active('Final day!')]];
        return [[text('Retrigger all'), condition('final day')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('Retrigger all played dice on final day of round')]],
    }),

  },
  {
    id: 'lucky_find',
    name: 'Lucky Find',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',

    effectType: 'SOLO_FIRST_DAY_ENHANCE',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.day === 1 && game.state.selectedForScore?.length === 1)
          return [[active('Enhancing!')]];
        return [[condition('Solo first day'), inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If one die is scored alone on first day, add a random enhancement')]],
    }),

  },
  {
    id: 'iron_furnace',
    name: 'Iron Furnace',
    cardTemplate: "white-text",
    cost: 7,
    rarity: 'uncommon',

    effectType: 'ENHANCEMENT_COUNT_XMULT',
    effectParams: { enhancement: 'steel', value: 0.2 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const count = player.dice.filter((d) => d.enhancement === 'steel').length;
        const xm = 1 + count * 0.2;
        if (count > 0) return [[mult(`x${xm.toFixed(1)}`), condition(`${count} steel`)]];
        return [[mult('x0.2'), condition('per steel')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('x0.2 mult for each steel die in collection')]],
    }),

    unlockCondition: unlockByEnhancement('steel'),
  },
  {
    id: 'rainy_day_fund',
    name: 'Rainy Day Fund',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'END_ROUND_MONEY_PER_REROLL',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[money('$1'), condition('per unused reroll')]])(game, player),
      tooltip: [[text('$1 per unused re-roll at end of round')]],
    }),

  },
  {
    id: 'one_eyed_jack',
    name: 'One-Eyed Jack',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'PIP_RETRIGGER',
    effectParams: { pip: 1 },
    display: (game, player) => ({
      hint: (() => [[text('Retrigger'), condition('each 1')]])(game, player),
      tooltip: [[text('Retrigger each played 1')]],
    }),

  },
  {
    id: 'gold_pan',
    name: 'Gold Pan',
    cardTemplate: "white-text-black-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'ENHANCED_SCORE_MONEY',
    effectParams: { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const p = { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } };
        const chance = resolveChance(p, player.profession?.id);
        if (chance[0] >= chance[1]) return [[money('$2'), oddsDisplay([1, 1], player), condition('enhanced scored')]];
        return [[money('$2'), oddsDisplay(chance, player), condition('enhanced scored')]];
      })(game, player),
      tooltip: [[text('1 in 2 chance to give $2 when an enhanced die scores. Davis Holler (Prospector) has a guaranteed chance.')]],
    }),

    unlockCondition: unlockAnyEnhanced,
  },

  // ─── Phase 4 Items ───
  {
    id: 'trail_journal',
    name: 'Trail Journal',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'HAND_TIMES_PLAYED_MULT',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game, player) => {
        const handType = game?.state.currentHandType;
        if (handType) {
          const stats = player.getHandStats(handType);
          return [[mult(`+${stats.timesPlayed}`), condition(HAND_NAMES[handType])]];
        }
        return [[mult('+?'), condition('times played')]];
      })(game, player),
      tooltip: [[text('Adds the number of times the hand has been played this trip as mult')]],
    }),

  },
  {
    id: 'marked',
    name: 'Marked',
    cardTemplate: "marked",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'MARKED_NO_SIX_MULT',
    effectParams: { multPerHand: 1, professionOverrides: { demon_hunter: { multPerHand: 2 } } },
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'marked');
        const m = equip?.state.mult ?? 0;
        return [[mult(`+${m}`), condition('no 6s')]];
      })(game, player),
      tooltip: [[text('+1 mult per hand played without scoring a 6. Scoring a 6 resets mult to 0. Isaac Granger (Demon Hunter) gets +2 per hand.')]],
    }),

  },
  {
    id: 'surveyors_transit',
    name: "Surveyor's Transit",
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'HAND_UPGRADE_CHANCE',
    effectParams: { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const p = { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } };
        return [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('upgrade hand')]];
      })(game, player),
      tooltip: [[text("1 in 4 chance to upgrade trail knowledge of hand type played. 1 in 2 chance if used by Elias Mercer (Surveyor).")]],
    }),

  },
  {
    id: 'guide_lantern',
    name: 'Guide Lantern',
    cardTemplate: "white-text",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'TRAIL_GUIDE_XMULT',
    effectParams: { value: 0.1, professionOverrides: { scout: { value: 0.2 } } },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'guide_lantern');
        const xm = equip?.state.xMult ?? 1;
        const gain = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 0.1 }, 'value', player.profession?.id);
        if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
        return [[mult(`x${gain}`), condition('per guide used')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('Gain x0.1 mult for every trail guide used. Caleb Winters (Scout) gains x0.2 mult for every trail guide used.')]],
    }),

  },
  {
    id: 'steam_engine',
    name: 'Steam Engine',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'STATEFUL_ADD_MILES',
    effectParams: { decayPerHand: 5 },
    initialState: { miles: 100 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'steam_engine');
        const m = equip?.state.miles ?? 100;
        if (m > 0) return [[miles(`+${m}`)]];
        return [[inactive('+0 miles')]];
      })(game, player),
      tooltip: [[text('Gains +100 miles. -5 miles per hand played.')]],
    }),

  },
  {
    id: 'bloodline',
    name: 'Bloodline',
    cardTemplate: "white-text-black-outline",
    cost: 8,
    rarity: 'rare',

    effectType: 'FIRST_DAY_SOLO_COPY',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.day === 1 && game.state.selectedForScore?.length === 1)
          return [[active('Copying!')]];
        return [[condition('Solo first day')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If first day of round only scores one die, add a permanent copy to your collection')]],
    }),

  },
  {
    id: 'open_palm',
    name: 'Open Palm',
    cardTemplate: "white-text-black-outline",
    cost: 3,
    rarity: 'common',

    effectType: 'ALL_DICE_SCORE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('All dice score')]])(game, player),
      tooltip: [[text('All dice count when scoring')]],
    }),

  },
  {
    id: 'hellfire_round',
    name: 'Hellfire Round',
    cardTemplate: "hellfire",
    cost: 6,
    rarity: 'rare',

    effectType: 'FIRST_HAND_ENHANCED_SIX',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.day === 1) return [[condition('First hand'), active('Ready')]];
        return [[condition('First hand'), inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If first hand of round is an enhanced 6, destroy it and gain a Frontier Encounter card')]],
    }),

    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'cowboy_boots',
    name: 'Cowboy Boots',
    cardTemplate: "white-text-black-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'PERMANENT_DIE_MILES_GAIN',
    effectParams: { value: 5 },
    display: (game, player) => ({
      hint: (() => [[miles('+5'), condition('per die (permanent)')]])(game, player),
      tooltip: [[text('Every played die permanently gains +5 miles when scored')]],
    }),

  },
  {
    id: 'trail_tax',
    name: 'Trail Tax',
    cost: 4,
    rarity: 'common',

    effectType: 'TRAIL_TAX',
    effectParams: { multPerDay: 2, multLostPerReroll: 1 },
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'trail_tax');
        const m = equip?.state.mult ?? 0;
        return [[mult(`+${m}`)]];
      })(game, player),
      tooltip: [[text('+2 mult per day travelled, -1 mult per re-roll used')]],
    }),

  },
  {
    id: 'wanted_poster',
    name: 'Wanted Poster',
    cost: 4,
    rarity: 'common',

    effectType: 'WANTED_HAND_MONEY',
    effectParams: { value: 4, professionOverrides: { hunter: { value: 8 } } },
    initialState: { targetHand: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'wanted_poster');
      const handIdx = equip?.state.targetHand ?? 0;
      const handTypes = Object.values(HandType);
      const handType = handTypes[handIdx % handTypes.length] as HandType;
      const amount = resolveEffectParam<number>(equip?.def.effectParams ?? { value: 4 }, 'value', player.profession?.id);
      const hint = [[money(`$${amount}`), condition(HAND_NAMES[handType] ?? '?')]];
      return {
        hint,
        tooltip: [[text('Earn '), money(`$${amount}`), text(' when hand is '), condition(HAND_NAMES[handType] ?? '?')]],
      };
    },

  },

  // ─── Phase 5 Items ───
  {
    id: 'nitro',
    name: 'Nitro',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'rare',

    effectType: 'XMULT_RISKY',
    effectParams: { value: 3, destroyChance: [1, 1000] },
    display: (game, player) => ({
      hint: ((_game, player) => [[mult('x3')], [oddsDisplay([1, 1000], player), text('self-destruct')]])(game, player),
      tooltip: [[text('x3 mult. 1 in 1000 chance of being destroyed at end of round.')]],
    }),

    unlockCondition: unlockNitro,
  },
  {
    id: 'repeat_offender',
    name: 'Repeat Offender',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'REPEAT_HAND_XMULT',
    effectParams: { value: 3 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.currentHandType && game.state.handHistory.filter((h) => h === game.state.currentHandType).length > 1)
          return [[mult('x3')], [active('Repeat!')]];
        return [[mult('x3'), condition('repeat hand')]];
      })(game, player),
      tooltip: [[text('x3 mult if played hand has already been played this round')]],
    }),

  },
  {
    id: 'tight_fist',
    name: 'Tight Fist',
    cardTemplate: "black-text-white-outline-noborder",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'STATEFUL_ADD_MULT',
    effectParams: { gainOnPackSkip: 3 },
    initialState: { mult: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'tight_fist');
        const m = equip?.state.mult ?? 0;
        if (m > 0) return [[mult(`+${m}`)]];
        return [[mult('+3'), condition('per pack skipped')]];
      })(game, player),
      tooltip: [[text('Gains +3 mult when any booster pack is skipped')]],
    }),

  },
  {
    id: 'haunted_totem',
    name: 'Haunted Totem',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'uncommon',

    effectType: 'ROUND_START_XMULT_DESTROY',
    effectParams: { value: 0.5 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'haunted_totem');
        const xm = equip?.state.xMult ?? 1;
        if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
        return [[mult('x0.5'), condition('per round start')]];
      })(game, player),
      tooltip: [[text('Gains x0.5 mult when round starts (not boss rounds). Destroys one random equipment.')]],
    }),

  },
  {
    id: 'square_dance',
    name: 'Square Dance',
    cardTemplate: "black-text-white-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'EXACT_DICE_COUNT_MILES',
    effectParams: { count: 4, value: 4 },
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'square_dance');
        const m = equip?.state.miles ?? 0;
        if (m > 0) return [[miles(`+${m}`), condition('4 dice played')]];
        return [[miles('+4')], [condition('when 4 dice played')]];
      })(game, player),
      tooltip: [[text('Gains +4 miles if played hand has exactly 4 dice')]],
    }),

  },
  {
    id: 'junk_dealer',
    name: 'Junk Dealer',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_CREATE_EQUIPMENT',
    effectParams: { count: 2, rarity: 'common' },
    display: (game, player) => ({
      hint: (() => [[text('2 common equip')], [condition('per round')]])(game, player),
      tooltip: [[text('When round starts, create 2 common pieces of equipment')]],
    }),

  },
  {
    id: 'new_blood',
    name: 'New Blood',
    cardTemplate: "black-text-white-outline",
    cost: 7,
    rarity: 'uncommon',

    effectType: 'STATEFUL_XMULT',
    effectParams: { gainOnDiceAdded: 0.25 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'new_blood');
        const xm = equip?.state.xMult ?? 1;
        if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
        return [[mult('x0.25'), condition('per new dice')]];
      })(game, player),
      tooltip: [[text('Gains x0.25 mult for every new dice added to collection')]],
    }),

  },
  {
    id: 'emergency_supplies',
    name: 'Emergency Supplies',
    cardTemplate: "black-text",
    cost: 8,
    rarity: 'uncommon',

    effectType: 'LOW_MONEY_SUPPLY',
    effectParams: { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const p = { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } };
        const threshold = resolveEffectParam<number>(p, 'threshold', player.profession?.id);
        if (player.economy.balance <= threshold) return [[text('Supply card!'), active('Active')]];
        return [[text('Supply card'), condition(`≤$${threshold}`)]];
      })(game, player),
      tooltip: [[text('Create a random supply card if hand is played with $4 or less. Dr. Eleanor Sykes (Doctor) gets a supply card if hand is played with $8 or less.')]],
    }),

  },
  {
    id: 'railroad_bonds',
    name: 'Railroad Bonds',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'END_ROUND_MONEY_SCALING',
    effectParams: { base: 1, perBoss: 2 },
    initialState: { bossesDefeated: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'railroad_bonds');
        const bossesDefeated = (equip?.state?.bossesDefeated as number) ?? 0;
        const total = 1 + bossesDefeated * 2;
        return [[money(`$${total}`), condition('end of round')]];
      })(game, player),
      tooltip: [[text('Earn $1 at end of round, increased by $2 for every boss defeated')]],
    }),

  },
  {
    id: 'leftovers',
    name: 'Leftovers',
    cardTemplate: "black-text-white-outline",
    cost: 4,
    rarity: 'common',

    effectType: 'PACK_OPEN_SUPPLY_CHANCE',
    effectParams: { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const p = { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } };
        const chance = resolveChance(p, player.profession?.id);
        return [[oddsDisplay(chance, player), text('supply'), condition('on pack open')]];
      })(game, player),
      tooltip: [[text('1 in 2 chance to gain a supply card when opening a booster pack. Martha Delaney (Cook) has a guaranteed chance.')]],
    }),

  },
  {
    id: 'campfire_stories',
    name: 'Campfire Stories',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'SUPPLY_USED_MULT',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'campfire_stories');
        const m = equip?.state.mult ?? 0;
        if (m > 0) return [[mult(`+${m}`)]];
        return [[mult('+1'), condition('per supply used')]];
      })(game, player),
      tooltip: [[text('+1 mult per supply card used this journey')]],
    }),

  },
  {
    id: 'quarry_mine',
    name: 'Quarry Mine',
    cardTemplate: "white-text-black-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ENHANCEMENT_COUNT_MILES',
    effectParams: { enhancement: 'stone', value: 25 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const count = player.dice.filter((d) => d.enhancement === 'stone').length;
        const total = count * 25;
        if (count > 0) return [[miles(`+${total}`), condition(`${count} stone`)]];
        return [[miles('+25'), condition('per stone die')]];
      })(game, player),
      tooltip: [[text('+25 miles for each stone die in collection')]],
    }),

    unlockCondition: unlockByEnhancement('stone'),
  },
  {
    id: 'antique_revolver',
    name: 'Antique Revolver',
    cardTemplate: "white-text",
    cost: 4,
    rarity: 'common',

    effectType: 'ROUND_START_SELL_VALUE',
    effectParams: { value: 3 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'antique_revolver');
        const sv = equip?.sellValue ?? 2;
        return [[money(`$${sv}`), text('sell value')]];
      })(game, player),
      tooltip: [[text('When round starts, gain $3 of sell value to current card')]],
    }),

  },
  {
    id: 'hardtack',
    name: 'Hardtack',
    cardTemplate: "black-text-white-outline",
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_DAYS_NO_REROLLS',
    effectParams: { days: 3 },
    display: (game, player) => ({
      hint: (() => [[text('+3 days'), condition('no rerolls')]])(game, player),
      tooltip: [[text('When round starts, gain +3 days and lose all rerolls')]],
    }),

  },
  {
    id: 'manifest_destiny',
    name: 'Manifest Destiny',
    cardTemplate: "black-text-white-outline",
    cost: 5,
    rarity: 'uncommon',

    effectType: 'HAND_MILES_GAIN',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 15 },
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'manifest_destiny');
        const m = equip?.state.miles ?? 0;
        if (m > 0) return [[miles(`+${m}`), condition(HAND_NAMES.FIVE_STRAIGHT)]];
        return [[miles('+15'), condition(HAND_NAMES.FIVE_STRAIGHT)]];
      })(game, player),
      tooltip: [[text('Gains +15 miles if hand contains a 5 straight')]],
    }),

  },

  // ─── Phase 6 Items ───
  {
    id: 'rail_splitter',
    name: 'Rail Splitter',
    cardTemplate: 'black-text-white-outline',
    cost: 4,
    rarity: 'common',

    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 8 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT))
          return [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]];
        return [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains a 4 straight +8 mult')]],
    }),

  },
  {
    id: 'open_range',
    name: 'Open Range',
    cardTemplate: 'white-text-black-outline',
    cost: 3,
    rarity: 'common',

    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 12 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
          return [[mult('+12'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
        return [[mult('+12'), condition(HAND_NAMES.FIVE_STRAIGHT)], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('If played hand contains a 5 straight +12 mult')]],
    }),

  },
  {
    id: 'one_man_posse',
    name: 'One-Man Posse',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',

    effectType: 'EMPTY_SLOT_XMULT',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const emptySlots = player.maxEquipmentSlots - player.usedEquipmentSlots;
        if (emptySlots > 0) return [[mult(`x${1 + emptySlots}`), condition(`${emptySlots} empty`)]];
        return [[mult('x1'), condition('no empty slots')], [inactive('Inactive')]];
      })(game, player),
      tooltip: [[text('x1 mult for each empty equipment slot')]],
    }),

  },
  {
    id: 'covered_wagon',
    name: 'Covered Wagon',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ENHANCEMENT_SCORED_MILES',
    effectParams: { enhancement: 'wooden', value: 30 },
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'covered_wagon');
        const m = equip?.state.miles ?? 0;
        if (m > 0) return [[miles(`+${m}`), condition('wooden scored')]];
        return [[miles('+30'), condition('per wooden scored')]];
      })(game, player),
      tooltip: [[text('Gains +30 miles for every Wood die scored')]],
    }),

    unlockCondition: unlockByEnhancement('wooden'),
  },
  {
    id: 'moonshine',
    name: 'Moonshine',
    cardTemplate: 'white-text-noborder',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ENHANCED_RETRIGGER',
    effectParams: { destroyChance: [1, 6], diamondDestroyChance: [1, 3] },
    display: (game, player) => ({
      hint: ((_game, player) => [[text('Retrigger'), condition('enhanced dice')], [oddsDisplay([1, 6], player), text('destroy')]])(game, player),
      tooltip: [[text('Retrigger all enhanced dice. Enhanced dice have 1 in 6 chance of being destroyed, diamond dice 1 in 3.')]],
    }),

    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'burn_barrel',
    name: 'Burn Barrel',
    cardTemplate: 'black-text',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_DESTROY_STANDARD_DICE',
    effectParams: { value: 3 },
    display: (game, player) => ({
      hint: (() => [[money('+$3'), condition('destroy standard die')]])(game, player),
      tooltip: [[text('At start of each round, destroy one standard non-enhanced die. If destroyed, earn $3.')]],
    }),

  },
  {
    id: 'shortcut_trail',
    name: 'Shortcut Trail',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUNDS_SKIPPED_XMULT',
    effectParams: { value: 0.25 },
    initialState: { roundsSkipped: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'shortcut_trail');
        const skipped = equip?.state.roundsSkipped ?? 0;
        const xm = 1 + skipped * 0.25;
        if (skipped > 0) return [[mult(`x${xm.toFixed(2)}`), condition(`${skipped} skipped`)]];
        return [[mult('x0.25'), condition('per round skipped')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('x0.25 mult for each round of journey skipped')]],
    }),

  },
  {
    id: 'quick_draw',
    name: 'Quick Draw',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',

    effectType: 'FIRST_DICE_RETRIGGER',
    effectParams: { value: 2 },
    display: (game, player) => ({
      hint: (() => [[text('Retrigger first'), condition('×2')]])(game, player),
      tooltip: [[text('Retrigger first played die 2 additional times')]],
    }),

  },
  {
    id: 'last_laugh',
    name: 'Last Laugh',
    cardTemplate: 'white-text-noborder',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'LAST_DICE_RETRIGGER',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[text('Retrigger last'), condition('×1')]])(game, player),
      tooltip: [[text('Retrigger last played die 1 additional time')]],
    }),

  },
  {
    id: 'lucky_penny',
    name: 'Lucky Penny',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'LUCKY_DICE_MONEY',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[money('+$1'), condition('per lucky scored')]])(game, player),
      tooltip: [[text('Played lucky dice earn $1 when scored')]],
    }),

  },
  {
    id: 'bone_charm',
    name: 'Bone Charm',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'BONE_DICE_XMULT_CHANCE',
    effectParams: { chance: [1, 2], value: 1.5 },
    display: (game, player) => ({
      hint: ((_game, player) => [[mult('x1.5'), oddsDisplay([1, 2], player), condition('per bone')]])(game, player),
      tooltip: [[text('Played bone dice have 1 in 2 chance to give x1.5 mult')]],
    }),

    unlockCondition: unlockByEnhancement('bone'),
  },
  {
    id: 'wood_axe',
    name: 'Wood Axe',
    cardTemplate: 'black-text',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'WOODEN_DICE_MILES',
    effectParams: { value: 50 },
    display: (game, player) => ({
      hint: (() => [[miles('+50'), condition('per wooden')]])(game, player),
      tooltip: [[text('Played wooden dice give +50 miles when scored')]],
    }),

    unlockCondition: unlockByEnhancement('wooden'),
  },
  {
    id: 'iron_spurs',
    name: 'Iron Spurs',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'IRON_DICE_MULT',
    effectParams: { value: 7 },
    display: (game, player) => ({
      hint: (() => [[mult('+7'), condition('per steel')]])(game, player),
      tooltip: [[text('Played iron dice give +7 mult when scored')]],
    }),

    unlockCondition: unlockByEnhancement('steel'),
  },
  {
    id: 'diamond_coffin',
    name: 'Diamond Coffin',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'DIAMOND_DESTROYED_XMULT',
    effectParams: { value: 0.75 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'diamond_coffin');
        const xm = equip?.state.xMult ?? 1;
        if (xm > 1) return [[mult(`x${xm.toFixed(2)}`)]];
        return [[mult('x0.75'), condition('per diamond destroyed')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('Item gains x0.75 mult for every diamond die that is destroyed')]],
    }),

    unlockCondition: unlockByEnhancement('diamond'),
  },
  {
    id: 'counterfeit_goods',
    name: 'Counterfeit Goods',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'ALLOW_DUPLICATES',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Duplicates allowed')]])(game, player),
      tooltip: [[text('Allows items/trail guides/supplies/frontier encounter cards to appear multiple times in the shop and packs')]],
    }),

  },
  {
    id: 'rainbow_trail',
    name: 'Rainbow Trail',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'RAINBOW_TRAIL_XMULT',
    effectParams: {},
    display: (game, player) => ({
      hint: ((game) => {
        if (game && game.state.selectedForScore?.length > 0) {
          const types = new Set(game.state.selectedForScore.filter((d) => d.enhancement !== null).map((d) => d.enhancement));
          if (types.size >= 2) return [[mult(`x${types.size}`), active(`${types.size} types`)]];
        }
        return [[mult('x1')], [condition('per enhancement')]];
      })(game, player),
      tooltip: [[text('x2 if 2 different enhanced dice score, x3 if 3, x4 if 4, x5 if 5 different')]],
    }),

    unlockCondition: unlockTwoEnhancedTypes,
  },
  {
    id: 'loaded_dice',
    name: 'Loaded Dice',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'uncommon',

    effectType: 'LOADED_DICE',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[odds('x2'), text('all listed odds')]])(game, player),
      tooltip: [[text('Doubles all listed probabilities')]],
    }),

  },
  {
    id: 'mirror_lake',
    name: 'Mirror Lake',
    cardTemplate: 'white-text-black-outline',
    cost: 10,
    rarity: 'rare',

    effectType: 'COPY_RIGHT',
    effectParams: {},
    display: (_game, player) => {
      const idx = player.equipment.findIndex((e) => e.def.id === 'mirror_lake');
      let target = 'Nothing to copy';
      if (idx >= 0) {
        const resolved = resolveCopyTarget(player.equipment, idx, player.equipment.length);
        if (resolved) target = resolved.def.name;
        else if (idx < player.equipment.length - 1) target = 'Incompatible';
      }
      const hint = idx >= 0 && target !== 'Nothing to copy' && target !== 'Incompatible'
        ? [[text('Copying')], [active(target)]]
        : target === 'Incompatible'
          ? [[inactive('Incompatible')]]
          : [[inactive('Nothing to copy')]];
      return {
        hint,
        tooltip: [[text('Copies the ability of: ')], [target === 'Incompatible' ? inactive(target) : active(target)]],
      };
    },

  },
  {
    id: 'echo_chamber',
    name: 'Echo Chamber',
    cardTemplate: undefined,
    cost: 10,
    rarity: 'rare',

    effectType: 'COPY_LEFTMOST',
    effectParams: {},
    display: (_game, player) => {
      const idx = player.equipment.findIndex((e) => e.def.id === 'echo_chamber');
      let target = 'Nothing to copy';
      if (idx > 0) {
        const resolved = resolveCopyTarget(player.equipment, idx, player.equipment.length);
        target = resolved ? resolved.def.name : 'Incompatible';
      }
      const hint = idx > 0 && target !== 'Incompatible'
        ? [[text('Copying')], [active(target)]]
        : idx > 0
          ? [[inactive('Incompatible')]]
          : [[inactive('Nothing to copy')]];
      return {
        hint,
        tooltip: [[text('Copies the leftmost ability: ')], [target === 'Incompatible' ? inactive(target) : active(target)]],
      };
    },

  },

  // ─── Phase 9 Items ───
  {
    id: 'five_mile_marker',
    name: '5 Mile Marker',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'PIP_SCORED_MILES_GAIN',
    effectParams: { pip: 5, value: 5 },
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'five_mile_marker');
        const m = equip?.state.miles ?? 0;
        if (m > 0) return [[miles(`+${m}`), condition('5s scored')]];
        return [[miles('+5'), condition('per 5 scored')]];
      })(game, player),
      tooltip: [[text('Gains +5 miles each time a 5 pip is scored')]],
    }),

  },
  {
    id: 'trail_backpack',
    name: 'Trail Backpack',
    cardTemplate: 'black-text-white-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'TRAIL_BACKPACK',
    effectParams: { rerollsBonus: 2, rollSizePenalty: 1 },
    display: (game, player) => ({
      hint: (() => [[active('+2 rerolls')], [condition('-1 roll size')]])(game, player),
      tooltip: [[text('+2 re-rolls per day, -1 dice when rolling')]],
    }),

  },
  {
    id: 'hitched_pair',
    name: 'Hitched Pair',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.PAIR, value: 2 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.PAIR))
          return [[mult('x2'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
        return [[mult('x2'), condition(HAND_NAMES.PAIR)]];
      })(game, player),
      tooltip: [[text('x2 mult if hand contains a pair')]],
    }),

  },
  {
    id: 'hat_trick',
    name: 'Hat Trick',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 3 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
          return [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
        return [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)]];
      })(game, player),
      tooltip: [[text('x3 mult if hand contains a three of a kind')]],
    }),

  },
  {
    id: 'posse_wagon',
    name: 'Posse Wagon',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FOUR_OF_A_KIND, value: 4 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FOUR_OF_A_KIND))
          return [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)], [active('Active!')]];
        return [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)]];
      })(game, player),
      tooltip: [[text('x4 mult if hand contains a four of a kind')]],
    }),

  },
  {
    id: 'five_finger_fillet',
    name: 'Five Finger Fillet',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FIVE_OF_A_KIND, value: 5 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FIVE_OF_A_KIND))
          return [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)], [active('Active!')]];
        return [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)]];
      })(game, player),
      tooltip: [[text('x5 mult if hand contains a five of a kind')]],
    }),

  },
  {
    id: 'snake_river',
    name: 'Snake River',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',

    effectType: 'HAND_CONTAINS_XMULT',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 3 },
    display: (game, player) => ({
      hint: ((game) => {
        if (game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT))
          return [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]];
        return [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)]];
      })(game, player),
      tooltip: [[text('x3 mult if hand contains a 5 straight')]],
    }),

  },
  {
    id: 'express_train',
    name: 'Express Train',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'EXPRESS_TRAIN',
    effectParams: { miles: 250, rerollsPenalty: 2 },
    display: (game, player) => ({
      hint: (() => [[miles('+250')], [condition('-2 rerolls')]])(game, player),
      tooltip: [[text('+250 miles, -2 re-rolls')]],
    }),

  },
  {
    id: 'phantom_wagon',
    name: 'Phantom Wagon',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',

    effectType: 'PHANTOM_WAGON',
    effectParams: { roundsNeeded: 2 },
    initialState: { roundsHeld: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'phantom_wagon');
        const held = equip?.state.roundsHeld ?? 0;
        const needed = 2;
        if (held >= needed) return [[active('Ready to sell!')], [text('Duplicates random item')]];
        return [[condition(`${held}/${needed} rounds`)], [text('Sell to duplicate')]];
      })(game, player),
      tooltip: [[text('After 2 rounds, sell this card to duplicate a random item (removes ghost aura)')]],
    }),

  },
  {
    id: 'trail_almanac',
    name: 'Trail Almanac',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'TRAIL_ALMANAC_MONEY',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        let discoveredCount = 0;
        for (const [, stats] of player.handStats) {
          if (stats.level > 1) discoveredCount++;
        }
        return [[money(`+$${discoveredCount}`), condition('trail guides')]];
      })(game, player),
      tooltip: [[text('$1 at end of round for every type of trail guide discovered')]],
    }),

  },
  {
    id: 'blessed_herd',
    name: 'Blessed Herd',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'ENHANCED_DICE_COUNT_XMULT',
    effectParams: { threshold: 16, value: 3 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const enhCount = player.dice.filter((d) => d.enhancement !== null).length;
        if (enhCount >= 16) return [[mult('x3')], [active(`${enhCount} enhanced`)]];
        return [[mult('x3'), condition(`${enhCount}/16 enhanced`)]];
      })(game, player),
      tooltip: [[text('x3 mult if you have at least 16 enhanced dice in collection')]],
    }),

  },
  {
    id: 'supply_drop',
    name: 'Supply Drop',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'ROUND_START_SUPPLY',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Supply at round start')]])(game, player),
      tooltip: [[text('Create a random supply card at start of round')]],
    }),

  },
  {
    id: 'explorers_guild',
    name: "Explorer's Guild",
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',

    effectType: 'EXPLORER_GUILD',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Trail guides free')]])(game, player),
      tooltip: [[text('All trail guides and trail guide packs are free in the shop')]],
    }),

  },
  {
    id: 'graverobber',
    name: 'Graverobber',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'GRAVEROBBER_XMULT',
    effectParams: { value: 0.1 },
    initialState: { xMult: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'graverobber');
        const xm = equip?.state.xMult ?? 1;
        if (xm > 1) return [[mult(`x${xm.toFixed(1)}`)]];
        return [[mult('x0.1'), condition('per enhanced scored')]];
      })(game, player),
      tooltip: [[text('Gains x0.1 mult per scored enhanced dice, removes dice enhancement')]],
    }),

    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'pack_saddle',
    name: 'Pack Saddle',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',

    effectType: 'PACK_SADDLE',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[active('+1 hand size')]])(game, player),
      tooltip: [[text('+1 hand size')]],
    }),

  },
  {
    id: 'coffee',
    name: 'Coffee',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'COFFEE',
    effectParams: { handSizeBonus: 2, daysPenalty: 1 },
    display: (game, player) => ({
      hint: (() => [[active('+2 hand size')], [condition('-1 day')]])(game, player),
      tooltip: [[text('+2 hand size, -1 day per round')]],
    }),

  },
  {
    id: 'flour_sack',
    name: 'Flour Sack',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'FLOUR_SACK',
    effectParams: { decayPerRound: 1, professionOverrides: { farmer: { decayPerRound: 0 } } },
    initialState: { handSizeBonus: 5 },
    display: (game, player) => ({
      hint: ((_game, player) => {
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
      })(game, player),
      tooltip: [[text('+5 hand size, reduces by 1 each round. Hank Caldwell (Farmer) keeps the full +5 with no decay.')]],
    }),

  },

  // ─── Phase 10 Items ───
  {
    id: 'oil_baron',
    name: 'Oil Baron',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'MULT_PER_MONEY_CHUNK',
    effectParams: { chunk: 5, value: 2 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const multGain = Math.floor(player.economy.balance / 5) * 2;
        if (multGain > 0) return [[mult(`+${multGain}`), condition('per $5 held')]];
        return [[mult('+2'), condition('per $5 held')]];
      })(game, player),
      tooltip: [[text('+2 mult for every $5 you have')]],
    }),

  },
  {
    id: 'trailblazer',
    name: 'Trailblazer',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',

    effectType: 'TRAILBLAZER_XMULT',
    effectParams: { value: 0.2 },
    initialState: { streak: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'trailblazer');
        const streak = equip?.state.streak ?? 0;
        if (streak > 0) {
          const xm = 1 + streak * 0.2;
          return [[mult(`x${xm.toFixed(1)}`), condition(`${streak} hands`)], [active('Active!')]];
        }
        return [[mult('x0.2'), condition('per hand off-meta')], [inactive('None')]];
      })(game, player),
      tooltip: [[text('Earns x0.2 mult per consecutive hand played without playing your most played hand')]],
    }),

  },
  {
    id: 'golden_spike',
    name: 'Golden Spike',
    cardTemplate: 'black-text',
    cost: 7,
    rarity: 'uncommon',

    effectType: 'SCORED_GOLD_CHANCE',
    effectParams: { chance: [1, 4] },
    display: (game, player) => ({
      hint: ((_game, player) => [[oddsDisplay([1, 4], player), condition('per scored die')]])(game, player),
      tooltip: [[text('All scored dice have a 1 in 4 chance to turn into a gold dice')]],
    }),

  },
  {
    id: 'sheriffs_badge',
    name: "Sheriff's Badge",
    cardTemplate: 'black-text',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'SELL_DISABLE_BOSS',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[text('Sell to'), condition('disable boss')]])(game, player),
      tooltip: [[text('Sell this item to disable the current boss effect')]],
    }),

  },
  {
    id: 'bounty_contract',
    name: 'Bounty Contract',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'SELL_GRANT_TAG',
    effectParams: { tagId: 'tag_twin_wagon' },
    display: (game, player) => ({
      hint: (() => [[text('Sell to'), condition('Twin Wagon')]])(game, player),
      tooltip: [[text('Sell this item to gain a free Twin Wagon tag')]],
    }),

  },
  {
    id: 'double_barrel',
    name: 'Double Barrel',
    cardTemplate: 'black-text',
    cost: 5,
    rarity: 'common',

    effectType: 'FIRST_PIP_XMULT',
    effectParams: { pip: 2, value: 2 },
    display: (game, player) => ({
      hint: (() => [[mult('x2'), condition('first 2 scored')]])(game, player),
      tooltip: [[text('First played 2 pip dice gives x2 mult when scored')]],
    }),

  },
  {
    id: 'raffle_ticket',
    name: 'Raffle Ticket',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'END_ROUND_SELL_VALUE_ALL',
    effectParams: { value: 1 },
    display: (game, player) => ({
      hint: (() => [[money('+$1'), condition('sell value each item')]])(game, player),
      tooltip: [[text('At the end of each round add $1 of sell value to each piece of equipment')]],
    }),

  },
  {
    id: 'ghost_town',
    name: 'Ghost Town',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',

    effectType: 'MULT_PER_MISSING_DICE',
    effectParams: { value: 10 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const missing = Math.max(0, player.startingDiceCount - player.dice.length);
        if (missing > 0) return [[mult(`+${missing * 10}`), condition(`${missing} dice lost`)]];
        return [[mult('+10'), condition('per missing die')], [inactive('Full herd')]];
      })(game, player),
      tooltip: [[text('+10 mult for each dice below the collections starting size')]],
    }),

  },
  {
    id: 'savings_account',
    name: 'Savings Account',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'uncommon',

    effectType: 'SAVINGS_ACCOUNT_INTEREST',
    effectParams: { perChunk: 5, value: 1, accountantBonus: 1 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const perChunk = Math.floor(Math.min(player.economy.balance, player.interestCap) / 5);
        const isAccountant = player.profession?.id === 'accountant';
        const perDollar = isAccountant ? 2 : 1;
        if (perChunk > 0) return [[money(`+$${perChunk * perDollar}`), condition('extra interest')]];
        return [[money('+$1'), condition('per $5 held')]];
      })(game, player),
      tooltip: [[text('Earn an extra $1 of interest for every $5 you have at end of round. Henry Pritchard (Accountant) earns an additional $1 for every $5.')]],
    }),

  },
  {
    id: 'six_feet_under',
    name: 'Six Feet Under',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'common',

    effectType: 'DICE_DESTROYED_MILES_GAIN',
    effectParams: { value: 66 },
    initialState: { miles: 0 },
    display: (game, player) => ({
      hint: ((_game, player) => {
        const equip = player.equipment.find((e) => e.def.id === 'six_feet_under');
        const m = equip?.state.miles ?? 0;
        if (m > 0) return [[miles(`+${m}`), condition('dice destroyed')]];
        return [[miles('+66'), condition('per die destroyed')]];
      })(game, player),
      tooltip: [[text('Item gains 66 miles for every dice that is destroyed')]],
    }),

  },
  {
    id: 'eight_second_ride',
    name: 'Eight Second Ride',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',

    effectType: 'CONSECUTIVE_PIP_XMULT',
    effectParams: { pip: 8, increment: 0.5 },
    display: (game, player) => ({
      hint: (() => [[mult('x1→x3+'), condition('consecutive 8s')]])(game, player),
      tooltip: [[text('Each consecutive scored 8 gains +0.5 xMult over the previous (x1, x1.5, x2, x2.5, x3...)')]],
    }),

  },
  {
    id: 'stacked_deck',
    name: 'Stacked Deck',
    cardTemplate: 'white-text-black-outline',
    cost: 10,
    rarity: 'rare',

    effectType: 'STACKED_DECK',
    effectParams: {},
    display: (game, player) => ({
      hint: (() => [[active('Loaded = all pips')]])(game, player),
      tooltip: [[text('Loaded dice are considered all pip values for equipment effects')]],
    }),

    unlockCondition: unlockByEnhancement('loaded'),
  },
];

export default items;
