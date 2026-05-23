import { afterEach, describe, expect, test } from 'bun:test';
import {
  generateRunSeed,
  getRunRngState,
  initRunRng,
  nextRunId,
  resetRunRng,
  restoreRunRng,
  rngFloat,
} from '../RunRng';

describe('RunRng', () => {
  afterEach(() => {
    resetRunRng();
  });

  test('same seed reproduces stream values', () => {
    initRunRng('frontier-seed');
    const firstDice = [rngFloat('dice'), rngFloat('dice'), rngFloat('dice')];
    const firstShop = [rngFloat('shop'), rngFloat('shop')];

    initRunRng('frontier-seed');
    const secondDice = [rngFloat('dice'), rngFloat('dice'), rngFloat('dice')];
    const secondShop = [rngFloat('shop'), rngFloat('shop')];

    expect(secondDice).toEqual(firstDice);
    expect(secondShop).toEqual(firstShop);
  });

  test('generated seed is 8-char uppercase alphanumeric', () => {
    const seed = generateRunSeed();
    expect(seed).toHaveLength(8);
    expect(seed).toMatch(/^[A-Z0-9]{8}$/);
  });

  test('streams are isolated from one another', () => {
    initRunRng('isolated-streams');
    const baseline = [rngFloat('dice'), rngFloat('dice'), rngFloat('dice')];

    initRunRng('isolated-streams');
    rngFloat('shop');
    rngFloat('shop');
    const withShopNoise = [rngFloat('dice'), rngFloat('dice'), rngFloat('dice')];

    expect(withShopNoise).toEqual(baseline);
  });

  test('restores stream state and ID counter exactly', () => {
    initRunRng('restore-check');
    rngFloat('trail');
    const id1 = nextRunId('pack');
    const saved = getRunRngState();

    const expectedTrailRoll = rngFloat('trail');
    const expectedId = nextRunId('pack');

    restoreRunRng('restore-check', saved);
    expect(rngFloat('trail')).toBe(expectedTrailRoll);
    expect(nextRunId('pack')).toBe(expectedId);
    expect(id1).not.toBe(expectedId);
  });
});
