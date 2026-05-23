// ─── Boss Round Effects (No Phaser imports) ───
// Applies boss modifiers during boss rounds, unless negated by Saint Elmo's Shield
// or Sheriff's Badge (sold this round).

import { Die, HandResult, HandStats, HandType } from './types';
import { getPlayerState } from './PlayerState';
import { isBossEffectNegated, dieMatchesParity } from './effects/helpers';
import { buildHandResult } from './DiceSystem';
import { rngFloat, rngShuffle } from './RunRng';

export interface BossRoundConfigMods {
  targetMilesMultiplier: number;
  /** If set, overrides max rerolls entirely (Chain Gang) */
  setMaxRerolls: number | null;
  /** If set, overrides max days (Standoff) */
  setMaxDays: number | null;
}

export interface BossRoundState {
  /** Equipment slot indices disabled by Jinx (per day, cumulative) */
  disabledEquipmentIndices: number[];
  /** Bounty: dice locked into score selection after first roll each day */
  lockedDiceIds: string[];
  /** Preacher: hand type locked after first play */
  preacherLockedHand: HandType | null;
  /** Call Girl: hand types already played this round */
  handsPlayedThisRound: HandType[];
  /** Land Slide: shuffled display order (original indices) */
  equipmentDisplayOrder: number[] | null;
  /** Land Slide: card faces hidden */
  equipmentHidden: boolean;
  /** Land Slide: hints/tooltips enabled after first scored hand */
  landSlideRevealed: boolean;
}

const NO_MODS: BossRoundConfigMods = {
  targetMilesMultiplier: 1,
  setMaxRerolls: null,
  setMaxDays: null,
};

export const EMPTY_BOSS_ROUND_STATE: BossRoundState = {
  disabledEquipmentIndices: [],
  lockedDiceIds: [],
  preacherLockedHand: null,
  handsPlayedThisRound: [],
  equipmentDisplayOrder: null,
  equipmentHidden: false,
  landSlideRevealed: false,
};

function getActiveBoss() {
  if (isBossEffectNegated()) return null;
  return getPlayerState().currentBoss;
}

/** Mutable per-round boss state on PlayerState */
export function getBossRoundState(): BossRoundState {
  return getPlayerState().bossRoundState;
}

export function resetBossRoundState(): void {
  getPlayerState().bossRoundState = { ...EMPTY_BOSS_ROUND_STATE, disabledEquipmentIndices: [] };
}

/** Initialize boss-specific state at round start */
export function initBossRoundState(): void {
  resetBossRoundState();
  const boss = getActiveBoss();
  if (!boss) return;

  const state = getBossRoundState();

  switch (boss.effectType) {
    case 'HIDE_EQUIPMENT': {
      const player = getPlayerState();
      state.equipmentDisplayOrder = rngShuffle(
        'boss',
        player.equipment.map((_, i) => i),
      );
      state.equipmentHidden = true;
      state.landSlideRevealed = false;
      break;
    }
  }
}

/** Round-start config modifiers from the current boss */
export function getBossRoundConfigMods(): BossRoundConfigMods {
  const boss = getActiveBoss();
  if (!boss) return NO_MODS;

  const mods: BossRoundConfigMods = { ...NO_MODS };

  switch (boss.effectType) {
    case 'MODIFY_REROLLS':
      mods.setMaxRerolls = 0;
      break;
    case 'SET_HANDS':
      mods.setMaxDays = (boss.effectParams.days as number) ?? 1;
      break;
  }

  return mods;
}

/** Whether the current boss's round effects are actively applying */
export function isBossEffectActive(): boolean {
  return !isBossEffectNegated() && getPlayerState().currentBoss !== null;
}

/** Start-of-day boss hooks (Jinx disables equipment) */
export function applyBossOnDayStart(day: number): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const state = getBossRoundState();
  const player = getPlayerState();

  if (boss.effectType === 'DISABLE_RANDOM_EQUIPMENT') {
    const count = (boss.effectParams.count as number) ?? 1;
    const available = player.equipment.map((_, i) => i).filter((i) => !state.disabledEquipmentIndices.includes(i));
    for (let n = 0; n < count && available.length > 0; n++) {
      const pick = available.splice(Math.floor(rngFloat('boss') * available.length), 1)[0];
      state.disabledEquipmentIndices.push(pick);
    }
  }

  // Bounty locks dice after first roll — handled in applyBossAfterRoll
  void day;
}

