import { describe, expect, test } from 'bun:test';
import type { HintSegment } from '../../../../game/ItemsSystem';
import { expandSegmentRowToTokens, mergeAdjacentSegments, segmentIsAtomic } from '../itemCardTooltipFlow';

describe('itemCardTooltipFlow', () => {
  test('segmentIsAtomic is true for chip styles', () => {
    expect(segmentIsAtomic({ text: 'x2', style: 'xmult' })).toBe(true);
    expect(segmentIsAtomic({ text: '+3', style: 'mult' })).toBe(true);
  });

  test('segmentIsAtomic is false for inline text styles', () => {
    expect(segmentIsAtomic({ text: '+12', style: 'miles' })).toBe(false);
    expect(segmentIsAtomic({ text: 'plain', style: 'text' })).toBe(false);
  });

  test('expandSegmentRowToTokens splits wrappable segments on words', () => {
    const row: HintSegment[] = [
      { text: '+12', style: 'miles' },
      { text: 'miles for each trail guide', style: 'text' },
    ];
    const tokens = expandSegmentRowToTokens(row);
    expect(tokens).toEqual([
      { text: '+12', style: 'miles' },
      { text: 'miles ', style: 'text' },
      { text: 'for ', style: 'text' },
      { text: 'each ', style: 'text' },
      { text: 'trail ', style: 'text' },
      { text: 'guide', style: 'text' },
    ]);
  });

  test('expandSegmentRowToTokens keeps chip segments intact', () => {
    const row: HintSegment[] = [
      { text: 'x2.5', style: 'xmult' },
      { text: 'when active', style: 'text' },
    ];
    const tokens = expandSegmentRowToTokens(row);
    expect(tokens[0]).toEqual({ text: 'x2.5', style: 'xmult' });
    expect(tokens.slice(1).map((t) => t.text)).toEqual(['when ', 'active']);
  });

  test('mergeAdjacentSegments joins same-style tokens on a line', () => {
    const line: HintSegment[] = [
      { text: 'Currently: ', style: 'text' },
      { text: '+72', style: 'miles' },
      { text: ' miles', style: 'text' },
    ];
    expect(mergeAdjacentSegments(line)).toEqual(line);
  });

  test('mergeAdjacentSegments merges split words back together', () => {
    const line: HintSegment[] = [
      { text: 'miles ', style: 'text' },
      { text: 'for ', style: 'text' },
      { text: 'each', style: 'text' },
    ];
    expect(mergeAdjacentSegments(line)).toEqual([{ text: 'miles for each', style: 'text' }]);
  });
});
