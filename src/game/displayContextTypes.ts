// ─── Item display context types (No Phaser imports) ───
// Type-only module for data/items.ts and unlock helpers — no store/resolve imports.

import type { Die, HandStats, HandType, PhaseState } from './types';

/** Minimal equipment shape for item hint display() — compatible with EquipmentInstance. */
export interface DisplayEquipmentRef {
  def: {
    id: string;
    name: string;
    cost: number;
    rarity: string;
    effectType: string;
    effectParams: Record<string, unknown>;
  };
  state: Record<string, number>;
  modifiers: string[];
  sellValue: number;
  perishableRoundsLeft?: number;
}

export interface ItemDisplayContext {
  balance: number;
  equipment: DisplayEquipmentRef[];
  dice: Die[];
  lastUsedConsumableId: string | null;
  handStats: Record<HandType, HandStats>;
  purchasedPermits: string[];
  professionId: string | null;
  debtLimit: number;
  shopRerollCount: number;
  maxEquipmentSlots: number;
  usedEquipmentSlots: number;
  startingDiceCount: number;
  interestCap: number;
  supplyCardsUsed: number;
  supplyCardUseCounts: Record<string, number>;
  equipmentObtainedIds: string[];
  getHandStats(handType: HandType): HandStats;
}

/** Round slice passed to equipment display() — mirrors selectEquipmentHintRoundContext. */
export interface RoundHintContext {
  phase: PhaseState;
  day: number;
  maxDays: number;
  rerollsRemaining: number;
  currentHandType: HandType | null;
  handHistory: HandType[];
  rolledDice: Die[];
  selectedForScore: Die[];
}
