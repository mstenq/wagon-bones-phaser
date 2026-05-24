// ─── Common run-store reads for pure systems (No Phaser imports) ───

import type { HandType } from '../types';
import { getRunState } from './runStore';
import { resolveEquipmentList } from './resolve';
import { selectHandStats, selectProfession, selectResolvedLoadedDieTarget } from './selectors/runSelectors';

export function getRunProfessionId(): string | null {
  return getRunState().professionId;
}

export function getRunDifficulty(): number {
  return getRunState().difficulty;
}

export function getRunEquipment() {
  return resolveEquipmentList();
}

export function getRunHandStats(handType: HandType) {
  return selectHandStats(getRunState(), handType);
}

export function getRunProfession() {
  return selectProfession(getRunState());
}

export function runHasLuckyNumberEquipment(state = getRunState()) {
  return resolveEquipmentList(state).some((e) => e.def.id === 'lucky_number');
}

export function getResolvedLoadedDieTarget(state = getRunState()) {
  return selectResolvedLoadedDieTarget(state);
}