/** After dice are rolled for the day (Bounty locks random die) */
export function applyBossAfterRoll(rolledDice: Die[]): void {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'LOCK_RANDOM_DICE') return;

  const state = getBossRoundState();
  state.lockedDiceIds = [];

  const count = (boss.effectParams.count as number) ?? 1;
  const pool = [...rolledDice];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rngFloat('boss') * pool.length);
    const [picked] = pool.splice(idx, 1);
    state.lockedDiceIds.push(picked.id);
  }
}

/** Bounty-locked dice cannot be unlocked */
export function isDiceLockedByBoss(dieId: string): boolean {
  return getBossRoundState().lockedDiceIds.includes(dieId);
}

/**
 * Ghost Town / Undertaker / Bank Lien: die still counts for hand detection and selection,
 * but earns no miles, enhancements, stickers, retriggers, or per-die equipment triggers.
 */
export function isDiceScoringDisabledByBoss(die: Die): boolean {
  const boss = getActiveBoss();
  if (!boss) return false;

  if (boss.effectType === 'DISABLE_ALL_DICE') return true;

  if (boss.effectType !== 'DISABLE_VALUES') return false;

  const parity = boss.effectParams.parity as 'even' | 'odd';
  const player = getPlayerState();
  return dieMatchesParity(die, parity, player.equipment);
}

/** @deprecated Use isDiceScoringDisabledByBoss — kept for call-site clarity */
export function isDiceDisabledByBoss(die: Die): boolean {
  return isDiceScoringDisabledByBoss(die);
}

/** Jinx-disabled equipment does not score */
export function isEquipmentDisabledByBoss(equipIndex: number): boolean {
  return getBossRoundState().disabledEquipmentIndices.includes(equipIndex);
}

/** Validate hand type before scoring (Preacher, Call Girl) */
export function canPlayHandType(handType: HandType): { allowed: boolean; reason?: string } {
  const boss = getActiveBoss();
  if (!boss) return { allowed: true };

  const state = getBossRoundState();

  if (boss.effectType === 'SINGLE_HAND_TYPE') {
    if (state.preacherLockedHand === null) return { allowed: true };
    if (handType !== state.preacherLockedHand) {
      return { allowed: false, reason: `Only ${state.preacherLockedHand} hands allowed` };
    }
  }

  if (boss.effectType === 'UNIQUE_HANDS_ONLY') {
    if (state.handsPlayedThisRound.includes(handType)) {
      return { allowed: false, reason: 'Must play a different hand each day' };
    }
  }

  return { allowed: true };
}

/** Record hand type after successful score validation */
export function recordBossHandPlayed(handType: HandType): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const state = getBossRoundState();

  if (boss.effectType === 'SINGLE_HAND_TYPE' && state.preacherLockedHand === null) {
    state.preacherLockedHand = handType;
  }
  if (boss.effectType === 'UNIQUE_HANDS_ONLY') {
    if (!state.handsPlayedThisRound.includes(handType)) {
      state.handsPlayedThisRound.push(handType);
    }
  }
}

/** Trickster: reduce hand level before scoring (min level 1) */
export function getBossAdjustedHandStats(_handType: HandType, stats: HandStats): HandStats {
  const boss = getActiveBoss();
  if (!boss) return stats;

  let level = stats.level;

  if (boss.effectType === 'DOWNGRADE_TRAIL_KNOWLEDGE') {
    const amount = (boss.effectParams.amount as number) ?? 1;
    level = Math.max(1, level - amount);
  }

  if (boss.effectType === 'HALVE_TRAIL_KNOWLEDGE') {
    level = Math.max(1, Math.floor(level / 2));
  }

  if (level === stats.level) return stats;
  return { ...stats, level };
}

/** River: only straight hands score full value; others downgrade to high card */
export function applyBossHandRestriction(handResult: HandResult, selectedDice: Die[]): HandResult {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'STRAIGHTS_ONLY') return handResult;

  const straightTypes: HandType[] = [HandType.FOUR_STRAIGHT, HandType.FIVE_STRAIGHT];
  if (straightTypes.includes(handResult.type)) return handResult;

  const active = selectedDice.filter((d) => !isDiceScoringDisabledByBoss(d) && d.enhancement !== 'stone');
  if (active.length === 0) return handResult;
  const highest = active.reduce((a, b) => (b.value > a.value ? b : a));
  const stoneDice = selectedDice.filter((d) => d.enhancement === 'stone');
  return buildHandResult(HandType.HIGH_VALUE, [highest, ...stoneDice]);
}

