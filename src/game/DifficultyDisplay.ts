// ─── Difficulty display helpers (No Phaser imports) ───

import { COLORS, DIFFICULTIES } from './Constants';

const MAX_DIFFICULTY = DIFFICULTIES.length;

export function getDifficultyName(level: number): string | null {
  if (level <= 0 || level > MAX_DIFFICULTY) return null;
  return DIFFICULTIES[level - 1].name;
}

/** Hex color string for difficulty beat UI (tooltips, labels). */
export function getDifficultyBeatColorHex(level: number): string {
  const color = getDifficultyBeatColor(level);
  if (color === null) return '#888888';
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Fill color for the profession beat-indicator dot (0 = none beaten). */
export function getDifficultyBeatColor(level: number): number | null {
  if (level <= 0 || level > MAX_DIFFICULTY) return null;
  return DIFFICULTIES[level - 1].color;
}

/** Stroke color for beat-indicator dots (contrast on light fills). */
export function getDifficultyBeatStrokeColor(level: number): number {
  if (level === 1 || level === MAX_DIFFICULTY) return COLORS.SIDEBAR_SECTION_BORDER;
  return 0x000000;
}
