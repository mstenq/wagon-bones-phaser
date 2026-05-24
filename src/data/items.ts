// ─── Equipment Item Definitions ───
// Each item defines its hint display as a function returning styled segments.
// Segments are rendered below the card image in the equipment bar.

// ─── Hint System Types ───

/** Card template overlay identifier — matches filename in assets/card-templates/ */
export type CardTemplate =
  | 'white-text'
  | 'white-text-noborder'
  | 'black-text'
  | 'black-text-noborder'
  | 'white-text-black-outline'
  | 'white-text-black-outline-noborder'
  | 'black-text-white-outline'
  | 'black-text-white-outline-noborder'
  | 'marked'
  | 'hellfire';

/** Visual style for a hint segment */
export type HintStyle =
  | 'miles' // blue text — distance/miles values
  | 'mult' // red rounded-rect background, white text — multiplier chips
  | 'xmult' // red rounded-rect background, white text — xMult values
  | 'retrigger' // purple text — retrigger labels/values
  | 'odds' // green text — probability displays like "1 in 6"
  | 'inactive' // gray text — "Inactive" when condition not met
  | 'condition' // amber text — activation requirement label
  | 'active' // bright green text — "Active!" when condition is met
  | 'money' // gold text — dollar amounts
  | 'text' // default light text — plain labels
  | 'aura_fire' // fire aura label (orange-red)
  | 'aura_icy' // icy aura label (cyan)
  | 'aura_holy'; // holy aura label (golden-white)

export type HintSize = 'xs' | 'sm' | 'md';

/** A single styled text chunk in a hint line */
export interface HintSegment {
  text: string;
  style: HintStyle;
  size?: HintSize;
}

export interface ItemDisplayResult {
  hint: HintSegment[][];
  tooltip: HintSegment[][];
}

import type { GameState } from '../game/GameState';
import type { PlayerState } from '../game/PlayerState';
import { HandType, type EquipmentModifier } from '../game/types';
import { getLoadedDiceMultiplier, resolveCopyTarget } from '../game/equipmentUtils';
import { resolveEffectParam, resolveChance } from '../game/effectParams';
import {
  unlockAnyEnhanced,
  unlockByEnhancement,
  unlockNitro,
  unlockTwoEnhancedTypes,
  type EquipmentUnlockCondition,
} from '../game/equipmentUnlock';

/** Equipment definition shape (static data + optional `display` for live hints) */
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
  /** Immune to difficulty modifier rolls (cursed / perishable / leased), not instance state. */
  modifierImmunity?: EquipmentModifier[];
}

// ─── Helper constructors for readability ───
const segment = (text: string, style: HintStyle, size: HintSize = 'md'): HintSegment => ({ text, style, size });
const miles = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'miles', size);
const mult = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'mult', size);
const retrigger = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'retrigger', size);
const odds = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'odds', size);
const inactive = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'inactive', size);
const condition = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'condition', size);
const active = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'active', size);
const money = (text: string, size: HintSize = 'md'): HintSegment => segment(text, 'money', size);
const text = (t: string, size: HintSize = 'md'): HintSegment => segment(t, 'text', size);

