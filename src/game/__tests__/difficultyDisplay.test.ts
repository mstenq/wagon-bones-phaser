import { describe, expect, test } from 'bun:test';
import { getDifficultyBeatColor, getDifficultyBeatColorHex, getDifficultyName } from '../DifficultyDisplay';

describe('DifficultyDisplay', () => {
  test('getDifficultyBeatColor returns palette colors for levels 1-8', () => {
    expect(getDifficultyBeatColor(0)).toBeNull();
    expect(getDifficultyBeatColor(1)).toBe(0xffffff);
    expect(getDifficultyBeatColor(8)).toBe(0xffd700);
    expect(getDifficultyBeatColor(9)).toBeNull();
  });

  test('getDifficultyName returns names for valid levels only', () => {
    expect(getDifficultyName(0)).toBeNull();
    expect(getDifficultyName(1)).toBe('Clear Skies');
    expect(getDifficultyName(8)).toBe('Debt to the Company Store');
    expect(getDifficultyName(9)).toBeNull();
  });

  test('getDifficultyBeatColorHex falls back for invalid levels', () => {
    expect(getDifficultyBeatColorHex(0)).toBe('#888888');
    expect(getDifficultyBeatColorHex(8)).toBe('#ffd700');
  });
});