/** Dice that contribute miles/effects (excludes parity-disabled, not hand detection) */
export function filterBossScoringDice(dice: Die[]): Die[] {
  return dice.filter((d) => !isDiceScoringDisabledByBoss(d));
}

/** Before scoring mutations: tax man, banker money loss */
export function applyBossOnScore(handType: HandType, playedDice: Die[]): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const player = getPlayerState();

  if (boss.effectType === 'ZERO_MONEY_ON_MOST_PLAYED') {
    let max = 0;
    for (const [, stats] of player.handStats) {
      max = Math.max(max, stats.timesPlayed);
    }
    const mostPlayed: HandType[] = [];
    for (const [type, stats] of player.handStats) {
      if (stats.timesPlayed === max && max > 0) mostPlayed.push(type);
    }
    if (mostPlayed.includes(handType)) {
      player.economy.setBalance(0);
    }
  }

  if (boss.effectType === 'LOSE_MONEY_PER_PLAYED') {
    const perDie = (boss.effectParams.value as number) ?? 1;
    player.economy.spend(perDie * playedDice.length);
  }
}

/** After a hand is scored (Inspector spends dice, Land Slide reveal) */
export function applyBossAfterScore(): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const player = getPlayerState();
  const state = getBossRoundState();

  if (boss.effectType === 'SPEND_RANDOM_AFTER_SCORE') {
    const count = (boss.effectParams.count as number) ?? 2;
    const available = player.availableDice;
    const toSpend: string[] = [];
    const pool = [...available];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(rngFloat('boss') * pool.length);
      toSpend.push(pool.splice(idx, 1)[0].id);
    }
    if (toSpend.length > 0) player.markDiceSpent(toSpend);
  }

  if (boss.effectType === 'HIDE_EQUIPMENT' && !state.landSlideRevealed) {
    state.landSlideRevealed = true;
  }
}

/** Land Slide: reorder equipment indices for display */
export function getBossEquipmentDisplayOrder(): number[] | null {
  return getBossRoundState().equipmentDisplayOrder;
}

/** Keep display-order permutation in sync when equipment count changes (sell, add) */
export function syncEquipmentDisplayOrder(): void {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'HIDE_EQUIPMENT') return;

  const state = getBossRoundState();
  const count = getPlayerState().equipment.length;
  if (count === 0) {
    state.equipmentDisplayOrder = [];
    return;
  }

  let order = (state.equipmentDisplayOrder ?? []).filter((i) => i < count);
  const present = new Set(order);
  const missing: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!present.has(i)) missing.push(i);
  }
  for (const idx of missing) {
    const slot = Math.floor(rngFloat('boss') * (order.length + 1));
    order.splice(slot, 0, idx);
  }
  state.equipmentDisplayOrder = order;
}

/** Update stored indices after the player reorders underlying equipment */
export function remapEquipmentDisplayOrderAfterReorder(fromIndex: number, toIndex: number): void {
  const order = getBossRoundState().equipmentDisplayOrder;
  if (!order) return;

  getBossRoundState().equipmentDisplayOrder = order.map((idx) => {
    if (idx === fromIndex) return toIndex;
    if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) return idx - 1;
    if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) return idx + 1;
    return idx;
  });
}

/** Update stored indices after equipment is sold */
export function remapEquipmentDisplayOrderAfterRemove(removedIndex: number): void {
  const state = getBossRoundState();
  if (!state.equipmentDisplayOrder) return;

  state.equipmentDisplayOrder = state.equipmentDisplayOrder
    .filter((idx) => idx !== removedIndex)
    .map((idx) => (idx > removedIndex ? idx - 1 : idx));
}

export function isBossEquipmentHidden(): boolean {
  const state = getBossRoundState();
  return state.equipmentHidden && !state.landSlideRevealed;
}

/** Hints/tooltips hidden during Land Slide until first hand scored */
export function isBossEquipmentHintsHidden(): boolean {
  const state = getBossRoundState();
  if (!state.equipmentHidden) return false;
  return !state.landSlideRevealed;
}

/** Mark first score animation complete — enables hints while faces stay hidden */
export function revealLandSlideHints(): void {
  const state = getBossRoundState();
  if (state.equipmentHidden) state.landSlideRevealed = true;
}
