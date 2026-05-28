// ─── Boss Round Effects (No Phaser imports) ───
// Applies boss modifiers during boss rounds, unless negated by Saint Elmo's Shield
// or Sheriff's Badge (sold this round).

import { Die, HandType, type HandStats, type HandUpgradeInfo } from './types';
import { isBossEffectNegated, dieMatchesParity } from './effects/helpers';
import { getMostPlayedHandTypes, buildHandUpgradeInfo } from './handStatsHelpers';
import { detectBestHand } from './DiceSystem';
import { getHandByType } from '../data/hands';
import { rngFloat, rngShuffle } from './RunRng';
import { getRunState } from './store/runStore';
import { replaceEquipmentList, resolveEquipmentList } from './store/resolve';
import {
  getBossRoundState,
  patchBossRoundState,
  resetBossRoundStateSlice,
  updateBossRoundState,
} from './store/bossRoundState';
import { selectCurrentBoss, selectHandStats } from './store/selectors/runSelectors';
import { economyActions } from './store/actions/economyActions';
import { progressionActions } from './store/actions/progressionActions';

export type { BossRoundState } from './store/types';
export { EMPTY_BOSS_ROUND_STATE } from './store/types';

export interface BossRoundConfigMods {
  targetMilesMultiplier: number;
  /** If set, overrides max rerolls entirely (Chain Gang) */
  setMaxRerolls: number | null;
  /** If set, overrides max days (Standoff) */
  setMaxDays: number | null;
}

const NO_MODS: BossRoundConfigMods = {
  targetMilesMultiplier: 1,
  setMaxRerolls: null,
  setMaxDays: null,
};

function getActiveBoss() {
  if (isBossEffectNegated()) return null;
  return selectCurrentBoss(getRunState());
}

export function resetBossRoundState(): void {
  resetBossRoundStateSlice();
}

export { getBossRoundState } from './store/bossRoundState';

/** Initialize boss-specific state at round start */
export function initBossRoundState(): void {
  resetBossRoundState();
  const boss = getActiveBoss();
  if (!boss) return;

  if (boss.effectType === 'HIDE_EQUIPMENT') {
    const equipment = resolveEquipmentList();
    let shuffledIndices = rngShuffle(
      'boss',
      equipment.map((_, i) => i),
    );
    // Ensure Land Slide always actually changes order when 2+ cards exist.
    if (shuffledIndices.length > 1 && shuffledIndices.every((value, idx) => value === idx)) {
      [shuffledIndices[0], shuffledIndices[1]] = [shuffledIndices[1], shuffledIndices[0]];
    }
    const shuffledEquipment = shuffledIndices
      .map((index) => equipment[index])
      .filter((entry): entry is (typeof equipment)[number] => Boolean(entry));
    replaceEquipmentList(shuffledEquipment);
    patchBossRoundState({
      // Keep null so the real equipment list order drives both visuals and scoring.
      equipmentDisplayOrder: null,
      equipmentHidden: true,
      landSlideRevealed: false,
    });
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
  return !isBossEffectNegated() && selectCurrentBoss(getRunState()) !== null;
}

/** Start-of-day boss hooks (Jinx disables equipment) */
export function applyBossOnDayStart(day: number): void {
  const boss = getActiveBoss();
  if (!boss) return;

  if (boss.effectType === 'DISABLE_RANDOM_EQUIPMENT') {
    const count = (boss.effectParams.count as number) ?? 1;
    const equipment = resolveEquipmentList();
    const disabledEquipmentIndices: number[] = [];
    const available = equipment.map((_, i) => i);
    for (let n = 0; n < count && available.length > 0; n++) {
      const pick = available.splice(Math.floor(rngFloat('boss') * available.length), 1)[0];
      disabledEquipmentIndices.push(pick);
    }
    patchBossRoundState({ disabledEquipmentIndices });
  }

  void day;
}

/** After dice are rolled for the day (Bounty locks random die) */
export function applyBossAfterRoll(rolledDice: Die[]): void {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'LOCK_RANDOM_DICE') return;

  const lockedDiceIds: string[] = [];
  const count = (boss.effectParams.count as number) ?? 1;
  const pool = [...rolledDice];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rngFloat('boss') * pool.length);
    const [picked] = pool.splice(idx, 1);
    lockedDiceIds.push(picked.id);
  }
  patchBossRoundState({ lockedDiceIds });
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

  if (boss.effectType === 'DISABLE_ALL_DICE') {
    return !getBossRoundState().diceScoringReenabledBySell;
  }

  if (boss.effectType !== 'DISABLE_VALUES') return false;

  if (die.enhancement === 'stone') return false;

  const parity = boss.effectParams.parity as 'even' | 'odd';
  return dieMatchesParity(die, parity, resolveEquipmentList());
}

