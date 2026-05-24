// ─── Boss round state helpers (No Phaser imports) ───

import { getRunState, runStore } from './runStore';
import { EMPTY_BOSS_ROUND_STATE, type BossRoundState } from './types';

export function getBossRoundState(): BossRoundState {
  return getRunState().bossRoundState;
}

export function setBossRoundState(bossRoundState: BossRoundState): void {
  runStore.setState((s) => {
    Object.assign(s.bossRoundState, bossRoundState);
    return { ...s };
  });
}

export function patchBossRoundState(partial: Partial<BossRoundState>): void {
  runStore.setState((s) => {
    Object.assign(s.bossRoundState, partial);
    return { ...s };
  });
}

export function updateBossRoundState(mutator: (state: BossRoundState) => void): void {
  runStore.setState((s) => {
    mutator(s.bossRoundState);
    return { ...s };
  });
}

export function resetBossRoundStateSlice(): void {
  runStore.setState((s) => ({
    ...s,
    bossRoundState: { ...EMPTY_BOSS_ROUND_STATE, disabledEquipmentIndices: [] },
  }));
}
