import { describe, test, expect } from 'bun:test';
import {
  enhancementCountsAsGold,
  enhancementCountsAsSteel,
  enhancementHeldGoldPayout,
  enhancementHeldSteelXMult,
  enhancementMatchesTarget,
} from '../alchemyKit';

describe('alchemyKit helpers', () => {
  test('swap table without alchemy', () => {
    expect(enhancementCountsAsGold('gold', false)).toBe(true);
    expect(enhancementCountsAsGold('steel', false)).toBe(false);
    expect(enhancementCountsAsSteel('steel', false)).toBe(true);
    expect(enhancementCountsAsSteel('gold', false)).toBe(false);
    expect(enhancementHeldSteelXMult('steel', false)).toBe(true);
    expect(enhancementHeldSteelXMult('gold', false)).toBe(false);
    expect(enhancementHeldGoldPayout('gold', false)).toBe(true);
    expect(enhancementHeldGoldPayout('steel', false)).toBe(false);
  });

  test('swap table with alchemy', () => {
    expect(enhancementCountsAsGold('steel', true)).toBe(true);
    expect(enhancementCountsAsGold('gold', true)).toBe(true);
    expect(enhancementCountsAsSteel('gold', true)).toBe(true);
    expect(enhancementCountsAsSteel('steel', true)).toBe(true);
    expect(enhancementHeldSteelXMult('gold', true)).toBe(true);
    expect(enhancementHeldSteelXMult('steel', true)).toBe(true);
    expect(enhancementHeldGoldPayout('steel', true)).toBe(true);
    expect(enhancementHeldGoldPayout('gold', true)).toBe(true);
  });

  test('enhancementMatchesTarget for collection counts', () => {
    expect(enhancementMatchesTarget('steel', 'steel', false)).toBe(true);
    expect(enhancementMatchesTarget('gold', 'steel', false)).toBe(false);
    expect(enhancementMatchesTarget('gold', 'steel', true)).toBe(true);
    expect(enhancementMatchesTarget('steel', 'gold', true)).toBe(true);
  });
});
