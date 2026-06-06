// ─── Profession Definitions ───
// Typed profession data following the trail_tags.ts pattern.
// Each profession defines modifiers applied at run start and optional signature equipment.

import type { DiceEnhancement } from '../game/types';

// ─── Types ───

/** Non-null dice enhancement for profession starting pouches */
export type ProfessionStartingEnhancement = Exclude<DiceEnhancement, null>;

export interface ProfessionSpecialEquipment {
  id: string;
  name: string;
  effect: string;
}

/** Starting supply card entry — plain id or id with aura */
export type ProfessionStartingSupplyCard = string | { id: string; aura?: string };

export interface ProfessionModifiers {
  rerolls?: number;
  days?: number;
  startingMoney?: number;
  noInterest?: boolean;
  endOfRoundBonusPerRemaining?: number;
  equipmentSlots?: number;
  handSize?: number;
  supplySlots?: number;
  startingPermits?: string[];
  startingSupplyCards?: ProfessionStartingSupplyCard[];
  frontierInShop?: boolean;
  doubleTagOnBoss?: boolean;
  balanceMilesAndMult?: boolean;
  blindSizeMultiplier?: number;
  ghostMedicineOnBoss?: boolean;
}

export interface ProfessionDef {
  id: string;
  title: string;
  name: string;
  description: string;
  modifiers: ProfessionModifiers;
  startingDice: ProfessionStartingEnhancement[];
  specialEquipment?: ProfessionSpecialEquipment;
}

// ─── Profession Definitions ───

