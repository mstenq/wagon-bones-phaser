// ─── Run economy actions ───

import { canAfford, trySpendBalance, earnBalance } from '../economy';
import { getRunState, runStore } from '../runStore';

export const economyActions = {
  canAfford(amount: number, state = getRunState()): boolean {
    return canAfford(state, amount);
  },

  earn(amount: number): void {
    if (amount === 0) return;
    runStore.setState((s) => ({ balance: earnBalance(s.balance, amount) }));
  },

  spend(amount: number): boolean {
    const state = getRunState();
    const result = trySpendBalance(state, amount);
    if (!result.ok) return false;
    runStore.setState({ balance: result.balance });
    return true;
  },

  setBalance(balance: number): void {
    runStore.setState({ balance });
  },

  trySpend(amount: number): boolean {
    return economyActions.spend(amount);
  },
};
