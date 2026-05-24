// ─── User stats (No Phaser imports) ───
// Cross-run meta-progression: highest difficulty beaten per profession.

import { COLORS, DIFFICULTIES, GAMEPLAY } from './Constants';
import type { DifficultyLevel } from './types';

export interface ProfessionStats {
  highestDifficultyBeaten: number;
}

export interface UserStatsData {
  professions: Record<string, ProfessionStats>;
}

const DEVELOPER_PROFESSION_ID = 'developer';
const MAX_DIFFICULTY = 8;

let cached: UserStatsData | null = null;

function emptyStats(): UserStatsData {
  return { professions: {} };
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
    return parsed;
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
  writeToStorage(data);
}

export function clearUserStatsStorage(): void {
  try {
    localStorage.removeItem(GAMEPLAY.USER_STATS_STORAGE_KEY);
  } catch {
    // ignore
  }
  cached = null;
}

export function resetUserStatsCacheForTests(): void {
  cached = null;
}

export function getHighestDifficultyBeaten(professionId: string): number {
  if (professionId === DEVELOPER_PROFESSION_ID) return MAX_DIFFICULTY;
  return readUserStats().professions[professionId]?.highestDifficultyBeaten ?? 0;
}

export function getHighestUnlockedDifficulty(professionId: string): DifficultyLevel {
  if (professionId === DEVELOPER_PROFESSION_ID) return MAX_DIFFICULTY;
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

/** Fill color for the profession beat-indicator dot (0 = none beaten). */
export function getDifficultyBeatColor(level: number): number | null {
  if (level <= 0 || level > MAX_DIFFICULTY) return null;
  return DIFFICULTIES[level - 1].color;
}

/** Stroke color for beat-indicator dots (contrast on light fills). */
export function getDifficultyBeatStrokeColor(level: number): number {
  if (level === 1 || level === 8) return COLORS.SIDEBAR_SECTION_BORDER;
  return 0x000000;
}
