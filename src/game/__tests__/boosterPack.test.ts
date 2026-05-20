import './setup';
import { describe, test, expect, afterEach } from 'bun:test';
import { generatePackContents, tryRollRarePackCard, type PackDefinition } from '../BoosterPackSystem';
import { CHANCES } from '../Constants';

const frontierPack: PackDefinition = {
  id: 'frontier_standard',
  category: 'frontier',
  tier: 'normal',
  name: 'Frontier Pack',
  cost: 4,
  totalCards: 2,
  pickCount: 1,
  weight: 0.6,
  color: 0x8b008b,
};

describe('Rare pack card spawning', () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  test('frontier packs exclude rare cards from normal pool', () => {
    Math.random = () => 0.99;
    const items = generatePackContents(frontierPack);
    for (const item of items) {
      expect(item.frontierEncounterId).not.toBe('pandoras_box');
      expect(item.frontierEncounterId).not.toBe('spiritual_journey');
    }
  });

  test('pandoras_box rolls in supply and frontier packs at 3/1000', () => {
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('supply')?.id).toBe('pandoras_box');
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('frontier')?.id).toBe('pandoras_box');
    Math.random = () => 0.99;
    expect(tryRollRarePackCard('trail_guide')).toBeNull();
  });

  test('spiritual_journey rolls in trail guide packs at 3/1000', () => {
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('trail_guide')?.id).toBe('spiritual_journey');
  });

  test('spiritual_journey is second roll in frontier packs when pandora misses', () => {
    let call = 0;
    Math.random = () => {
      call++;
      return call === 1 ? 0.99 : 0.001;
    };
    expect(tryRollRarePackCard('frontier')?.id).toBe('spiritual_journey');
  });

  test('RARE_PACK_CARD chance is 3/1000', () => {
    expect(CHANCES.RARE_PACK_CARD).toBeCloseTo(0.003, 6);
  });
});