/** @deprecated Use isDiceScoringDisabledByBoss — kept for call-site clarity */
export function isDiceDisabledByBoss(die: Die): boolean {
  return isDiceScoringDisabledByBoss(die);
}

/** Bank Lien: selling any equipment re-enables dice scoring for the rest of the round */
export function onBossRoundEquipmentSold(): void {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'DISABLE_ALL_DICE') return;
  patchBossRoundState({ diceScoringReenabledBySell: true });
}

/** Jinx-disabled equipment does not score (only while the boss round is active). */
export function isEquipmentDisabledByBoss(equipIndex: number): boolean {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'DISABLE_RANDOM_EQUIPMENT') return false;
  return getBossRoundState().disabledEquipmentIndices.includes(equipIndex);
}

export interface BossScorePreview {
  handType: HandType;
  handName: string;
  warning: string | null;
  forfeit: boolean;
}

function getHandDisplayName(handType: HandType): string {
  return getHandByType(handType)?.name ?? handType;
}

function getBossHandTypeWarning(handType: HandType): string | null {
  const boss = getActiveBoss();
  if (!boss) return null;

  const state = getBossRoundState();

  if (boss.effectType === 'SINGLE_HAND_TYPE') {
    if (state.preacherLockedHand !== null && handType !== state.preacherLockedHand) {
      return `Only ${getHandDisplayName(state.preacherLockedHand)} hands score this round.`;
    }
  }

  if (boss.effectType === 'UNIQUE_HANDS_ONLY') {
    if (state.handsPlayedThisRound.includes(handType)) {
      return `${getHandDisplayName(handType)} has already been played and won't score.`;
    }
  }

  if (boss.effectType === 'STRAIGHTS_ONLY') {
    const allowedTypes: HandType[] = [HandType.FOUR_STRAIGHT, HandType.FIVE_STRAIGHT, HandType.HIGH_VALUE];
    if (!allowedTypes.includes(handType)) {
      return 'Only Straights or High Value can score this round.';
    }
  }

  return null;
}

/** Preview boss restrictions for the current dice selection (ROLL phase UI + scoring). */
export function previewBossScoreSelection(selectedDice: Die[]): BossScorePreview {
  const handResult = detectBestHand(selectedDice);
  const handType = handResult.type;
  const warning = getBossHandTypeWarning(handType);
  return {
    handType,
    handName: getHandByType(handType)?.name ?? handResult.name,
    warning,
    forfeit: warning !== null,
  };
}

export function isBossScoreForfeit(preview: BossScorePreview): boolean {
  return preview.forfeit;
}

/** @deprecated Prefer previewBossScoreSelection — kept for unit tests */
export function canPlayHandType(handType: HandType): { allowed: boolean; reason?: string } {
  const warning = getBossHandTypeWarning(handType);
  if (warning) return { allowed: false, reason: warning };
  return { allowed: true };
}

/** Record hand type after successful score validation */
export function recordBossHandPlayed(handType: HandType): void {
  const boss = getActiveBoss();
  if (!boss) return;

  updateBossRoundState((state) => {
    if (boss.effectType === 'SINGLE_HAND_TYPE' && state.preacherLockedHand === null) {
      state.preacherLockedHand = handType;
    }
    if (boss.effectType === 'UNIQUE_HANDS_ONLY' && !state.handsPlayedThisRound.includes(handType)) {
      state.handsPlayedThisRound = [...state.handsPlayedThisRound, handType];
    }
  });
}

/** Bottle: halve effective hand level for the round (temporary, not permanent). */
export function getBossAdjustedHandStats(_handType: HandType, stats: HandStats): HandStats {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'HALVE_TRAIL_KNOWLEDGE') return stats;

  const level = Math.max(1, Math.floor(stats.level / 2));
  if (level === stats.level) return stats;
  return { ...stats, level };
}

/** Trickster: permanently downgrade played hand before scoring; returns animation payload. */
export function applyBossTricksterDowngrade(handType: HandType): HandUpgradeInfo | null {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'DOWNGRADE_TRAIL_KNOWLEDGE') return null;

  const run = getRunState();
  const stats = selectHandStats(run, handType);
  const oldLevel = stats.level;
  if (oldLevel <= 1) return null;

  const amount = (boss.effectParams.amount as number) ?? 1;
  progressionActions.downgradeHandLevel(handType, amount);
  const newStats = selectHandStats(getRunState(), handType);
  return buildHandUpgradeInfo(handType, oldLevel, newStats.level, newStats);
}

