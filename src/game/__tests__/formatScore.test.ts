import { describe, expect, test } from 'bun:test';
import { formatMult, formatScore, formatScoreComponent, formatXMult } from '../formatScore';

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

  test('shows Infinity beyond JS number range', () => {
    expect(formatScore('2.91e383')).toBe('Infinity');
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('Infinity');
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

  test('shows Infinity beyond JS number range', () => {
    expect(formatScoreComponent('2.91e383')).toBe('Infinity');
  });
});

describe('formatMult', () => {
  test('keeps small and fractional values exact', () => {
    expect(formatMult(1)).toBe('1');
    expect(formatMult(1.5)).toBe('1.5');
    expect(formatMult(137)).toBe('137');
    expect(formatMult(999)).toBe('999');
    expect(formatMult(1.335)).toBe('1.34');
  });

  test('uses k/m/b abbreviations for large values', () => {
    expect(formatMult(1_000)).toBe('1k');
    expect(formatMult(1_500)).toBe('1.5k');
    expect(formatMult(12_345)).toBe('12.3k');
    expect(formatMult(123_456)).toBe('123k');
    expect(formatMult(4_313_088)).toBe('4.3m');
    expect(formatMult(23_300_000)).toBe('23.3m');
    expect(formatMult(2_100_000_000)).toBe('2.1b');
  });

  test('promotes rounded thousand-tier labels to the next suffix', () => {
    expect(formatMult(999_999)).toBe('1m');
  });

  test('uses scientific notation at or above 100 billion', () => {
    expect(formatMult(1e11)).toBe('1e11');
    expect(formatMult(127_000_000_000)).toBe('1.27e11');
  });
});
