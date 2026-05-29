// ─── Item display context (No Phaser imports) ───
// Run/round slices for items.ts display() and Phaser card hints.

import type { EquipmentInstance } from './ItemsSystem';
import type { HandType } from './types';
import { getRunState } from './store/runStore';
import { getRoundState } from './store/roundStore';
import { resolveEquipmentList } from './store/resolve';
import { selectEquipmentHintRoundContext } from './store/selectors/roundSelectors';
import { selectHandStats, selectUsedEquipmentSlots } from './store/selectors/runSelectors';
import { selectDebtLimit } from './store/economy';
import type { ItemDisplayContext, RoundHintContext } from './displayContextTypes';

export type { ItemDisplayContext, RoundHintContext } from './displayContextTypes';

export function getItemDisplayContext(state = getRunState()): ItemDisplayContext {
  return {
    balance: state.balance,
    equipment: resolveEquipmentList(state) as ItemDisplayContext['equipment'],
    dice: state.dice,
    lastUsedConsumableId: state.lastUsedConsumableId,
    handStats: state.handStats,
    purchasedPermits: state.purchasedPermits,
    professionId: state.professionId,
    debtLimit: selectDebtLimit(state),
    shopRerollCount: state.shopRerollCount,
    maxEquipmentSlots: state.maxEquipmentSlots,
    usedEquipmentSlots: selectUsedEquipmentSlots(state),
    startingDiceCount: state.startingDiceCount,
    interestCap: state.interestCap,
    supplyCardsUsed: state.supplyCardsUsed,
    getHandStats: (handType: HandType) => selectHandStats(state, handType),
  };
}

export function getRoundHintContext(): RoundHintContext | null {
  return selectEquipmentHintRoundContext(getRoundState()) as RoundHintContext | null;
}

/** Resolved equipment instances for systems that need full EquipmentInstance objects. */
export function getResolvedEquipment(state = getRunState()): EquipmentInstance[] {
  return resolveEquipmentList(state);
}