/** Inspector: record day-1 roll size at round start. */
export function initInspectorRollSize(rollSize: number): void {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'SHRINK_HAND_PER_DAY') return;
  patchBossRoundState({ inspectorBaseRollSize: rollSize });
}

/** Inspector: roll size for a given day (day 1 = base, day 2 = base - 1, …). */
export function getInspectorRollSizeForDay(day: number): number | null {
  const base = getBossRoundState().inspectorBaseRollSize;
  if (base === null) return null;
  return Math.max(1, base - (day - 1));
}

/** Dice that contribute miles/effects (excludes parity-disabled, not hand detection) */
export function filterBossScoringDice(dice: Die[]): Die[] {
  return dice.filter((d) => !isDiceScoringDisabledByBoss(d));
}

/** Before scoring mutations: tax man, banker money loss */
export function applyBossOnScore(handType: HandType, playedDice: Die[]): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const run = getRunState();

  if (boss.effectType === 'ZERO_MONEY_ON_MOST_PLAYED') {
    const mostPlayed = getMostPlayedHandTypes(run.handStats);
    if (mostPlayed.includes(handType)) {
      economyActions.setBalance(0);
    }
  }

  if (boss.effectType === 'LOSE_MONEY_PER_PLAYED') {
    const perDie = (boss.effectParams.value as number) ?? 1;
    economyActions.trySpend(perDie * playedDice.length);
  }
}

/** After a hand is scored (Land Slide reveal) */
export function applyBossAfterScore(): void {
  const boss = getActiveBoss();
  if (!boss) return;

  const state = getBossRoundState();

  if (boss.effectType === 'HIDE_EQUIPMENT' && !state.landSlideRevealed) {
    patchBossRoundState({ landSlideRevealed: true });
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
  if (state.equipmentDisplayOrder === null) return;

  const count = resolveEquipmentList().length;
  if (count === 0) {
    patchBossRoundState({ equipmentDisplayOrder: [] });
    return;
  }

  updateBossRoundState((state) => {
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
  });
}

/** Update stored indices after the player reorders underlying equipment */
export function remapEquipmentDisplayOrderAfterReorder(fromIndex: number, toIndex: number): void {
  const order = getBossRoundState().equipmentDisplayOrder;
  if (!order) return;

  patchBossRoundState({
    equipmentDisplayOrder: order.map((idx) => {
      if (idx === fromIndex) return toIndex;
      if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) return idx - 1;
      if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) return idx + 1;
      return idx;
    }),
  });
}

/** Update stored indices after equipment is sold */
export function remapEquipmentDisplayOrderAfterRemove(removedIndex: number): void {
  const state = getBossRoundState();
  if (!state.equipmentDisplayOrder) return;

  patchBossRoundState({
    equipmentDisplayOrder: state.equipmentDisplayOrder
      .filter((idx) => idx !== removedIndex)
      .map((idx) => (idx > removedIndex ? idx - 1 : idx)),
  });
}

/** Keep Jinx-disabled slot aligned with the equipment instance after drag reorder */
export function remapDisabledEquipmentIndicesAfterReorder(fromIndex: number, toIndex: number): void {
  const disabled = getBossRoundState().disabledEquipmentIndices;
  if (disabled.length === 0) return;

  patchBossRoundState({
    disabledEquipmentIndices: disabled.map((idx) => {
      if (idx === fromIndex) return toIndex;
      if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) return idx - 1;
      if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) return idx + 1;
      return idx;
    }),
  });
}

/** Keep Jinx-disabled slot aligned after equipment is sold or destroyed */
export function remapDisabledEquipmentIndicesAfterRemove(removedIndex: number): void {
  const disabled = getBossRoundState().disabledEquipmentIndices;
  if (disabled.length === 0) return;

  patchBossRoundState({
    disabledEquipmentIndices: disabled
      .filter((idx) => idx !== removedIndex)
      .map((idx) => (idx > removedIndex ? idx - 1 : idx)),
  });
}

export function isBossEquipmentHidden(): boolean {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'HIDE_EQUIPMENT') return false;
  const state = getBossRoundState();
  return state.equipmentHidden;
}

/** Hints/tooltips hidden during Land Slide until first hand scored */
export function isBossEquipmentHintsHidden(): boolean {
  const boss = getActiveBoss();
  if (!boss || boss.effectType !== 'HIDE_EQUIPMENT') return false;
  const state = getBossRoundState();
  return state.equipmentHidden;
}

/** Mark first score animation complete — enables hints while faces stay hidden */
export function revealLandSlideHints(): void {
  const state = getBossRoundState();
  if (state.equipmentHidden) patchBossRoundState({ landSlideRevealed: true });
}
