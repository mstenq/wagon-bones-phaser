import { describe, expect, test } from 'bun:test';
import './setup';
import { D, eq, multiplyScore, ceilScore, milesToSave, milesFromSave } from '../decimal';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { formatScore } from '../formatScore';

describe('decimal', () => {
  test('leg 39 targets parse without Infinity', () => {
    const leg39 = getBaseTargetMilesForLeg(39, 1);
    expect(leg39.isFinite()).toBe(true);
    expect(eq(leg39, '4.8e309')).toBe(true);
  });

  test('multiplyScore preserves small-value behavior', () => {
    expect(eq(multiplyScore(3, 4), 12)).toBe(true);
    expect(eq(multiplyScore(D(1.5), 2), 3)).toBe(true);
  });

  test('ceilScore rounds up fractional targets', () => {
    expect(eq(ceilScore(D(800.1)), 801)).toBe(true);
  });

  test('miles save round-trip', () => {
    const raw = milesToSave(D('1.5e50'));
    expect(milesFromSave(raw).toString()).toBe(D('1.5e50').toString());
  });
});

describe('formatScore with Decimal', () => {
  test('formats large targets in scientific notation', () => {
    expect(formatScore(D('1.27e11'))).toBe('1.27e11');
  });

  test('rolls mantissa overflow into exponent', () => {
    expect(formatScore(D('9.999e11'))).toBe('1e12');
  });
});
