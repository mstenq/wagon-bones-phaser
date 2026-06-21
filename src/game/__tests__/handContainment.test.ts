import { describe, test, expect } from 'bun:test';
import { handTypeContains } from '../handContainment';
import { HandType } from '../types';

describe('handTypeContains', () => {
  test('returns false for null played hand', () => {
    expect(handTypeContains(null, HandType.PAIR)).toBe(false);
  });

  test('exact match', () => {
    expect(handTypeContains(HandType.PAIR, HandType.PAIR)).toBe(true);
    expect(handTypeContains(HandType.FLUSH_HOUSE, HandType.FLUSH_HOUSE)).toBe(true);
  });

  test('unrelated hands do not contain each other', () => {
    expect(handTypeContains(HandType.PAIR, HandType.FIVE_STRAIGHT)).toBe(false);
    expect(handTypeContains(HandType.FIVE_STRAIGHT, HandType.PAIR)).toBe(false);
    expect(handTypeContains(HandType.HIGH_VALUE, HandType.PAIR)).toBe(false);
    expect(handTypeContains(HandType.FLUSH, HandType.PAIR)).toBe(false);
  });

  describe('standard containment tiers', () => {
    test('two pair contains pair', () => {
      expect(handTypeContains(HandType.TWO_PAIR, HandType.PAIR)).toBe(true);
    });

    test('three of a kind contains pair', () => {
      expect(handTypeContains(HandType.THREE_OF_A_KIND, HandType.PAIR)).toBe(true);
    });

    test('full house contains pair, two pair, and three of a kind', () => {
      expect(handTypeContains(HandType.FULL_HOUSE, HandType.PAIR)).toBe(true);
      expect(handTypeContains(HandType.FULL_HOUSE, HandType.TWO_PAIR)).toBe(true);
      expect(handTypeContains(HandType.FULL_HOUSE, HandType.THREE_OF_A_KIND)).toBe(true);
    });

    test('four of a kind contains lower rank hands', () => {
      expect(handTypeContains(HandType.FOUR_OF_A_KIND, HandType.PAIR)).toBe(true);
      expect(handTypeContains(HandType.FOUR_OF_A_KIND, HandType.TWO_PAIR)).toBe(true);
      expect(handTypeContains(HandType.FOUR_OF_A_KIND, HandType.THREE_OF_A_KIND)).toBe(true);
    });

    test('five of a kind contains pair through four of a kind', () => {
      expect(handTypeContains(HandType.FIVE_OF_A_KIND, HandType.PAIR)).toBe(true);
      expect(handTypeContains(HandType.FIVE_OF_A_KIND, HandType.THREE_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FIVE_OF_A_KIND, HandType.FOUR_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FIVE_OF_A_KIND, HandType.TWO_PAIR)).toBe(false);
      expect(handTypeContains(HandType.FIVE_OF_A_KIND, HandType.FULL_HOUSE)).toBe(false);
    });

    test('five straight contains four straight only', () => {
      expect(handTypeContains(HandType.FIVE_STRAIGHT, HandType.FOUR_STRAIGHT)).toBe(true);
      expect(handTypeContains(HandType.FIVE_STRAIGHT, HandType.PAIR)).toBe(false);
    });

    test('four straight contains nothing weaker', () => {
      expect(handTypeContains(HandType.FOUR_STRAIGHT, HandType.PAIR)).toBe(false);
    });
  });

  describe('flush variant containment', () => {
    test('flush house contains full house and lower rank hands', () => {
      expect(handTypeContains(HandType.FLUSH_HOUSE, HandType.FULL_HOUSE)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_HOUSE, HandType.TWO_PAIR)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_HOUSE, HandType.THREE_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_HOUSE, HandType.PAIR)).toBe(true);
    });

    test('straight flush contains five straight and four straight', () => {
      expect(handTypeContains(HandType.STRAIGHT_FLUSH, HandType.FIVE_STRAIGHT)).toBe(true);
      expect(handTypeContains(HandType.STRAIGHT_FLUSH, HandType.FOUR_STRAIGHT)).toBe(true);
      expect(handTypeContains(HandType.STRAIGHT_FLUSH, HandType.PAIR)).toBe(false);
    });

    test('flush five contains five of a kind through pair', () => {
      expect(handTypeContains(HandType.FLUSH_FIVE, HandType.FIVE_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_FIVE, HandType.FOUR_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_FIVE, HandType.THREE_OF_A_KIND)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_FIVE, HandType.PAIR)).toBe(true);
      expect(handTypeContains(HandType.FLUSH_FIVE, HandType.FULL_HOUSE)).toBe(false);
    });
  });
});