const professions: ProfessionDef[] = [
  {
    id: 'farmer',
    title: 'Farmer',
    name: 'Hank Caldwell',
    description: '+1 reroll per day',
    modifiers: { rerolls: 1 },
    startingDice: ['wooden', 'wooden', 'wooden', 'steel', 'steel'],
    specialEquipment: {
      id: 'flour_sack',
      name: 'Flour Sack',
      effect: 'Keeps +5 hand size with no decay each round (normally decays by 1 each round)',
    },
  },
  {
    id: 'surveyor',
    title: 'Surveyor',
    name: 'Elias Mercer',
    description: '+1 day of travel',
    modifiers: { days: 1 },
    startingDice: ['wooden', 'wooden', 'steel', 'steel', 'stone'],
    specialEquipment: {
      id: 'surveyors_transit',
      name: "Surveyor's Transit",
      effect: '1 in 2 chance to upgrade trail knowledge of hand type played (normally 1 in 4 chance)',
    },
  },
  {
    id: 'banker',
    title: 'Banker',
    name: 'Charles Whitlock',
    description: 'Starts with and extra $10',
    modifiers: { startingMoney: 14 },
    startingDice: ['gold', 'gold', 'gold', 'diamond', 'diamond'],
    specialEquipment: {
      id: 'bank_note',
      name: 'Bank Note',
      effect: 'Selling Bank Note wipes your debt clean',
    },
  },
  {
    id: 'outlaw',
    title: 'Outlaw',
    name: 'Jesse Rawlins',
    description: 'Earns no interest. $1 per remaining day and unused reroll.',
    modifiers: { noInterest: true, endOfRoundBonusPerRemaining: 1 },
    startingDice: ['loaded', 'loaded', 'steel', 'steel', 'bone'],
    specialEquipment: {
      id: 'payday',
      name: 'Payday',
      effect: 'Earn $12 at end of round (normally $4)',
    },
  },
  {
    id: 'merchant',
    title: 'Merchant',
    name: 'Abigail Turner',
    description: '1 extra equipment slot, -1 day of travel',
    modifiers: { equipmentSlots: 1, days: -1 },
    startingDice: ['gold', 'diamond', 'lucky', 'steel', 'wooden'],
    specialEquipment: {
      id: 'snake_eyes',
      name: 'Snake Eyes',
      effect: '1 in 2 chance for a supply card when a 1 is scored (normally 1 in 4 chance)',
    },
  },
  {
    id: 'cook',
    title: 'Cook',
    name: 'Martha Delaney',
    description:
      'Starts with the Camp Merchant permit (Supply cards appear 2x more frequently in the shop) and 2 copies of second helpings supply card',
    modifiers: {
      startingPermits: ['camp_merchant'],
      startingSupplyCards: ['second_helpings', 'second_helpings'],
    },
    startingDice: ['bone', 'bone', 'wooden', 'wooden', 'stone'],
    specialEquipment: {
      id: 'leftovers',
      name: 'Leftovers',
      effect: 'Guaranteed supply card when opening a booster pack (normally 1 in 2 chance)',
    },
  },
  {
    id: 'scout',
    title: 'Scout',
    name: 'Caleb Winters',
    description:
      'Starts with Binoculars permit (Trail guide packs always contain the trail guide for your most played hand), -1 supply slot',
    modifiers: { startingPermits: ['binoculars'], supplySlots: -1 },
    startingDice: ['wooden', 'steel', 'lucky', 'stone', 'bone'],
    specialEquipment: {
      id: 'guide_lantern',
      name: 'Guide Lantern',
      effect: 'Gain x0.2 mult for every trail guide used (normally x0.1 mult)',
    },
  },
  {
    id: 'demon_hunter',
    title: 'Demon Hunter',
    name: 'Isaac Granger',
    description:
      'Frontier Encounter cards appear in shop, start with a Priests Blessing card (Add holy aura to random item, delete all others)',
    modifiers: { frontierInShop: true, startingSupplyCards: ['priests_blessing'] },
    startingDice: ['steel', 'steel', 'steel', 'bone', 'bone'],
    specialEquipment: {
      id: 'marked',
      name: 'Marked',
      effect: '+2 mult per hand played without scoring a 6 (normally +1 mult)',
    },
  },
  {
    id: 'prospector',
    title: 'Prospector',
    name: 'Davis Holler',
    description:
      'Start with permits for Camp Merchant/Trail Cartographer/Supply Wagon (2x supplies/2x trail guides and 1 extra card slot in shop)',
    modifiers: {
      startingPermits: ['camp_merchant', 'trail_cartographer', 'supply_wagon'],
    },
    startingDice: ['gold', 'gold', 'diamond', 'diamond', 'lucky'],
    specialEquipment: {
      id: 'gold_pan',
      name: 'Gold Pan',
      effect: 'Guaranteed $2 when an enhanced die scores (normally 1 in 2 chance)',
    },
  },
  {
    id: 'gambler',
    title: 'Gambler',
    name: 'Thomas "Tommy" Reeve',
    description: 'Start with +2 hand size and -1 equipment slot',
    modifiers: { handSize: 2, equipmentSlots: -1 },
    startingDice: ['lucky', 'lucky', 'lucky', 'loaded', 'loaded'],
    specialEquipment: {
      id: 'lucky_number',
      name: 'Lucky Number',
      effect: 'x2 mult when your lucky number scores (normally x1.5 mult)',
    },
  },
  {
    id: 'hunter',
    title: 'Hunter',
    name: 'Nathan Cole',
    description: 'After each boss gain a Twin Wagon tag (Doubles your next trail tag reward)',
    modifiers: { doubleTagOnBoss: true },
    startingDice: ['bone', 'bone', 'bone', 'steel', 'stone'],
    specialEquipment: {
      id: 'wanted_poster',
      name: 'Wanted Poster',
      effect: 'Earn $8 when the wanted hand is played (normally $4)',
    },
  },
  {
    id: 'accountant',
    title: 'Accountant',
    name: 'Henry Pritchard',
    description: 'Balance miles and mult before calculating. x2 base blind size.',
    modifiers: { balanceMilesAndMult: true, blindSizeMultiplier: 2 },
    startingDice: ['stone', 'stone', 'wooden', 'wooden', 'gold'],
    specialEquipment: {
      id: 'savings_account',
      name: 'Savings Account',
      effect: 'Savings Account bonus ignores the interest cap ($1 per $5 on full balance)',
    },
  },
  {
    id: 'doctor',
    title: 'Doctor',
    name: 'Dr. Eleanor Sykes',
    description:
      'Start with 2 medicine cards with ghost aura, receive 1 free medicine card  with ghost aura after each boss',
    modifiers: {
      startingSupplyCards: [
        { id: 'medicine', aura: 'ghost' },
        { id: 'medicine', aura: 'ghost' },
      ],
      ghostMedicineOnBoss: true,
    },
    startingDice: ['steel', 'steel', 'stone', 'stone', 'bone'],
    specialEquipment: {
      id: 'emergency_supplies',
      name: 'Emergency Supplies',
      effect: 'Free supply card when playing a hand at $8 or less (normally $4 or less)',
    },
  },
  {
    id: 'con_artist',
    title: 'Con Artist',
    name: 'Victor Hale',
    description: '+2 rerolls, -1 hand size',
    modifiers: { rerolls: 2, handSize: -1 },
    startingDice: ['loaded', 'loaded', 'loaded', 'gold', 'diamond'],
    specialEquipment: {
      id: 'card_counter',
      name: 'Card Counter',
      effect: '+4 mult when hand contains two pair (normally +2 mult)',
    },
  },
  {
    id: 'occult_trader',
    title: 'Occult Trader',
    name: 'Vivian Crowe',
    description:
      'Starts with permits for Spiritual Ritual,Sacred Ceremony, and Bargain Bin (Makes aura 4x more likely and 25% off all shop items)',
    modifiers: {
      startingPermits: ['spirit_ritual', 'sacred_ceremony', 'bargain_bin'],
    },
    startingDice: ['bone', 'bone', 'wooden', 'wooden', 'lucky'],
    specialEquipment: {
      id: 'junk_dealer',
      name: 'Junk Dealer',
      effect: 'When round starts, create 2 pieces of equipment up to rare rarity (Normally common)',
    },
  },
  {
    id: 'developer',
    title: 'Developer',
    name: 'Dev Mode',
    description: 'Starts with $999. For testing purposes.',
    modifiers: { startingMoney: 99900 },
    startingDice: ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded', 'diamond', 'stone'],
    specialEquipment: {
      id: 'horseshoe',
      name: 'Horseshoe',
      effect: '+200 mult instead of +4 mult',
    },
  },
];

export default professions;

// ─── Lookup Helpers ───

/** Find a profession definition by ID */
export function getProfessionById(id: string): ProfessionDef | undefined {
  return professions.find((p) => p.id === id);
}
