// ─── User stats (No Phaser imports) ───
// Cross-run meta-progression: highest difficulty beaten per profession and per equipment.

import { DIFFICULTIES, GAMEPLAY } from './Constants';
import type { DifficultyLevel, HandType } from './types';
import { getSecretHandTypes } from '../data/hands';

export interface ProfessionStats {
  highestDifficultyBeaten: number;
}

export interface EquipmentStats {
  highestDifficultyBeaten: number;
}

export interface UserStatsData {
  professions: Record<string, ProfessionStats>;
  equipment: Record<string, EquipmentStats>;
  /** Secret hand types discovered across runs (for achievements and meta). */
  discoveredSecretHands: HandType[];
}

const DEVELOPER_PROFESSION_ID = 'developer';
const MAX_DIFFICULTY = DIFFICULTIES.length;

let cached: UserStatsData | null = null;

function emptyStats(): UserStatsData {
  return { professions: {}, equipment: {}, discoveredSecretHands: [] };
}

/** Clamp stored beat level to 0..MAX_DIFFICULTY for safe reads and imports. */
export function normalizeStoredBeatLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_DIFFICULTY, Math.max(0, Math.round(value)));
}

export function normalizeUserStatsData(data: UserStatsData): UserStatsData {
  const professions: Record<string, ProfessionStats> = {};
  for (const [id, stats] of Object.entries(data.professions)) {
    if (!stats || typeof stats !== 'object') continue;
    professions[id] = {
      highestDifficultyBeaten: normalizeStoredBeatLevel(stats.highestDifficultyBeaten),
    };
  }

  const equipment: Record<string, EquipmentStats> = {};
  for (const [id, stats] of Object.entries(data.equipment)) {
    if (!stats || typeof stats !== 'object') continue;
    equipment[id] = {
      highestDifficultyBeaten: normalizeStoredBeatLevel(stats.highestDifficultyBeaten),
    };
  }

  const validSecretHands = new Set(getSecretHandTypes());
  const discoveredSecretHands = Array.isArray(data.discoveredSecretHands)
    ? ([
        ...new Set(
          data.discoveredSecretHands.filter((t): t is HandType => typeof t === 'string' && validSecretHands.has(t)),
        ),
      ] as HandType[])
    : [];

  return { professions, equipment, discoveredSecretHands };
}

function normalizeDifficulty(value: number): DifficultyLevel {
  return Math.min(MAX_DIFFICULTY, Math.max(1, Math.round(value))) as DifficultyLevel;
}

function readFromStorage(): UserStatsData {
  try {
    const raw = localStorage.getItem(GAMEPLAY.USER_STATS_STORAGE_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as UserStatsData;
    if (!parsed || typeof parsed !== 'object' || !parsed.professions || typeof parsed.professions !== 'object') {
      return emptyStats();
    }
    const equipment = parsed.equipment && typeof parsed.equipment === 'object' ? parsed.equipment : {};
    const discoveredSecretHands = Array.isArray(parsed.discoveredSecretHands) ? parsed.discoveredSecretHands : [];
    return normalizeUserStatsData({ professions: parsed.professions, equipment, discoveredSecretHands });
  } catch {
    return emptyStats();
  }
}

function writeToStorage(data: UserStatsData): void {
  try {
    localStorage.setItem(GAMEPLAY.USER_STATS_STORAGE_KEY, JSON.stringify(data));
    cached = data;
  } catch {
    // Quota exceeded or private browsing — ignore
  }
}

export function readUserStats(): UserStatsData {
  if (cached) return cached;
  cached = readFromStorage();
  return cached;
}

export function writeUserStats(data: UserStatsData): void {
  writeToStorage(normalizeUserStatsData(data));
}

export function clearUserStatsStorage(): void {
  try {
    localStorage.removeItem(GAMEPLAY.USER_STATS_STORAGE_KEY);
  } catch {
    // ignore
  }
  cached = null;
}

export function invalidateUserStatsCache(): void {
  cached = null;
}

export function resetUserStatsCacheForTests(): void {
  invalidateUserStatsCache();
}

export function getHighestDifficultyBeaten(professionId: string): number {
  if (professionId === DEVELOPER_PROFESSION_ID) return MAX_DIFFICULTY;
  return readUserStats().professions[professionId]?.highestDifficultyBeaten ?? 0;
}

export function getHighestUnlockedDifficulty(professionId: string): DifficultyLevel {
  if (professionId === DEVELOPER_PROFESSION_ID) return MAX_DIFFICULTY as DifficultyLevel;
  const beaten = getHighestDifficultyBeaten(professionId);
  return Math.min(beaten + 1, MAX_DIFFICULTY) as DifficultyLevel;
}

export function isDifficultyUnlocked(professionId: string, level: DifficultyLevel): boolean {
  return level <= getHighestUnlockedDifficulty(professionId);
}

export function recordStoryVictory(professionId: string, difficulty: DifficultyLevel): void {
  if (professionId === DEVELOPER_PROFESSION_ID) return;

  const current = getHighestDifficultyBeaten(professionId);
  const normalized = normalizeDifficulty(difficulty);
  if (normalized <= current) return;

  const stats = readUserStats();
  stats.professions[professionId] = { highestDifficultyBeaten: normalized };
  writeUserStats(stats);
}

export function getEquipmentHighestDifficultyBeaten(equipmentId: string): number {
  return readUserStats().equipment[equipmentId]?.highestDifficultyBeaten ?? 0;
}

export function recordEquipmentVictory(defIds: string[], difficulty: DifficultyLevel): void {
  if (defIds.length === 0) return;

  const normalized = normalizeDifficulty(difficulty);
  const stats = readUserStats();

  let changed = false;
  for (const defId of defIds) {
    const current = stats.equipment[defId]?.highestDifficultyBeaten ?? 0;
    if (normalized <= current) continue;
    stats.equipment[defId] = { highestDifficultyBeaten: normalized };
    changed = true;
  }

  if (changed) writeUserStats(stats);
}

export function getDiscoveredSecretHands(): HandType[] {
  return [...(readUserStats().discoveredSecretHands ?? [])];
}

export function isSecretHandDiscovered(handType: HandType): boolean {
  return getDiscoveredSecretHands().includes(handType);
}

export function areAllSecretHandsDiscovered(): boolean {
  const secretTypes = getSecretHandTypes();
  if (secretTypes.length === 0) return false;
  const discovered = new Set(getDiscoveredSecretHands());
  return secretTypes.every((type) => discovered.has(type));
}

/** Persist cross-run discovery when a secret hand is scored. */
export function recordSecretHandDiscovered(handType: HandType): void {
  if (!getSecretHandTypes().includes(handType)) return;

  const stats = readUserStats();
  const discovered = new Set(stats.discoveredSecretHands ?? []);
  if (discovered.has(handType)) return;

  discovered.add(handType);
  stats.discoveredSecretHands = [...discovered];
  writeUserStats(stats);
}
