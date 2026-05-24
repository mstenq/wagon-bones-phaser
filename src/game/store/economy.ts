// ─── Run economy helpers (No Phaser imports) ───
// Pure balance operations on RunState slices.

import type { RunState } from './types';
import { resolveEquipmentList } from './resolve';

export function hasBankNote(state: RunState): boolean {
  return resolveEquipmentList(state).some((e) => e.def.effectType === 'BANK_NOTE');
}

export function selectDebtLimit(state: RunState): number {
  if (!hasBankNote(state)) return 0;
  const note = resolveEquipmentList(state).find((e) => e.def.effectType === 'BANK_NOTE');
  return (note?.def.effectParams.maxDebt as number) ?? 20;
}

export function selectMinBalance(state: RunState): number {
  return -selectDebtLimit(state);
}

export function canAfford(state: RunState, amount: number): boolean {
  return state.balance - amount >= selectMinBalance(state);
}

export function trySpendBalance(state: RunState, amount: number): { ok: true; balance: number } | { ok: false } {
  const minBalance = selectMinBalance(state);
  if (state.balance - amount < minBalance) return { ok: false };
  return { ok: true, balance: state.balance - amount };
}

export function earnBalance(balance: number, amount: number): number {
  return balance + amount;
}