/** Format odds display accounting for Loaded Dice multiplier */
const oddsDisplay = (chance: [number, number], player: PlayerState, size: HintSize = 'md'): HintSegment => {
  const ldm = getLoadedDiceMultiplier(player.equipment);
  const effectiveNum = chance[0] * ldm;
  return odds(`${effectiveNum} in ${chance[1]}`, size);
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
    FIVE_STRAIGHT: [HandType.FOUR_STRAIGHT],
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
    cardTemplate: 'white-text-black-outline',
    cost: 2,
    rarity: 'common',
    effectType: 'ADD_MULT',
    effectParams: { value: 4 },
    display: (_game, _player) => ({
      hint: [[mult('+4')]],
      tooltip: [[mult('+4'), text('mult')]],
    }),
  },
  {
    id: 'wedding_ring',
    name: 'Wedding Ring',
    cardTemplate: 'white-text',
    cost: 3,
    rarity: 'common',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.PAIR, value: 8 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.PAIR)
          ? [[mult('+8'), condition(HAND_NAMES.PAIR)], [active('Active!')]]
          : [[mult('+8'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains a'), condition(HAND_NAMES.PAIR), mult('+8'), text('mult')]],
    }),
  },
  {
    id: 'town_choir',
    name: 'Town Choir',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 12 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND)
          ? [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]]
          : [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains'), condition(HAND_NAMES.THREE_OF_A_KIND), mult('+12'), text('mult')]],
    }),
  },
  {
    id: 'deputy_brothers',
    name: 'Deputy Brothers',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.TWO_PAIR, value: 10 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.TWO_PAIR)
          ? [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]]
          : [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains'), condition(HAND_NAMES.TWO_PAIR), mult('+10'), text('mult')]],
    }),
  },
  {
    id: 'work_boots',
    name: 'Work Boots',
    cardTemplate: 'white-text',
    cost: 3,
    rarity: 'common',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.PAIR, value: 50 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.PAIR)
          ? [[miles('+50'), condition(HAND_NAMES.PAIR)], [active('Active!')]]
          : [[miles('+50'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains'), condition(HAND_NAMES.PAIR), miles('+50'), text('miles')]],
    }),
  },
  {
    id: 'buffalo_stampede',
    name: 'Buffalo Stampede',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 100 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND)
          ? [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]]
          : [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains'), condition(HAND_NAMES.THREE_OF_A_KIND), miles('+100'), text('miles')]],
    }),
  },
  {
    id: 'trail_rations',
    name: 'Trail Rations',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'common',
    effectType: 'MILES_PER_UNUSED_REROLL',
    effectParams: { value: 30 },
    display: (game, _player) => {
      const rerolls = game?.state.rerollsRemaining ?? 0;
      const total = rerolls * 30;
      return {
        hint: total > 0 ? [[miles(`+${total}`), text('mi')]] : [[inactive(`+0`), text('mi')]],
        tooltip: [[miles('+30'), text('miles per unused re-roll')]],
      };
    },
  },
  {
    id: 'deadeye',
    name: 'Deadeye',
    cardTemplate: 'black-text-white-outline',
    cost: 5,
    rarity: 'common',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'SCORED_DICE_LTE', threshold: 3, value: 20 },
    display: (game, _player) => {
      const diceCount = game?.state.rolledDice?.length ?? 0;
      const isActive = diceCount > 0 && diceCount <= 3;
      return {
        hint: isActive
          ? [[mult('+20'), condition('≤ 3 dice')], [active('Active!')]]
          : [[mult('+20'), condition('≤ 3 dice')], [inactive('Inactive')]],
        tooltip: [[mult('+20'), text('mult if'), condition('3 or fewer dice are scored')]],
      };
    },
  },
  {
    id: 'stubborn_mule',
    name: 'Stubborn Mule',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'common',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'NO_REROLLS', value: 15 },
    display: (game, _player) => {
      if (!game) {
        return {
          hint: [[mult('+15'), condition('No rerolls')]],
          tooltip: [[mult('+15'), text('mult when'), condition('0 re-rolls remaining')]],
        };
      }
      const isActive = game.state.rerollsRemaining === 0;
      return {
        hint: isActive
          ? [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [active('Active!')]]
          : [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [inactive('Inactive')]],
        tooltip: [[mult('+15'), text('mult when'), condition('0 re-rolls remaining')]],
      };
    },
  },
  {
    id: 'toolbelt',
    name: 'Toolbelt',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'MULT_PER_EQUIPMENT',
    effectParams: { value: 3 },
    display: (_game, player) => {
      const total = player.equipment.length * 3;
      return {
        hint: [[mult(`+${total}`)]],
        tooltip: [[mult('+3'), text('mult for each piece of equipment. Currently'), mult(`+${total}`)]],
      };
    },
  },
  {
    id: 'even_odds',
    name: 'Even Odds',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'PARITY_MULT',
    effectParams: { parity: 'even', value: 4 },
    display: (_game, _player) => ({
      hint: [[mult('+4'), condition('per even')]],
      tooltip: [[mult('+4'), text('mult when an'), condition('even value is scored')]],
    }),
  },
  {
    id: 'odd_fellow',
    name: 'Odd Fellow',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'PARITY_MILES',
    effectParams: { parity: 'odd', value: 31 },
    display: (_game, _player) => ({
      hint: [[miles('+31'), condition('per odd')]],
      tooltip: [[miles('+31'), text('miles when an'), condition('odd value is scored')]],
    }),
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'common',
    modifierImmunity: ['cursed'],
    effectType: 'ADD_MULT_RISKY',
    effectParams: { value: 15, destroyChance: [1, 6] },
    display: (_game, player) => ({
      hint: [[mult('+15')]],
      tooltip: [
        [mult('+15'), text('mult.'), oddsDisplay([1, 6], player), text('chance to be destroyed at end of round.')],
      ],
    }),
  },
  {
    id: 'spare_holster',
    name: 'Spare Holster',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'MODIFY_REROLLS',
    effectParams: { value: 1 },
    display: (_game, _player) => ({
      hint: [[active('+1 reroll')]],
      tooltip: [[active('+1 re-roll'), text('per leg')]],
    }),
  },
  {
    id: 'payday',
    name: 'Payday',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'common',
    effectType: 'END_ROUND_MONEY',
    effectParams: { value: 4, professionOverrides: { outlaw: { value: 12 } } },
    display: (_game, player) => {
      const amount = resolveEffectParam<number>(
        { value: 4, professionOverrides: { outlaw: { value: 12 } } },
        'value',
        player.profession?.id,
      );
      return {
        hint: [[money(`+$${amount}`)]],
        tooltip: [[text('Earn'), money('$4'), text('at end of round. Jesse Rawlins (Outlaw) earns'), money('$12')]],
      };
    },
  }, // ─── Held-in-Hand Items ───
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
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'common',
    effectType: 'HELD_LOWEST_MULT',
    effectParams: {},
    display: (game, _player) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const hint = held.length > 0 ? [[mult(`+${Math.min(...held.map((d) => d.value)) * 2}`)]] : [[inactive('+?')]];
      return {
        hint,
        tooltip: [[text('Adds double the rank of'), condition('lowest held-in-hand die'), text('to'), mult('mult')]],
      };
    },
  },
  {
    id: 'ace_in_the_hole',
    name: 'Ace in the Hole',
    cost: 8,
    rarity: 'rare',
    effectType: 'HELD_PIP_XMULT',
    effectParams: { pip: 1, value: 1.5 },
    display: (game, _player) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 1).length;
      const hint =
        count > 0 ? [[mult(`x${1.5 ** count}`)]] : [[mult('x1.5'), condition('per 1 held')], [inactive('Inactive')]];
      return {
        hint,
        tooltip: [[text('Each'), condition('1'), text('held in hand gives'), mult('x1.5 mult')]],
      };
    },
  },
  {
    id: 'prospectors_pouch',
    name: "Prospector's Pouch",
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'common',
    effectType: 'HELD_ENHANCED_MONEY',
    effectParams: { chance: [1, 2], value: 1 },
    display: (game, player) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const enhanced = held.filter((d) => d.enhancement !== null).length;
      const hint =
        enhanced > 0
          ? [[money('$1'), oddsDisplay([1, 2], player), condition(`${enhanced} enhanced`)]]
          : [[money('$1'), oddsDisplay([1, 2], player), condition('enhanced held')]];
      return {
        hint,
        tooltip: [
          [
            text('Each enhanced die held in hand has a '),
            oddsDisplay([1, 2], player),
            text(' chance to give '),
            money('$1'),
          ],
        ],
      };
    },
    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'eleventh_crossing',
    name: 'The Eleventh Crossing',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'common',
    effectType: 'HELD_PIP_MULT',
    effectParams: { pip: 11, value: 11 },
    display: (game, _player) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 11).length;
      const hint =
        count > 0 ? [[mult(`+${count * 11}`)]] : [[mult('+11'), condition('per 11 held')], [inactive('Inactive')]];
      return {
        hint,
        tooltip: [[text('Each '), mult('11'), text(' held in hand gives '), mult('+11 mult')]],
      };
    },
  }, // ─── Phase 2 Items ───
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    unlockCondition: unlockByEnhancement('lucky'),
    effectType: 'LUCKY_TRIGGER_XMULT',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'rabbits_foot');
      const xm = equip?.state.xMult ?? 1;
      return {
        hint: [[mult(`x${xm.toFixed(2)}`)]],
        tooltip: [[text('Item gains'), mult('x0.25 mult'), text('for every lucky dice trigger')]],
      };
    },
  },
  {
    id: 'collectors_case',
    name: "Collector's Case",
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    effectType: 'UNCOMMON_EQUIP_XMULT',
    effectParams: {},
    display: (_game, player) => {
      const count = player.equipment.filter((e) => e.def.rarity === 'uncommon').length;
      const hint =
        count > 0
          ? [[mult(`x${(1.5 ** count).toFixed(2)}`)]]
          : [[mult('x1.5'), condition('per uncommon')], [inactive('None')]];
      return {
        hint,
        tooltip: [[condition('Uncommon equipment'), text('each give'), mult('x1.5 mult')]],
      };
    },
  },
  {
    id: 'money_wagon',
    name: 'Money Wagon',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'MILES_PER_DOLLAR',
    effectParams: { value: 2 },
    display: (_game, player) => {
      const total = player.economy.balance * 2;
      const hint = [[miles(`+${total}`), text('mi')]];
      return {
        hint,
        tooltip: [[miles('+2 miles'), text('for every'), money('$1'), text('you have')]],
      };
    },
  },
  {
    id: 'bargain_bin',
    name: 'Bargain Bin',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'SHOP_REROLL_MULT_GAIN',
    effectParams: { value: 2 },
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'bargain_bin');
      const m = equip?.state.mult ?? 0;
      const hint = [[mult(`+${m}`)]];
      return {
        hint,
        tooltip: [[text('Item gains '), mult('+2'), text(' mult per reroll in the shop')]],
      };
    },
  },
  {
    id: 'fading_memory',
    name: 'Fading Memory',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'common',
    modifierImmunity: ['cursed'],
    effectType: 'DECAYING_MULT',
    effectParams: { decayPerRound: 4, maxRounds: 5 },
    initialState: { mult: 20, roundsPlayed: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'fading_memory');
      const m = equip?.state.mult ?? 20;
      const rounds = equip?.state.roundsPlayed ?? 0;
      const hint = [[mult(`+${m}`), condition(`${5 - rounds} rounds left`)]];
      return {
        hint,
        tooltip: [
          [
            mult('+20'),
            text(' mult, '),
            mult('-4'),
            text(' mult per round played, removed after '),
            condition('5 rounds'),
          ],
        ],
      };
    },
  },
  {
    id: 'card_counter',
    name: 'Card Counter',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'HAND_MULT_GAIN',
    effectParams: {
      handType: HandType.TWO_PAIR,
      value: 2,
      professionOverrides: { con_artist: { value: 4 } },
    },
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'card_counter');
      const m = equip?.state.mult ?? 0;
      const hint = [[mult(`+${m}`), condition(HAND_NAMES.TWO_PAIR)]];
      return {
        hint,
        tooltip: [
          [
            text('Item gains '),
            mult('+2'),
            text(' mult if played hand contains '),
            condition(HAND_NAMES.TWO_PAIR),
            text('. Victor Hale (Con Artist) gains '),
            mult('+4'),
            text(' mult if played hand contains '),
            condition(HAND_NAMES.TWO_PAIR),
            text('.'),
          ],
        ],
      };
    },
  },
  {
    id: 'lucky_number',
    name: 'Lucky Number',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    effectType: 'LUCKY_NUMBER_PIP_XMULT',
    effectParams: { value: 1.5, professionOverrides: { gambler: { value: 2 } } },
    initialState: { pip: 7 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'lucky_number');
      const pip = equip?.state.pip ?? 7;
      const xVal = resolveEffectParam<number>(
        equip?.def.effectParams ?? { value: 1.5 },
        'value',
        player.profession?.id,
      );
      const hint = [[mult(`x${xVal}`), condition(`per ${pip}`)]];
      return {
        hint,
        tooltip: [
          [text('Each played '), condition(String(pip)), text(' gives '), mult(`x${xVal}`), text(' mult when scored. Number changes each round.')],
        ],
      };
    },
  },
  {
    id: 'worn_deck',
    name: 'Worn Deck',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'DECAYING_XMULT',
    effectParams: { decayPerDie: 0.01 },
    initialState: { xMult: 2 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'worn_deck');
      const xm = equip?.state.xMult ?? 2;
      const hint = [[mult(`x${xm.toFixed(2)}`)]];
      return {
        hint,
        tooltip: [[mult('x2'), text(' Mult. Loses '), mult('x0.01'), text(' mult per dice re-rolled')]],
      };
    },
  },
  {
    id: 'war_drums',
    name: 'War Drums',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'SCORED_RETRIGGER_TIMED',
    effectParams: {},
    initialState: { daysRemaining: 10 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'war_drums');
      const days = equip?.state.daysRemaining ?? 0;
      const hint = days > 0 ? [[retrigger("Played")],[active(`${days} days left`)]] : [[inactive('Expired')]];
      return {
        hint,
        tooltip: [[text('Retrigger all dice played for the next '), condition('10 days'), text(' of travel')]],
      };
    },
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
    cardTemplate: 'white-text',
    cost: 9,
    rarity: 'rare',
    effectType: 'SELL_XMULT_GAIN',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'snake_oil_ledger');
      const xm = equip?.state.xMult ?? 1;
      const hint = [[mult(`x${xm.toFixed(2)}`)]];
      return {
        hint,
        tooltip: [
          [text('Item gains '), mult('x0.25'), text(' mult for each card sold. Resets when boss is defeated.')],
        ],
      };
    },
  },
  {
    id: 'gold_tooth',
    name: 'Gold Tooth',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'GOLD_DICE_MONEY',
    effectParams: { value: 4 },
    display: (_game, _player) => ({
      hint: [[money('+$4'), condition('per gold')]],
      tooltip: [[text('Played gold dice earn '), money('$4')]],
    }),
    unlockCondition: unlockByEnhancement('gold'),
  },
  {
    id: 'guardian_totem',
    name: 'Guardian Totem',
    cardTemplate: 'black-text-white-outline',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'PREVENT_DEATH',
    effectParams: { threshold: 0.25 },
    display: (_game, _player) => ({
      hint: [[active('Protected')]],
      tooltip: [
        [
          text('Prevents death if miles travelled is at least '),
          condition('25%'),
          text(' of required distance. Card is destroyed if used.'),
        ],
      ],
    }),
  },
  {
    id: 'high_noon',
    name: 'High Noon',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'FINAL_DAY_XMULT',
    effectParams: { value: 3 },
    display: (game, _player) => {
      const hint =
        game && game.state.day >= game.config.maxDays
          ? [[mult('x3')], [active('Active!')]]
          : [[mult('x3'), condition('final day')], [inactive('Inactive')]];
      return {
        hint,
        tooltip: [[mult('x3'), text(' mult on '), condition('final day'), text(' of round')]],
      };
    },
  },
  {
    id: 'desperado',
    name: 'Desperado',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'SELL_VALUE_AS_MULT',
    effectParams: {},
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'desperado');
      let total = 0;
      for (const e of player.equipment) {
        if (e !== equip) total += e.sellValue;
      }
      const hint = [[mult(`+${total}`)]];
      return {
        hint,
        tooltip: [[text('Add the sell value of all other owned equipment as '), mult('mult')]],
      };
    },
  },
  {
    id: 'stagecoach',
    name: 'Stagecoach',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'deprecated',
    effectType: 'NONE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[inactive('Deprecated')]],
      tooltip: [[text('Deprecated: removed with auto-draw round flow.')]],
    }),
  },
  {
    id: 'mystery_crate',
    name: 'Mystery Crate',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ROUND_START_ADD_DICE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('+1 die'), condition('round start')]],
      tooltip: [[text('Add a dice at the start of each round with a random sticker')]],
    }),
  },
  {
    id: 'trail_repair_kit',
    name: 'Trail Repair Kit',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'STATEFUL_XMULT',
    effectParams: { xMultGainPerNegation: 0.75 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const inst = player.equipment.find((e) => e.def.id === 'trail_repair_kit');
      const xm = inst?.state.xMult ?? 1;
      const gain = resolveEffectParam<number>(
        inst?.def.effectParams ?? { xMultGainPerNegation: 0.75 },
        'xMultGainPerNegation',
        player.profession?.id,
      );
      const hint = [
        [mult(`x${xm.toFixed(2)}`)],
      ];
      return {
        hint,
        tooltip: [
          [
            text('Negates negative trail event penalties. Gains '),
            mult(`x${gain}`),
            text(' mult each time it prevents a penalty.'),
          ],
        ],
      };
    },
  },
  {
    id: 'scouts_spyglass',
    name: "Scout's Spyglass",
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'STATEFUL_ADD_MILES',
    effectParams: { investigateMiles: 20 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const inst = player.equipment.find((e) => e.def.id === 'scouts_spyglass');
      const stored = inst?.state.miles ?? 0;
      const investigateMiles = resolveEffectParam<number>(
        inst?.def.effectParams ?? { investigateMiles: 20 },
        'investigateMiles',
        player.profession?.id,
      );
      const hint = [
        [text('View'), condition('trail ahead')],
        stored > 0
          ? [miles(`+${stored}`), text(' stored miles')]
          : [miles(`+${investigateMiles}`), text(' if investigated')],
      ];
      return {
        hint,
        tooltip: [
          [
            text('View from the spyglass before the next trail event. '),
            text('Avoid to skip it, or investigate for '),
            miles(`+${investigateMiles}`),
            text(' stored miles and face the full event.'),
          ],
        ],
      };
    },
  },
  {
    id: 'saint_elmos_shield',
    name: "Saint Elmo's Shield",
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    effectType: 'NONE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('Negates'), text(' boss & trail penalties')]],
      tooltip: [
        [
          text(
            'Disables all boss effects and negative effects from trail events are prevented. Divine favor intervenes.',
          ),
        ],
      ],
    }),
  },
  {
    id: 'book_of_the_dead',
    name: 'Book of the Dead',
    cardTemplate: 'white-text-black-outline',
    cost: 20,
    rarity: 'legendary',
    modifierImmunity: ['perishable'],
    effectType: 'ENHANCED_DESTROYED_XMULT',
    effectParams: { value: 1 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'book_of_the_dead');
      const xm = equip?.state.xMult ?? 1;
      const hint =
        xm > 1 ? [[mult(`x${xm}`)]] : [[mult('x1'), condition('per enhanced destroyed')], [inactive('None')]];
      return {
        hint,
        tooltip: [[text('Gains '), mult('x1'), text(' mult for each destroyed enhanced dice')]],
      };
    },
  },
  {
    id: 'devils_hand',
    name: "The Devil's Hand",
    cardTemplate: 'white-text-noborder',
    cost: 20,
    rarity: 'legendary',
    effectType: 'PIP_XMULT',
    effectParams: { pip: 6, value: 2 },
    display: (_game, _player) => ({
      hint: [[mult('x2'), condition('per 6 scored')]],
      tooltip: [[text('Played '), condition('6'), text("'s give "), mult('x2'), text(' mult when scored')]],
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
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'twenty_third_psalm');
      const xm = equip?.state.xMult ?? 1;
      const total = equip?.state.rerollsTotal ?? 0;
      return {
        hint: [[mult(`x${xm}`)], [text(`${total % 23}/23`)]],
        tooltip: [
          [text('Item gains '), mult('x1'), text(' mult for every '), condition('23'), text(' dice re-rolled')],
        ],
      };
    },
  },
  {
    id: 'ghost_lantern',
    name: 'Ghost Lantern',
    cardTemplate: 'white-text-noborder',
    cost: 20,
    rarity: 'legendary',
    effectType: 'SHOP_END_GHOST_CONSUMABLE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('Ghost copy'), condition('end of shop')]],
      tooltip: [
        [text('Creates a ghost copy of a random consumable card in your possession at the end of the shop phase')],
      ],
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
    display: (_game, _player) => ({
      hint: [[retrigger('Retrigger')], [condition('played/held', "sm")]],
      tooltip: [[text('Retriggers all played dice, and all held in hand effects')]],
    }),
  }, // ─── Phase 3 Items ───
  {
    id: 'twin_colts',
    name: 'Twin Colts',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.TWO_PAIR, value: 80 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.TWO_PAIR)
          ? [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]]
          : [[miles('+80'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]],
      tooltip: [
        [text('If played hand contains '), condition(HAND_NAMES.TWO_PAIR), text(' '), miles('+80'), text(' miles')],
      ],
    }),
  },
  {
    id: 'rail_line',
    name: 'Rail Line',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 80 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT)
          ? [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]]
          : [[miles('+80'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]],
      tooltip: [
        [
          text('If played hand contains a '),
          condition(HAND_NAMES.FOUR_STRAIGHT),
          text(' '),
          miles('+80'),
          text(' miles'),
        ],
      ],
    }),
  },
  {
    id: 'long_haul',
    name: 'Long Haul',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 100 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT)
          ? [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]]
          : [[miles('+100'), condition(HAND_NAMES.FIVE_STRAIGHT)], [inactive('Inactive')]],
      tooltip: [
        [
          text('If played hand contains a '),
          condition(HAND_NAMES.FIVE_STRAIGHT),
          text(' '),
          miles('+100'),
          text(' miles'),
        ],
      ],
    }),
  },
  {
    id: 'silver_bullets',
    name: 'Silver Bullets',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'HELD_RETRIGGER',
    effectParams: { value: 1 },
    display: (_game, _player) => ({
      hint: [[retrigger('Held')]],
      tooltip: [[text('Retrigger all dice held in hand')]],
    }),
  },
  {
    id: 'funeral_pyre',
    name: 'Funeral Pyre',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'ROUND_START_DESTROY_RIGHT',
    effectParams: {},
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'funeral_pyre');
      const m = equip?.state.mult ?? 0;
      const hint = m > 0 ? [[mult(`+${m}`)]] : [[text('Destroys right'), condition('round start')]];
      return {
        hint,
        tooltip: [
          [text('When starting round, destroy equipment to right and add double its sell value as '), mult('mult')],
        ],
      };
    },
  },
  {
    id: 'quarry_stone',
    name: 'Quarry Stone',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ROUND_START_ADD_STONE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('+1 stone'), condition('round start')]],
      tooltip: [[text('Add one stone die to collection when starting round')]],
    }),
  },
  {
    id: 'six_shooter',
    name: 'Six Shooter',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'EVERY_NTH_HAND_XMULT',
    effectParams: { n: 6, value: 4 },
    initialState: { handsPlayed: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'six_shooter');
      const hands = equip?.state.handsPlayed ?? 0;
      const remaining = 6 - (hands % 6);
      const hint =
        remaining === 6 && hands > 0
          ? [[mult('x4')], [active('Active!')]]
          : [[mult('x4'), condition(`in ${remaining}`)]];
      return {
        hint,
        tooltip: [[mult('x4'), text(' mult every '), condition('6th'), text(' hand played')]],
      };
    },
  },
  {
    id: 'wild_card',
    name: 'Wild Card',
    cost: 4,
    rarity: 'common',
    effectType: 'RANDOM_MULT',
    effectParams: { min: 0, max: 23 },
    display: (_game, _player) => ({
      hint: [[mult('+0-23'), odds('random')]],
      tooltip: [[mult('+0'), text(' to '), mult('+23'), text(' mult '), odds('random')]],
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
    display: (_game, player) => {
      const debt = player.debtLimit;
      const hint =
        player.economy.balance < 0
          ? [[money(`$${player.economy.balance}`), condition('in debt')]]
          : [[money(`-$${debt} max`), condition('debt limit')]];
      return {
        hint,
        tooltip: [
          [
            text('Go up to '),
            money('$20'),
            text(' in debt. When Charles Whitlock (Banker) sells this item, his debt is wiped clean.'),
          ],
        ],
      };
    },
  },
  {
    id: 'snake_eyes',
    name: 'Snake Eyes',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'PIP_SUPPLY_CHANCE',
    effectParams: { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } },
    display: (_game, player) => {
      const p = { pip: 1, chance: [1, 4], professionOverrides: { merchant: { chance: [1, 2] } } };
      const hint = [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('supply per 1')]];
      return {
        hint,
        tooltip: [
          [
            odds('1 in 4'),
            text(' chance to get a supply card when a 1 is scored. Abigail Turner (Merchant) has a '),
            odds('1 in 2'),
            text(' chance.'),
          ],
        ],
      };
    },
  },
  {
    id: 'coupon_book',
    name: 'Coupon Book',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'FREE_SHOP_REROLL',
    effectParams: { value: 1 },
    display: (game, player) => {
      const totalFreeRerolls = player.equipment.reduce((sum, equip) => {
        if (equip.def.effectType !== 'FREE_SHOP_REROLL') return sum;
        const value = (equip.def.effectParams as { value?: number }).value ?? 0;
        return sum + value;
      }, 0);
      const freeRerollsRemaining = Math.max(0, totalFreeRerolls - player.shopRerollCount);
      const isActive = game === null && freeRerollsRemaining > 0;
      return ({
        hint: isActive ? [[active(`free reroll`)]] : [[inactive('used')]],
        tooltip: [[text('1 free reroll per shop visit')]],
      });
    },
  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'SCORED_RETRIGGER_FINAL_DAY',
    effectParams: {},
    display: (game, _player) => ({
      hint:
        game && game.state.day >= game.config.maxDays
          ? [[retrigger('Played'), active('Final day!')]]
          : [[retrigger('Played'), condition('final day')], [inactive('Inactive')]],
      tooltip: [[text('Retrigger all played dice on final day of round')]],
    }),
  },
  {
    id: 'lucky_find',
    name: 'Lucky Find',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    effectType: 'SOLO_FIRST_DAY_ENHANCE',
    effectParams: {},
    display: (game, _player) => ({
      hint:
        game && game.state.day === 1 && game.state.selectedForScore?.length === 1
          ? [[active('Enhancing!')]]
          : [[condition('Solo first day'), inactive('Inactive')]],
      tooltip: [[text('If one die is scored alone on first day, add a random enhancement')]],
    }),
  },
  {
    id: 'iron_furnace',
    name: 'Iron Furnace',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',
    effectType: 'ENHANCEMENT_COUNT_XMULT',
    effectParams: { enhancement: 'steel', value: 0.2 },
    display: (_game, player) => {
      const count = player.dice.filter((d) => d.enhancement === 'steel').length;
      const xm = 1 + count * 0.2;
      const hint =
        count > 0
          ? [[mult(`x${xm.toFixed(1)}`), condition(`${count} steel`)]]
          : [[mult('x0.2'), condition('per steel')], [inactive('None')]];
      return {
        hint,
        tooltip: [[mult('x0.2'), text(' mult for each steel die in collection')]],
      };
    },
    unlockCondition: unlockByEnhancement('steel'),
  },
  {
    id: 'rainy_day_fund',
    name: 'Rainy Day Fund',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'END_ROUND_MONEY_PER_REROLL',
    effectParams: { value: 1 },
    display: (_game, _player) => ({
      hint: [[money('$1'), condition('per unused reroll')]],
      tooltip: [[money('$1'), text(' per unused re-roll at end of round')]],
    }),
  },
  {
    id: 'one_eyed_jack',
    name: 'One-Eyed Jack',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'PIP_RETRIGGER',
    effectParams: { pip: 1 },
    display: (_game, _player) => ({
      hint: [[retrigger('Played 1s')]],
      tooltip: [[text('Retrigger each played 1')]],
    }),
  },
  {
    id: 'gold_pan',
    name: 'Gold Pan',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'ENHANCED_SCORE_MONEY',
    effectParams: { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } },
    display: (_game, player) => {
      const p = { chance: [1, 2], value: 2, professionOverrides: { prospector: { chance: [1, 1] } } };
      const chance = resolveChance(p, player.profession?.id);
      const hint =
        chance[0] >= chance[1]
          ? [[money('$2'), oddsDisplay([1, 1], player), condition('enhanced scored')]]
          : [[money('$2'), oddsDisplay(chance, player), condition('enhanced scored')]];
      return {
        hint,
        tooltip: [
          [
            odds('1 in 2'),
            text(' chance to give '),
            money('$2'),
            text(' when an enhanced die scores. Davis Holler (Prospector) has a guaranteed chance.'),
          ],
        ],
      };
    },
    unlockCondition: unlockAnyEnhanced,
  }, // ─── Phase 4 Items ───
  {
    id: 'trail_journal',
    name: 'Trail Journal',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'HAND_TIMES_PLAYED_MULT',
    effectParams: {},
    display: (game, player) => {
      const handType = game?.state.currentHandType;
      const hint = handType
        ? [[mult(`+${player.getHandStats(handType).timesPlayed}`), condition(HAND_NAMES[handType])]]
        : [[mult('+?'), condition('times played')]];
      return {
        hint,
        tooltip: [[text('Adds the number of times the hand has been played this trip as '), mult('mult')]],
      };
    },
  },
  {
    id: 'marked',
    name: 'Marked',
    cardTemplate: 'marked',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'MARKED_NO_SIX_MULT',
    effectParams: { multPerHand: 1, professionOverrides: { demon_hunter: { multPerHand: 2 } } },
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'marked');
      const m = equip?.state.mult ?? 0;
      const hint = [[mult(`+${m}`), condition('no 6s')]];
      return {
        hint,
        tooltip: [
          [
            mult('+1'),
            text(
              ' mult per hand played without scoring a 6. Scoring a 6 resets mult to 0. Isaac Granger (Demon Hunter) gets ',
            ),
            mult('+2'),
            text(' per hand.'),
          ],
        ],
      };
    },
  },
  {
    id: 'surveyors_transit',
    name: "Surveyor's Transit",
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'HAND_UPGRADE_CHANCE',
    effectParams: { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } },
    display: (_game, player) => {
      const p = { chance: [1, 4], professionOverrides: { surveyor: { chance: [1, 2] } } };
      const hint = [[oddsDisplay(resolveChance(p, player.profession?.id), player), condition('upgrade hand')]];
      return {
        hint,
        tooltip: [
          [
            odds('1 in 4'),
            text(' chance to upgrade trail knowledge of hand type played. '),
            odds('1 in 2'),
            text(' chance if used by Elias Mercer (Surveyor).'),
          ],
        ],
      };
    },
  },
  {
    id: 'guide_lantern',
    name: 'Guide Lantern',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'TRAIL_GUIDE_XMULT',
    effectParams: { value: 0.1, professionOverrides: { scout: { value: 0.2 } } },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'guide_lantern');
      const xm = equip?.state.xMult ?? 1;
      const gain = resolveEffectParam<number>(
        equip?.def.effectParams ?? { value: 0.1 },
        'value',
        player.profession?.id,
      );
      const hint =
        xm > 1 ? [[mult(`x${xm.toFixed(1)}`)]] : [[mult(`x${gain}`), condition('per guide used')], [inactive('None')]];
      return {
        hint,
        tooltip: [
          [
            text('Gain '),
            mult('x0.1'),
            text(' mult for every trail guide used. Caleb Winters (Scout) gains '),
            mult('x0.2'),
            text(' mult for every trail guide used.'),
          ],
        ],
      };
    },
  },
  {
    id: 'steam_engine',
    name: 'Steam Engine',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'STATEFUL_ADD_MILES',
    effectParams: { decayPerHand: 5 },
    initialState: { miles: 100 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'steam_engine');
      const m = equip?.state.miles ?? 100;
      const hint = m > 0 ? [[miles(`+${m}`)]] : [[inactive('+0 miles')]];
      return {
        hint,
        tooltip: [[text('Gains '), miles('+100'), text(' miles. '), miles('-5'), text(' miles per hand played.')]],
      };
    },
  },
  {
    id: 'bloodline',
    name: 'Bloodline',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    effectType: 'FIRST_DAY_SOLO_COPY',
    effectParams: {},
    display: (game, _player) => ({
      hint:
        game && game.state.day === 1 && game.state.selectedForScore?.length === 1
          ? [[active('Copying!')]]
          : [[condition('Solo first day')], [inactive('Inactive')]],
      tooltip: [[text('If first day of round only scores one die, add a permanent copy to your collection')]],
    }),
  },
  {
    id: 'open_palm',
    name: 'Open Palm',
    cardTemplate: 'white-text-black-outline',
    cost: 3,
    rarity: 'common',
    effectType: 'ALL_DICE_SCORE',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('All dice score')]],
      tooltip: [[text('All dice count when scoring')]],
    }),
  },
  {
    id: 'hellfire_round',
    name: 'Hellfire Round',
    cardTemplate: 'hellfire',
    cost: 6,
    rarity: 'rare',
    effectType: 'FIRST_HAND_ENHANCED_SIX',
    effectParams: {},
    display: (game, _player) => ({
      hint:
        game && game.state.day === 1
          ? [[condition('First hand'), active('Ready')]]
          : [[condition('First hand'), inactive('Inactive')]],
      tooltip: [[text('If first hand of round is an enhanced 6, destroy it and gain a Frontier Encounter card')]],
    }),
    unlockCondition: unlockAnyEnhanced,
  },
  {
    id: 'cowboy_boots',
    name: 'Cowboy Boots',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'PERMANENT_DIE_MILES_GAIN',
    effectParams: { value: 5 },
    display: (_game, _player) => ({
      hint: [[miles('+5'), condition('per die (permanent)')]],
      tooltip: [[text('Every played die permanently gains '), miles('+5'), text(' miles when scored')]],
    }),
  },
  {
    id: 'trail_tax',
    name: 'Trail Tax',
    cost: 4,
    rarity: 'common',
    modifierImmunity: ['perishable'],
    effectType: 'TRAIL_TAX',
    effectParams: { multPerDay: 2, multLostPerReroll: 1 },
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'trail_tax');
      const m = equip?.state.mult ?? 0;
      const hint = [[mult(`+${m}`)]];
      return {
        hint,
        tooltip: [[mult('+2'), text(' mult per day travelled, '), mult('-1'), text(' mult per re-roll used')]],
      };
    },
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
      const amount = resolveEffectParam<number>(
        equip?.def.effectParams ?? { value: 4 },
        'value',
        player.profession?.id,
      );
      const hint = [[money(`$${amount}`), condition(HAND_NAMES[handType] ?? '?')]];
      return {
        hint,
        tooltip: [[text('Earn '), money(`$${amount}`), text(' when hand is '), condition(HAND_NAMES[handType] ?? '?')]],
      };
    },
  }, // ─── Phase 5 Items ───
  {
    id: 'nitro',
    name: 'Nitro',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'rare',
    modifierImmunity: ['cursed'],
    effectType: 'XMULT_RISKY',
    effectParams: { value: 3, destroyChance: [1, 1000] },
    display: (_game, player) => {
      const hint = [[mult('x3')], [oddsDisplay([1, 1000], player), text('self-destruct')]];
      return {
        hint,
        tooltip: [
          [
            mult('x3'),
            text(' mult. '),
            oddsDisplay([1, 1000], player),
            text(' chance to be destroyed at end of round.'),
          ],
        ],
      };
    },
    unlockCondition: unlockNitro,
  },
  {
    id: 'repeat_offender',
    name: 'Repeat Offender',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'REPEAT_HAND_XMULT',
    effectParams: { value: 3 },
    display: (game, _player) => ({
      hint:
        game &&
        game.state.currentHandType &&
        game.state.handHistory.filter((h) => h === game.state.currentHandType).length > 1
          ? [[mult('x3')], [active('Repeat!')]]
          : [[mult('x3'), condition('repeat hand')]],
      tooltip: [[mult('x3'), text(' mult if played hand has already been played this round')]],
    }),
  },
  {
    id: 'tight_fist',
    name: 'Tight Fist',
    cardTemplate: 'black-text-white-outline-noborder',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'STATEFUL_ADD_MULT',
    effectParams: { gainOnPackSkip: 3 },
    initialState: { mult: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'tight_fist');
      const m = equip?.state.mult ?? 0;
      const hint = m > 0 ? [[mult(`+${m}`)]] : [[mult('+3'), condition('per pack skipped')]];
      return {
        hint,
        tooltip: [[text('Gains '), mult('+3'), text(' mult when any booster pack is skipped')]],
      };
    },
  },
  {
    id: 'haunted_totem',
    name: 'Haunted Totem',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'ROUND_START_XMULT_DESTROY',
    effectParams: { value: 0.5 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'haunted_totem');
      const xm = equip?.state.xMult ?? 1;
      const hint = xm > 1 ? [[mult(`x${xm.toFixed(1)}`)]] : [[mult('x0.5'), condition('per round start')]];
      return {
        hint,
        tooltip: [
          [
            text('Gains '),
            mult('x0.5'),
            text(' mult when round starts (not boss rounds). Destroys one random equipment.'),
          ],
        ],
      };
    },
  },
  {
    id: 'square_dance',
    name: 'Square Dance',
    cardTemplate: 'black-text-white-outline',
    cost: 4,
    rarity: 'common',
    modifierImmunity: ['perishable'],
    effectType: 'EXACT_DICE_COUNT_MILES',
    effectParams: { count: 4, value: 4 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'square_dance');
      const m = equip?.state.miles ?? 0;
      const hint =
        m > 0 ? [[miles(`+${m}`), condition('4 dice played')]] : [[miles('+4')], [condition('when 4 dice played')]];
      return {
        hint,
        tooltip: [[text('Gains '), miles('+4'), text(' miles if played hand has exactly '), condition('4 dice')]],
      };
    },
  },
  {
    id: 'junk_dealer',
    name: 'Junk Dealer',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ROUND_START_CREATE_EQUIPMENT',
    effectParams: { count: 2, rarity: 'common' },
    display: (_game, _player) => ({
      hint: [[text('2 common equip')], [condition('per round')]],
      tooltip: [[text('When round starts, create 2 common pieces of equipment')]],
    }),
  },
  {
    id: 'new_blood',
    name: 'New Blood',
    cardTemplate: 'black-text-white-outline',
    cost: 7,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'STATEFUL_XMULT',
    effectParams: { gainOnDiceAdded: 0.25 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'new_blood');
      const xm = equip?.state.xMult ?? 1;
      const hint = xm > 1 ? [[mult(`x${xm.toFixed(1)}`)]] : [[mult('x0.25'), condition('per new dice')]];
      return {
        hint,
        tooltip: [[text('Gains '), mult('x0.25'), text(' mult for every new dice added to collection')]],
      };
    },
  },
  {
    id: 'emergency_supplies',
    name: 'Emergency Supplies',
    cardTemplate: 'black-text',
    cost: 8,
    rarity: 'uncommon',
    effectType: 'LOW_MONEY_SUPPLY',
    effectParams: { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } },
    display: (_game, player) => {
      const p = { threshold: 4, professionOverrides: { doctor: { threshold: 8 } } };
      const threshold = resolveEffectParam<number>(p, 'threshold', player.profession?.id);
      const hint =
        player.economy.balance <= threshold
          ? [[text('Supply card!'), active('Active')]]
          : [[text('Supply card'), condition(`≤$${threshold}`)]];
      return {
        hint,
        tooltip: [
          [
            text('Create a random supply card if hand is played with '),
            money('$4'),
            text(' or less. Dr. Eleanor Sykes (Doctor) gets a supply card if hand is played with '),
            money('$8'),
            text(' or less.'),
          ],
        ],
      };
    },
  },
  {
    id: 'railroad_bonds',
    name: 'Railroad Bonds',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'END_ROUND_MONEY_SCALING',
    effectParams: { base: 1, perBoss: 2 },
    initialState: { bossesDefeated: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'railroad_bonds');
      const bossesDefeated = (equip?.state?.bossesDefeated as number) ?? 0;
      const total = 1 + bossesDefeated * 2;
      const hint = [[money(`$${total}`), condition('end of round')]];
      return {
        hint,
        tooltip: [
          [
            text('Earn '),
            money('$1'),
            text(' at end of round, increased by '),
            money('$2'),
            text(' for every boss defeated'),
          ],
        ],
      };
    },
  },
  {
    id: 'leftovers',
    name: 'Leftovers',
    cardTemplate: 'black-text-white-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'PACK_OPEN_SUPPLY_CHANCE',
    effectParams: { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } },
    display: (_game, player) => {
      const p = { chance: [1, 2], professionOverrides: { cook: { chance: [1, 1] } } };
      const chance = resolveChance(p, player.profession?.id);
      const hint = [[oddsDisplay(chance, player), text('supply'), condition('on pack open')]];
      return {
        hint,
        tooltip: [
          [
            odds('1 in 2'),
            text(' chance to gain a supply card when opening a booster pack. Martha Delaney (Cook) has a '),
            odds('1 in 1'),
            text(' chance.'),
          ],
        ],
      };
    },
  },
  {
    id: 'campfire_stories',
    name: 'Campfire Stories',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'SUPPLY_USED_MULT',
    effectParams: { value: 1 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'campfire_stories');
      const m = equip?.state.mult ?? 0;
      const hint = m > 0 ? [[mult(`+${m}`)]] : [[mult('+1'), condition('per supply used')]];
      return {
        hint,
        tooltip: [[mult('+1'), text(' mult per supply card used this journey')]],
      };
    },
  },
  {
    id: 'quarry_mine',
    name: 'Quarry Mine',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ENHANCEMENT_COUNT_MILES',
    effectParams: { enhancement: 'stone', value: 25 },
    display: (_game, player) => {
      const count = player.dice.filter((d) => d.enhancement === 'stone').length;
      const total = count * 25;
      const hint =
        count > 0 ? [[miles(`+${total}`), condition(`${count} stone`)]] : [[miles('+25'), condition('per stone die')]];
      return {
        hint,
        tooltip: [[miles('+25'), text(' miles for each stone die in collection')]],
      };
    },
    unlockCondition: unlockByEnhancement('stone'),
  },
  {
    id: 'antique_revolver',
    name: 'Antique Revolver',
    cardTemplate: 'white-text',
    cost: 4,
    rarity: 'common',
    effectType: 'ROUND_START_SELL_VALUE',
    effectParams: { value: 3 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'antique_revolver');
      const sv = equip?.sellValue ?? 2;
      const hint = [[money(`$${sv}`), text('sell value')]];
      return {
        hint,
        tooltip: [[text('When round starts, gain '), money('$3'), text(' of sell value to current card')]],
      };
    },
  },
  {
    id: 'hardtack',
    name: 'Hardtack',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ROUND_START_DAYS_NO_REROLLS',
    effectParams: { days: 3 },
    display: (_game, _player) => ({
      hint: [[text('+3 days'), condition('no rerolls')]],
      tooltip: [[text('When round starts, gain '), condition('+3 days'), text(' and lose all rerolls')]],
    }),
  },
  {
    id: 'manifest_destiny',
    name: 'Manifest Destiny',
    cardTemplate: 'black-text-white-outline',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'HAND_MILES_GAIN',
    effectParams: { handType: HandType.FIVE_STRAIGHT, value: 15 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const equip = findOwnedEquip(player, 'manifest_destiny');
      const m = equip?.state.miles ?? 0;
      const hint =
        m > 0
          ? [[miles(`+${m}`), condition(HAND_NAMES.FIVE_STRAIGHT)]]
          : [[miles('+15'), condition(HAND_NAMES.FIVE_STRAIGHT)]];
      return {
        hint,
        tooltip: [
          [text('Gains '), miles('+15'), text(' miles if hand contains a '), condition(HAND_NAMES.FIVE_STRAIGHT)],
        ],
      };
    },
  }, // ─── Phase 6 Items ───
  {
    id: 'rail_splitter',
    name: 'Rail Splitter',
    cardTemplate: 'black-text-white-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.FOUR_STRAIGHT, value: 8 },
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FOUR_STRAIGHT)
          ? [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [active('Active!')]]
          : [[mult('+8'), condition(HAND_NAMES.FOUR_STRAIGHT)], [inactive('Inactive')]],
      tooltip: [
        [text('If played hand contains a '), condition(HAND_NAMES.FOUR_STRAIGHT), text(' '), mult('+8'), text(' mult')],
      ],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT)
          ? [[mult('+12')], [active('Active!')]]
          : [[mult('+12')], [inactive('Inactive')]],
      tooltip: [[text('If played hand contains '), condition(HAND_NAMES.FIVE_STRAIGHT), mult('+12'), text(' mult')]],
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
    display: (_game, player) => {
      const emptySlots = player.maxEquipmentSlots - player.usedEquipmentSlots;
      const hint =
        emptySlots > 0
          ? [[mult(`x${1 + emptySlots}`), condition(`${emptySlots} empty`)]]
          : [[mult('x1'), condition('no empty slots')], [inactive('Inactive')]];
      return {
        hint,
        tooltip: [[mult('x1'), text(' mult for each empty equipment slot')]],
      };
    },
  },
  {
    id: 'covered_wagon',
    name: 'Covered Wagon',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'ENHANCEMENT_SCORED_MILES',
    effectParams: { enhancement: 'wooden', value: 30 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'covered_wagon');
      const m = equip?.state.miles ?? 0;
      const hint =
        m > 0 ? [[miles(`+${m}`), condition('wooden scored')]] : [[miles('+30'), condition('per wooden scored')]];
      return {
        hint,
        tooltip: [[text('Gains '), miles('+30'), text(' miles for every Wood die scored')]],
      };
    },
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
    display: (_game, player) => ({
      hint: [
        [retrigger('Retrigger', 'xs'), condition('enhanced', "xs")],
        [oddsDisplay([1, 6], player), text('destroy')],
      ],
      tooltip: [
        [
          text('Retrigger all enhanced dice. Enhanced dice have '),
          oddsDisplay([1, 6], player),
          text(' chance of being destroyed, diamond dice '),
          odds('1 in 3'),
          text('.'),
        ],
      ],
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
    display: (_game, _player) => ({
      hint: [[money('+$3'), condition('destroy standard die')]],
      tooltip: [
        [
          text('At start of each round, destroy one standard non-enhanced die. If destroyed, earn '),
          money('$3'),
          text('.'),
        ],
      ],
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
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'shortcut_trail');
      const skipped = equip?.state.roundsSkipped ?? 0;
      const xm = 1 + skipped * 0.25;
      const hint =
        skipped > 0
          ? [[mult(`x${xm.toFixed(2)}`), condition(`${skipped} skipped`)]]
          : [[mult('x0.25'), condition('per round skipped')], [inactive('None')]];
      return {
        hint,
        tooltip: [[mult('x0.25'), text(' mult for each round of journey skipped')]],
      };
    },
  },
  {
    id: 'quick_draw',
    name: 'Quick Draw',
    cardTemplate: 'white-text-black-outline',
    cost: 4,
    rarity: 'common',
    effectType: 'FIRST_DICE_RETRIGGER',
    effectParams: { value: 2 },
    display: (_game, _player) => ({
      hint: [[retrigger('First'), condition('×2')]],
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
    display: (_game, _player) => ({
      hint: [[retrigger('Last'), condition('×1')]],
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
    display: (_game, _player) => ({
      hint: [[money('+$1'), condition('per lucky scored')]],
      tooltip: [[text('Played lucky dice earn '), money('$1'), text(' when scored')]],
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
    display: (_game, player) => ({
      hint: [[mult('x1.5'), oddsDisplay([1, 2], player), condition('per bone')]],
      tooltip: [
        [
          text('Played bone dice have '),
          oddsDisplay([1, 2], player),
          text(' chance to give '),
          mult('x1.5'),
          text(' mult'),
        ],
      ],
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
    display: (_game, _player) => ({
      hint: [[miles('+50'), condition('per wooden')]],
      tooltip: [[text('Played wooden dice give '), miles('+50'), text(' miles when scored')]],
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
    display: (_game, _player) => ({
      hint: [[mult('+7'), condition('per steel')]],
      tooltip: [[text('Played iron dice give '), mult('+7'), text(' mult when scored')]],
    }),
    unlockCondition: unlockByEnhancement('steel'),
  },
  {
    id: 'diamond_coffin',
    name: 'Diamond Coffin',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'DIAMOND_DESTROYED_XMULT',
    effectParams: { value: 0.75 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'diamond_coffin');
      const xm = equip?.state.xMult ?? 1;
      const hint =
        xm > 1
          ? [[mult(`x${xm.toFixed(2)}`)]]
          : [[mult('x0.75'), condition('per diamond destroyed')], [inactive('None')]];
      return {
        hint,
        tooltip: [[text('Item gains '), mult('x0.75'), text(' mult for every diamond die that is destroyed')]],
      };
    },
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
    display: (_game, _player) => ({
      hint: [[active('Duplicates allowed')]],
      tooltip: [
        [
          text(
            'Allows items/trail guides/supplies/frontier encounter cards to appear multiple times in the shop and packs',
          ),
        ],
      ],
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
    display: (game, _player) => {
      const types = game?.state.selectedForScore?.length
        ? new Set(game.state.selectedForScore.filter((d) => d.enhancement !== null).map((d) => d.enhancement))
        : null;
      const hint =
        types && types.size >= 2
          ? [[mult(`x${types.size}`), active(`${types.size} types`)]]
          : [[mult('x1')], [condition('per enhancement')]];
      return {
        hint,
        tooltip: [
          [
            mult('x2'),
            text(' if 2 different enhanced dice score, '),
            mult('x3'),
            text(' if 3, '),
            mult('x4'),
            text(' if 4, '),
            mult('x5'),
            text(' if 5 different'),
          ],
        ],
      };
    },
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
    display: (_game, _player) => ({
      hint: [[odds('x2'), text('all listed odds')]],
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
      const hint =
        idx >= 0 && target !== 'Nothing to copy' && target !== 'Incompatible'
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
      const hint =
        idx > 0 && target !== 'Incompatible'
          ? [[text('Copying')], [active(target, "xs")]]
          : idx > 0
            ? [[inactive('Incompatible')]]
            : [[inactive('Nothing to copy')]];
      return {
        hint,
        tooltip: [
          [text('Copies the leftmost ability: ')],
          [target === 'Incompatible' ? inactive(target) : active(target)],
        ],
      };
    },
  }, // ─── Phase 9 Items ───
  {
    id: 'five_mile_marker',
    name: '5 Mile Marker',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'PIP_SCORED_MILES_GAIN',
    effectParams: { pip: 5, value: 5 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'five_mile_marker');
      const m = equip?.state.miles ?? 0;
      const hint = m > 0 ? [[miles(`+${m}`), condition('5s scored')]] : [[miles('+5'), condition('per 5 scored')]];
      return {
        hint,
        tooltip: [[text('Gains '), miles('+5'), text(' miles each time a '), condition('5'), text(' pip is scored')]],
      };
    },
  },
  {
    id: 'trail_backpack',
    name: 'Trail Backpack',
    cardTemplate: 'black-text-white-outline',
    cost: 7,
    rarity: 'uncommon',
    effectType: 'TRAIL_BACKPACK',
    effectParams: { rerollsBonus: 2, rollSizePenalty: 1 },
    display: (_game, _player) => ({
      hint: [[active('+2 rerolls')], [condition('-1 roll size')]],
      tooltip: [[condition('+2 re-rolls'), text(' per day, '), condition('-1 dice'), text(' when rolling')]],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.PAIR)
          ? [[mult('x2'), condition(HAND_NAMES.PAIR)], [active('Active!')]]
          : [[mult('x2'), condition(HAND_NAMES.PAIR)]],
      tooltip: [[mult('x2'), text(' mult if hand contains '), condition(HAND_NAMES.PAIR)]],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND)
          ? [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]]
          : [[mult('x3'), condition(HAND_NAMES.THREE_OF_A_KIND)]],
      tooltip: [[mult('x3'), text(' mult if hand contains '), condition(HAND_NAMES.THREE_OF_A_KIND)]],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FOUR_OF_A_KIND)
          ? [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)], [active('Active!')]]
          : [[mult('x4'), condition(HAND_NAMES.FOUR_OF_A_KIND)]],
      tooltip: [[mult('x4'), text(' mult if hand contains '), condition(HAND_NAMES.FOUR_OF_A_KIND)]],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FIVE_OF_A_KIND)
          ? [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)], [active('Active!')]]
          : [[mult('x5'), condition(HAND_NAMES.FIVE_OF_A_KIND)]],
      tooltip: [[mult('x5'), text(' mult if hand contains '), condition(HAND_NAMES.FIVE_OF_A_KIND)]],
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
    display: (game, _player) => ({
      hint:
        game && handContains(game.state.currentHandType, HandType.FIVE_STRAIGHT)
          ? [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)], [active('Active!')]]
          : [[mult('x3'), condition(HAND_NAMES.FIVE_STRAIGHT)]],
      tooltip: [[mult('x3'), text(' mult if hand contains '), condition(HAND_NAMES.FIVE_STRAIGHT)]],
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
    display: (_game, _player) => ({
      hint: [[miles('+250')], [condition('-2 rerolls')]],
      tooltip: [[miles('+250'), text(' miles, '), condition('-2 re-rolls')]],
    }),
  },
  {
    id: 'phantom_wagon',
    name: 'Phantom Wagon',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    modifierImmunity: ['cursed'],
    effectType: 'PHANTOM_WAGON',
    effectParams: { roundsNeeded: 2 },
    initialState: { roundsHeld: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'phantom_wagon');
      const held = equip?.state.roundsHeld ?? 0;
      const needed = 2;
      const hint =
        held >= needed
          ? [[active('Ready to sell!')], [text('Duplicates random item')]]
          : [[condition(`${held}/${needed} rounds`)], [text('Sell to duplicate')]];
      return {
        hint,
        tooltip: [[text('After 2 rounds, sell this card to duplicate a random item (removes ghost aura)')]],
      };
    },
  },
  {
    id: 'trail_almanac',
    name: 'Trail Almanac',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'TRAIL_ALMANAC_MONEY',
    effectParams: { value: 1 },
    display: (_game, player) => {
      let discoveredCount = 0;
      for (const [, stats] of player.handStats) {
        if (stats.level > 1) discoveredCount++;
      }
      return {
        hint: [[money(`+$${discoveredCount}`), condition('trail guides')]],
        tooltip: [[money('$1'), text(' at end of round for every type of trail guide discovered')]],
      };
    },
  },
  {
    id: 'blessed_herd',
    name: 'Blessed Herd',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    effectType: 'ENHANCED_DICE_COUNT_XMULT',
    effectParams: { threshold: 16, value: 3 },
    display: (_game, player) => {
      const enhCount = player.dice.filter((d) => d.enhancement !== null).length;
      const hint =
        enhCount >= 16
          ? [[mult('x3')], [active(`${enhCount} enhanced`)]]
          : [[mult('x3'), condition(`${enhCount}/16 enhanced`)]];
      return {
        hint,
        tooltip: [
          [mult('x3'), text(' mult if you have at least '), condition('16'), text(' enhanced dice in collection')],
        ],
      };
    },
  },
  {
    id: 'supply_drop',
    name: 'Supply Drop',
    cardTemplate: 'white-text-black-outline',
    cost: 6,
    rarity: 'uncommon',
    effectType: 'ROUND_START_SUPPLY',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[active('Supply at round start')]],
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
    display: (_game, _player) => ({
      hint: [[active('Trail guides free')]],
      tooltip: [[text('All trail guides and trail guide packs are free in the shop')]],
    }),
  },
  {
    id: 'graverobber',
    name: 'Graverobber',
    cardTemplate: 'white-text',
    cost: 7,
    rarity: 'uncommon',
    modifierImmunity: ['perishable'],
    effectType: 'GRAVEROBBER_XMULT',
    effectParams: { value: 0.1 },
    initialState: { xMult: 1 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'graverobber');
      const xm = equip?.state.xMult ?? 1;
      const hint = xm > 1 ? [[mult(`x${xm.toFixed(1)}`)]] : [[mult('x0.1'), condition('per enhanced scored')]];
      return {
        hint,
        tooltip: [[text('Gains '), mult('x0.1'), text(' mult per scored enhanced dice, removes dice enhancement')]],
      };
    },
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
    display: (_game, _player) => ({
      hint: [[active('+1 hand size')]],
      tooltip: [[active('+1 hand size')]],
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
    display: (_game, _player) => ({
      hint: [[active('+2 hand size')], [condition('-1 day')]],
      tooltip: [[active('+2 hand size'), text(', '), condition('-1 day'), text(' per round')]],
    }),
  },
  {
    id: 'flour_sack',
    name: 'Flour Sack',
    cardTemplate: 'white-text',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'FLOUR_SACK',
    effectParams: { decayPerRound: 1, professionOverrides: { farmer: { decayPerRound: 0 } } },
    initialState: { handSizeBonus: 5 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'flour_sack');
      const bonus = equip?.state.handSizeBonus ?? 5;
      const decay = resolveEffectParam<number>(
        equip?.def.effectParams ?? { decayPerRound: 1 },
        'decayPerRound',
        player.profession?.id,
      );
      let hint;
      if (bonus > 0) {
        hint =
          decay === 0
            ? [[active(`+${bonus} hand size`), condition('no decay')]]
            : [[active(`+${bonus} hand size`), condition(`-${decay}/round`)]];
      } else {
        hint = [[inactive('Empty')]];
      }
      return {
        hint,
        tooltip: [
          [
            active('+5 hand size'),
            text(', reduces by '),
            condition('1 each round'),
            text('. Hank Caldwell (Farmer) keeps the full '),
            active('+5'),
            text(' with no decay.'),
          ],
        ],
      };
    },
  }, // ─── Phase 10 Items ───
  {
    id: 'oil_baron',
    name: 'Oil Baron',
    cardTemplate: 'white-text-black-outline',
    cost: 7,
    rarity: 'uncommon',
    effectType: 'MULT_PER_MONEY_CHUNK',
    effectParams: { chunk: 5, value: 2 },
    display: (_game, player) => {
      const multGain = Math.floor(player.economy.balance / 5) * 2;
      const hint =
        multGain > 0 ? [[mult(`+${multGain}`), condition('per $5 held')]] : [[mult('+2'), condition('per $5 held')]];
      return {
        hint,
        tooltip: [[mult('+2'), text(' mult for every '), money('$5'), text(' you have')]],
      };
    },
  },
  {
    id: 'trailblazer',
    name: 'Trailblazer',
    cardTemplate: 'white-text',
    cost: 8,
    rarity: 'rare',
    modifierImmunity: ['perishable'],
    effectType: 'TRAILBLAZER_XMULT',
    effectParams: { value: 0.2 },
    initialState: { streak: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'trailblazer');
      const streak = equip?.state.streak ?? 0;
      const hint =
        streak > 0
          ? [[mult(`x${(1 + streak * 0.2).toFixed(1)}`), condition(`${streak} hands`)], [active('Active!')]]
          : [[mult('x0.2'), condition('per hand off-meta')], [inactive('None')]];
      return {
        hint,
        tooltip: [
          [
            text('Earns '),
            mult('x0.2'),
            text(' mult per consecutive hand played without playing your most played hand'),
          ],
        ],
      };
    },
  },
  {
    id: 'golden_spike',
    name: 'Golden Spike',
    cardTemplate: 'black-text',
    cost: 7,
    rarity: 'uncommon',
    effectType: 'SCORED_GOLD_CHANCE',
    effectParams: { chance: [1, 4] },
    display: (_game, player) => ({
      hint: [[oddsDisplay([1, 4], player), condition('per scored die')]],
      tooltip: [
        [text('All scored dice have a '), oddsDisplay([1, 4], player), text(' chance to turn into a gold dice')],
      ],
    }),
  },
  {
    id: 'sheriffs_badge',
    name: "Sheriff's Badge",
    cardTemplate: 'black-text',
    cost: 5,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'SELL_DISABLE_BOSS',
    effectParams: {},
    display: (_game, _player) => ({
      hint: [[text('Sell to'), condition('disable boss')]],
      tooltip: [[text('Sell this item to disable the current boss effect')]],
    }),
  },
  {
    id: 'bounty_contract',
    name: 'Bounty Contract',
    cardTemplate: 'black-text-white-outline',
    cost: 6,
    rarity: 'uncommon',
    modifierImmunity: ['cursed'],
    effectType: 'SELL_GRANT_TAG',
    effectParams: { tagId: 'tag_twin_wagon' },
    display: (_game, _player) => ({
      hint: [[text('Sell to'), condition('Twin Wagon')]],
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
    display: (_game, _player) => ({
      hint: [[mult('x2'), condition('first 2 scored')]],
      tooltip: [[text('First played '), mult('2'), text(' pip die gives '), mult('x2'), text(' mult when scored')]],
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
    display: (_game, _player) => ({
      hint: [[money('+$1'), condition('sell value each item')]],
      tooltip: [
        [text('At the end of each round add '), money('$1'), text(' of sell value to each piece of equipment')],
      ],
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
    display: (_game, player) => {
      const missing = Math.max(0, player.startingDiceCount - player.dice.length);
      const hint =
        missing > 0
          ? [[mult(`+${missing * 10}`), condition(`${missing} dice lost`)]]
          : [[mult('+10'), condition('per missing die')], [inactive('Full herd')]];
      return {
        hint,
        tooltip: [[mult('+10'), text(" mult for each dice below the collection's starting size")]],
      };
    },
  },
  {
    id: 'savings_account',
    name: 'Savings Account',
    cardTemplate: 'white-text',
    cost: 5,
    rarity: 'uncommon',
    effectType: 'SAVINGS_ACCOUNT_INTEREST',
    effectParams: { perChunk: 5, value: 1, accountantBonus: 1 },
    display: (_game, player) => {
      const perChunk = Math.floor(Math.min(player.economy.balance, player.interestCap) / 5);
      const isAccountant = player.profession?.id === 'accountant';
      const perDollar = isAccountant ? 2 : 1;
      const hint =
        perChunk > 0
          ? [[money(`+$${perChunk * perDollar}`), condition('extra interest')]]
          : [[money('+$1'), condition('per $5 held')]];
      return {
        hint,
        tooltip: [
          [
            text('Earn an extra '),
            money('$1'),
            text(' of interest for every '),
            money('$5'),
            text(' you have at end of round. Henry Pritchard (Accountant) earns an additional '),
            money('$1'),
            text(' for every '),
            money('$5'),
            text('.'),
          ],
        ],
      };
    },
  },
  {
    id: 'six_feet_under',
    name: 'Six Feet Under',
    cardTemplate: 'white-text-black-outline',
    cost: 5,
    rarity: 'common',
    modifierImmunity: ['perishable'],
    effectType: 'DICE_DESTROYED_MILES_GAIN',
    effectParams: { value: 66 },
    initialState: { miles: 0 },
    display: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'six_feet_under');
      const m = equip?.state.miles ?? 0;
      return {
        hint: [[miles(`+${m}`)]],
        tooltip: [[text('Item gains '), miles('+66'), text(' miles for every dice that is destroyed')]],
      };
    },
  },
  {
    id: 'eight_second_ride',
    name: 'Eight Second Ride',
    cardTemplate: 'white-text-black-outline',
    cost: 8,
    rarity: 'rare',
    effectType: 'CONSECUTIVE_PIP_XMULT',
    effectParams: { pip: 8, increment: 0.5 },
    display: (_game, _player) => ({
      hint: [[mult('x1→x3+'), condition('consecutive 8s')]],
      tooltip: [
        [
          text('Each consecutive scored '),
          condition('8'),
          text(' gains '),
          mult('+0.5'),
          text(' xMult over the previous ('),
          mult('x1'),
          text(', '),
          mult('x1.5'),
          text(', '),
          mult('x2'),
          text(', '),
          mult('x2.5'),
          text(', '),
          mult('x3'),
          text('...)'),
        ],
      ],
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
    display: (_game, _player) => ({
      hint: [[active('Loaded = all pips')]],
      tooltip: [[text('Loaded dice are considered all pip values for equipment effects')]],
    }),
    unlockCondition: unlockByEnhancement('loaded'),
  },
];

export default items;
