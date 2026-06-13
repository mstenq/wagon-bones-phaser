import { describe, expect, test } from 'bun:test';
import { formatScore, formatScoreComponent, formatXMult } from '../formatScore';

describe('formatScore', () => {
  test('uses thousand separators below 100 billion', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1234)).toBe('1,234');
    expect(formatScore(99_999_999_999)).toBe('99,999,999,999');
  });

  test('uses scientific notation at or above 100 billion', () => {
    expect(formatScore(1e11)).toBe('1e11');
    expect(formatScore(127_000_000_000)).toBe('1.27e11');
    expect(formatScore(1_270_000_000_000)).toBe('1.27e12');
    expect(formatScore(8_357_843_088_609_702_000)).toBe('8.36e18');
    expect(formatScore(127_000_000_000_000)).toBe('1.27e14');
  });

  test('floors fractional values', () => {
    expect(formatScore(1234.9)).toBe('1,234');
  });
});

describe('formatXMult', () => {
  test('rounds to two decimal places', () => {
    expect(formatXMult(1)).toBe('1');
    expect(formatXMult(1.5)).toBe('1.5');
    expect(formatXMult(2)).toBe('2');
    expect(formatXMult(0.75)).toBe('0.75');
    expect(formatXMult(0.25)).toBe('0.25');
    expect(formatXMult(1.3333333333333333)).toBe('1.33');
    expect(formatXMult(1.335)).toBe('1.34');
  });
});

describe('formatScoreComponent', () => {
  test('preserves fractional scoring values', () => {
    expect(formatScoreComponent(7.5)).toBe('7.5');
    expect(formatScoreComponent(56.25)).toBe('56.25');
  });

  test('keeps thousand separators for whole numbers', () => {
    expect(formatScoreComponent(1234)).toBe('1,234');
  });
});
