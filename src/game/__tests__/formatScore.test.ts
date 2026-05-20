import { describe, expect, test } from 'bun:test';
import { formatScore } from '../formatScore';

describe('formatScore', () => {
  test('uses thousand separators below 1 trillion', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1234)).toBe('1,234');
    expect(formatScore(999_999_999_999)).toBe('999,999,999,999');
  });

  test('uses scientific notation at or above 1 trillion', () => {
    expect(formatScore(1_000_000_000_000)).toBe('1e12');
    expect(formatScore(1_270_000_000_000)).toBe('1.27e12');
    expect(formatScore(8_357_843_088_609_702_000)).toBe('8.36e18');
    expect(formatScore(127_000_000_000_000)).toBe('1.27e14');
  });

  test('floors fractional values', () => {
    expect(formatScore(1234.9)).toBe('1,234');
  });
});
